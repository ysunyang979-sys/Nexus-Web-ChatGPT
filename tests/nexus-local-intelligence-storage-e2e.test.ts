import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Database = require("../apps/server/node_modules/better-sqlite3");
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Local Intelligence Storage & Learning Engine E2E Blackbox Tests", () => {
  let tmpBaseDir: string;
  let customStorageDir: string;
  let migratedStorageDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;

  beforeAll(async () => {
    tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-intelligence-e2e-"));
    customStorageDir = path.join(tmpBaseDir, "NexusDataRoot");
    migratedStorageDir = path.join(tmpBaseDir, "NexusDataMigrated");
    dbFilePath = path.join(tmpBaseDir, "nexus_test.db");

    // Pre-seed storage path in system_settings before boot to simulate user choice
    const initDb = new Database(dbFilePath);
    initDb.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES ('intelligence_storage_path', '${customStorageDir.replace(/\\/g, "\\\\")}', ${Date.now()});
    `);
    initDb.close();

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // Test 1: Memory Write & Persistence Test
  // ==========================================================================
  it("Test 1: Memory Write -> Sharded JSONL File -> SQLite Index -> API -> Restart Persistence", async () => {
    const memoryPayload = {
      key: "user_preferred_workspace_mode",
      content: "The operator prefers dark theme and unrestricted local execution without popup prompts.",
      scope: "GLOBAL",
      type: "PREFERENCE",
      importance: 0.95,
      confidence: 1.0,
      tags: ["preference", "workspace", "theme"],
      source: "USER",
    };

    // 1. Write Memory via API
    const writeRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memoryPayload),
    });
    expect(writeRes.status).toBe(201);
    const createdMemory = (await writeRes.json()) as any;
    expect(createdMemory.id).toBeDefined();
    expect(createdMemory.key).toBe(memoryPayload.key);

    // 2. Verify file appears in customStorageDir/memory/YYYY/MM/*.jsonl
    const now = new Date();
    const yearStr = String(now.getFullYear());
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const memoryPartitionDir = path.join(customStorageDir, "memory", yearStr, monthStr);
    expect(fs.existsSync(memoryPartitionDir)).toBe(true);

    const memoryFiles = fs.readdirSync(memoryPartitionDir);
    expect(memoryFiles.length).toBeGreaterThanOrEqual(1);
    const jsonlContent = fs.readFileSync(path.join(memoryPartitionDir, memoryFiles[0]), "utf8");
    expect(jsonlContent).toContain(createdMemory.id);
    expect(jsonlContent).toContain("user_preferred_workspace_mode");

    // 3. Verify local domain SQLite memory/index.db contains the entry
    const domainMemoryDbPath = path.join(customStorageDir, "memory", "index.db");
    expect(fs.existsSync(domainMemoryDbPath)).toBe(true);
    const memDb = new Database(domainMemoryDbPath);
    const indexedMem = memDb.prepare("SELECT * FROM memory_index WHERE id = ?").get(createdMemory.id) as any;
    memDb.close();
    expect(indexedMem).toBeDefined();
    expect(indexedMem.key).toBe(memoryPayload.key);

    // 4. Verify API can recall the memory
    const recallRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/memory?query=theme`);
    expect(recallRes.status).toBe(200);
    const recallData = (await recallRes.json()) as any;
    expect(recallData.memories.some((m: any) => m.id === createdMemory.id)).toBe(true);
  });

  // ==========================================================================
  // Test 2: Knowledge Import Test
  // ==========================================================================
  it("Test 2: Knowledge Import -> Time-Partitioned Documents -> SQLite Index -> API Query", async () => {
    const importPayload = {
      filename: "windows_architecture_guide.md",
      content: "# Windows Native Architecture\nGuidelines for process discovery, registry hive inspection and COM automation.",
      explicitType: "DOCUMENT",
      source: "upload",
    };

    const importRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/knowledge/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importPayload),
    });
    expect(importRes.status).toBe(201);
    const importResult = (await importRes.json()) as any;
    expect(importResult.fileHash).toBeDefined();
    expect(importResult.result).toBe("success");

    // 1. Verify file appears in knowledge/documents/YYYY/MM/*.jsonl
    const now = new Date();
    const yearStr = String(now.getFullYear());
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const knowPartitionDir = path.join(customStorageDir, "knowledge", "documents", yearStr, monthStr);
    expect(fs.existsSync(knowPartitionDir)).toBe(true);

    const docFiles = fs.readdirSync(knowPartitionDir);
    expect(docFiles.length).toBeGreaterThanOrEqual(1);
    const docJsonl = fs.readFileSync(path.join(knowPartitionDir, docFiles[0]), "utf8");
    expect(docJsonl).toContain("windows_architecture_guide.md");

    // 2. Verify knowledge/index.db contains the entry
    const domainKnowledgeDbPath = path.join(customStorageDir, "knowledge", "index.db");
    expect(fs.existsSync(domainKnowledgeDbPath)).toBe(true);
    const knowDb = new Database(domainKnowledgeDbPath);
    const indexedDoc = knowDb.prepare("SELECT * FROM knowledge_index WHERE filename = ?").get("windows_architecture_guide.md") as any;
    knowDb.close();
    expect(indexedDoc).toBeDefined();
    expect(indexedDoc.file_hash).toBe(importResult.fileHash);

    // 3. Verify API query returns it
    const listRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/knowledge`);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.documents.some((d: any) => d.filename === "windows_architecture_guide.md")).toBe(true);
  });

  // ==========================================================================
  // Test 3: Context Snapshot Test
  // ==========================================================================
  it("Test 3: Context Snapshot Creation -> Sharded JSONL -> API -> Deletion Sync", async () => {
    const buildRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/context/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Verify Local Storage Context Snapshot Sharding",
        taskId: "task_test_context_001",
        sessionId: "sess_test_001",
        files: ["src/index.ts"],
      }),
    });
    expect(buildRes.status).toBe(200);
    const snapshot = (await buildRes.json()) as any;
    expect(snapshot.contextId).toBeDefined();

    // 1. Verify file appears in context/snapshots/YYYY/MM/*.jsonl
    const now = new Date();
    const yearStr = String(now.getFullYear());
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const ctxPartitionDir = path.join(customStorageDir, "context", "snapshots", yearStr, monthStr);
    expect(fs.existsSync(ctxPartitionDir)).toBe(true);

    const ctxFiles = fs.readdirSync(ctxPartitionDir);
    expect(ctxFiles.length).toBeGreaterThanOrEqual(1);
    const ctxJsonl = fs.readFileSync(path.join(ctxPartitionDir, ctxFiles[0]), "utf8");
    expect(ctxJsonl).toContain(snapshot.contextId);

    // 2. Verify context/index.db
    const domainContextDbPath = path.join(customStorageDir, "context", "index.db");
    expect(fs.existsSync(domainContextDbPath)).toBe(true);
    const ctxDb = new Database(domainContextDbPath);
    const indexedCtx = ctxDb.prepare("SELECT * FROM context_index WHERE context_id = ?").get(snapshot.contextId) as any;
    ctxDb.close();
    expect(indexedCtx).toBeDefined();

    // 3. Verify API lists snapshots
    const snapshotsListRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/context/snapshots`);
    expect(snapshotsListRes.status).toBe(200);
    const snapshotsData = (await snapshotsListRes.json()) as any;
    expect(snapshotsData.snapshots.some((s: any) => s.contextId === snapshot.contextId)).toBe(true);

    // 4. Delete snapshot
    const delRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/context/snapshots/${snapshot.contextId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    // 5. Verify removed from index & tombstoned in archive
    const ctxDb2 = new Database(domainContextDbPath);
    const afterDel = ctxDb2.prepare("SELECT * FROM context_index WHERE context_id = ?").get(snapshot.contextId);
    ctxDb2.close();
    expect(afterDel).toBeUndefined();

    const tombstoneFile = path.join(customStorageDir, "context", "archive", "deleted-snapshots.jsonl");
    expect(fs.existsSync(tombstoneFile)).toBe(true);
    const tombstoneContent = fs.readFileSync(tombstoneFile, "utf8");
    expect(tombstoneContent).toContain(snapshot.contextId);
  });

  // ==========================================================================
  // Test 4: AI Skill Automatic Learning Pipeline
  // ==========================================================================
  it("Test 4: AI Skill Learning Pipeline -> Evidence Extraction -> Auto-Naming -> Active Registration -> Atomic Version File", async () => {
    const learnPayload = {
      actions: [
        {
          actionId: "act_101",
          toolName: "localbridge_process_find",
          actionName: "find_blender_process",
          params: { name: "blender.exe" },
          status: "COMMITTED",
        },
        {
          actionId: "act_102",
          toolName: "localbridge_computer_click",
          actionName: "add_cube_mesh",
          params: { menu: "Add", target: "Mesh > Cube" },
          status: "COMMITTED",
        },
        {
          actionId: "act_103",
          toolName: "localbridge_file_write",
          actionName: "save_blend_file",
          params: { file: "test_scene.blend" },
          status: "COMMITTED",
        },
      ],
      goal: "Blender 自动化创建基础立方体建模流程",
      appName: "Blender",
      taskId: "task_blender_001",
      sessionId: "sess_blender_001",
      autoRegister: true,
    };

    const learnRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/skills/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(learnPayload),
    });
    expect(learnRes.status).toBe(201);
    const learnResult = (await learnRes.json()) as any;

    expect(learnResult.candidate).toBeDefined();
    expect(learnResult.candidate.candidateId).toBeDefined();
    expect(learnResult.candidate.evidence).toBeDefined();
    expect(learnResult.candidate.evidence.executionCount).toBe(3);
    expect(learnResult.candidate.evidence.tasks).toContain("task_blender_001");

    // Verify AI Auto-Naming (not generic or blank)
    expect(learnResult.skill.name).toBe("Blender 创建并保存基础立方体");
    expect(learnResult.skill.description).toContain("Blender");
    expect(learnResult.skill.activeVersion).toBe("1.0.0");
    expect(learnResult.skill.tags).toContain("AI_GENERATED");
    expect(learnResult.skill.tags).toContain("AUTO_GENERATED");

    // Verify physical version file exists on disk: skills/versions/{skillId}/1.0.0.json
    const skillVersionPath = path.join(
      customStorageDir,
      "skills",
      "versions",
      learnResult.skill.skillId,
      "1.0.0.json"
    );
    expect(fs.existsSync(skillVersionPath)).toBe(true);

    const versionContent = JSON.parse(fs.readFileSync(skillVersionPath, "utf8"));
    expect(versionContent.version).toBe("1.0.0");
    expect(versionContent.steps.length).toBe(3);
    expect(versionContent.steps[0].toolName).toBe("localbridge_process_find");
    expect(versionContent.steps[1].toolName).toBe("localbridge_computer_click");
    expect(versionContent.steps[2].toolName).toBe("localbridge_file_write");

    // Verify local domain SQLite skills/index.db
    const domainSkillsDbPath = path.join(customStorageDir, "skills", "index.db");
    expect(fs.existsSync(domainSkillsDbPath)).toBe(true);
    const skDb = new Database(domainSkillsDbPath);
    const indexedSkill = skDb.prepare("SELECT * FROM skills_index WHERE id = ?").get(learnResult.skill.skillId) as any;
    skDb.close();
    expect(indexedSkill).toBeDefined();
    expect(indexedSkill.active_version).toBe("1.0.0");
  });

  // ==========================================================================
  // Test 5: Real Deletion Test
  // ==========================================================================
  it("Test 5: Real Deletion -> API Purge -> SQLite Index Purge -> Physical Disk Archive", async () => {
    // 1. Create temporary memory to delete
    const memRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "temporary_test_memory",
        content: "Ephemeral memory to be deleted.",
        scope: "PROJECT",
        type: "OBSERVATION",
      }),
    });
    const memData = (await memRes.json()) as any;
    const memId = memData.id;

    // 2. Delete Memory via API
    const delMemRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/memory/${memId}`, {
      method: "DELETE",
    });
    expect(delMemRes.status).toBe(200);

    // Verify API can no longer recall it
    const checkMemRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/memory?query=temporary_test_memory`);
    const checkMemData = (await checkMemRes.json()) as any;
    expect(checkMemData.memories.some((m: any) => m.id === memId)).toBe(false);

    // Verify removed from domain memory/index.db
    const memDb = new Database(path.join(customStorageDir, "memory", "index.db"));
    const inDb = memDb.prepare("SELECT * FROM memory_index WHERE id = ?").get(memId);
    memDb.close();
    expect(inDb).toBeUndefined();

    // Verify archived tombstone on disk
    const tombstoneFile = path.join(customStorageDir, "memory", "archive", "deleted-memories.jsonl");
    expect(fs.existsSync(tombstoneFile)).toBe(true);
    const tombstones = fs.readFileSync(tombstoneFile, "utf8");
    expect(tombstones).toContain(memId);
  });

  // ==========================================================================
  // Test 6: Server Restart & Live Storage Migration Test
  // ==========================================================================
  it("Test 6: Server Restart Persistence & Live Directory Migration", async () => {
    // 1. Restart server instance with existing database and storage
    serverInstance.app.server.closeAllConnections?.();
    await serverInstance.app.close();

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    // Verify storage stats reflect healthy state and existing items
    const statsRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/storage`);
    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as any;
    expect(stats.status).toBe("HEALTHY");
    expect(stats.rootDir).toBe(customStorageDir);
    expect(stats.domainCounts.memory).toBeGreaterThanOrEqual(1);
    expect(stats.domainCounts.knowledge).toBeGreaterThanOrEqual(1);
    expect(stats.domainCounts.skills).toBeGreaterThanOrEqual(1);

    // 2. Execute Live Storage Migration to migratedStorageDir
    const migrateRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/storage/migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDir: migratedStorageDir }),
    });
    expect(migrateRes.status).toBe(200);
    const migrateData = (await migrateRes.json()) as any;
    expect(migrateData.success).toBe(true);
    expect(migrateData.migratedFiles).toBeGreaterThan(0);

    // 3. Verify files and indexes exist in the new directory
    expect(fs.existsSync(path.join(migratedStorageDir, "system", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(migratedStorageDir, "memory", "index.db"))).toBe(true);
    expect(fs.existsSync(path.join(migratedStorageDir, "knowledge", "index.db"))).toBe(true);
    expect(fs.existsSync(path.join(migratedStorageDir, "skills", "index.db"))).toBe(true);

    // 4. Verify scan of the new migrated directory reports 0 corrupted files
    const scanRes = await fetch(`http://127.0.0.1:${serverPort}/api/intelligence/storage/scan`, {
      method: "POST",
    });
    expect(scanRes.status).toBe(200);
    const scanData = (await scanRes.json()) as any;
    expect(scanData.corruptedFiles.length).toBe(0);
    expect(scanData.validItems).toBeGreaterThan(0);
  });
});
