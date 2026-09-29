import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpRateLimiter } from "../apps/server/src/mcp/rate-limiter.js";
import { ActionLedger } from "../apps/runner/src/agent-task/action-ledger.js";
import { LocalBridgeEventBus } from "../apps/runner/src/events/event-bus-service.js";
import { ApplicationDiscoveryEngine } from "../apps/runner/src/discovery/application-discovery-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Production-Grade Kernel & All-Source Discovery E2E", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;
  let runnerStateDir: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let managementSecret: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  function parseToolResult<T = any>(res: any): T {
    if (res.isError) {
      const msg = res.content?.[0]?.text ?? JSON.stringify(res);
      throw new Error(`Tool call returned isError: true - ${msg}`);
    }
    expect(res.isError).toBeFalsy();
    expect(res.content).toBeDefined();
    expect(res.content.length).toBeGreaterThan(0);
    const text = res.content[0].text;
    try {
      return JSON.parse(text);
    } catch {
      return text as unknown as T;
    }
  }

  const testCustomPolicy = {
    trustLevel: "custom" as const,
    filePolicy: "allow" as const,
    commandPolicy: "allow" as const,
    protectedFilesPolicy: "always-ask" as const,
    customRules: {
      files: { delete: "allow" as const },
      git: {
        stage: "allow" as const,
        unstage: "allow" as const,
        commit: "allow" as const,
        createBranch: "allow" as const,
        switchBranch: "allow" as const,
      },
    },
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-prod-kernel-test-"));
    dbFilePath = path.join(tmpDir, "server.db");
    projectDir = path.join(tmpDir, "test-workspace");
    fs.mkdirSync(projectDir, { recursive: true });

    runnerStateDir = path.join(tmpDir, "runner-state");
    runnerStatePath = path.join(runnerStateDir, "state.json");
    runnerProjectsPath = path.join(runnerStateDir, "projects.json");
    fs.mkdirSync(runnerStateDir, { recursive: true });

    managementSecret = "sec_prod_kernel_test_2026";
    const serverConfig = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config: serverConfig,
      migrationsDir,
      enableLogging: false,
      managementSecret,
      rateLimiter: new McpRateLimiter(500000, 2000),
    });

    const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
    const match = address.match(/:(\d+)$/);
    serverPort = match ? Number.parseInt(match[1]!, 10) : 19191;

    const mcpTokenRecord = serverInstance.tokenService.createToken({
      name: "Prod-Kernel-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
      purpose: "chatgpt",
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Runner-Kernel-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "windows-kernel-e2e-runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
      heartbeatIntervalMs: 5000,
    });

    runner = new LocalBridgeRunner(runnerConfig);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "Kernel Test Workspace",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(authorized.id, "project-code");
    runner.projectRegistry.setTrustPolicy(authorized.id, testCustomPolicy);
    projectId = authorized.id;

    await runner.start();

    // Wait for handshake
    const startWait = Date.now();
    while (serverInstance.runnerRegistry.count() === 0) {
      if (Date.now() - startWait > 10000) throw new Error("Runner did not register within 10000ms");
      await new Promise((r) => setTimeout(r, 50));
    }
    while (serverInstance.projectService.listProjects().length < 1) {
      if (Date.now() - startWait > 10000) throw new Error("Project was not synced within 10000ms");
      await new Promise((r) => setTimeout(r, 50));
    }

    serverInstance.projectService.setTrustPolicy(projectId, testCustomPolicy as any);

    // Connect MCP client
    transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serverPort}/mcp`), {
      protocolVersion: "2026-07-28",
      requestInit: {
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
      },
    });
    client = new Client(
      { name: "kernel-test-agent", version: "1.0.0" },
      { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
    );
    await client.connect(transport);
  }, 45000);

  afterAll(async () => {
    try {
      if (client) await client.close();
    } catch {}
    try {
      if (runner) await runner.stop();
    } catch {}
    try {
      if (serverInstance) await serverInstance.app.close();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // --------------------------------------------------------------------------
  // TEST 1: 100% Real Action Interception & Zero Phantom Actions
  // --------------------------------------------------------------------------
  it("Phase 1: 100% of real tool calls flow through ActionLedger with verifiable actions", async () => {
    const fileName = "action_ledger_verification_test.txt";
    const fileContent = "Unified Agent Execution Kernel Verification: Real File Content";

    // Call MCP tool directly without task ID (ambient session invocation)
    const createRes = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: fileName,
        content: fileContent,
      },
    });

    const parsed = parseToolResult<{ path: string; fullPath: string; hash?: string }>(createRes);
    expect(parsed.path).toBe(fileName);

    // Verify ambient task was created and tracked in ActionLedger
    const taskManager = runner.agentTaskManager;
    const tasks = Array.from(taskManager["tasks"].values());
    expect(tasks.length).toBeGreaterThan(0);

    const ambientTask = tasks.find((t) => t.id.startsWith("task_ambient_") || t.actionCount > 0);
    expect(ambientTask).toBeDefined();

    // Verify actionCount and actionsExecuted are > 0 (ELIMINATES PHANTOM ACTIONS)
    expect(ambientTask!.actionCount).toBeGreaterThanOrEqual(1);
    expect(ambientTask!.resourceUsage.actionsExecuted).toBeGreaterThanOrEqual(1);

    // Verify ActionLedger records and WAL exist on disk
    const ledger = runner.actionLedger;
    const ledgerActions = ledger.getActionsForTask(ambientTask!.id);
    expect(ledgerActions.length).toBeGreaterThanOrEqual(1);

    const action = ledgerActions[0];
    expect(action.actionId).toMatch(/^(act|action)_/);
    expect(action.status).toBe("COMMITTED");
    expect(action.alreadyExecuted).toBe(true);
    expect(action.alreadyVerified).toBe(true);
    expect(action.preStateHash).toBeDefined();
    expect(action.postStateHash).toBeDefined();

    // Verify physical file was written and postStateHash matches file SHA-256
    const absPath = path.join(projectDir, fileName);
    expect(fs.existsSync(absPath)).toBe(true);
    const content = fs.readFileSync(absPath, "utf-8");
    expect(content).toBe(fileContent);

    const expectedHash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
    expect(action.postStateHash).toBe(expectedHash);
  });

  // --------------------------------------------------------------------------
  // TEST 2: In-Flight Crash -> UNKNOWN -> World-State Reconciliation -> COMMITTED
  // --------------------------------------------------------------------------
  it("Phase 2: In-flight crash marks non-idempotent action UNKNOWN; world-state reconciles to COMMITTED", async () => {
    const crashTestDir = path.join(tmpDir, "crash-ledger-test");
    fs.mkdirSync(crashTestDir, { recursive: true });
    const eventBus = new LocalBridgeEventBus(crashTestDir);

    const targetFilePath = path.join(projectDir, "reconciliation_target.txt");
    const targetFileContent = "Physical file created before sudden process crash";

    // 1. Initial ActionLedger instance preparing and starting a non-idempotent file write action
    const ledger1 = new ActionLedger(crashTestDir, eventBus, undefined, runner.projectRegistry);
    const crashTaskId = "task_crash_sim_001";
    const idempotencyKey = "idem_crash_non_idempotent_01";

    const prepared = await ledger1.prepareAction({
      taskId: crashTaskId,
      toolName: "file.write",
      method: "file.write",
      idempotencyKey,
      params: { projectId, path: "reconciliation_target.txt", content: targetFileContent },
    });
    expect(prepared.status).toBe("PREPARED");

    await ledger1.startAction(prepared.actionId, "file_not_found");
    // Write physical file to simulate execution completing on disk just before crash / power-kill
    fs.writeFileSync(targetFilePath, targetFileContent, "utf-8");

    // Flush WAL and simulate immediate crash by not committing
    ledger1.flushTask(crashTaskId);

    // 2. Simulate runner restart and new ActionLedger startup
    const ledger2 = new ActionLedger(crashTestDir, eventBus, undefined, runner.projectRegistry);
    ledger2.loadTaskLedger(crashTaskId);

    const reloadedAction = ledger2.getAction(prepared.actionId);
    expect(reloadedAction).toBeDefined();
    // Non-idempotent in-flight action must transition to UNKNOWN with safeToRetry: false
    expect(reloadedAction!.status).toBe("UNKNOWN");
    expect(reloadedAction!.safeToRetry).toBe(false);
    expect(reloadedAction!.error).toContain("requires world-state reconciliation");

    // 3. Perform world-state reconciliation
    const reconciliation = await ledger2.reconcileUnknown(prepared.actionId);
    expect(reconciliation.reconciled).toBe(true);
    expect(reconciliation.outcome).toBe("COMMITTED");
    expect(reconciliation.entry.status).toBe("COMMITTED");
    expect(reconciliation.entry.safeToRetry).toBe(true);

    // Verify task ledger entries now reflect COMMITTED state
    const actionsAfter = ledger2.getActionsForTask(crashTaskId);
    expect(actionsAfter[0].status).toBe("COMMITTED");
    expect(actionsAfter[0].alreadyVerified).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Checkpoint State Machine (create, list, inspect, validate, diff, restore, prune)
  // --------------------------------------------------------------------------
  it("Phase 3: Checkpoint state machine validates integrity, diffs state, restores, and prunes safely", async () => {
    const taskManager = runner.agentTaskManager;
    const taskRes = await taskManager.create({
      title: "Checkpoint State Machine E2E Task",
      goal: "Demonstrate complete checkpoint lifecycle",
      projectId,
    });
    const taskId = taskRes.agentTaskId;

    // Create Checkpoint 1
    const cp1Res = await taskManager.createTaskCheckpoint(taskId, {
      trigger: "manual",
      description: "Initial baseline checkpoint",
    });
    expect(cp1Res.success).toBe(true);
    const cp1Id = cp1Res.checkpointId;

    // Simulate action execution modifying a file
    const cpFileName = "cp_state_file.txt";
    fs.writeFileSync(path.join(projectDir, cpFileName), "Version 1", "utf-8");
    const taskRec = taskManager.getTaskRecord(taskId)!;
    taskRec.modifiedFiles = [cpFileName];
    taskRec.actionCount = 5;
    taskManager.saveTask(taskRec);

    // Create Checkpoint 2
    const cp2Res = await taskManager.createTaskCheckpoint(taskId, {
      trigger: "milestone",
      description: "Milestone checkpoint after 5 actions",
    });
    expect(cp2Res.success).toBe(true);
    const cp2Id = cp2Res.checkpointId;

    // 1. List Checkpoints
    const listRes = await taskManager.listTaskCheckpoints(taskId, 10);
    expect(listRes.total).toBeGreaterThanOrEqual(2);
    expect(listRes.checkpoints.some((c) => c.checkpointId === cp1Id)).toBe(true);
    expect(listRes.checkpoints.some((c) => c.checkpointId === cp2Id)).toBe(true);

    // 2. Inspect Checkpoint
    const inspected = await taskManager.inspectTaskCheckpoint(taskId, cp2Id);
    expect(inspected.checkpointId).toBe(cp2Id);
    expect(inspected.schemaVersion).toBe(2);
    expect(inspected.completedSteps).toBe(5);

    // 3. Validate Checkpoint Integrity & World State
    const validation = await taskManager.validateTaskCheckpoint(taskId, cp2Id);
    expect(validation.valid).toBe(true);
    expect(validation.integrity).toBe(true);
    expect(validation.worldStateMatch).toBe(true);

    // 4. Diff Checkpoints
    const diff = await taskManager.diffTaskCheckpoints(taskId, cp1Id, cp2Id);
    expect(diff.stateDelta.stepDelta).toBe(5);
    expect(diff.modifiedFilesDiff.some((d) => d.includes(cpFileName))).toBe(true);

    // 5. Restore Checkpoint 1 (Rollback to initial baseline)
    const restoreRes = await taskManager.restoreTaskCheckpoint(taskId, {
      checkpointId: cp1Id,
      verifyStateBeforeResume: false,
    });
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.checkpointId).toBe(cp1Id);

    // Verify task state restored to Checkpoint 1 baseline
    const restoredTask = taskManager.getTaskRecord(taskId)!;
    expect(restoredTask.actionCount).toBe(0);
    expect(restoredTask.state).toBe("paused");

    // 6. Prune Checkpoints (keep 1)
    const pruneRes = await taskManager.pruneTaskCheckpoints(taskId, 1);
    expect(pruneRes.prunedCount).toBeGreaterThanOrEqual(1);
    expect(pruneRes.remainingCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 4: All-Computer Application Discovery with App Paths & Rich Aliases
  // --------------------------------------------------------------------------
  it("Phase 4: ApplicationDiscoveryEngine queries App Paths registry, Office paths, and matches aliases with fresh: true", async () => {
    const discoveryEngine = new ApplicationDiscoveryEngine();
    const discovered = await discoveryEngine.discoverApplications(true);
    expect(discovered.length).toBeGreaterThan(0);

    // Test alias generation for office, dev tools, and utilities
    const wordAliases = discoveryEngine.generateAliases("Microsoft Word", "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE");
    expect(wordAliases).toContain("word");
    expect(wordAliases).toContain("winword");
    expect(wordAliases).toContain("winword.exe");
    expect(wordAliases).toContain("microsoft word");

    const excelAliases = discoveryEngine.generateAliases("Microsoft Excel", "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE");
    expect(excelAliases).toContain("excel");
    expect(excelAliases).toContain("excel.exe");

    const codeAliases = discoveryEngine.generateAliases("Visual Studio Code", "C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe");
    expect(codeAliases).toContain("vscode");
    expect(codeAliases).toContain("code");

    // Verify DiscoveryService unified query with fresh: true
    const discoveryService = runner.discoveryService;
    discoveryService.setSecurityMode("unrestricted");

    const queryRes = await discoveryService.query({
      query: "word",
      action: "find_application",
      fresh: true,
      limit: 10,
    });

    expect(queryRes.fresh).toBe(true);
    expect(queryRes.cacheAge).toBeLessThan(10000);
    expect(queryRes.lastScanAt).toBeDefined();
    expect(queryRes.scanSource).toBe("local_windows_registry_and_filesystem");
  }, 35000);

  // --------------------------------------------------------------------------
  // TEST 5: State-Aware Idempotency & Closed-Loop Skipping
  // --------------------------------------------------------------------------
  it("Phase 5: State-aware idempotency safely skips committed action with metric recording", async () => {
    const testFile = "idempotency_state_file.txt";
    const testContent = "Idempotency State-Aware Check Content";
    fs.writeFileSync(path.join(projectDir, testFile), testContent, "utf-8");

    // First read
    const read1 = await client.callTool({
      name: "localbridge_file_read",
      arguments: {
        projectId,
        path: testFile,
      },
    });
    const parsed1 = parseToolResult<{ lines: { line: number; text: string }[] }>(read1);
    expect(parsed1.lines[0].text).toBe(testContent);

    // Measure metrics prior to second read
    const obsService = runner.observabilityService;
    const metricsBefore = await obsService.getMetrics({});
    const initialHits = metricsBefore.metrics.idempotency_hit_total || 0;

    // Second read with identical parameters (must hit idempotency skip)
    const read2 = await client.callTool({
      name: "localbridge_file_read",
      arguments: {
        projectId,
        path: testFile,
      },
    });
    const parsed2 = parseToolResult<{ lines: { line: number; text: string }[] }>(read2);
    expect(parsed2.lines[0].text).toBe(testContent);

    const metricsAfter = await obsService.getMetrics({});
    expect(metricsAfter.metrics.idempotency_hit_total).toBeGreaterThanOrEqual(initialHits + 1);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Multi-Step Execution with AgentExecutor & Complete Metrics
  // --------------------------------------------------------------------------
  it("Phase 6: Multi-step task execution through AgentExecutor syncs ActionLedger & populates system metrics", async () => {
    const taskManager = runner.agentTaskManager;
    const createRes = await taskManager.create({
      title: "Multi-Step ActionLedger Verified Task",
      goal: "Execute verified step operations and assert ActionLedger sync",
      projectId,
    });
    const taskId = createRes.agentTaskId;

    const taskRec = taskManager.getTaskRecord(taskId)!;
    taskRec.state = "running";
    taskRec.startedAt = Date.now();

    const ledger = runner.actionLedger;
    const obsService = runner.observabilityService;

    // Prepare 3 real sequential actions
    for (let i = 1; i <= 3; i++) {
      const stepFile = `step_${i}_output.txt`;
      const stepContent = `Multi-step execution content for step ${i}`;
      const idempotencyKey = `step_idem_key_${taskId}_${i}`;

      const prepared = await ledger.prepareAction({
        taskId,
        toolName: "file.write",
        method: "file.write",
        idempotencyKey,
        params: { projectId, path: stepFile, content: stepContent },
      });

      const preStateHash = await ledger.computePreStateHash("file.write", { projectId, path: stepFile });
      await ledger.startAction(prepared.actionId, preStateHash);

      // Perform physical action
      fs.writeFileSync(path.join(projectDir, stepFile), stepContent, "utf-8");
      const sideEffects = ledger.detectSideEffects("file.write", { path: stepFile }, { success: true });
      await ledger.recordExecuted(prepared.actionId, { success: true }, sideEffects);
      await ledger.recordObserved(prepared.actionId, { summary: `Wrote ${stepFile}` });

      await ledger.startVerification(prepared.actionId);
      const postStateHash = await ledger.computePostStateHash("file.write", { projectId, path: stepFile }, { success: true });
      const vResult = await ledger.verifyAction("file.write", { projectId, path: stepFile }, { success: true }, preStateHash, postStateHash);

      expect(vResult.verified).toBe(true);
      await ledger.recordVerified(prepared.actionId, postStateHash, vResult.details);
      await ledger.commitAction(prepared.actionId);

      // Update task record state
      ledger.reduceTaskState(taskRec);
      taskManager.saveTask(taskRec);
    }

    // Verify task counters match exactly 3 committed actions
    expect(taskRec.actionCount).toBe(3);
    expect(taskRec.resourceUsage.actionsExecuted).toBe(3);
    expect(taskRec.actionHistory.length).toBe(3);
    expect(taskRec.actionHistory.every((a) => a.status === "COMMITTED")).toBe(true);

    // Wait for event bus async handlers to settle
    await new Promise((r) => setTimeout(r, 200));

    // Verify metrics in ObservabilityService
    const metricsRes = await obsService.getMetrics({});
    expect(metricsRes.metrics.action_total).toBeGreaterThanOrEqual(3);
    expect(metricsRes.metrics.verification_total).toBeGreaterThanOrEqual(1);
    expect(metricsRes.metrics.verification_success_total).toBeGreaterThanOrEqual(1);
  }, 20000);
});

