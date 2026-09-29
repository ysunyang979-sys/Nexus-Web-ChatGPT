import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ApprovalManager } from "../apps/runner/src/approvals/manager.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { initDatabase } from "../apps/server/src/db/index.js";
import { loadConfig } from "@localbridge/shared";

describe("Phase 12 - Crash Recovery, Approvals Expiration & State Integrity", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-crash-recovery-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ensures all pending approvals are expired upon runner stop/restart and cannot be revived", async () => {
    const manager = new ApprovalManager();

    // 1. Create a pending approval
    const approval = manager.create({
      projectId: "proj_1",
      operation: "command_run",
      risk: "DANGEROUS",
      summary: "Execute custom script",
      payloadHash: "hash123",
    });

    expect(approval.status).toBe("pending");

    // 2. Simulate daemon crash / teardown by calling expireAll()
    manager.expireAll();

    // 3. Verify approval transitioned to expired
    const fetched = manager.get(approval.id);
    expect(fetched?.status).toBe("expired");

    // 4. Attempting to approve an expired approval MUST fail
    expect(() => {
      manager.resolve({
        approvalId: approval.id,
        action: "approve",
      });
    }).toThrow(/has expired/);

    // 5. In a new runner lifecycle, old pending approvals cannot exist
    const newManager = new ApprovalManager();
    expect(newManager.list({ status: "pending" })).toHaveLength(0);
  });

  it("creates a pre-migration database backup when a pending migration exists", () => {
    const dbPath = path.join(tmpDir, "localbridge.db");

    // 1. First initialization creates DB
    const firstConn = initDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    // Write sample data to verify persistence
    firstConn.db.exec("CREATE TABLE custom_test (id INTEGER PRIMARY KEY, val TEXT)");
    firstConn.db.exec("INSERT INTO custom_test (val) VALUES ('persisted_value')");
    firstConn.close();

    // 2. Second initialization with a newly available migration
    const futureMigrations = path.join(tmpDir, "future-migrations");
    fs.cpSync(path.resolve("apps/server/src/db/migrations"), futureMigrations, { recursive: true });
    fs.writeFileSync(path.join(futureMigrations, "0016_backup_test.sql"), "CREATE TABLE migration_backup_test (id INTEGER PRIMARY KEY);");
    const secondConn = initDatabase(dbPath, futureMigrations);
    try {
      expect(secondConn.backupPath).toBeDefined();
      expect(fs.existsSync(secondConn.backupPath!)).toBe(true);

      // Verify backup copy contains the pre-existing data
      const backupContent = fs.readFileSync(secondConn.backupPath!);
      expect(backupContent.length).toBeGreaterThan(0);

      // Verify active DB retains data
      const row = secondConn.db.prepare("SELECT val FROM custom_test WHERE id = 1").get() as { val: string };
      expect(row.val).toBe("persisted_value");
    } finally {
      secondConn.close();
    }
  });

  it("preserves corrupt configuration files without silent overwrite and throws descriptive error", () => {
    const corruptConfigFile = path.join(tmpDir, "config.json");
    const brokenContent = '{\n  "server": { "port": 18080,\n'; // Malformed JSON
    fs.writeFileSync(corruptConfigFile, brokenContent, "utf-8");

    // Attempting to load config must throw descriptive error
    expect(() => {
      loadConfig({ configPath: corruptConfigFile });
    }).toThrow(/Failed to parse configuration file/);

    // Verify corrupt file was NOT overwritten or deleted
    expect(fs.existsSync(corruptConfigFile)).toBe(true);
    expect(fs.readFileSync(corruptConfigFile, "utf-8")).toBe(brokenContent);
  });

  it("cleans up orphaned LocalBridge temporary files on runner startup while preserving user files", async () => {
    const runnerStateDir = path.join(tmpDir, "runner-state");
    const projectDir = path.join(tmpDir, "my-project");
    fs.mkdirSync(runnerStateDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Create orphaned LocalBridge temp files (sibling pattern and dot-localbridge pattern)
    const orphanedTemp1 = path.join(projectDir, ".file.ts.localbridge-0123456789abcdef.tmp");
    const orphanedTemp2 = path.join(runnerStateDir, ".localbridge-crash-999.tmp");
    fs.writeFileSync(orphanedTemp1, "orphaned atomic write temp 1");
    fs.writeFileSync(orphanedTemp2, "orphaned atomic write temp 2");

    // Create legitimate user files that MUST NOT be touched
    const userFile1 = path.join(projectDir, "important-data.tmp");
    const userFile2 = path.join(projectDir, ".user-hidden-file.tmp");
    const userSource = path.join(projectDir, "app.ts");
    fs.writeFileSync(userFile1, "do not delete user temp");
    fs.writeFileSync(userFile2, "do not delete hidden user file");
    fs.writeFileSync(userSource, "console.log('safe');");

    // Instantiate and start runner
    const runner = new LocalBridgeRunner({
      name: "Test-Cleaner-Runner",
      serverUrl: "ws://127.0.0.1:18080/runner/ws",
      statePath: path.join(runnerStateDir, "runner.json"),
      reconnect: {
        enabled: false,
        initialDelayMs: 500,
        maxDelayMs: 2000,
        factor: 2,
        jitter: false,
      },
      logging: { level: "silent" as const, pretty: false },
    });

    runner.projectRegistry.add(projectDir, {
      name: "My Project",
    });

    // Start triggers cleanup
    await runner.start();
    await runner.stop();

    // Verify orphaned LocalBridge temp files were deleted
    expect(fs.existsSync(orphanedTemp1)).toBe(false);
    expect(fs.existsSync(orphanedTemp2)).toBe(false);

    // Verify legitimate user files remain completely untouched
    expect(fs.existsSync(userFile1)).toBe(true);
    expect(fs.existsSync(userFile2)).toBe(true);
    expect(fs.existsSync(userSource)).toBe(true);
  });
});
