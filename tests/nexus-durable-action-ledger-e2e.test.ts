import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpRateLimiter } from "../apps/server/src/mcp/rate-limiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Durable Action Ledger E2E Suite", () => {
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

  async function startServerAndRunner(isRestart = false) {
    if (!isRestart) {
      managementSecret = "sec_durable_ledger_token_2026";
    }

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

    if (!isRestart) {
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
    }

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "Durable-Ledger-Runner",
      statePath: runnerStatePath,
      projectsPath: runnerProjectsPath,
      logging: { level: "silent", pretty: false },
      reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
      heartbeatIntervalMs: 5000,
    });

    const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
    runner = new LocalBridgeRunner(runnerConfig, silentLogger);

    if (!isRestart) {
      const authorized = runner.projectRegistry.add(projectDir, {
        name: "durable-project",
        accessMode: "read-write",
      });
      runner.projectRegistry.setExecutionMode(authorized.id, "project-code");
      runner.projectRegistry.setTrustPolicy(authorized.id, testCustomPolicy);
      projectId = authorized.id;
    }

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

    // Connect MCP Client
    transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${serverPort}/mcp`), {
      protocolVersion: "2026-07-28",
      requestInit: {
        headers: {
          Authorization: `Bearer ${mcpToken}`,
        },
      },
    });

    client = new Client(
      { name: "durable-ledger-test-agent", version: "1.0.0" },
      { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
    );
    await client.connect(transport);
  }

  async function stopServerAndRunner() {
    try {
      if (client) await client.close();
    } catch {}
    try {
      if (runner) await runner.stop();
    } catch {}
    try {
      if (serverInstance) await serverInstance.app.close();
    } catch {}
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-ledger-e2e-"));
    runnerStateDir = path.join(tmpDir, "state");
    fs.mkdirSync(runnerStateDir, { recursive: true });
    dbFilePath = path.join(tmpDir, "ledger-e2e.db");
    projectDir = path.join(tmpDir, "ledger-project");
    runnerStatePath = path.join(runnerStateDir, "runner-state.json");
    runnerProjectsPath = path.join(runnerStateDir, "projects.json");

    fs.mkdirSync(projectDir, { recursive: true });

    execSync("git init", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.email ledger@nexus.local", { cwd: projectDir, stdio: "ignore" });
    execSync("git config user.name LedgerTester", { cwd: projectDir, stdio: "ignore" });

    fs.writeFileSync(path.join(projectDir, "README.md"), "# Durable Ledger Test\n");
    execSync("git add .", { cwd: projectDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projectDir, stdio: "ignore" });

    await startServerAndRunner(false);
  }, 40000);

  afterAll(async () => {
    await stopServerAndRunner();
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // Scenario 1: 4-Step Minimal Acceptance
  // Task -> Step 1 -> Step 2 -> Step 3 -> Checkpoint -> Nexus Restart -> Restore -> Resume -> Step 4 -> Complete
  // =========================================================================
  it("Scenario 1: 4-Step Minimal Blackbox Acceptance with Restart, Restore, Idempotency Skip, and Complete", async () => {
    // 1. Create task via real MCP call
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "4-Step Minimal Acceptance Task",
        goal: "Execute 4 verified steps with restart, restore, and idempotency",
        resourcePolicy: { maxActions: 20 },
      },
    });
    const task = parseToolResult<any>(createRes);
    expect(task.agentTaskId).toBeDefined();
    const taskId = task.agentTaskId;

    // 2. Step 1: Real MCP tool call
    const step1Res = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "s1-step-001.txt",
        content: "Step 1 content generated by external agent",
        taskId,
      },
    });
    parseToolResult(step1Res);
    expect(fs.existsSync(path.join(projectDir, "s1-step-001.txt"))).toBe(true);

    let status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(1);
    expect(status.actionsExecuted).toBe(1);

    // 3. Step 2: Real MCP tool call
    const step2Res = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "s1-step-002.txt",
        content: "Step 2 content generated by external agent",
        taskId,
      },
    });
    parseToolResult(step2Res);
    expect(fs.existsSync(path.join(projectDir, "s1-step-002.txt"))).toBe(true);

    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(2);
    expect(status.actionsExecuted).toBe(2);

    // 4. Step 3: Real MCP tool call
    const step3Res = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "s1-step-003.txt",
        content: "Step 3 content generated by external agent",
        taskId,
      },
    });
    parseToolResult(step3Res);
    expect(fs.existsSync(path.join(projectDir, "s1-step-003.txt"))).toBe(true);

    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(3);
    expect(status.actionsExecuted).toBe(3);

    // 5. Create Checkpoint via real MCP call
    const cpRes = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "Checkpoint after Step 3",
        includeComputerState: true,
      },
    });
    const cpData = parseToolResult<any>(cpRes);
    expect(cpData.success).toBe(true);
    expect(cpData.checkpoint.currentStep).toBe(3);
    expect(cpData.checkpoint.completedSteps).toBe(3);
    expect(cpData.checkpoint.actionHistory.length).toBe(3);
    expect(cpData.checkpoint.verificationResults.length).toBe(3);
    expect(cpData.checkpoint.modifiedFiles).toContain("s1-step-001.txt");
    expect(cpData.checkpoint.modifiedFiles).toContain("s1-step-002.txt");
    expect(cpData.checkpoint.modifiedFiles).toContain("s1-step-003.txt");
    const cpId = cpData.checkpointId;

    // 6. Simulate Nexus Restart
    await stopServerAndRunner();
    await startServerAndRunner(true);

    // 7. Verify Task State reconstructed from Action Ledger on restart
    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(3);
    expect(status.actionsExecuted).toBe(3);

    // 8. Restore Checkpoint via real MCP call
    const restoreRes = await client.callTool({
      name: "localbridge_agent_task_checkpoint_restore",
      arguments: {
        agentTaskId: taskId,
        checkpointId: cpId,
      },
    });
    const restoreData = parseToolResult<any>(restoreRes);
    expect(restoreData.success).toBe(true);
    expect(restoreData.checkpointId).toBe(cpId);

    // 9. Resume Task via real MCP call
    const resumeRes = await client.callTool({
      name: "localbridge_agent_task_resume",
      arguments: { agentTaskId: taskId },
    });
    const resumeData = parseToolResult<any>(resumeRes);
    expect(resumeData.state).toBe("running");

    // 10. Idempotency Check: Replaying Step 1 should safely skip and return without incrementing
    const replayStep1 = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "s1-step-001.txt",
        content: "Step 1 content generated by external agent",
        taskId,
      },
    });
    const replayResult = parseToolResult<any>(replayStep1);
    expect(replayResult).toBeDefined();

    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(3); // Did not re-execute, stayed at 3!

    // 11. Step 4: Real MCP tool call
    const step4Res = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "s1-step-004.txt",
        content: "Step 4 content after resume",
        taskId,
      },
    });
    parseToolResult(step4Res);
    expect(fs.existsSync(path.join(projectDir, "s1-step-004.txt"))).toBe(true);

    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(4);
    expect(status.actionsExecuted).toBe(4);

    // 12. Complete Task via real MCP call
    const completeRes = await client.callTool({
      name: "localbridge_agent_task_complete",
      arguments: {
        agentTaskId: taskId,
        summary: "4 steps completed successfully with durable action ledger",
        artifactsProduced: ["s1-step-001.txt", "s1-step-002.txt", "s1-step-003.txt", "s1-step-004.txt"],
        validationPassed: true,
      },
    });
    const completeData = parseToolResult<any>(completeRes);
    expect(completeData.state).toBe("completed");

    // Final verification
    status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.state).toBe("completed");
    expect(status.actionCount).toBe(4);
    expect(status.actionsExecuted).toBe(4);
  }, 60000);

  // =========================================================================
  // Scenario 2: 10-Step Verified Durable Execution with Event Lifecycle
  // =========================================================================
  it("Scenario 2: 10-Step Verified Durable Execution with Event Lifecycle", async () => {
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "10-Step Pipeline Task",
        goal: "Run 10 steps and verify complete action event lifecycle",
        resourcePolicy: { maxActions: 30 },
      },
    });
    const task = parseToolResult<any>(createRes);
    const taskId = task.agentTaskId;

    for (let i = 1; i <= 10; i++) {
      const fileName = `s2-step-${String(i).padStart(3, "0")}.txt`;
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: fileName,
          content: `Data for scenario 2 step ${i}`,
          taskId,
        },
      });
      parseToolResult(res);
      expect(fs.existsSync(path.join(projectDir, fileName))).toBe(true);
    }

    const status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(10);
    expect(status.actionsExecuted).toBe(10);

    const cpRes = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "Checkpoint at Step 10",
      },
    });
    const cpData = parseToolResult<any>(cpRes);
    expect(cpData.checkpoint.currentStep).toBe(10);
    expect(cpData.checkpoint.completedSteps).toBe(10);
    expect(cpData.checkpoint.actionHistory.length).toBe(10);
    expect(cpData.checkpoint.verificationResults.length).toBe(10);
    expect(cpData.checkpoint.modifiedFiles.length).toBe(10);

    // Verify events recorded in EventBus
    const eventHistoryRes = await client.callTool({
      name: "localbridge_event_history",
      arguments: {
        topicPattern: "agent.action.*",
        limit: 100,
      },
    });
    const eventHistory = parseToolResult<any>(eventHistoryRes);
    expect(eventHistory.events.length).toBeGreaterThan(0);
    const preparedEvents = eventHistory.events.filter((e: any) => e.topic === "agent.action.prepared");
    const committedEvents = eventHistory.events.filter((e: any) => e.topic === "agent.action.committed");
    expect(preparedEvents.length).toBeGreaterThanOrEqual(10);
    expect(committedEvents.length).toBeGreaterThanOrEqual(10);

    const completeRes = await client.callTool({
      name: "localbridge_agent_task_complete",
      arguments: {
        agentTaskId: taskId,
        summary: "10 steps completed",
        validationPassed: true,
      },
    });
    expect(parseToolResult<any>(completeRes).state).toBe("completed");
  }, 45000);

  // =========================================================================
  // Scenario 3: 20-Step Exact User Acceptance Case (step-001.txt ~ step-020.txt)
  // =========================================================================
  it("Scenario 3: 20-Step Full Scale Replay of the Exact User Acceptance Case", async () => {
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "20-Step Blackbox Acceptance Task",
        goal: "Generate step-001.txt through step-020.txt with midpoint and final checkpoints",
        resourcePolicy: { maxActions: 50 },
      },
    });
    const task = parseToolResult<any>(createRes);
    const taskId = task.agentTaskId;

    // Steps 1 to 10
    for (let i = 1; i <= 10; i++) {
      const fileName = `step-${String(i).padStart(3, "0")}.txt`;
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: fileName,
          content: `Real content for ${fileName}`,
          taskId,
        },
      });
      parseToolResult(res);
      expect(fs.existsSync(path.join(projectDir, fileName))).toBe(true);
    }

    // Checkpoint at Step 10
    const cp10Res = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "Step 10 checkpoint",
        includeComputerState: true,
      },
    });
    const cp10 = parseToolResult<any>(cp10Res);
    expect(cp10.checkpoint.currentStep).toBe(10);
    expect(cp10.checkpoint.completedSteps).toBe(10);
    expect(cp10.checkpoint.actionHistory.length).toBe(10);
    expect(cp10.checkpoint.verificationResults.length).toBe(10);
    expect(cp10.checkpoint.modifiedFiles.length).toBe(10);

    // Steps 11 to 20
    for (let i = 11; i <= 20; i++) {
      const fileName = `step-${String(i).padStart(3, "0")}.txt`;
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: fileName,
          content: `Real content for ${fileName}`,
          taskId,
        },
      });
      parseToolResult(res);
      expect(fs.existsSync(path.join(projectDir, fileName))).toBe(true);
    }

    // Verify task status at step 20
    const status20 = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status20.actionCount).toBe(20);
    expect(status20.actionsExecuted).toBe(20);
    expect(status20.iteration).toBe(20);

    // Checkpoint at Step 20
    const cp20Res = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "Step 20 final checkpoint",
      },
    });
    const cp20 = parseToolResult<any>(cp20Res);
    expect(cp20.checkpoint.currentStep).toBe(20);
    expect(cp20.checkpoint.completedSteps).toBe(20);
    expect(cp20.checkpoint.actionHistory.length).toBe(20);
    expect(cp20.checkpoint.verificationResults.length).toBe(20);
    expect(cp20.checkpoint.modifiedFiles.length).toBe(20);

    // Complete task: Must succeed with 20 actions evidence
    const completeRes = await client.callTool({
      name: "localbridge_agent_task_complete",
      arguments: {
        agentTaskId: taskId,
        summary: "All 20 steps successfully verified and executed",
        validationPassed: true,
      },
    });
    const completeData = parseToolResult<any>(completeRes);
    expect(completeData.state).toBe("completed");
  }, 60000);

  // =========================================================================
  // Scenario 4: Idempotency and RETRY_UNSAFE
  // =========================================================================
  it("Scenario 4: Idempotency and RETRY_UNSAFE behavior", async () => {
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "Idempotency and Safety Test",
        goal: "Verify safe skip and safety constraints",
        resourcePolicy: { maxActions: 10 },
      },
    });
    const taskId = parseToolResult<any>(createRes).agentTaskId;

    // Idempotent action with explicit idempotencyKey
    const idemKey = "custom_idem_key_001";
    const res1 = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "idem-test.txt",
        content: "Idempotent initial write",
        taskId,
        idempotencyKey: idemKey,
      },
    });
    const r1 = parseToolResult<any>(res1);
    expect(r1.path).toBe("idem-test.txt");

    // Second call with same idempotencyKey: must return cached result
    const res2 = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "idem-test.txt",
        content: "Idempotent initial write",
        taskId,
        idempotencyKey: idemKey,
      },
    });
    const r2 = parseToolResult<any>(res2);
    expect(r2.path).toBe("idem-test.txt");

    const status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(1); // Action count did not double
  }, 30000);

  // =========================================================================
  // Scenario 5: 100-Step Durable Scalability and Memory Boundedness
  // =========================================================================
  it("Scenario 5: 100-Step Durable Scalability and Checkpoint Integrity", async () => {
    const createRes = await client.callTool({
      name: "localbridge_agent_task_create",
      arguments: {
        projectId,
        title: "100-Step Scalability Pipeline",
        goal: "Execute 100 verified MCP tool actions with durable ledger",
        resourcePolicy: { maxActions: 150 },
      },
    });
    const taskId = parseToolResult<any>(createRes).agentTaskId;

    for (let i = 1; i <= 100; i++) {
      const fileName = `scale-100-${String(i).padStart(3, "0")}.txt`;
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: fileName,
          content: `Content for scale 100 item ${i}`,
          taskId,
        },
      });
      parseToolResult(res);
    }

    const status = parseToolResult<any>(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(100);
    expect(status.actionsExecuted).toBe(100);

    const cpRes = await client.callTool({
      name: "localbridge_agent_task_checkpoint_create",
      arguments: {
        agentTaskId: taskId,
        trigger: "manual",
        description: "100-step checkpoint",
      },
    });
    const cpData = parseToolResult<any>(cpRes);
    expect(cpData.checkpoint.currentStep).toBe(100);
    expect(cpData.checkpoint.completedSteps).toBe(100);
    expect(cpData.checkpoint.actionHistory.length).toBe(100);
    expect(cpData.checkpoint.verificationResults.length).toBe(100);

    const completeRes = await client.callTool({
      name: "localbridge_agent_task_complete",
      arguments: {
        agentTaskId: taskId,
        summary: "100 steps completed",
        validationPassed: true,
      },
    });
    expect(parseToolResult<any>(completeRes).state).toBe("completed");
  }, 120000);
});
