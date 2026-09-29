import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";

import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { ArtifactService } from "../apps/runner/src/artifacts/artifact-service.js";
import { WorkspaceCheckpointService } from "../apps/runner/src/checkpoints/checkpoint-service.js";
import { WorkspaceHygieneService } from "../apps/runner/src/hygiene/hygiene-service.js";
import { WindowsComputerUseService } from "../apps/runner/src/computer-use/computer-use-service.js";
import { CodePatchService } from "../apps/runner/src/code-patch/patch-service.js";
import { AgentMemoryService } from "../apps/runner/src/memory/memory-service.js";
import { UnifiedValidationService } from "../apps/runner/src/validation/validation-service.js";
import { AgentTaskManager } from "../apps/runner/src/agent-task/agent-task-manager.js";
import { AgentCommunicationService } from "../apps/server/src/agent-comm/communication-service.js";
import { WorkflowOrchestrator } from "../apps/server/src/workflow/workflow-orchestrator.js";
import { searchProjectFiles } from "../apps/runner/src/filesystem/fs-search.js";
import { grepProjectFiles } from "../apps/runner/src/filesystem/fs-grep.js";
import { readFileStreamChunk } from "../apps/runner/src/filesystem/fs-stream.js";

describe("Nexus / LocalBridge 156 Tool Deep Stress & Capability Audit Suite", () => {
  let tempBaseDir: string;
  let runnerStateDir: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let projectId: string;

  // Services
  let artifactService: ArtifactService;
  let checkpointService: WorkspaceCheckpointService;
  let hygieneService: WorkspaceHygieneService;
  let computerUseService: WindowsComputerUseService;
  let codePatchService: CodePatchService;
  let memoryService: AgentMemoryService;
  let validationService: UnifiedValidationService;
  let agentTaskManager: AgentTaskManager;
  let agentCommService: AgentCommunicationService;
  let workflowOrchestrator: WorkflowOrchestrator;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-stress-audit-"));
    runnerStateDir = path.join(tempBaseDir, "runner-state");
    projectDir = path.join(tempBaseDir, "stress-project");
    fs.mkdirSync(runnerStateDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize git
    try {
      execSync("git init", { cwd: projectDir, stdio: "ignore" });
      execSync('git config user.name "NexusAuditor"', { cwd: projectDir, stdio: "ignore" });
      execSync('git config user.email "auditor@nexus.local"', { cwd: projectDir, stdio: "ignore" });
    } catch {}

    // Initial files
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "stress-app", version: "1.0.0", scripts: { test: "node -e 0" } }, null, 2)
    );
    fs.writeFileSync(path.join(projectDir, "index.ts"), "export const APP_ENV = 'production';\n");

    try {
      execSync("git add .", { cwd: projectDir, stdio: "ignore" });
      execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });
    } catch {}

    const projectsPath = path.join(runnerStateDir, "projects.json");
    projectRegistry = new ProjectRegistry(projectsPath);
    const proj = projectRegistry.add(projectDir, { name: "Stress Audit Project", accessMode: "read-write" });
    projectId = proj.id;

    // Instantiate services
    artifactService = new ArtifactService(runnerStateDir, projectRegistry);
    checkpointService = new WorkspaceCheckpointService(runnerStateDir, projectRegistry);
    hygieneService = new WorkspaceHygieneService(projectRegistry);
    computerUseService = new WindowsComputerUseService(runnerStateDir);
    computerUseService.setSecurityMode("universal");
    codePatchService = new CodePatchService(projectRegistry, checkpointService);
    memoryService = new AgentMemoryService(runnerStateDir);
    validationService = new UnifiedValidationService(projectRegistry);
    agentTaskManager = new AgentTaskManager(runnerStateDir);
    agentCommService = new AgentCommunicationService();

    const dummyContext = {
      resolveProjectRunner: () => "mock_runner",
      resolveAnyRunner: () => "mock_runner",
      runnerRegistry: { list: () => [{ id: "mock_runner" }] },
      logAudit: () => {},
      request: async () => ({ success: true }),
      communicationService: agentCommService,
    } as any;
    workflowOrchestrator = new WorkflowOrchestrator(dummyContext);
  });

  afterAll(() => {
    try {
      // P0-4: Prevent tests from destroying raw evidence (tmpDir and WAL).
      // fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // ========================================================
  // 1. Idempotency & Fault Resilience (Requirement 4)
  // ========================================================
  describe("Idempotency & Error Boundaries", () => {
    it("handles non-existent artifact get gracefully", async () => {
      await expect(artifactService.get({ artifactId: "art_non_existent_id" })).rejects.toThrow();
    });

    it("handles non-existent checkpoint get gracefully", async () => {
      await expect(
        checkpointService.get({ checkpointId: "cp_non_existent", projectId })
      ).rejects.toThrow();
    });

    it("deleting a non-existent artifact returns deleted: false without throwing", async () => {
      const res = await artifactService.delete({ artifactId: "art_never_existed" });
      expect(res.deleted).toBe(false);
    });

    it("memory operations are idempotent on overwrite and missing delete", async () => {
      await memoryService.set({
        scope: "project",
        scopeId: projectId,
        key: "db_version",
        value: "v2.4",
      });

      // Repeat write with identical key
      const res2 = await memoryService.set({
        scope: "project",
        scopeId: projectId,
        key: "db_version",
        value: "v2.5",
      });
      expect(res2.entry.value).toBe("v2.5");

      // Delete non-existent key returns false
      const delRes = await memoryService.delete({
        scope: "project",
        scopeId: projectId,
        key: "non_existent_key_xyz",
      });
      expect(delRes.deleted).toBe(false);
    });
  });

  // ========================================================
  // 2. Dry Run & Safe Rollback (Requirement 6 & 7)
  // ========================================================
  describe("Dangerous Operation Dry Run & Safe Rollback", () => {
    it("supports dryRun on checkpoint restore without modifying disk", async () => {
      const targetFile = path.join(projectDir, "dry-run-check.txt");
      fs.writeFileSync(targetFile, "original content");

      const cp = await checkpointService.create({
        projectId,
        name: "dry-run-baseline",
      });

      fs.writeFileSync(targetFile, "modified content");

      // Dry run restore
      const restoreDryRes = (await checkpointService.restore({
        projectId,
        checkpointId: cp.checkpoint.id,
        dryRun: true,
      } as any)) as any;

      expect(restoreDryRes.dryRun).toBe(true);
      expect(restoreDryRes.success).toBe(true);
      // Verify file is STILL modified on disk
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("modified content");

      // Actual restore
      const restoreReal = await checkpointService.restore({
        projectId,
        checkpointId: cp.checkpoint.id,
      });
      expect(restoreReal.success).toBe(true);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe("original content");
    });

    it("supports dryRun on workspace hygiene clean without deleting files", async () => {
      const junkFile = path.join(projectDir, "temp-junk-to-clean.tmp");
      fs.writeFileSync(junkFile, "temporary junk bytes");

      const dryClean = (await hygieneService.clean({
        projectId,
        cleanTempFiles: true,
        dryRun: true,
      } as any)) as any;

      expect(dryClean.dryRun).toBe(true);
      expect(dryClean.tempFilesRemoved).toBeGreaterThanOrEqual(1);
      // File must STILL exist after dryRun
      expect(fs.existsSync(junkFile)).toBe(true);

      // Real clean removes it
      const realClean = await hygieneService.clean({
        projectId,
        cleanTempFiles: true,
      });
      expect(realClean.tempFilesRemoved).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(junkFile)).toBe(false);
    });

    it("prevents partial code corruption by failing atomically on conflict", async () => {
      const mathFile = path.join(projectDir, "atomic-test.ts");
      fs.writeFileSync(mathFile, "function add(a, b) { return a + b; }\n");

      // Conflicting patch that expects different old content
      const conflictingPatch = `--- a/atomic-test.ts
+++ b/atomic-test.ts
@@ -1,1 +1,1 @@
-function subtract(a, b) { return a - b; }
+function add(a: number, b: number) { return a + b; }
`;

      await expect(
        codePatchService.apply({
          projectId,
          patchContent: conflictingPatch,
          atomic: true,
        })
      ).rejects.toThrow(/Cannot apply patch atomically/);

      // Original file remains completely unchanged
      expect(fs.readFileSync(mathFile, "utf-8")).toBe("function add(a, b) { return a + b; }\n");
    });
  });

  // ========================================================
  // 3. File Tool Limits, Streaming & Unicode (Requirement 8)
  // ========================================================
  describe("File Limits, Large Chunk Streaming & Unicode", () => {
    it("reads a 10MB file in bounded chunks without out-of-memory", async () => {
      const bigFilePath = path.join(projectDir, "large-dataset.bin");
      const tenMb = 10 * 1024 * 1024;
      const sampleChunk = Buffer.alloc(64 * 1024, 0x41); // 64KB 'A'
      const writeFd = fs.openSync(bigFilePath, "w");
      let written = 0;
      while (written < tenMb) {
        fs.writeSync(writeFd, sampleChunk);
        written += sampleChunk.length;
      }
      fs.closeSync(writeFd);

      // Stream read with bounded 64KB chunks
      const streamRes = readFileStreamChunk(
        {
          projectId,
          path: "large-dataset.bin",
          offsetBytes: 0,
          maxBytes: 64 * 1024,
        },
        { canonicalRoot: projectDir }
      );

      expect(streamRes.bytesRead).toBe(64 * 1024);
      expect(streamRes.totalSizeBytes).toBe(tenMb);
      expect(streamRes.isLastChunk).toBe(false);
      expect(streamRes.content.length).toBeGreaterThan(0);

      // Clean up big file
      fs.unlinkSync(bigFilePath);
    });

    it("handles complex multi-byte UTF-8, Chinese, and Emoji paths and contents", async () => {
      const unicodeRel = "docs/测试-🚀-多语言.md";
      const unicodeContent = "# 🌟 极速测试\n这是一段包含 Unicode 4字节表情 🪐 与中文字符的文档。\n";
      const abs = path.join(projectDir, unicodeRel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, unicodeContent, "utf-8");

      // Search finds the unicode file
      const searchRes = searchProjectFiles(
        {
          projectId,
          query: "多语言",
        },
        { canonicalRoot: projectDir }
      );
      expect(searchRes.matches.some((f) => f.relativePath.includes("测试"))).toBe(true);

      // Grep matches inside unicode content
      const grepRes = await grepProjectFiles(
        {
          projectId,
          query: "极速测试",
        },
        { canonicalRoot: projectDir }
      );
      expect(grepRes.fileMatches.length).toBeGreaterThanOrEqual(1);
      expect(grepRes.fileMatches[0].lines[0].lineText).toContain("🌟 极速测试");
    });
  });

  // ========================================================
  // 4. Real Process & Port Lifecycle (Requirement 10 & 11)
  // ========================================================
  describe("Real Process, Port, and Network Lifecycle", () => {
    it("starts a real HTTP server, verifies port binding, and releases cleanly", async () => {
      const testPort = 39182;
      const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "alive", port: testPort }));
      });

      await new Promise<void>((resolve) => server.listen(testPort, "127.0.0.1", () => resolve()));

      // Query HTTP server
      const responseData = await new Promise<string>((resolve, reject) => {
        http.get(`http://127.0.0.1:${testPort}`, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(body));
        }).on("error", reject);
      });

      const parsed = JSON.parse(responseData);
      expect(parsed.status).toBe("alive");
      expect(parsed.port).toBe(testPort);

      // Close server and verify port freed
      await new Promise<void>((resolve) => server.close(() => resolve()));

      // Ensure port is available again
      const testServer2 = http.createServer();
      await new Promise<void>((resolve) =>
        testServer2.listen(testPort, "127.0.0.1", () => {
          testServer2.close(() => resolve());
        })
      );
    });
  });

  // ========================================================
  // 5. Windows Computer Use Comprehensive Pipeline (Requirement 12)
  // ========================================================
  describe("Windows Computer Use Real OS Automation", () => {
    it("safely handles multi-line Unicode and Chinese clipboard roundtrip", async () => {
      const specialClip = `Nexus-测试剪贴板-🚀\nLine 2 with "quotes" and symbols: @#$%^&*()\nTimestamp: ${Date.now()}`;
      const writeRes = await computerUseService.clipboardWrite({ text: specialClip });
      expect(writeRes.success).toBe(true);

      const readRes = await computerUseService.clipboardRead();
      expect(readRes.text).toBe(specialClip);
    });

    it("enumerates desktop display monitors with physical metrics", async () => {
      const dispRes = await computerUseService.displayList();
      expect(dispRes.displays.length).toBeGreaterThanOrEqual(1);
      const primary = dispRes.displays.find((d) => d.isPrimary) || dispRes.displays[0];
      expect(primary.bounds.width).toBeGreaterThan(0);
      expect(primary.bounds.height).toBeGreaterThan(0);
    });

    it("captures full screen snapshot returning valid base64 payload", async () => {
      const snapRes = await computerUseService.screenSnapshot({ format: "png" });
      expect(snapRes.width).toBeGreaterThan(0);
      expect(snapRes.height).toBeGreaterThan(0);
      expect(snapRes.base64Data.length).toBeGreaterThan(100);

      // Verify PNG magic header
      const buffer = Buffer.from(snapRes.base64Data, "base64");
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // 'P'
      expect(buffer[2]).toBe(0x4e); // 'N'
      expect(buffer[3]).toBe(0x47); // 'G'
    });
  });

  // ========================================================
  // 6. Multi-Scope Agent Memory Isolation (Requirement 14)
  // ========================================================
  describe("Multi-Scope Agent Memory Isolation & Purge", () => {
    it("strictly isolates global, project, session, agent, and task memories", async () => {
      await memoryService.set({
        scope: "global",
        key: "system_theme",
        value: "dark",
      });

      await memoryService.set({
        scope: "project",
        scopeId: projectId,
        key: "build_tool",
        value: "pnpm",
      });

      await memoryService.set({
        scope: "session",
        scopeId: "sess_101",
        key: "current_goal",
        value: "refactor_auth",
      });

      await memoryService.set({
        scope: "agent",
        scopeId: "agent_architect",
        key: "expertise",
        value: "distributed_systems",
      });

      await memoryService.set({
        scope: "task",
        scopeId: "task_999",
        key: "temp_scratch",
        value: "pending_verification",
      });

      // Verify scope lookups
      const g = await memoryService.get({ scope: "global", key: "system_theme" });
      expect(g.entry?.value).toBe("dark");

      const p = await memoryService.get({ scope: "project", scopeId: projectId, key: "build_tool" });
      expect(p.entry?.value).toBe("pnpm");

      const s = await memoryService.get({ scope: "session", scopeId: "sess_101", key: "current_goal" });
      expect(s.entry?.value).toBe("refactor_auth");

      // Cross-scope lookups must return null
      const cross = await memoryService.get({ scope: "project", scopeId: "other_proj", key: "build_tool" });
      expect(cross.entry).toBeNull();

      // Purge task scope
      const purgeRes = await memoryService.purge({ scope: "task", scopeId: "task_999" });
      expect(purgeRes.purgedCount).toBe(1);

      const checkPurged = await memoryService.get({ scope: "task", scopeId: "task_999", key: "temp_scratch" });
      expect(checkPurged.entry).toBeNull();
    });
  });

  // ========================================================
  // 7. Multi-Agent Conversation & State Handoff (Requirement 15)
  // ========================================================
  describe("Multi-Agent Collaborative Protocol & Full State Handoff", () => {
    it("coordinates A -> B -> C messaging and preserves task context handoff", async () => {
      const agentA = "agent_planner";
      const agentB = "agent_coder";
      const agentC = "agent_reviewer";

      await agentCommService.register({ id: agentA, name: "Planner", roles: ["planning"] });
      await agentCommService.register({ id: agentB, name: "Coder", roles: ["coding"] });
      await agentCommService.register({ id: agentC, name: "Reviewer", roles: ["review"] });

      // Create conversation
      const conv = await agentCommService.createConversation({
        title: "Feature Implementation Group",
        participants: [agentA, agentB, agentC],
      });

      // A sends message to B
      const msgAB = await agentCommService.sendMessage({
        conversationId: conv.conversation.id,
        senderId: agentA,
        recipientId: agentB,
        subject: "Implement Auth Middleware",
        payload: { specUrl: "/docs/auth.md" },
      });
      expect(msgAB.message.id).toBeDefined();

      // B receives and ACKs
      const readB = await agentCommService.readMessages({ agentId: agentB });
      expect(readB.messages.some((m) => m.id === msgAB.message.id)).toBe(true);

      await agentCommService.ackMessage({
        agentId: agentB,
        messageId: msgAB.message.id,
      });

      // B hands off completed task to C
      const handoffRes = await agentCommService.handoff({
        fromAgentId: agentB,
        toAgentId: agentC,
        taskId: "task_auth_42",
        contextSummary: "Implemented JWT validation with RS256; test suite passing",
        checkpoints: ["cp_auth_v1"],
        artifacts: ["art_jwt_spec"],
      });

      expect(handoffRes.status).toBe("transferred");
      expect(handoffRes.handoffId).toBeDefined();

      // C reads handoff message
      const readC = await agentCommService.readMessages({ agentId: agentC });
      const handoffMsg = readC.messages.find((m) => m.messageType === "handoff");
      expect(handoffMsg).toBeDefined();
      expect(handoffMsg?.payload.contextSummary).toContain("RS256");
      expect(handoffMsg?.payload.checkpoints).toContain("cp_auth_v1");
    });
  });

  // ========================================================
  // 8. Agent Task Long-Running Lifecycle (Requirement 13)
  // ========================================================
  describe("Agent Task Lifecycle Execution & Reconcile", () => {
    it("completes full lifecycle: create -> assign -> attempt -> coding -> heartbeat -> reconcile -> complete", async () => {
      const created = await agentTaskManager.create({
        projectId,
        title: "Migrate database queries",
      });
      const taskId = created.agentTaskId;

      // Assign
      await agentTaskManager.assign({ agentTaskId: taskId, agentId: "agent_db_worker" });

      // Attempt
      await agentTaskManager.attempt({ agentTaskId: taskId, attemptNumber: 1, prompt: "Refactor connection pooling" });

      // Coding Run
      await agentTaskManager.codingRun({ agentTaskId: taskId, instruction: "Update db config pool size" });

      // Heartbeat
      const hb = await agentTaskManager.heartbeat({ agentTaskId: taskId, progressPercent: 75, message: "Pool configured" });
      expect(hb.progressPercent).toBe(75);

      // Reconcile
      const rec = await agentTaskManager.reconcile({ agentTaskId: taskId });
      expect(rec.reconciledState).toBeDefined();

      // Complete
      const comp = await agentTaskManager.complete({
        agentTaskId: taskId,
        summary: "Connection pooling optimized; max connections set to 20",
        artifactsProduced: ["art_db_config"],
      });
      expect(comp.state).toBe("completed");
      expect(comp.summary).toContain("max connections set to 20");
    });
  });
});
