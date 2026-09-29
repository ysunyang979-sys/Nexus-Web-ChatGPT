import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
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

describe("Nexus Durable Kernel Fault Injection & Comprehensive E2E Suite", () => {
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
      managementSecret = "sec_fault_injection_token_2026";
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
    serverPort = match ? Number.parseInt(match[1]!, 10) : 19192;

    if (!isRestart) {
      const mcpTokenRecord = serverInstance.tokenService.createToken({
        name: "FaultInjection-MCP-Token",
        type: "mcp",
        scopes: ["read", "write", "execute"],
        purpose: "chatgpt",
      });
      mcpToken = mcpTokenRecord.token;

      const runnerTokenRecord = serverInstance.tokenService.createToken({
        name: "FaultInjection-Runner-Token",
        type: "runner",
        scopes: ["runner:connect"],
      });
      runnerToken = runnerTokenRecord.token;
    }

    const runnerConfig = RunnerDaemonConfigSchema.parse({
      serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
      token: runnerToken,
      runnerName: "FaultInjection-Runner",
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
        name: "fault-injection-project",
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
    serverInstance.projectService.setSafetyLayerDisabled(true, "universal");

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
      { name: "fault-injection-test-agent", version: "1.0.0" },
      { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
    );
    await client.connect(transport);
  }

  async function stopServerAndRunner() {
    try {
      if (client) await client.close();
    } catch {}
    try {
      if (transport) await transport.close();
    } catch {}
    try {
      if (runner) await runner.stop();
    } catch {}
    try {
      if (serverInstance?.app) await serverInstance.app.close();
    } catch {}
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-fault-test-"));
    dbFilePath = path.join(tmpDir, "localbridge.sqlite");
    projectDir = path.join(tmpDir, "workspace");
    runnerStateDir = path.join(tmpDir, "runner-state");
    runnerStatePath = path.join(runnerStateDir, "runner-state.json");
    runnerProjectsPath = path.join(runnerStateDir, "runner-projects.json");

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(runnerStateDir, { recursive: true });

    await startServerAndRunner(false);
  }, 30000);

  afterAll(async () => {
    await stopServerAndRunner();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // -----------------------------------------------------------------------------------------
  // Test A: Tool Failure (Action 1 PASS -> Action 2 FAIL -> Action 3 PASS)
  // -----------------------------------------------------------------------------------------
  it("Test A: Tool Failure: Action 1 PASS -> Action 2 FAIL -> Action 3 PASS", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test A: Tool Failure Pipeline",
          goal: "Execute Action 1 PASS -> Action 2 FAIL -> Action 3 PASS",
        },
      })
    );
    const taskId = taskRes.agentTaskId;

    // Action 1: PASS
    const act1 = parseToolResult(
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "test-a-1.txt",
          content: "Action 1 passed",
          taskId,
        },
      })
    );
    expect(act1.newHash).toBeDefined();

    // Action 2: FAIL (invalid path outside project boundaries)
    const act2Promise = client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "../../../outside-danger.txt",
        content: "Should fail security check",
        taskId,
      },
    });
    const act2Res = await act2Promise;
    expect(act2Res.isError).toBe(true);

    // Action 3: PASS
    const act3 = parseToolResult(
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "test-a-3.txt",
          content: "Action 3 passed",
          taskId,
        },
      })
    );
    expect(act3.newHash).toBeDefined();

    // Check Task status
    const status = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );

    expect(status.actionCount).toBe(2); // Only Action 1 and 3 are COMMITTED
    expect(status.failureCount).toBe(1); // Action 2 is recorded as FAILED
    expect(status.modifiedFiles).toContain("test-a-1.txt");
    expect(status.modifiedFiles).toContain("test-a-3.txt");
    expect(status.modifiedFiles).not.toContain("../../../outside-danger.txt");

    // Action ledger check on disk
    const ledgerPath = path.join(runnerStateDir, "action-ledger", `${taskId}-ledger.json`);
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledgerEntries = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    expect(ledgerEntries.length).toBe(3);
    expect(ledgerEntries[0].status).toBe("COMMITTED");
    expect(ledgerEntries[1].status).toBe("FAILED");
    expect(ledgerEntries[2].status).toBe("COMMITTED");
  });

  // -----------------------------------------------------------------------------------------
  // Test B: Process Disconnect / Checkpoint Resume
  // -----------------------------------------------------------------------------------------
  it("Test B: Process Disconnect and Checkpoint Resume", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test B: Checkpoint & Resume",
          goal: "Execute 5 steps, checkpoint, restart, resume steps 6-10",
        },
      })
    );
    const taskId = taskRes.agentTaskId;

    // Steps 1 to 5
    for (let i = 1; i <= 5; i++) {
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: `resume-step-${String(i).padStart(2, "0")}.txt`,
          content: `Data for step ${i}`,
          taskId,
          idempotencyKey: `idem_resume_${i}`,
        },
      });
    }

    // Create Checkpoint at step 5
    const cpRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_checkpoint_create",
        arguments: {
          agentTaskId: taskId,
          description: "Checkpoint after step 5",
        },
      })
    );
    expect(cpRes.checkpointId).toBeDefined();

    // Restart Runner & Server to simulate process termination
    await stopServerAndRunner();
    await startServerAndRunner(true);

    // Restore Checkpoint
    const restoreRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_checkpoint_restore",
        arguments: {
          agentTaskId: taskId,
          checkpointId: cpRes.checkpointId,
        },
      })
    );
    expect(restoreRes.success).toBe(true);

    // Steps 1 to 5 should be safely skipped (Idempotent)
    for (let i = 1; i <= 5; i++) {
      const skipRes = parseToolResult(
        await client.callTool({
          name: "localbridge_file_create",
          arguments: {
            projectId,
            path: `resume-step-${String(i).padStart(2, "0")}.txt`,
            content: `Data for step ${i}`,
            taskId,
            idempotencyKey: `idem_resume_${i}`,
          },
        })
      );
      expect(skipRes.newHash).toBeDefined();
    }

    // Steps 6 to 10 execute normally
    for (let i = 6; i <= 10; i++) {
      const execRes = parseToolResult(
        await client.callTool({
          name: "localbridge_file_create",
          arguments: {
            projectId,
            path: `resume-step-${String(i).padStart(2, "0")}.txt`,
            content: `Data for step ${i}`,
            taskId,
            idempotencyKey: `idem_resume_${i}`,
          },
        })
      );
      expect(execRes.newHash).toBeDefined();
    }

    // Complete Task
    const compRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_complete",
        arguments: {
          agentTaskId: taskId,
          summary: "10 steps completed after restart and restore",
          artifactsProduced: ["resume-step-10.txt"],
        },
      })
    );
    expect(compRes.state).toBe("completed");

    const finalStatus = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(finalStatus.actionCount).toBe(10);
    expect(finalStatus.state).toBe("completed");
  }, 30000);

  // -----------------------------------------------------------------------------------------
  // Test C: Runner Disconnect & Reconnect Reconcile
  // -----------------------------------------------------------------------------------------
  it("Test C: Runner Disconnect and Reconnect Reconcile", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test C: Disconnect & Reconcile",
          goal: "Disconnect running agent, reconcile, resume",
        },
      })
    );
    const taskId = taskRes.agentTaskId;

    // Run action 1
    await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "disconnect-test-1.txt",
        content: "Before disconnect",
        taskId,
      },
    });

    // Disconnect agent
    const discRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_disconnect",
        arguments: {
          agentTaskId: taskId,
          reason: "Network loss simulation",
        },
      })
    );
    expect(discRes.state).toBe("disconnected");

    // Verify task is disconnected
    const discStatus = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(discStatus.state).toBe("disconnected");

    // Reconcile task
    const recRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_reconcile",
        arguments: {
          agentTaskId: taskId,
          recoverCheckpointIfFailed: true,
        },
      })
    );
    expect(recRes.reconciledState).toBe("paused");
    expect(recRes.recoveredFromCheckpoint).toBe(true);

    // Resume and execute action 2
    await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "disconnect-test-2.txt",
        content: "After reconcile",
        taskId,
      },
    });

    const postStatus = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(postStatus.actionCount).toBe(2);
    expect(postStatus.state).toBe("running");
  });

  // -----------------------------------------------------------------------------------------
  // Test D: Idempotency with Duplicate Key
  // -----------------------------------------------------------------------------------------
  it("Test D: Idempotency with Duplicate Key", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test D: Strict Idempotency",
          goal: "Duplicate idempotency keys return committed result without duplicate ledger entries",
        },
      })
    );
    const taskId = taskRes.agentTaskId;
    const idemKey = `idem_strict_${Date.now()}`;

    // First call
    const res1 = parseToolResult(
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "strict-idem.txt",
          content: "Original Content",
          taskId,
          idempotencyKey: idemKey,
        },
      })
    );
    expect(res1.newHash).toBeDefined();

    // Second call with different content but same idempotencyKey
    const res2 = parseToolResult(
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "strict-idem.txt",
          content: "Attempted overwrite content",
          taskId,
          idempotencyKey: idemKey,
        },
      })
    );
    expect(res2.newHash).toBeDefined();
    expect(res2.newHash).toBe(res1.newHash);

    // File content must remain original
    const physicalContent = fs.readFileSync(path.join(projectDir, "strict-idem.txt"), "utf-8");
    expect(physicalContent).toBe("Original Content");

    // Ledger must contain exactly 1 entry for this task
    const status = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(1);
  });

  // -----------------------------------------------------------------------------------------
  // Test E: Computer Use Verification Failure (Tool Success != World State Success)
  // -----------------------------------------------------------------------------------------
  it("Test E: Computer Use Verification Failure: Tool success with unchanged screen", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test E: World State Verification Failure",
          goal: "Tool reports success but world state verification fails",
        },
      })
    );
    const taskId = taskRes.agentTaskId;
    const idemKey = `idem_world_state_fail_${Date.now()}`;

    // Call computer action with simulated world state verification failure
    const callRes = await client.callTool({
      name: "localbridge_computer_mouse_click",
      arguments: {
        x: 100,
        y: 100,
        button: "left",
        taskId,
        idempotencyKey: idemKey,
        requireScreenChange: true,
        testScreenHash: "screen_hash_static_123",
        testPostScreenHash: "screen_hash_static_123", // unchanged screen hash triggers verification failure
      },
    });

    // Verification failed -> tool call returns error
    expect(callRes.isError).toBe(true);
    const errMsg = callRes.content[0].text;
    expect(errMsg).toMatch(/Screen visual state unchanged|verification failed/i);

    // Action ledger must record this action as RETRY_UNSAFE
    const ledgerPath = path.join(runnerStateDir, "action-ledger", `${taskId}-ledger.json`);
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    expect(ledger.length).toBe(1);
    expect(ledger[0].status).toBe("RETRY_UNSAFE");
    expect(ledger[0].safeToRetry).toBe(false);

    // Trying to blindly re-run the same unverified non-idempotent action must be blocked
    const retryRes = await client.callTool({
      name: "localbridge_computer_mouse_click",
      arguments: {
        x: 100,
        y: 100,
        button: "left",
        taskId,
        idempotencyKey: idemKey,
      },
    });
    expect(retryRes.isError).toBe(true);
    expect(retryRes.content[0].text).toMatch(/RETRY_UNSAFE|unsafe/i);
  });

  // -----------------------------------------------------------------------------------------
  // Test F: Crash Window in STARTED (Recovers to RETRY_UNSAFE)
  // -----------------------------------------------------------------------------------------
  it("Test F: Crash window in STARTED: Recovers to RETRY_UNSAFE upon restart", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test F: Crash Window in STARTED",
          goal: "Action interrupted while in STARTED status recovers to RETRY_UNSAFE",
        },
      })
    );
    const taskId = taskRes.agentTaskId;
    const idemKey = `idem_crash_started_${Date.now()}`;
    const ledgerDir = path.join(runnerStateDir, "action-ledger");
    fs.mkdirSync(ledgerDir, { recursive: true });
    const taskLedgerFile = path.join(ledgerDir, `${taskId}-ledger.json`);

    // Artificially inject an action interrupted in 'STARTED' state (simulating power failure / crash)
    const interruptedEntry = {
      actionId: `action_crash_${Date.now()}`,
      taskId,
      executionId: `exec_${taskId}`,
      attemptId: 1,
      actionName: "localbridge_file_create",
      toolName: "localbridge_file_create",
      method: "file.create",
      argumentsHash: "fake_arg_hash",
      params: { path: "interrupted.txt", content: "partial data" },
      status: "STARTED",
      preparedAt: Date.now() - 5000,
      startedAt: Date.now() - 4000,
      idempotencyKey: idemKey,
      isIdempotent: false,
      alreadyExecuted: false,
      alreadyVerified: false,
      safeToRetry: true,
    };
    fs.writeFileSync(taskLedgerFile, JSON.stringify([interruptedEntry], null, 2), "utf-8");

    // Restart Runner & Server
    await stopServerAndRunner();
    await startServerAndRunner(true);

    // Verify entry has transitioned to RETRY_UNSAFE
    const recoveredRaw = JSON.parse(fs.readFileSync(taskLedgerFile, "utf-8"));
    expect(recoveredRaw.length).toBe(1);
    expect(["RETRY_UNSAFE", "UNKNOWN"]).toContain(recoveredRaw[0].status);
    expect(recoveredRaw[0].safeToRetry).toBe(false);
    expect(recoveredRaw[0].error).toMatch(/Interrupted by runner crash/i);

    // Replaying the unverified action must be blocked as RETRY_UNSAFE
    const replayRes = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "interrupted.txt",
        content: "partial data",
        taskId,
        idempotencyKey: idemKey,
      },
    });
    expect(replayRes.isError).toBe(true);
    expect(replayRes.content[0].text).toMatch(/RETRY_UNSAFE/i);
  }, 30000);

  // -----------------------------------------------------------------------------------------
  // Test G: Metrics and Tracing End-to-End
  // -----------------------------------------------------------------------------------------
  it("Test G: Metrics and Tracing End-to-End Integration", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test G: Tracing & Metrics",
          goal: "Verify action-level trace spans and total tool calls metrics",
        },
      })
    );
    const taskId = taskRes.agentTaskId;

    // Execute 3 actions
    for (let i = 1; i <= 3; i++) {
      await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: `metrics-test-${i}.txt`,
          content: `Data ${i}`,
          taskId,
        },
      });
    }

    // Query Metrics via MCP
    const metricsRes = parseToolResult(
      await client.callTool({
        name: "localbridge_metrics_get",
        arguments: {},
      })
    );
    expect(metricsRes.metrics.totalToolCalls).toBeGreaterThanOrEqual(3);

    // Query Trace via MCP
    const traceRes = parseToolResult(
      await client.callTool({
        name: "localbridge_trace_get",
        arguments: { traceId: `exec_${taskId}` },
      })
    );
    expect(traceRes.totalSpans).toBe(3);
    expect(traceRes.spans.every((s: any) => s.status === "ok")).toBe(true);

    // Query Observability Summary
    const obsRes = parseToolResult(
      await client.callTool({
        name: "localbridge_observability_summary",
        arguments: { timeWindowMinutes: 60 },
      })
    );
    expect(obsRes.summary.totalTraces).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------------------------
  // Test H: Agent Plan & Todo Automatic Synchronization
  // -----------------------------------------------------------------------------------------
  it("Test H: Agent Plan & Todo Automatic Lifecycle Synchronization", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test H: Plan & Todo Sync",
          goal: "Automatically advance plan steps on action commit",
        },
      })
    );
    const taskId = taskRes.agentTaskId;

    // Create 3-step Plan
    const planRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_plan_create",
        arguments: {
          agentTaskId: taskId,
          title: "Execution Plan for Test H",
          goal: "Complete steps 1, 2, 3",
          steps: [
            { title: "Step 1: Init file", description: "Create init.txt" },
            { title: "Step 2: Update file", description: "Update init.txt" },
            { title: "Step 3: Finalize", description: "Create final.txt" },
          ],
        },
      })
    );
    const planId = planRes.plan.planId;
    expect(planRes.plan.steps[0].status).toBe("ready");
    expect(planRes.plan.steps[1].status).toBe("pending");
    expect(planRes.plan.steps[2].status).toBe("pending");

    // Execute Step 1 action
    await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "step-1.txt",
        content: "Step 1 done",
        taskId,
      },
    });

    // Check Plan: Step 1 should be completed, Step 2 ready
    const p1 = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_plan_get",
        arguments: { planId },
      })
    );
    expect(p1.plan.steps[0].status).toBe("completed");
    expect(p1.plan.steps[1].status).toBe("ready");

    // Execute Step 2 action
    await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "step-2.txt",
        content: "Step 2 done",
        taskId,
      },
    });

    const p2 = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_plan_get",
        arguments: { planId },
      })
    );
    expect(p2.plan.steps[1].status).toBe("completed");
    expect(p2.plan.steps[2].status).toBe("ready");

    // Execute Step 3 action
    await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId,
        path: "step-3.txt",
        content: "Step 3 done",
        taskId,
      },
    });

    // All steps completed -> Plan completed!
    const p3 = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_plan_get",
        arguments: { planId },
      })
    );
    expect(p3.plan.steps[2].status).toBe("completed");
    expect(p3.plan.status).toBe("completed");
  });

  // -----------------------------------------------------------------------------------------
  // Test I: 500-Action Scale & Ledger Verification
  // -----------------------------------------------------------------------------------------
  it("Test I: 500-Action High Scale Durability & State Integrity", async () => {
    const taskRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_create",
        arguments: {
          projectId,
          title: "Test I: 500-Action Scale Verification",
          goal: "Execute 500 real verified durable actions via MCP and verify complete ledger reduction",
          resourcePolicy: { maxActions: 600 },
        },
      })
    );
    const taskId = taskRes.agentTaskId;
    const totalActions = 500;
    const scaleStartTime = Date.now();

    for (let i = 1; i <= totalActions; i++) {
      const padNum = String(i).padStart(4, "0");
      const filename = `scale-500-${padNum}.txt`;
      const res = parseToolResult(
        await client.callTool({
          name: "localbridge_file_create",
          arguments: {
            projectId,
            path: filename,
            content: `Scale action evidence #${i} sha256_placeholder`,
            taskId,
            idempotencyKey: `idem_scale_500_${i}`,
          },
        })
      );
      expect(res.newHash).toBeDefined();

      // Periodically checkpoint every 100 actions
      if (i % 100 === 0) {
        await client.callTool({
          name: "localbridge_agent_task_checkpoint_create",
          arguments: {
            agentTaskId: taskId,
            description: `Scale checkpoint at action #${i}`,
          },
        });
      }

      // Performance metrics check at 10, 50, 100, 500 actions
      if (i === 10 || i === 50 || i === 100 || i === 500) {
        const metrics = runner.actionLedger.getMetrics(taskId);
        const elapsedMs = Date.now() - scaleStartTime;
        const averageActionMs = (elapsedMs / i).toFixed(2);
        console.log(
          `[PERF] actionCount: ${i}, walEventCount: ${metrics.walEventCount}, snapshotCount: ${metrics.snapshotCount}, ledgerBytes: ${metrics.ledgerBytes}, walBytes: ${metrics.walBytes}, elapsedMs: ${elapsedMs}, averageActionMs: ${averageActionMs}ms`
        );
      }
    }

    // Verify task state
    const status = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_status",
        arguments: { agentTaskId: taskId },
      })
    );
    expect(status.actionCount).toBe(500);
    expect(status.actionsExecuted).toBe(500);
    expect(status.checkpointCount).toBe(5);
    expect(status.modifiedFiles.length).toBe(500);

    // Verify completion
    const completeRes = parseToolResult(
      await client.callTool({
        name: "localbridge_agent_task_complete",
        arguments: {
          agentTaskId: taskId,
          summary: "500 actions fully executed, verified, and committed into durable ledger",
          artifactsProduced: ["scale-500-0500.txt"],
        },
      })
    );
    expect(completeRes.state).toBe("completed");

    // Verify ledger disk file integrity
    const ledgerPath = path.join(runnerStateDir, "action-ledger", `${taskId}-ledger.json`);
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const diskLedger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    expect(diskLedger.length).toBe(500);
    expect(diskLedger.every((e: any) => e.status === "COMMITTED" && e.alreadyVerified)).toBe(true);
  }, 300000);
});
