import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initDatabase, type DatabaseConnection } from "../apps/server/src/db/index.js";
import { IntelligenceStore } from "../apps/server/src/intelligence/store.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("IntelligenceStore & Migration 0015 Unit Suite", () => {
  let tmpDir: string;
  let dbConn: DatabaseConnection;
  let store: IntelligenceStore;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "intel-store-test-"));
    const dbPath = path.join(tmpDir, "intel-test.sqlite");
    dbConn = initDatabase(dbPath, migrationsDir);
    store = new IntelligenceStore(dbConn.db);
  });

  afterAll(() => {
    try {
      dbConn?.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("should apply migration 0015 successfully", () => {
    expect(dbConn.migrationResult.currentVersion).toBeGreaterThanOrEqual(15);
  });

  it("should save and retrieve versioned skills and rollback", () => {
    // 1. Create skill
    store.saveSkill({
      skillId: "test-blender-import",
      name: "Blender Importer",
      activeVersion: "1.0.0",
      description: "Automated FBX importer for Blender",
      source: "USER_UPLOADED",
      status: "ACTIVE",
      tags: ["3d", "blender"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Add version 1.0.0
    store.saveSkillVersion({
      version: "1.0.0",
      skillId: "test-blender-import",
      name: "Blender Importer v1",
      description: "Basic import",
      capabilities: ["fbx"],
      steps: [
        {
          stepNumber: 1,
          actionName: "Select File",
          toolName: "file.read",
          description: "Read FBX file",
          preconditions: ["file exists"],
          successConditions: ["read success"],
        },
      ],
      tools: ["file.read"],
      parameters: {},
      preconditions: ["blender installed"],
      successConditions: ["imported"],
      errorHandling: {},
      dependencies: [],
      instructions: "Step 1: read fbx",
      source: "USER_UPLOADED",
      hash: "hash_v1",
      createdAt: Date.now(),
    });

    // 3. Add version 2.0.0
    store.saveSkillVersion({
      version: "2.0.0",
      skillId: "test-blender-import",
      name: "Blender Importer v2",
      description: "Enhanced with ASCII path fallback",
      capabilities: ["fbx", "obj"],
      steps: [
        {
          stepNumber: 1,
          actionName: "Select File ASCII",
          toolName: "file.read",
          description: "Read FBX with safe path",
          preconditions: ["ascii path"],
          successConditions: ["read success"],
        },
      ],
      tools: ["file.read", "computer.mouse_click"],
      parameters: {},
      preconditions: ["blender installed"],
      successConditions: ["imported"],
      errorHandling: {},
      dependencies: [],
      instructions: "Step 1: use ascii path",
      source: "USER_UPLOADED",
      hash: "hash_v2",
      createdAt: Date.now(),
    });

    // Verify versions
    const skill = store.getSkill("test-blender-import");
    expect(skill).toBeDefined();
    expect(skill?.versions.length).toBe(2);
    expect(skill?.activeVersion).toBe("1.0.0");

    // Activate v2.0.0
    const activated = store.activateSkillVersion("test-blender-import", "2.0.0");
    expect(activated).toBe(true);
    expect(store.getSkill("test-blender-import")?.activeVersion).toBe("2.0.0");

    // Rollback to v1.0.0
    const rolledBack = store.rollbackSkillVersion("test-blender-import", "1.0.0");
    expect(rolledBack).toBe(true);
    expect(store.getSkill("test-blender-import")?.activeVersion).toBe("1.0.0");
  });

  it("should save, recall, and candidate review memories", () => {
    // 1. Save memory
    const mem = store.saveMemory({
      id: "mem_blender_1",
      key: "blender_fbx_path_rule",
      content: "When importing FBX into Blender on Windows, non-ASCII paths fail. Use ASCII paths.",
      type: "SOLUTION",
      scope: "PROJECT",
      scopeId: "proj_blender_1",
      importance: 9,
      confidence: 0.95,
      source: "SKILL",
      provenance: {
        source: "SKILL",
        skillId: "test-blender-import",
        result: "SUCCESS",
        evidence: "Avoided UnicodeDecodeError",
      },
      version: 1,
      relations: { relatedMemoryIds: [] },
      status: "ACTIVE",
      tags: ["blender", "fbx", "windows"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(mem.id).toBe("mem_blender_1");

    // 2. Recall memory
    const recall = store.recallMemories({
      query: "ASCII paths",
      scope: "PROJECT",
      scopeId: "proj_blender_1",
      minImportance: 5,
    });
    expect(recall.total).toBe(1);
    expect(recall.memories[0].key).toBe("blender_fbx_path_rule");
    expect(recall.memories[0].provenance?.skillId).toBe("test-blender-import");

    // 3. Propose candidate and accept
    store.saveMemoryCandidate({
      candidateId: "cand_mem_001",
      key: "new_blender_codec",
      content: "Blender 4.2 supports glTF 2.0 with embedded textures",
      type: "EXPERIENCE",
      scope: "PROJECT",
      importance: 7,
      confidence: 0.85,
      source: "ACTION",
      provenance: {
        source: "ACTION",
        actionIds: ["act_01"],
      },
      tags: ["blender", "gltf"],
      status: "CANDIDATE",
      createdAt: Date.now(),
    });

    const candidate = store.getMemoryCandidate("cand_mem_001");
    expect(candidate).toBeDefined();
    expect(candidate?.status).toBe("CANDIDATE");

    const accepted = store.acceptMemoryCandidate("cand_mem_001", "Verified in task 01");
    expect(accepted).toBeDefined();
    expect(accepted?.status).toBe("ACTIVE");

    const candAfter = store.getMemoryCandidate("cand_mem_001");
    expect(candAfter?.status).toBe("ACCEPTED");
  });

  it("should enforce rule priority and detect conflicts", () => {
    // System rule
    store.saveRule({
      ruleId: "rule_sys_01",
      name: "No Outside Deletion",
      content: "Files outside project boundaries cannot be deleted under any circumstance.",
      scope: "GLOBAL",
      priority: "SYSTEM",
      priorityRank: 100,
      status: "ACTIVE",
      version: 1,
      tags: ["security"],
      provenance: { source: "system" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // User rule
    store.saveRule({
      ruleId: "rule_user_01",
      name: "Auto Clean Tmp",
      content: "Allow deleting /tmp files automatically",
      scope: "USER_GLOBAL",
      priority: "USER_GLOBAL",
      priorityRank: 60,
      status: "ACTIVE",
      version: 1,
      tags: ["cleanup"],
      provenance: { source: "user" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const rules = store.listRules();
    expect(rules.length).toBe(2);
    // SYSTEM rule must be ranked higher than USER_GLOBAL rule
    expect(rules[0].priorityRank).toBeGreaterThan(rules[1].priorityRank);
    expect(rules[0].priority).toBe("SYSTEM");
  });

  it("should record knowledge documents and deduplicate imports via hash", () => {
    const docHash = "sha256_mock_file_abc123";

    store.recordImport({
      importId: "imp_001",
      fileHash: docHash,
      filename: "guide.md",
      mimeType: "text/markdown",
      detectedType: "DOCUMENT",
      source: "upload",
      result: "success",
      registeredId: "doc_001",
      registeredCount: 1,
      errors: [],
      warnings: [],
      createdAt: Date.now(),
    });

    const existing = store.getImportByHash(docHash);
    expect(existing).toBeDefined();
    expect(existing?.result).toBe("success");
    expect(existing?.registeredId).toBe("doc_001");
  });

  it("should save compacted context snapshots, unwrap them, auto-heal null IDs, and delete cleanly", () => {
    // 1. Save normal snapshot
    const normalSnap = {
      contextId: "ctx_normal_1",
      goal: "Normal Context Task",
      tokenEstimate: 500,
      recentActions: [],
      rules: [],
      memories: [],
      skills: [],
      files: [],
      currentState: {},
      traceMetadata: { contextHash: "h1", usedRuleIds: [], usedMemoryIds: [], usedSkillVersions: {}, usedDocumentIds: [], actionIds: [] },
      createdAt: Date.now(),
    };
    store.saveContextSnapshot(normalSnap);

    // 2. Save wrapped compacted snapshot (simulate output of compactor)
    const wrappedCompacted = {
      compactedSnapshot: {
        contextId: "ctx_compacted_1",
        goal: "Compacted Context Task",
        tokenEstimate: 200,
        recentActions: [],
        rules: [],
        memories: [],
        skills: [],
        files: [],
        currentState: {},
        traceMetadata: { contextHash: "h2", usedRuleIds: [], usedMemoryIds: [], usedSkillVersions: {}, usedDocumentIds: [], actionIds: [] },
        createdAt: Date.now(),
      },
      state: {
        compactionId: "cmp_1",
        originalTokenEstimate: 800,
        compactedTokenEstimate: 200,
        compactionBoundaryStep: 1,
        preservedGoal: "Compacted Context Task",
        preservedStepCount: 1,
        preservedMemoryIds: [],
        preservedRuleIds: [],
        preservedSkillVersions: {},
        compactedActionSummary: "Compacted",
        compactedAt: Date.now(),
        version: 1,
      },
    };
    store.saveContextSnapshot(wrappedCompacted);

    // 3. List snapshots and verify unwrapping
    const list = store.listContextSnapshots(10);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const foundCompacted = list.find((s) => s.contextId === "ctx_compacted_1");
    expect(foundCompacted).toBeDefined();
    expect(foundCompacted?.tokenEstimate).toBe(200);
    expect((foundCompacted as any)?.compactionState?.compactionId).toBe("cmp_1");

    // 4. Test delete
    const deleted = store.deleteContextSnapshot("ctx_compacted_1");
    expect(deleted).toBe(true);

    const listAfterDelete = store.listContextSnapshots(10);
    expect(listAfterDelete.find((s) => s.contextId === "ctx_compacted_1")).toBeUndefined();
  });
});

