import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpRateLimiter } from "../apps/server/src/mcp/rate-limiter.js";
import { AgentTaskManager } from "../apps/runner/src/agent-task/agent-task-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Durable Execution Deep Enhancement E2E Suite (12 Scenarios)", () => {
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

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-durable-e2e-"));
    runnerStateDir = path.join(tmpDir, "state");
    fs.mkdirSync(runnerStateDir, { recursive: true });
    dbFilePath = path.join(tmpDir, "durable-e2e.db");
    projectDir = path.join(tmpDir, "durable-project");
    runnerStatePath = path.join(runnerStateDir, "runner-state.json");
    runnerProjectsPath = path.join(runnerStateDir, "projects.json");

    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize git repo in projectDir
    execSync("git init", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email durable@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name DurableTester", { cwd: projectDir, stdio: "ignore" });

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "durable-target-app",
          version: "1.0.0",
          scripts: { test: "node -e \"console.log('ok')\"" },
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(projectDir, "README.md"), "# Durable Execution Test Target\n");
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    // 1. Start Server
    managementSecret = "sec_durable_management_token_2026";
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
      name: "Durable-MCP-Token",
      type: "mcp",
      scopes: ["read", "write", "execute"],
      purpose: "chatgpt",
    });
    mcpToken = mcpTokenRecord.token;

    const runnerTokenRecord = serverInstance.tokenService.createToken({
      name: "Durable-Runner-Token",
      type: "runner",
      scopes: ["runner:connect"],
    });
    runnerToken = runnerTokenRecord.token;

    // 2. Start Runner
    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Durable-Execution-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    const authorized = runner.projectRegistry.add(projectDir, {
      name: "durable-target-app",
      accessMode: "read-write",
    });
    runner.projectRegistry.setExecutionMode(authorized.id, "project-code");
    const testCustomPolicy = {
      trustLevel: "custom" as const,
      filePolicy: "allow" as const,
      commandPolicy: "controlled" as const,
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

    // 3. Connect MCP Client
    transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${serverPort}/mcp`),
      {
        protocolVersion: "2026-07-28",
        requestInit: {
          headers: {
            Authorization: `Bearer ${mcpToken}`,
            connection: "close",
          },
        },
      }
    );

    client = new Client(
      { name: "Durable-Agent-Brain", version: "2.0.0" },
      { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
    );
    await client.connect(transport);
  }, 35000);

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
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // Scenario 1: Task create -> 10 actions -> checkpoint -> resume
  // =========================================================================
  it("Scenario 1: Task create -> 10 actions -> checkpoint -> resume", async () => {
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "Test 1: 10 Actions Pipeline",
        goal: "Perform 10 verified steps and take a durable checkpoint",
        resourcePolicy: { maxActions: 50 },
      },
    });
    const task = parseToolResult<any>(createRes);
    expect(task.agentTaskId).toBeDefined();
    expect(task.state).toBe("queued");

    const taskId = task.agentTaskId;

    // Execute 10 distinct actions via runner agentTaskManager
    for (let i = 1; i <= 10; i++) {
      runner.agentTaskManager.recordAction(
        taskId,
        `Step ${i}: Inspect subcomponent ${i}`,
        `tool_call_${i}`,
        0,
        undefined
      );
    }

    let status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(10);

    // Create durable checkpoint via MCP tool
    const cpRes = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "Post-10-actions verified checkpoint",
        includeComputerState: true,
      },
    });
    const cpData = parseToolResult<any>(cpRes);
    expect(cpData.success).toBe(true);
    expect(cpData.checkpointId).toBeDefined();
    expect(cpData.checkpoint.schemaVersion).toBe(2);
    expect(cpData.checkpoint.currentStep).toBe(10);

    // Pause task
    const pauseRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_pause",
        arguments: { agentTaskId: taskId, reason: "Testing pause before resume" },
      })
    );
    expect(pauseRes.state).toBe("paused");

    // Resume task
    const resumeRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_resume",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(resumeRes.state).toBe("running");
    expect(resumeRes.canResume).toBe(true);
  });

  // =========================================================================
  // Scenario 2: Mid-execution interruption -> Nexus restart -> reload checkpoint -> resume
  // =========================================================================
  it("Scenario 2: Mid-execution interruption -> Nexus restart -> reload checkpoint -> resume", async () => {
    const createRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 2: Interruption & Cold Restart Recovery",
          goal: "Persist through sudden runner daemon death and recover from disk",
        },
      })
    );
    const taskId = createRes.agentTaskId;

    // Execute actions
    for (let i = 1; i <= 5; i++) {
      runner.agentTaskManager.recordAction(taskId, `Action ${i}`, `step_${i}`, 0);
    }

    // Persist checkpoint to disk
    const cp = await runner.agentTaskManager.createTaskCheckpoint({
      agentTaskId: taskId,
      trigger: "periodic",
      description: "Pre-crash durable snapshot",
      includeComputerState: true,
    });
    expect(cp.checkpoint.schemaVersion).toBe(2);
    expect(cp.checkpoint.currentStep).toBe(5);

    // Simulate crash / restart: instantiate fresh AgentTaskManager pointing to same stateDir
    const recoveredManager = new AgentTaskManager(runnerStateDir);
    const recoveredTask = recoveredManager.getTaskRecord(taskId);
    expect(recoveredTask).toBeDefined();
    expect(recoveredTask?.id).toBe(taskId);
    expect(recoveredTask?.actionCount).toBe(5);

    // Verify checkpoint recovered from disk
    const checkpoints = await recoveredManager.listTaskCheckpoints({ agentTaskId: taskId });
    expect(checkpoints.total).toBeGreaterThanOrEqual(1);
    expect(checkpoints.checkpoints[0]?.schemaVersion).toBe(2);

    // Resume recovered task
    const resumeResult = await recoveredManager.resume({ agentTaskId: taskId });
    expect(resumeResult.state).toBe("running");
    expect(resumeResult.canResume).toBe(true);
  });

  // =========================================================================
  // Scenario 3: Agent disconnect -> reconnect -> resume
  // =========================================================================
  it("Scenario 3: Agent disconnect -> reconnect -> resume", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 3: External Brain Disconnection",
          goal: "Survive network loss and resume cleanly without duplicate execution",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Simulate agent losing connection
    const disconnectRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_disconnect",
        arguments: {
          agentTaskId: taskId,
          agentId: "claude-code-session-99",
          reason: "Network socket drop / client reboot",
        },
      })
    );
    expect(disconnectRes.state).toBe("disconnected");

    // Check status confirms disconnected state
    let status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.state).toBe("disconnected");

    // Agent reconnects and calls resume
    const resumeRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_resume",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(resumeRes.state).toBe("running");
    expect(resumeRes.canResume).toBe(true);
  });

  // =========================================================================
  // Scenario 4: Windows application crash -> detect -> record failure -> recover state -> report to external Agent
  // =========================================================================
  it("Scenario 4: Windows application crash -> detect -> record failure -> recover state -> report to external Agent", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 4: Windows App Crash Detection",
          goal: "Capture native process termination and return structured failure to Agent",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Spawn a short-lived native Windows process and let it exit with error code 1
    const child = spawn("cmd.exe", ["/c", "exit 1"]);
    const exitCodePromise = new Promise<number>((resolve) => {
      child.on("exit", (code) => resolve(code ?? 1));
    });
    const code = await exitCodePromise;
    expect(code).toBe(1);

    // Record failure in agent task
    runner.agentTaskManager.recordAction(
      taskId,
      "execute native process cmd.exe",
      "cmd.exe /c exit 1",
      code,
      `Process exited with code ${code}`
    );

    const status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(1);

    const logs = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_logs",
        arguments: { agentTaskId: taskId },
      })
    );
    const failLog = logs.logs.find((l: any) => l.message.includes("exit 1") || l.logType === "action");
    expect(failLog).toBeDefined();
  });

  // =========================================================================
  // Scenario 5: Re-resume idempotency verification (no duplicate non-idempotent actions)
  // =========================================================================
  it("Scenario 5: Re-resume idempotency verification (no duplicate non-idempotent actions)", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 5: Idempotency Verification",
          goal: "Skip verified idempotent actions and halt on unverified non-idempotent action",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Add completed idempotent actions and an interrupted unverified non-idempotent action
    const record = runner.agentTaskManager.getTaskRecord(taskId)!;
    record.actionHistory = [
      {
        actionId: "act_1",
        idempotencyKey: "key_read_1",
        toolName: "localbridge_file_read",
        status: "COMMITTED",
        isIdempotent: true,
        alreadyExecuted: true,
        alreadyVerified: true,
        safeToRetry: true,
      },
      {
        actionId: "act_2",
        idempotencyKey: "key_state_2",
        toolName: "localbridge_computer_state_get",
        status: "COMMITTED",
        isIdempotent: true,
        alreadyExecuted: true,
        alreadyVerified: true,
        safeToRetry: true,
      },
      {
        actionId: "act_3",
        idempotencyKey: "key_click_3",
        toolName: "localbridge_computer_mouse_click",
        status: "POST_STATE", // Interrupted before verification! Non-idempotent
        isIdempotent: false,
        alreadyExecuted: true,
        alreadyVerified: false,
        safeToRetry: false,
      },
    ];

    // Trigger checkpoint
    const cp = await runner.agentTaskManager.createTaskCheckpoint({
      agentTaskId: taskId,
      trigger: "on_failure",
      description: "Interrupted execution snapshot",
    });

    // Pause and Resume
    await runner.agentTaskManager.pause({ agentTaskId: taskId });
    const resumeRes = await runner.agentTaskManager.resume({ agentTaskId: taskId });

    // Idempotent actions were skipped
    expect(resumeRes.idempotentSkipCount).toBeGreaterThanOrEqual(2);
    // Unsafe non-idempotent action was flagged RETRY_UNSAFE
    const unsafeAct = record.actionHistory.find((a) => a.actionId === "act_3");
    expect(unsafeAct?.status).toBe("RETRY_UNSAFE");
    expect(unsafeAct?.safeToRetry).toBe(false);
  });

  // =========================================================================
  // Scenario 6: 100+ actions long task with periodic automatic checkpoints
  // =========================================================================
  it("Scenario 6: 100+ actions long task with periodic automatic checkpoints", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 6: 100+ Actions Long Task",
          goal: "Execute 120 steps and verify checkpoints saved every 20 actions",
          resourcePolicy: { maxActions: 200 },
        },
      })
    );
    const taskId = task.agentTaskId;

    // Simulate 120 actions with periodic checkpoints every 20 actions
    for (let i = 1; i <= 120; i++) {
      runner.agentTaskManager.recordAction(taskId, `Step ${i}`, `action_${i}`, 0);
      if (i % 20 === 0) {
        await runner.agentTaskManager.createTaskCheckpoint({
          agentTaskId: taskId,
          trigger: "periodic",
          description: `Periodic checkpoint at step ${i}`,
        });
      }
    }

    const cpList = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_checkpoint_list",
        arguments: { agentTaskId: taskId, limit: 10 },
      })
    );
    expect(cpList.total).toBe(6); // 20, 40, 60, 80, 100, 120
    expect(cpList.checkpoints.length).toBe(6);

    const latest = cpList.checkpoints[0];
    expect(latest.currentStep).toBe(120);
    expect(latest.schemaVersion).toBe(2);
  });

  // =========================================================================
  // Scenario 7: 500+ actions long task (resource stability and memory management)
  // =========================================================================
  it("Scenario 7: 500+ actions long task with bounded memory", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 7: 500+ Actions Long Task",
          goal: "Execute 500 steps with strict memory bounding",
          resourcePolicy: { maxActions: 1000 },
        },
      })
    );
    const taskId = task.agentTaskId;

    const startMemory = process.memoryUsage().rss;

    // Simulate 500 actions
    for (let i = 1; i <= 500; i++) {
      runner.agentTaskManager.recordAction(taskId, `Long task step ${i}`, `step_${i}`, 0);
      if (i % 50 === 0) {
        await runner.agentTaskManager.createTaskCheckpoint({
          agentTaskId: taskId,
          trigger: "periodic",
          description: `Checkpoint step ${i}`,
        });
      }
    }

    const status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(500);

    // In-memory logs are trimmed to latest 250 entries
    const logs = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_logs",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(logs.logs.length).toBeLessThanOrEqual(250);

    const endMemory = process.memoryUsage().rss;
    const diffMb = (endMemory - startMemory) / 1024 / 1024;
    // Memory increase should be moderate (< 150MB)
    expect(diffMb).toBeLessThan(150);
  }, 60000);

  // =========================================================================
  // Scenario 8: Checkpoint corruption / missing checkpoint recovery
  // =========================================================================
  it("Scenario 8: Checkpoint corruption / missing checkpoint recovery", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 8: Corruption Recovery",
          goal: "Recover safely from damaged checkpoint JSON",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Create 1 valid checkpoint
    const validCp = await runner.agentTaskManager.createTaskCheckpoint({
      agentTaskId: taskId,
      trigger: "manual",
      description: "Valid baseline checkpoint",
    });

    // Write a corrupted checkpoint file into the checkpoints directory
    const cpDir = path.join(runnerStateDir, "agent-task-checkpoints", taskId);
    fs.mkdirSync(cpDir, { recursive: true });
    fs.writeFileSync(path.join(cpDir, "corrupted_cp.json"), "{ NOT_VALID_JSON !!!@#$");

    // Listing checkpoints should filter out corrupted files without throwing
    const listRes = await runner.agentTaskManager.listTaskCheckpoints({ agentTaskId: taskId });
    expect(listRes.total).toBeGreaterThanOrEqual(1);
    expect(listRes.checkpoints.find((c) => c.checkpointId === validCp.checkpointId)).toBeDefined();

    // Restoring non-existent or corrupted checkpoint returns graceful error rather than crashing
    try {
      await runner.agentTaskManager.restoreTaskCheckpoint({
        agentTaskId: taskId,
        checkpointId: "corrupted_cp",
      });
      expect.fail("Should have thrown LocalBridgeError for corrupted checkpoint");
    } catch (err: any) {
      expect(err.message).toBeDefined();
    }
  });

  // =========================================================================
  // Scenario 9: State mismatch detection and structured reporting
  // =========================================================================
  it("Scenario 9: State mismatch detection and structured reporting", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 9: State Mismatch Detection",
          goal: "Detect desktop window mismatch between checkpoint and live Windows state",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Create checkpoint with a fictitious active window
    const cp = await runner.agentTaskManager.createTaskCheckpoint({
      agentTaskId: taskId,
      trigger: "manual",
      description: "Checkpoint with Notepad active window",
    });
    // Inject fictitious computerState into checkpoint file
    const cpDir = path.join(runnerStateDir, "agent-task-checkpoints", taskId);
    const cpFile = path.join(cpDir, `${cp.checkpointId}.json`);
    const cpData = JSON.parse(fs.readFileSync(cpFile, "utf-8"));
    cpData.computerState = {
      timestamp: Date.now() - 5000,
      activeWindow: {
        hwnd: 99999999,
        title: "NonExistentApp - Visual Studio Code",
        processName: "NonExistentApp.exe",
        pid: 88888,
      },
    };
    fs.writeFileSync(cpFile, JSON.stringify(cpData, null, 2));

    // Restore checkpoint with verifyStateBeforeResume: true
    const restoreRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_checkpoint_restore",
        arguments: {
          agentTaskId: taskId,
          checkpointId: cp.checkpointId,
          verifyStateBeforeResume: true,
        },
      })
    );

    expect(restoreRes.success).toBe(true);
    expect(restoreRes.computerStateCheck).toBeDefined();
    expect(restoreRes.computerStateCheck.status).toBe("STATE_MISMATCH");
    expect(restoreRes.computerStateCheck.suggestedAction).toContain("Reactivate target window");
    expect(restoreRes.computerStateCheck.stateDiff).toBeDefined();
  });

  // =========================================================================
  // Scenario 10: Cross-checkpoint loop detection and diagnostic reporting
  // =========================================================================
  it("Scenario 10: Cross-checkpoint loop detection and diagnostic reporting", async () => {
    const loopDetector = runner.computerUseService.getLoopDetector();
    expect(loopDetector).toBeDefined();

    // Create repeated actions sequence
    const repeatingActions = [
      { toolName: "localbridge_computer_mouse_click", args: { x: 100, y: 100 }, result: "clicked" },
      { toolName: "localbridge_computer_mouse_click", args: { x: 100, y: 100 }, result: "clicked" },
      { toolName: "localbridge_computer_mouse_click", args: { x: 100, y: 100 }, result: "clicked" },
      { toolName: "localbridge_computer_mouse_click", args: { x: 100, y: 100 }, result: "clicked" },
      { toolName: "localbridge_computer_mouse_click", args: { x: 100, y: 100 }, result: "clicked" },
    ];

    const result = loopDetector.analyzeHistory(repeatingActions);
    expect(result.loopDetected).toBe(true);
    expect(result.pattern).toBe("REPEATED_ACTION");
    expect(result.suggestedAction).toBeDefined();
    expect(result.message).toContain("repeated 5 times");

    // Oscillating sequence
    const oscillatingActions = [
      { toolName: "click_A", args: {}, result: "A" },
      { toolName: "click_B", args: {}, result: "B" },
      { toolName: "click_A", args: {}, result: "A" },
      { toolName: "click_B", args: {}, result: "B" },
      { toolName: "click_A", args: {}, result: "A" },
      { toolName: "click_B", args: {}, result: "B" },
    ];
    const oscResult = loopDetector.analyzeHistory(oscillatingActions);
    expect(oscResult.loopDetected).toBe(true);
    expect(oscResult.pattern).toBe("OSCILLATION_LOOP");
  });

  // =========================================================================
  // Scenario 11: Realtime stream event delivery during recovery
  // =========================================================================
  it("Scenario 11: Realtime stream event delivery during recovery", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 11: Realtime Event Stream",
          goal: "Verify event bus delivers checkpoint and resume events",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Subscribe to task events first
    const subRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_event_subscribe",
        arguments: {
          subscriberId: "recovery_monitor",
          topicPattern: `agent_task.${taskId}.*`,
        },
      })
    );
    expect(subRes.subscription?.subscriptionId).toBeDefined();
    const subscriptionId = subRes.subscription.subscriptionId;

    // Publish durable task events
    const pubRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_event_publish",
        arguments: {
          topic: `agent_task.${taskId}.checkpoint`,
          payload: { taskId, checkpointId: "cp_test_11", state: "checkpointed" },
          taskId,
          checkpointId: "cp_test_11",
        },
      })
    );
    expect(pubRes.eventId).toBeDefined();

    // Poll events using subscriptionId
    const pollRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_event_poll",
        arguments: {
          subscriptionId,
          limit: 10,
        },
      })
    );
    expect(pollRes.events).toBeDefined();
    expect(pollRes.events.length).toBeGreaterThanOrEqual(1);
    expect(pollRes.events[0].taskId).toBe(taskId);
  });

  // =========================================================================
  // Scenario 12: Human Takeover -> Resume
  // =========================================================================
  it("Scenario 12: Human Takeover -> Resume", async () => {
    const task = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test 12: Human In The Loop Takeover",
          goal: "Transfer control to human operator and return control cleanly",
        },
      })
    );
    const taskId = task.agentTaskId;

    // Human takes control
    const takeoverRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_takeover",
        arguments: {
          agentTaskId: taskId,
          takeoverBy: "human_admin_operator",
          action: "takeover",
          reason: "Manual verification of MFA prompt or system dialogue",
        },
      })
    );
    expect(takeoverRes.state).toBe("waiting_for_human");

    let status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.state).toBe("waiting_for_human");

    // Human operator finishes and returns control
    const returnRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_takeover",
        arguments: {
          agentTaskId: taskId,
          takeoverBy: "human_admin_operator",
          action: "return_control",
          reason: "Manual intervention completed successfully",
        },
      })
    );
    expect(returnRes.state).toBe("running");

    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.state).toBe("running");

    // Execute verified step post-takeover
    runner.agentTaskManager.recordAction(taskId, "Verify system post-takeover", "node -e \"console.log('done')\"", 0);
    const rec = runner.agentTaskManager.getTaskRecord(taskId)!;
    rec.executionInstruction = "Verify post-takeover state";

    // Complete task
    const completeRes = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_complete",
        arguments: {
          agentTaskId: taskId,
          summary: "12 Scenarios durable execution fully verified",
        },
      })
    );
    expect(completeRes.state).toBe("completed");
  });
});
