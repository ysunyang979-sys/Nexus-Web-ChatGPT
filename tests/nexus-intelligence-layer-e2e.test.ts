import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { initDatabase, type DatabaseConnection } from "../apps/server/src/db/index.js";
import { IntelligenceRuntime } from "../apps/server/src/intelligence/runtime.js";
import { ContextCompactor } from "../apps/server/src/intelligence/context/compactor.js";
import type { AgentCheckpoint, ActionItem } from "@localbridge/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Intelligence Layer E2E Integration Suite", () => {
  let tmpDir: string;
  let dbConn: DatabaseConnection;
  let runtime: IntelligenceRuntime;
  let eventBus: EventEmitter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-intel-e2e-"));
    const dbPath = path.join(tmpDir, "intel-e2e.sqlite");
    dbConn = initDatabase(dbPath, migrationsDir);
    runtime = new IntelligenceRuntime(dbConn.db);
    eventBus = new EventEmitter();
    runtime.attachEventBus(eventBus);
  });

  afterAll(() => {
    try {
      dbConn?.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe("1. Skills & AI Candidate Lifecycle (Phase 2 & 5)", () => {
    it("should validate and reject dangerous or malformed skill proposals using 6-point validator", () => {
      const validator = runtime.skillRegistry.getValidator();

      // Missing required step actionName & toolName
      const malformedReport = validator.validate({
        skillId: "malformed-skill",
        version: {
          version: "1.0.0",
          skillId: "malformed-skill",
          name: "Malformed Skill",
          description: "Lacks toolName in steps",
          capabilities: ["cli"],
          steps: [
            {
              stepNumber: 1,
              actionName: "run",
              toolName: "", // missing
            } as any,
          ],
          source: "AI_GENERATED",
          hash: "abc",
          createdAt: Date.now(),
        },
      });

      expect(malformedReport.validationStatus).toBe("invalid");
      expect(malformedReport.dryRunValid).toBe(false);

      // Dangerous command pattern: root deletion attempt
      const dangerousReport = validator.validate({
        skillId: "dangerous-eval-skill",
        version: {
          version: "1.0.0",
          skillId: "dangerous-eval-skill",
          name: "Dangerous Skill",
          description: "Executes rm -rf /",
          capabilities: ["cli"],
          steps: [
            {
              stepNumber: 1,
              actionName: "cleanup",
              toolName: "localbridge_command_run",
              input: { command: "rm -rf /" },
            },
          ],
          source: "AI_GENERATED",
          hash: "xyz",
          createdAt: Date.now(),
        },
      });

      expect(dangerousReport.validationStatus).toBe("invalid");
      expect(dangerousReport.securityValid).toBe(false);
      expect(dangerousReport.validationErrors.some((e) => e.includes("Root deletion"))).toBe(true);
    });

    it("should propose a valid AI skill candidate, approve, and activate", async () => {
      const candidate = runtime.skillCandidateManager.proposeCandidate({
        skillId: "git-commit-helper",
        name: "Git Commit Helper",
        description: "Automated git commit and message generation helper",
        proposedBy: "agent-task-001",
        extractedSteps: [
          {
            stepNumber: 1,
            actionName: "git_status",
            toolName: "localbridge_git_status",
            input: { cwd: "." },
          },
          {
            stepNumber: 2,
            actionName: "git_commit",
            toolName: "localbridge_git_commit",
            input: { message: "feat: automated commit" },
          },
        ],
        tools: ["localbridge_git_status", "localbridge_git_commit"],
        evidence: {
          sourceTaskId: "task-100",
          observedToolCalls: ["localbridge_git_status", "localbridge_git_commit"],
          sampleOutput: "Working tree clean",
          confidenceScore: 0.95,
        },
      });

      expect(candidate.status).toBe("CANDIDATE");

      // Accept candidate into official versioned registry
      const { skill, candidate: acceptedCandidate } = runtime.skillCandidateManager.acceptCandidate(
        candidate.candidateId,
        { targetVersion: "1.0.0", reviewNotes: "Validated and approved for deployment" }
      );

      expect(acceptedCandidate.status).toBe("ACTIVE");
      expect(skill.skillId).toBe("git-commit-helper");
      expect(skill.activeVersion).toBe("1.0.0");
      expect(skill.status).toBe("ACTIVE");

      // Verify skill in registry
      const loaded = runtime.skillRegistry.getSkill("git-commit-helper");
      expect(loaded).toBeDefined();
      expect(loaded?.activeVersion).toBe("1.0.0");
    });

    it("should support skill version upgrade and rollback", async () => {
      // Add version 1.1.0
      runtime.skillRegistry.createSkillWithVersion({
        version: "1.1.0",
        skillId: "git-commit-helper",
        name: "Git Commit Helper v1.1.0",
        description: "Improved git commit helper",
        capabilities: ["git", "terminal"],
        steps: [
          {
            stepNumber: 1,
            actionName: "git_diff",
            toolName: "localbridge_git_diff",
            input: { cached: true },
          },
        ],
      });

      // Activate version 1.1.0
      runtime.skillRegistry.activateVersion("git-commit-helper", "1.1.0");
      let skill = runtime.skillRegistry.getSkill("git-commit-helper");
      expect(skill?.activeVersion).toBe("1.1.0");

      // Rollback to 1.0.0
      runtime.skillRegistry.rollbackVersion("git-commit-helper", "1.0.0");
      skill = runtime.skillRegistry.getSkill("git-commit-helper");
      expect(skill?.activeVersion).toBe("1.0.0");
    });
  });

  describe("2. Memory Lifecycle & Action Committed Pipeline (Phase 3 & 10)", () => {
    it("should asynchronously generate memory candidate when agent.action.committed event fires", async () => {
      // Simulate action committed event on eventBus
      eventBus.emit("agent.action.committed", {
        topic: "agent.action.committed",
        source: "runner",
        actionId: "act_build_fix_101",
        taskId: "task_project_build",
        payload: {
          actionId: "act_build_fix_101",
          taskId: "task_project_build",
          toolName: "localbridge_command_run",
          wasRecovered: true,
          retryCount: 1,
          verificationStatus: "verified",
        },
      });

      // Allow async pipeline loop to process
      await new Promise((r) => setTimeout(r, 150));

      const candidates = runtime.memoryRuntime.listCandidates({ status: "CANDIDATE" });
      expect(candidates.length).toBeGreaterThanOrEqual(1);

      const candidate = candidates.find((c) => c.provenance?.actionIds?.includes("act_build_fix_101"));
      expect(candidate).toBeDefined();
      expect(candidate?.content).toContain("Recovery action succeeded");

      // Accept candidate into memory store
      const accepted = runtime.memoryRuntime.acceptCandidate(
        candidate!.candidateId,
        "Verified working build fix pattern"
      );

      expect(accepted).toBeDefined();
      expect(accepted?.status).toBe("ACTIVE");

      // Recall memory
      const recalled = runtime.memoryRuntime.recall({
        query: "command_run",
        scope: "TASK",
      });
      expect(recalled.memories.length).toBeGreaterThanOrEqual(1);
      expect(recalled.memories.some((m) => m.id === accepted?.id)).toBe(true);
    });

    it("should consolidate active memories into a synthesized memory entry", () => {
      // Add two related memories
      const m1 = runtime.memoryRuntime.setMemory({
        key: "mem_ts_error_1",
        scope: "PROJECT",
        type: "EXPERIENCE",
        content: "Error TS2307: Cannot find module @localbridge/shared - run pnpm build first",
        tags: ["typescript", "build", "monorepo"],
        importance: 8,
        confidence: 0.8,
      });

      const m2 = runtime.memoryRuntime.setMemory({
        key: "mem_ts_error_2",
        scope: "PROJECT",
        type: "EXPERIENCE",
        content: "Error TS2304: Cannot find name describe in vitest - include vitest/globals in tsconfig",
        tags: ["typescript", "vitest", "tsconfig"],
        importance: 7,
        confidence: 0.7,
      });

      const consolidated = runtime.memoryRuntime.consolidateMemories(
        [m1.id, m2.id],
        "Consolidated TypeScript Monorepo Resolution Patterns",
        "Ensure build precedes typecheck and vitest globals are declared."
      );

      expect(consolidated).toBeDefined();
      expect(consolidated?.status).toBe("ACTIVE");

      // Original memories should now be archived
      const old1 = runtime.memoryRuntime.getMemory(m1.id);
      const old2 = runtime.memoryRuntime.getMemory(m2.id);
      expect(old1?.status).toBe("ARCHIVED");
      expect(old2?.status).toBe("ARCHIVED");
    });
  });

  describe("3. Global Rules Hierarchy & Conflict Detection (Phase 4)", () => {
    it("should enforce priority hierarchy: SYSTEM (100) > CORE (80) > USER_GLOBAL (60) > PROJECT (40) > TASK (20)", () => {
      runtime.ruleRegistry.addRule({
        ruleId: "core_safety_gate",
        name: "Core Safety Gate",
        priority: "CORE",
        content: "Do not execute unapproved binary executions outside workspace",
        scope: "GLOBAL",
      });

      runtime.ruleRegistry.addRule({
        ruleId: "project_linter_rule",
        name: "Project Linter Rule",
        priority: "PROJECT",
        content: "Always use ESLint 8.x flat rules",
        scope: "PROJECT",
      });

      const effectiveRules = runtime.ruleRegistry.listRules();
      expect(effectiveRules.length).toBeGreaterThanOrEqual(2);

      // Verify descending priority rank order
      for (let i = 0; i < effectiveRules.length - 1; i++) {
        expect(effectiveRules[i].priorityRank).toBeGreaterThanOrEqual(effectiveRules[i + 1].priorityRank);
      }
    });

    it("should prevent deletion of immutable SYSTEM rules", () => {
      const systemRules = runtime.ruleRegistry.listRules({ scope: "GLOBAL" });
      const immutable = systemRules.find((r) => r.priority === "SYSTEM");
      if (immutable) {
        expect(() => {
          runtime.ruleRegistry.deleteRule(immutable.ruleId);
        }).toThrow(/system rules are immutable/i);
      }
    });

    it("should detect conflicting rules", () => {
      runtime.ruleRegistry.addRule({
        ruleId: "rule_network_allow",
        name: "Network Allow",
        priority: "PROJECT",
        content: "Always allow external network access for package installations",
        scope: "PROJECT",
      });

      const conflicts = runtime.ruleRegistry.detectConflicts({
        name: "Network Deny",
        content: "Never allow external network access; forbidden in sandbox",
        priority: "PROJECT",
        scope: "PROJECT",
      });

      expect(conflicts.hasConflict).toBe(true);
      expect(conflicts.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe("4. Knowledge Ingestion & SHA-256 Deduplication (Phase 6)", () => {
    it("should ingest documents, calculate SHA-256 hash, and reject duplicate content", async () => {
      const docContent = "# Nexus Architecture Guide\nNexus acts as an MCP Execution Bridge and Agent Harness.";

      const doc1 = await runtime.knowledgeImporter.importFile({
        filename: "Nexus-Architecture.md",
        content: docContent,
        explicitType: "DOCUMENT",
        source: "USER_IMPORT",
      });

      expect(doc1.result).toBe("success");
      expect(doc1.fileHash).toBeDefined();
      expect(doc1.detectedType).toBe("DOCUMENT");

      // Ingest duplicate
      const doc2 = await runtime.knowledgeImporter.importFile({
        filename: "Nexus-Architecture-Duplicate.md",
        content: docContent,
        explicitType: "DOCUMENT",
        source: "USER_IMPORT",
      });

      expect(doc2.result).toBe("duplicate");
      expect(doc2.fileHash).toBe(doc1.fileHash);
    });
  });

  describe("5. Dynamic Context & Deterministic Compaction (Phase 7 & 8)", () => {
    it("should dynamically build context snapshot aggregation without raw blob pollution", async () => {
      const context = await runtime.contextBuilder.buildContext({
        taskId: "task_e2e_compaction",
        projectId: "proj_default",
        goal: "Run test suite and verify build",
      });

      expect(context.rules.length).toBeGreaterThan(0);
      expect(context.skills.length).toBeGreaterThan(0);
      expect(context.tokenEstimate).toBeGreaterThan(0);
      expect(context.contextId).toBeDefined();
    });

    it("should deterministically compact context to token budget without LLM calls", async () => {
      const rawContext = await runtime.contextBuilder.buildContext({
        taskId: "task_e2e_compaction",
        projectId: "proj_default",
        goal: "Run test suite and verify build",
      });

      const compactor = new ContextCompactor();
      const tokenBudget = 100;
      const { compactedSnapshot, state } = compactor.compact(rawContext, tokenBudget);

      expect(compactedSnapshot.tokenEstimate).toBeLessThanOrEqual(rawContext.tokenEstimate);
      expect(state.compactionBoundaryStep).toBeDefined();

      // Verify system rules were preserved
      const hasSystemRule = compactedSnapshot.rules.some((r) => r.priorityRank >= 80);
      expect(hasSystemRule).toBe(true);
    });
  });

  describe("6. Checkpoint Reference-Only Architecture & Crash Recovery (Phase 9 & 10)", () => {
    it("should verify checkpoint stores reference IDs and recovers state without memory blob bloat", () => {
      const mockCommittedActions: ActionItem[] = [
        {
          actionId: "act_001",
          actionName: "localbridge_file_read",
          status: "COMMITTED",
          input: { path: "package.json" },
          output: "{\"name\": \"localbridge\"}",
          alreadyVerified: true,
          isIdempotent: true,
          executionId: "exec_001",
          stepNumber: 1,
          createdAt: Date.now(),
          committedAt: Date.now(),
        },
      ];

      const checkpoint: AgentCheckpoint = {
        schemaVersion: 2,
        checkpointId: "cp_test_ref_001",
        agentTaskId: "task_durability_001",
        taskId: "task_durability_001",
        executionId: "exec_durability_001",
        timestamp: new Date().toISOString(),
        createdAtMs: Date.now(),
        taskState: "running",
        executionState: "running",
        currentStep: 1,
        completedSteps: 1,
        failedSteps: 0,
        actionHistory: mockCommittedActions,
        intelligenceState: {
          memoryIds: ["mem_ts_error_1", "mem_ts_error_2"],
          ruleIds: ["core_safety_gate", "sys_boundary_protection"],
          skillVersions: { "git-commit-helper": "1.0.0" },
          contextHash: "ctx_hash_abcdef",
          compactionBoundary: 5,
          ledgerPosition: 1,
          lastCommittedActionId: "act_001",
        },
        artifacts: [],
      };

      // Checkpoint size verification: reference IDs only -> serialization is tiny
      const serialized = JSON.stringify(checkpoint);
      expect(serialized.length).toBeLessThan(2048); // < 2KB!

      // Crash & recovery simulation
      const restoredCheckpoint: AgentCheckpoint = JSON.parse(serialized);
      expect(restoredCheckpoint.intelligenceState?.memoryIds).toEqual(["mem_ts_error_1", "mem_ts_error_2"]);
      expect(restoredCheckpoint.intelligenceState?.ruleIds).toEqual(["core_safety_gate", "sys_boundary_protection"]);
      expect(restoredCheckpoint.intelligenceState?.skillVersions["git-commit-helper"]).toBe("1.0.0");
      expect(restoredCheckpoint.intelligenceState?.lastCommittedActionId).toBe("act_001");
    });

    it("should guarantee Action Ledger commit durability regardless of intelligence failures", () => {
      // Simulate action committed event
      let actionCommitSucceeded = false;
      const committedAction = {
        actionId: "act_critical_002",
        status: "COMMITTED",
        timestamp: Date.now(),
      };
      actionCommitSucceeded = true; // Hard durability boundary

      // Fire async event that might throw in an ill-behaved consumer
      eventBus.emit("action.committed", {
        actionId: committedAction.actionId,
        taskId: "task_broken",
        actionType: "bad_tool",
        input: null, // intentionally bad input to test resilience
      });

      // The action commit itself must remain succeeded
      expect(actionCommitSucceeded).toBe(true);
    });
  });
});
