import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { ArtifactService } from "../apps/runner/src/artifacts/artifact-service.js";
import { WorkspaceCheckpointService } from "../apps/runner/src/checkpoints/checkpoint-service.js";
import { WorkspaceHygieneService } from "../apps/runner/src/hygiene/hygiene-service.js";
import { WindowsComputerUseService } from "../apps/runner/src/computer-use/computer-use-service.js";
import { CodePatchService } from "../apps/runner/src/code-patch/patch-service.js";
import { AgentMemoryService } from "../apps/runner/src/memory/memory-service.js";
import { UnifiedValidationService } from "../apps/runner/src/validation/validation-service.js";
import { AgentTaskManager } from "../apps/runner/src/agent-task/agent-task-manager.js";
import { AgentCommunicationService } from "../apps/server/src/agent-comm/communication-service.js";
import { searchProjectFiles } from "../apps/runner/src/filesystem/fs-search.js";
import { grepProjectFiles } from "../apps/runner/src/filesystem/fs-grep.js";
import { readFileStreamChunk } from "../apps/runner/src/filesystem/fs-stream.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("LocalBridge / Nexus Agent Infrastructure Layer Comprehensive E2E", () => {
  let tmpDir: string;
  let projectDir: string;
  let runnerStateDir: string;
  let projectRegistry: ProjectRegistry;
  let artifactService: ArtifactService;
  let checkpointService: WorkspaceCheckpointService;
  let hygieneService: WorkspaceHygieneService;
  let computerUseService: WindowsComputerUseService;
  let codePatchService: CodePatchService;
  let memoryService: AgentMemoryService;
  let validationService: UnifiedValidationService;
  let agentTaskManager: AgentTaskManager;
  let agentCommService: AgentCommunicationService;
  let projectId: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-infra-test-"));
    runnerStateDir = path.join(tmpDir, "runner-state");
    projectDir = path.join(tmpDir, "test-project");

    fs.mkdirSync(runnerStateDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize git in project dir
    try {
      execSync("git init", { cwd: projectDir, stdio: "ignore" });
      execSync('git config user.name "NexusTester"', { cwd: projectDir, stdio: "ignore" });
      execSync('git config user.email "tester@nexus.local"', { cwd: projectDir, stdio: "ignore" });
    } catch {
      // ignore
    }

    // Create sample project files
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "test-infra-app",
          version: "1.0.0",
          scripts: {
            test: 'node -e "console.log(\'tests passed\')"',
            build: 'node -e "console.log(\'build success\')"',
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(projectDir, "index.ts"),
      `export function calculateSum(a: number, b: number): number {\n  return a + b;\n}\n`
    );

    // Initial git commit
    try {
      execSync("git add .", { cwd: projectDir, stdio: "ignore" });
      execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });
    } catch {
      // ignore
    }

    // Projects registry setup
    const projectsPath = path.join(runnerStateDir, "projects.json");
    projectRegistry = new ProjectRegistry(projectsPath);
    const projRecord = projectRegistry.add(projectDir, {
      name: "Test Infra Project",
      accessMode: "read-write",
    });
    projectId = projRecord.id;

    // Initialize all Infrastructure Services
    artifactService = new ArtifactService(runnerStateDir, projectRegistry);
    checkpointService = new WorkspaceCheckpointService(runnerStateDir, projectRegistry);
    hygieneService = new WorkspaceHygieneService(projectRegistry);
    computerUseService = new WindowsComputerUseService(runnerStateDir);
    codePatchService = new CodePatchService(projectRegistry, checkpointService);
    memoryService = new AgentMemoryService(runnerStateDir);
    validationService = new UnifiedValidationService(projectRegistry);
    agentTaskManager = new AgentTaskManager(runnerStateDir);
    agentCommService = new AgentCommunicationService();
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ==========================================
  // 1. Agent Task Full Lifecycle
  // ==========================================
  describe("Agent Task Lifecycle (Create -> Assign -> Attempt -> Coding Run -> Heartbeat -> Reconcile -> Complete -> Handoff)", () => {
    let taskId: string;

    it("creates an autonomous Agent Task with hard resource governance limits", async () => {
      const task = await agentTaskManager.create({
        projectId,
        title: "Implement High-Performance Caching Layer",
        goal: "Add Redis-compatible in-memory caching with TTL eviction",
        resourcePolicy: {
          maxWallTimeMs: 3600000,
          maxActions: 150,
          maxDiskWriteBytes: 52428800,
        },
      });

      expect(task).toBeDefined();
      expect(task.agentTaskId).toMatch(/^task_/);
      expect(task.state).toBe("queued");
      expect(task.resourcePolicy?.maxActions).toBe(150);
      taskId = task.agentTaskId;
    });

    it("assigns task to a coding agent role", async () => {
      const res = await agentTaskManager.assign({
        agentTaskId: taskId,
        agentId: "agent_coder_alpha",
        role: "Senior Backend Engineer",
      });

      expect(res.agentId).toBe("agent_coder_alpha");
      expect(res.state).toBe("assigned");
    });

    it("initiates execution attempt #1 with strategy and git baseline", async () => {
      const res = await agentTaskManager.attempt({
        agentTaskId: taskId,
        plan: "Strategy: create cache.ts, verify with unit tests, benchmark throughput",
      });

      expect(res.state).toBe("attempting");
      expect(res.attemptNumber).toBe(1);
    });

    it("executes coding run inside task attempt", async () => {
      const res = await agentTaskManager.codingRun({
        agentTaskId: taskId,
        instruction: "Writing src/cache.ts and wiring interface",
        targetFiles: ["src/cache.ts"],
      });

      expect(res.status).toBe("running");
      expect(res.filesModified).toContain("src/cache.ts");
    });

    it("emits heartbeat updating step and progress status", async () => {
      const res = await agentTaskManager.heartbeat({
        agentTaskId: taskId,
        progressNote: "Compiling TypeScript files and checking types",
      });

      expect(res.alive).toBe(true);
      expect(res.state).toBe("running");
      expect(res.deadlineRemainingMs).toBeGreaterThan(0);
    });

    it("pauses and resumes task", async () => {
      const pauseRes = await agentTaskManager.pause({ agentTaskId: taskId, reason: "Awaiting user input" });
      expect(pauseRes.state).toBe("paused");

      const resumeRes = await agentTaskManager.resume({ agentTaskId: taskId });
      expect(resumeRes.state).toBe("running");
    });

    it("reconciles task state safely", async () => {
      const res = await agentTaskManager.reconcile({ agentTaskId: taskId });
      expect(res.reconciledState).toBeDefined();
    });

    it("completes task with verification summary and artifacts", async () => {
      const res = await agentTaskManager.complete({
        agentTaskId: taskId,
        summary: "Cache implemented successfully with 99.9% test coverage",
        artifactsProduced: ["art_cache_benchmark_001"],
        validationPassed: true,
      });

      expect(res.state).toBe("completed");
      expect(res.artifacts).toContain("art_cache_benchmark_001");
      expect(res.completedAt).toBeDefined();
    });

    it("hands off task context to another agent", async () => {
      const res = await agentTaskManager.handoff({
        agentTaskId: taskId,
        toAgentId: "agent_reviewer_beta",
        note: "Code is complete, please review PR and verify benchmarks",
      });

      expect(res.toAgentId).toBe("agent_reviewer_beta");
      expect(res.state).toBe("completed");
    });
  });

  // ==========================================
  // 2. Artifact System
  // ==========================================
  describe("Artifact System (Streaming Chunks, SHA-256 Digest, Import & Export)", () => {
    let artifactId: string;
    const chunk1 = Buffer.from("Hello Artifact World Chunk 1! ");
    const chunk2 = Buffer.from("And this is Chunk 2 with extra binary data.");
    const fullContent = Buffer.concat([chunk1, chunk2]);
    const expectedSha256 = crypto.createHash("sha256").update(fullContent).digest("hex");

    it("creates an artifact entry with metadata", async () => {
      const res = await artifactService.create({
        projectId,
        name: "test-log.txt",
        contentType: "text/plain",
        tags: ["log", "e2e"],
        totalSizeBytes: fullContent.length,
      });

      expect(res.artifact).toBeDefined();
      expect(res.artifact.name).toBe("test-log.txt");
      expect(res.artifact.status).toBe("uploading");
      artifactId = res.artifact.id;
    });

    it("streams data chunks with SHA-256 verification", async () => {
      // Chunk 0
      const c1Hash = crypto.createHash("sha256").update(chunk1).digest("hex");
      const res1 = await artifactService.writeChunk({
        artifactId,
        chunkIndex: 0,
        dataBase64: chunk1.toString("base64"),
        chunkSha256: c1Hash,
        isLastChunk: false,
      });
      expect(res1.bytesWritten).toBe(chunk1.length);
      expect(res1.status).toBe("uploading");

      // Chunk 1 (final)
      const c2Hash = crypto.createHash("sha256").update(chunk2).digest("hex");
      const res2 = await artifactService.writeChunk({
        artifactId,
        chunkIndex: 1,
        dataBase64: chunk2.toString("base64"),
        chunkSha256: c2Hash,
        isLastChunk: true,
      });
      expect(res2.bytesWritten).toBe(chunk2.length);
      expect(res2.status).toBe("ready");
      expect(res2.totalSizeBytes).toBe(fullContent.length);
      expect(res2.sha256).toBe(expectedSha256);
    });

    it("reads back artifact in bounded chunks", async () => {
      const readRes = await artifactService.readChunk({
        artifactId,
        offsetBytes: 0,
        maxBytes: fullContent.length,
      });

      expect(readRes.bytesRead).toBe(fullContent.length);
      expect(readRes.isLastChunk).toBe(true);
      const readBuffer = Buffer.from(readRes.dataBase64, "base64");
      expect(readBuffer.toString("utf-8")).toBe(fullContent.toString("utf-8"));
    });

    it("exports artifact to workspace file", async () => {
      const exportRelPath = "exported-artifact.txt";
      const exportRes = await artifactService.exportArtifact({
        artifactId,
        projectId,
        targetPath: exportRelPath,
        overwrite: true,
      });

      expect(exportRes.success).toBe(true);
      expect(exportRes.bytesWritten).toBe(fullContent.length);
      expect(exportRes.sha256).toBe(expectedSha256);

      // Verify physical file on disk
      const targetAbs = path.join(projectDir, exportRelPath);
      expect(fs.existsSync(targetAbs)).toBe(true);
      expect(fs.readFileSync(targetAbs).toString("utf-8")).toBe(fullContent.toString("utf-8"));
    });

    it("imports a workspace file as a new artifact", async () => {
      const importRes = await artifactService.importArtifact({
        projectId,
        sourcePath: "exported-artifact.txt",
        name: "imported-artifact.txt",
        tags: ["imported"],
      });

      expect(importRes.artifact.name).toBe("imported-artifact.txt");
      expect(importRes.artifact.status).toBe("ready");
      expect(importRes.artifact.sha256).toBe(expectedSha256);
      expect(importRes.artifact.sizeBytes).toBe(fullContent.length);
    });

    it("lists artifacts with tag filters", async () => {
      const listRes = await artifactService.list({
        projectId,
        tag: "e2e",
      });

      expect(listRes.artifacts.length).toBeGreaterThanOrEqual(1);
      expect(listRes.artifacts.some((a) => a.id === artifactId)).toBe(true);
    });

    it("aborts an in-progress upload and cleans up blocks", async () => {
      const created = await artifactService.create({
        projectId,
        name: "aborted.bin",
        contentType: "application/octet-stream",
      });

      await artifactService.writeChunk({
        artifactId: created.artifact.id,
        chunkIndex: 0,
        dataBase64: Buffer.from("temporary data").toString("base64"),
        isLastChunk: false,
      });

      const abortRes = await artifactService.abort({ artifactId: created.artifact.id });
      expect(abortRes.aborted).toBe(true);

      const check = await artifactService.get({ artifactId: created.artifact.id });
      expect(check.artifact.status).toBe("aborted");
    });
  });

  // ==========================================
  // 3. Workspace Checkpoint & Safe Rollback
  // ==========================================
  describe("Workspace Checkpoints (Snapshot, Diff Tracking, and Rollback)", () => {
    let checkpointId: string;
    const testFile = "src/feature.ts";
    const initialCode = "export const feature = 'v1.0.0';\n";
    const modifiedCode = "export const feature = 'v2.0.0-broken';\n";

    it("creates a checkpoint snapshot of the workspace", async () => {
      const absPath = path.join(projectDir, testFile);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, initialCode);

      const res = await checkpointService.create({
        projectId,
        name: "pre-refactor-baseline",
        description: "Baseline before modifying feature.ts",
      });

      expect(res.checkpoint.id).toMatch(/^cp_/);
      expect(res.checkpoint.name).toBe("pre-refactor-baseline");
      expect(res.checkpoint.files.length).toBeGreaterThan(0);
      checkpointId = res.checkpoint.id;
    });

    it("restores checkpoint safely after breaking modifications", async () => {
      const absPath = path.join(projectDir, testFile);
      fs.writeFileSync(absPath, modifiedCode);
      expect(fs.readFileSync(absPath, "utf-8")).toBe(modifiedCode);

      const restoreRes = await checkpointService.restore({
        projectId,
        checkpointId,
      });

      expect(restoreRes.success).toBe(true);
      expect(restoreRes.checkpointId).toBe(checkpointId);

      // Verify file reverted to original code
      expect(fs.readFileSync(absPath, "utf-8")).toBe(initialCode);
    });

    it("lists and gets checkpoint manifests", async () => {
      const listRes = await checkpointService.list({ projectId });
      expect(listRes.checkpoints.length).toBeGreaterThanOrEqual(1);

      const getRes = await checkpointService.get({ projectId, checkpointId });
      expect(getRes.checkpoint.id).toBe(checkpointId);
      expect(getRes.checkpoint.name).toBe("pre-refactor-baseline");
    });
  });

  // ==========================================
  // 4. Workspace Hygiene & Safe Recovery
  // ==========================================
  describe("Workspace Hygiene & Safe Recovery", () => {
    it("detects untracked files and dirty state", async () => {
      // Create a junk untracked file and temp file
      fs.writeFileSync(path.join(projectDir, "temp_junk.tmp"), "junk content");
      fs.writeFileSync(path.join(projectDir, "untracked_script.sh"), "#!/bin/sh\n");

      const checkRes = await hygieneService.check({ projectId });
      expect(checkRes.untrackedFilesCount).toBeGreaterThan(0);
      expect(checkRes.issues.length).toBeGreaterThan(0);
    });

    it("cleans untracked junk files safely", async () => {
      const cleanRes = await hygieneService.cleanUntracked({ projectId });
      expect(cleanRes.totalCount).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(projectDir, "temp_junk.tmp"))).toBe(false);
    });
  });

  // ==========================================
  // 5. Code Patching (Unified Diff Preview & Apply & Rollback)
  // ==========================================
  describe("Code Patch Service (Atomic Diff Application & Rollback)", () => {
    const patchTarget = "src/math.ts";
    const originalMath = "export function add(a: number, b: number) {\n  return a + b;\n}\n";
    const unifiedDiff = `--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1,3 +1,3 @@\n export function add(a: number, b: number) {\n-  return a + b;\n+  return Number(a) + Number(b);\n }\n`;

    it("previews a unified diff patch without modifying disk", async () => {
      const absPath = path.join(projectDir, patchTarget);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, originalMath);

      const previewRes = await codePatchService.preview({
        projectId,
        patchContent: unifiedDiff,
      });

      expect(previewRes.canApplyAll).toBe(true);
      expect(previewRes.filesAffected).toContain("src/math.ts");
      expect(previewRes.hunks.length).toBe(1);

      // Verify original file is untouched
      expect(fs.readFileSync(absPath, "utf-8")).toBe(originalMath);
    });

    it("atomically applies patch with automatic checkpoint backup", async () => {
      const absPath = path.join(projectDir, patchTarget);

      const applyRes = await codePatchService.apply({
        projectId,
        patchContent: unifiedDiff,
      });

      expect(applyRes.applied).toBe(true);
      expect(applyRes.backupCheckpointId).toBeDefined();
      expect(applyRes.filesModified).toContain("src/math.ts");

      // Verify file modified
      const newContent = fs.readFileSync(absPath, "utf-8");
      expect(newContent).toContain("Number(a) + Number(b)");

      // Rollback patch using checkpoint
      const rollbackRes = await codePatchService.rollback({
        projectId,
        backupCheckpointId: applyRes.backupCheckpointId!,
      });
      expect(rollbackRes.rolledBack).toBe(true);

      // Verify reverted back
      expect(fs.readFileSync(absPath, "utf-8")).toBe(originalMath);
    });
  });

  // ==========================================
  // 6. Advanced Filesystem Operations
  // ==========================================
  describe("Filesystem Advanced (Search, Grep, Chunk Stream)", () => {
    it("searches project files recursively with filters", () => {
      const searchRes = searchProjectFiles(
        {
          projectId,
          query: "index",
          fileExtensions: [".ts"],
          type: "file",
          path: ".",
        },
        { canonicalRoot: projectDir }
      );

      expect(searchRes.matches.length).toBeGreaterThanOrEqual(1);
      expect(searchRes.matches.some((m) => m.name === "index.ts")).toBe(true);
    });

    it("greps text and regex line-by-line across files", async () => {
      const grepRes = await grepProjectFiles(
        {
          projectId,
          pattern: "calculateSum",
          path: ".",
          isRegex: false,
          caseSensitive: true,
        },
        { canonicalRoot: projectDir }
      );

      expect(grepRes.totalMatches).toBeGreaterThanOrEqual(1);
      expect(grepRes.fileMatches.some((f) => f.relativePath.includes("index.ts"))).toBe(true);
    });

    it("reads bounded streaming chunk with sha256 checksum", () => {
      const chunkRes = readFileStreamChunk(
        {
          projectId,
          path: "index.ts",
          offsetBytes: 0,
          maxBytes: 32,
        },
        { canonicalRoot: projectDir }
      );

      expect(chunkRes.bytesRead).toBe(32);
      expect(chunkRes.content.length).toBe(32);
      expect(chunkRes.sha256).toBeDefined();
      expect(chunkRes.isLastChunk).toBe(false);
    });
  });

  // ==========================================
  // 7. Scoped Agent Memory
  // ==========================================
  describe("Scoped Agent Memory (Global, Project, Session, Agent, Task)", () => {
    it("sets, gets, searches, and purges scoped memory entries", async () => {
      // 1. Set in project scope
      await memoryService.set({
        scope: "project",
        scopeId: projectId,
        key: "preferred_test_runner",
        value: { runner: "vitest", flags: ["--reporter=verbose"] },
        tags: ["config", "testing"],
      });

      // 2. Set in task scope
      await memoryService.set({
        scope: "task",
        scopeId: "task_1001",
        key: "last_error",
        value: "SyntaxError on line 42",
        tags: ["debug"],
      });

      // 3. Get entry
      const getRes = await memoryService.get({
        scope: "project",
        scopeId: projectId,
        key: "preferred_test_runner",
      });
      expect(getRes.entry).toBeDefined();
      expect((getRes.entry?.value as any).runner).toBe("vitest");

      // 4. Search entries
      const searchRes = await memoryService.search({
        query: "SyntaxError",
        scope: "task",
      });
      expect(searchRes.entries.length).toBe(1);
      expect(searchRes.entries[0].key).toBe("last_error");

      // 5. Delete entry
      const delRes = await memoryService.delete({
        scope: "task",
        scopeId: "task_1001",
        key: "last_error",
      });
      expect(delRes.deleted).toBe(true);

      // 6. Purge project entries
      const purgeRes = await memoryService.purge({
        scope: "project",
        scopeId: projectId,
      });
      expect(purgeRes.purgedCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // 8. Multi-Agent Communication & Handoff
  // ==========================================
  describe("Multi-Agent Communication (Messaging, ACK, and Peer Handoff)", () => {
    const agentAId = "agent_arch_001";
    const agentBId = "agent_tester_002";

    it("registers agent identities and advertises roles", async () => {
      const regA = await agentCommService.register({
        agentId: agentAId,
        name: "Architect Agent",
        role: "System Architect",
        capabilities: ["design", "decomposition", "scaffolding"],
      });
      expect(regA.agent.agentId).toBe(agentAId);

      const regB = await agentCommService.register({
        agentId: agentBId,
        name: "QA Tester Agent",
        role: "Quality Assurance",
        capabilities: ["test_execution", "coverage", "fuzzing"],
      });
      expect(regB.agent.agentId).toBe(agentBId);
    });

    it("sends, reads, and acknowledges direct agent messages", async () => {
      // Send from A to B
      const sendRes = await agentCommService.sendMessage({
        senderId: agentAId,
        recipientId: agentBId,
        messageType: "request",
        subject: "Verify authentication endpoints",
        payload: { endpoints: ["/api/auth/login", "/api/auth/token"] },
      });
      expect(sendRes.message.id).toMatch(/^msg_/);

      // B reads unread
      const readRes = await agentCommService.readMessages({
        agentId: agentBId,
        unreadOnly: true,
      });
      expect(readRes.messages.length).toBe(1);
      expect(readRes.messages[0].id).toBe(sendRes.message.id);
      expect(readRes.messages[0].subject).toBe("Verify authentication endpoints");

      // B ACKs message
      const ackRes = await agentCommService.ackMessages({
        agentId: agentBId,
        messageIds: [sendRes.message.id],
      });
      expect(ackRes.ackedCount).toBe(1);
    });

    it("creates multi-agent conversations and coordinates handoffs", async () => {
      const convRes = await agentCommService.createConversation({
        title: "Sprint 42 Refactor Group",
        participants: [agentAId, agentBId],
      });
      expect(convRes.conversation.id).toMatch(/^conv_/);

      const handoffRes = await agentCommService.handoff({
        fromAgentId: agentAId,
        toAgentId: agentBId,
        taskId: "task_sprint42",
        contextSummary: "Architecture docs complete, handing off test plan execution",
      });
      expect(handoffRes.status).toBe("transferred");
      expect(handoffRes.handoffId).toBeDefined();
    });
  });

  // ==========================================
  // 9. Windows Computer Use
  // ==========================================
  describe("Windows Computer Use (Clipboard and Window/Display Diagnostics)", () => {
    it("writes and reads Windows system clipboard safely", async () => {
      const testClipText = `Nexus-Test-Clipboard-${Date.now()}`;
      const writeRes = await computerUseService.clipboardWrite({ text: testClipText });
      expect(writeRes.success).toBe(true);

      const readRes = await computerUseService.clipboardRead();
      expect(readRes.text).toContain(testClipText);
    });

    it("queries active window list and display monitors", async () => {
      const winRes = await computerUseService.windowList();
      expect(Array.isArray(winRes.windows)).toBe(true);

      const dispRes = await computerUseService.displayList();
      expect(Array.isArray(dispRes.displays)).toBe(true);
      expect(dispRes.displays.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 10. Unified Validation Service
  // ==========================================
  describe("Unified Validation Runner", () => {
    it("detects ecosystem and runs package tests", async () => {
      const valRes = await validationService.run({
        projectId,
        checkType: "test",
      });

      expect(valRes.projectType).toBe("node");
      expect(valRes.overallPassed).toBe(true);
      expect(valRes.checks.length).toBe(1);
      expect(valRes.checks[0].checkType).toBe("test");
      expect(valRes.checks[0].passed).toBe(true);
    });
  });
});
