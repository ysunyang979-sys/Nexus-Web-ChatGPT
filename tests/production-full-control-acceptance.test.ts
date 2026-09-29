import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { FilesystemService } from "../apps/runner/src/filesystem/service.js";
import { BackupService } from "../apps/runner/src/backup/service.js";
import { FullControlService } from "../apps/server/src/auth/full-control-service.js";
import {
  assertSurvivalBoundarySafe,
  isSurvivalBoundaryViolation,
} from "../packages/security/src/path/survival-boundary.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";

describe("Production Acceptance: Nexus Full Control Mode & Universal FileSystem Tools", () => {
  let tmpBase: string;
  let registry: ProjectRegistry;
  let fsService: FilesystemService;
  let fullControlService: FullControlService;
  let isGlobalPaused: boolean;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-prod-full-control-"));
    const backupDir = path.join(tmpBase, "backups");
    registry = new ProjectRegistry(path.join(tmpBase, "projects.json"));
    const backupService = new BackupService(backupDir);
    fsService = new FilesystemService(registry, backupService);

    isGlobalPaused = false;
    fullControlService = new FullControlService(() => isGlobalPaused);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. CURRENT PROJECT FULL CONTROL: Complete empty of complex project
  // =========================================================================
  it("Point 1: Current Project Full Control empties project with text, PNG, binary, .env, and node_modules", async () => {
    const projectDir = path.join(tmpBase, "full-control-prod-test");
    fs.mkdirSync(projectDir, { recursive: true });

    // A. Real PNG image
    const pngName = "ChatGPT Image 2026年9月19日 20_01_15.png";
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(path.join(projectDir, pngName), Buffer.concat([pngHeader, crypto.randomBytes(4096)]));

    // B. Binary file
    fs.writeFileSync(path.join(projectDir, "data.bin"), crypto.randomBytes(8192));

    // C. Hidden configuration files
    fs.writeFileSync(path.join(projectDir, ".env.production"), "SECRET_KEY=nexus-super-secret\n");
    fs.mkdirSync(path.join(projectDir, ".config"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, ".config", "secret.json"), JSON.stringify({ token: "xyz" }));

    // D. Text files
    fs.writeFileSync(path.join(projectDir, "README.md"), "# Production Test Project\n");
    fs.writeFileSync(path.join(projectDir, "package.json"), '{"name":"full-control-prod-test"}\n');

    // E. Deep nested structures (node_modules, public, source, themes, nested/a/b/c.txt)
    fs.mkdirSync(path.join(projectDir, "node_modules", "@types", "node"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "node_modules", "lodash"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "node_modules", "@types", "node", "index.d.ts"), "export declare const x: number;");
    fs.writeFileSync(path.join(projectDir, "node_modules", "lodash", "index.js"), "module.exports = {};");

    fs.mkdirSync(path.join(projectDir, "public", "css"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "public", "css", "style.css"), "body { margin: 0; }");

    fs.mkdirSync(path.join(projectDir, "source", "_posts"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "source", "_posts", "post.md"), "--- title: hello ---");

    fs.mkdirSync(path.join(projectDir, "themes", "landscape"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "themes", "landscape", "theme.yml"), "highlight: true");

    fs.mkdirSync(path.join(projectDir, "nested", "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "nested", "a", "b", "c.txt"), "deeply nested text content");

    // Register project
    const project = registry.add(projectDir, { name: "full-control-prod-test" });
    registry.setAccessMode(project.id, "read-write");

    // Start Current Project Full Control
    fullControlService.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: project.id,
      durationMinutes: 30,
    });
    expect(fullControlService.isFullControlActive("client_chatgpt", project.id)).toBe(true);

    // AI issues single command to completely empty the project directory
    const emptyResult = await fsService.fsDelete(
      {
        projectId: project.id,
        path: ".",
        recursive: true,
        force: true,
      },
      true, // isFullControl
      false // isDeviceScope
    );

    expect(emptyResult.success).toBe(true);
    expect(emptyResult.filesAffected).toBeGreaterThanOrEqual(10);
    expect(emptyResult.directoriesAffected).toBeGreaterThanOrEqual(8);

    // Project root directory still exists, but contents are completely empty
    expect(fs.existsSync(projectDir)).toBe(true);
    const remainingFiles = fs.readdirSync(projectDir);
    expect(remainingFiles).toEqual([]);
  });

  // =========================================================================
  // 2. DEVICE FULL CONTROL: CRUD outside project & revocation
  // =========================================================================
  it("Point 2: Device Full Control enables external folder operations, revoked upon session stop", async () => {
    const externalDir = path.join(tmpBase, "external-device-test");
    fs.mkdirSync(externalDir, { recursive: true });
    const externalFile = path.join(externalDir, "device-payload.log");
    fs.writeFileSync(externalFile, "External log content");

    // 1. Without device full control, operation on path outside registered projects is rejected
    await expect(
      fsService.fsDelete(
        { path: externalFile, force: true },
        false, // isFullControl
        false  // isDeviceScope
      )
    ).rejects.toThrow();

    // 2. Start Device Full Control with operator confirmation
    const session = fullControlService.startSession({
      clientId: "client_chatgpt",
      scope: "device",
      confirmedDeviceFullControl: true,
      durationMinutes: 15,
    });
    expect(fullControlService.isFullControlActive("client_chatgpt", undefined, externalFile)).toBe(true);

    // 3. With Device Full Control, deleting external file succeeds
    const deleteRes = await fsService.fsDelete(
      { path: externalFile, force: true },
      true, // isFullControl
      true  // isDeviceScope
    );
    expect(deleteRes.success).toBe(true);
    expect(fs.existsSync(externalFile)).toBe(false);

    // 4. Session ends
    fullControlService.stopSession({ sessionId: session.id });
    expect(fullControlService.isFullControlActive("client_chatgpt", undefined, externalDir)).toBe(false);

    // 5. Subsequent operation is rejected
    const newExternalFile = path.join(externalDir, "another.txt");
    fs.writeFileSync(newExternalFile, "hello");
    await expect(
      fsService.fsDelete(
        { path: newExternalFile, force: true },
        false,
        false
      )
    ).rejects.toThrow();
  });

  // =========================================================================
  // 3. CLIENT ISOLATION: ChatGPT elevated vs Kimi constrained
  // =========================================================================
  it("Point 3: Multi-client isolation strictly prevents privilege leakage from ChatGPT to Kimi", () => {
    fullControlService.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_isolated",
      durationMinutes: 30,
    });

    // ChatGPT is elevated
    expect(fullControlService.isFullControlActive("client_chatgpt", "proj_isolated")).toBe(true);

    // Kimi Web has separate token and is strictly NOT elevated
    expect(fullControlService.isFullControlActive("client_kimi_web", "proj_isolated")).toBe(false);
    expect(fullControlService.getActiveSession("client_kimi_web")).toBeNull();

    // Claude and Gemini are also unprivileged
    expect(fullControlService.isFullControlActive("client_claude", "proj_isolated")).toBe(false);
    expect(fullControlService.isFullControlActive("client_gemini", "proj_isolated")).toBe(false);
  });

  // =========================================================================
  // 4. SESSION AUTO-EXPIRY: 15m expiration path
  // =========================================================================
  it("Point 4: Session automatically expires when time elapses", () => {
    const session = fullControlService.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_expire",
      durationMinutes: 15,
    });

    expect(fullControlService.isFullControlActive("client_chatgpt", "proj_expire")).toBe(true);

    // Advance clock past expiration
    session.expiresAt = Date.now() - 1000;

    // Must be expired
    expect(fullControlService.isFullControlActive("client_chatgpt", "proj_expire")).toBe(false);
    expect(fullControlService.getActiveSession("client_chatgpt")).toBeNull();
  });

  // =========================================================================
  // 5. NEXUS SELF-PROTECTION EXACT PATH: process.execPath vs tools\node.exe
  // =========================================================================
  it("Point 5: Protects Nexus executable but permits ordinary project tools/node.exe", () => {
    // A. Actual process executable (bundled node.exe / LocalBridge.exe) is protected
    expect(isSurvivalBoundaryViolation(process.execPath)).toBe(true);
    expect(() => assertSurvivalBoundarySafe(process.execPath)).toThrowError(/strictly protected and forbidden/);

    // B. Ordinary user project file named tools/node.exe or tools/nexus.db in user workspace is allowed
    const fakeProjectNode = path.resolve(tmpBase, "my-project", "tools", "node.exe");
    expect(isSurvivalBoundaryViolation(fakeProjectNode)).toBe(false);
    expect(() => assertSurvivalBoundarySafe(fakeProjectNode)).not.toThrow();

    // C. Control plane database in .localbridge is protected
    const homeDb = path.join(os.homedir(), ".localbridge", "localbridge.db");
    expect(isSurvivalBoundaryViolation(homeDb)).toBe(true);
  });

  // =========================================================================
  // 6. WINDOWS CORE PROTECTION: C:\Windows protected, user dirs allowed
  // =========================================================================
  it("Point 6: Enforces Windows OS core protection against System32 deletion", () => {
    if (process.platform === "win32") {
      const winDir = process.env.SystemRoot || "C:\\Windows";
      const sys32 = path.join(winDir, "System32");

      expect(isSurvivalBoundaryViolation(winDir)).toBe(true);
      expect(isSurvivalBoundaryViolation(sys32)).toBe(true);
      expect(() => assertSurvivalBoundarySafe(sys32)).toThrowError(/strictly protected and forbidden/);

      // Normal workspace directory is allowed
      const userWorkDir = path.resolve("E:\\workspace\\test-project");
      expect(isSurvivalBoundaryViolation(userWorkDir)).toBe(false);
    } else {
      expect(isSurvivalBoundaryViolation("/etc/passwd")).toBe(true);
      expect(isSurvivalBoundaryViolation("/bin/sh")).toBe(true);
    }
  });

  // =========================================================================
  // 7. SYMLINK / JUNCTION NO-FOLLOW SAFETY
  // =========================================================================
  it("Point 7: Symlink no-follow removes only the link, leaving external target files untouched", async () => {
    const projectDir = path.join(tmpBase, "symlink-project");
    const outsideDir = path.join(tmpBase, "outside-sensitive-vault");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Sensitive external file
    const secretFile = path.join(outsideDir, "secret-masterkey.key");
    fs.writeFileSync(secretFile, "HIGHLY_CONFIDENTIAL_KEY_MATERIAL");

    // Create a symlink or junction inside project pointing outside
    const linkPath = path.join(projectDir, "linked-vault");
    try {
      fs.symlinkSync(outsideDir, linkPath, process.platform === "win32" ? "junction" : "dir");
    } catch {
      // If OS policy prevents symlink creation without elevated rights, test with file symlink or skip link creation
      return;
    }

    const project = registry.add(projectDir, { name: "symlink-project" });
    registry.setAccessMode(project.id, "read-write");

    // Empty project with force: true and recursive: true
    const result = await fsService.fsDelete(
      {
        projectId: project.id,
        path: ".",
        recursive: true,
        force: true,
      },
      true, // isFullControl
      false
    );

    expect(result.success).toBe(true);
    // Link was unlinked inside the project
    expect(fs.existsSync(linkPath)).toBe(false);

    // CRITICAL: External directory and its files are 100% UNTOUCHED!
    expect(fs.existsSync(outsideDir)).toBe(true);
    expect(fs.existsSync(secretFile)).toBe(true);
    expect(fs.readFileSync(secretFile, "utf-8")).toBe("HIGHLY_CONFIDENTIAL_KEY_MATERIAL");
  });

  // =========================================================================
  // 8. EMERGENCY STOP PRIMACY: Overrides Full Control
  // =========================================================================
  it("Point 8: Emergency Stop vetoes Full Control immediately", () => {
    fullControlService.startSession({
      clientId: "client_chatgpt",
      scope: "current-project",
      projectId: "proj_myweb",
      durationMinutes: 30,
    });

    expect(fullControlService.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(true);

    // Trigger Emergency Stop
    isGlobalPaused = true;

    // Full control is instantly overridden
    expect(fullControlService.isFullControlActive("client_chatgpt", "proj_myweb")).toBe(false);
    expect(fullControlService.getActiveSession("client_chatgpt")).toBeNull();
  });

  // =========================================================================
  // 9. AGGREGATE AUDIT LOGGING
  // =========================================================================
  it("Point 9: Recursive deletion produces aggregated audit stats", async () => {
    const projectDir = path.join(tmpBase, "audit-stats-project");
    fs.mkdirSync(projectDir, { recursive: true });

    for (let i = 0; i < 15; i++) {
      fs.writeFileSync(path.join(projectDir, `file_${i}.txt`), `Content ${i}`);
    }
    fs.mkdirSync(path.join(projectDir, "subdir1", "subdir2"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "subdir1", "subfile.txt"), "subfile");

    const project = registry.add(projectDir, { name: "audit-stats-project" });
    registry.setAccessMode(project.id, "read-write");

    const result = await fsService.fsDelete(
      {
        projectId: project.id,
        path: ".",
        recursive: true,
        force: true,
      },
      true,
      false
    );

    expect(result.success).toBe(true);
    // Verified aggregated numbers
    expect(result.filesAffected).toBe(16);
    expect(result.directoriesAffected).toBeGreaterThanOrEqual(2);
    expect(result.bytesAffected).toBeGreaterThan(0);
    expect(result.affectedPaths.length).toBeGreaterThanOrEqual(16);
  });

  // =========================================================================
  // 10. MCP TOOLS EXPOSURE: 219 tools, 0 unmapped scopes
  // =========================================================================
  it("Point 10: All 332 MCP production tools are registered with 0 unmapped scopes", () => {
    const registeredTools = Object.keys(MCP_TOOL_SCOPE);
    expect(registeredTools.length).toBe(332);

    // Every single tool in MCP_TOOL_SCOPE must have an assigned scope
    for (const toolName of registeredTools) {
      const scope = MCP_TOOL_SCOPE[toolName];
      expect(scope, `Tool ${toolName} has undefined scope`).toBeDefined();
      expect(["read", "write", "execute"]).toContain(scope);
    }

    // New universal tools must be registered
    expect(MCP_TOOL_SCOPE["localbridge_fs_delete"]).toBe("write");
    expect(MCP_TOOL_SCOPE["localbridge_fs_move"]).toBe("write");
    expect(MCP_TOOL_SCOPE["localbridge_fs_copy"]).toBe("write");
    expect(MCP_TOOL_SCOPE["localbridge_fs_mkdir"]).toBe("write");
  });
});
