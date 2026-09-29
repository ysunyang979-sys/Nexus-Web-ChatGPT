import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createLocalBridgeMcpServer } from "../apps/server/src/mcp/server.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { RunnerRpcMethods } from "@localbridge/protocol";

describe("Nexus Four Core Infrastructure MCP Server Integration", () => {
  let tmpDir: string;
  let runner: LocalBridgeRunner;
  let mcpServer: any;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-mcp-infra-"));
    const runnerStateDir = path.join(tmpDir, "runner-state");
    fs.mkdirSync(runnerStateDir, { recursive: true });

    runner = new LocalBridgeRunner({
      runnerId: "runner-infra-test",
      serverUrl: "ws://127.0.0.1:9999/runner/ws",
      token: "test_token_123",
      statePath: path.join(runnerStateDir, "state.json"),
      projectsPath: path.join(runnerStateDir, "projects.json"),
      reconnect: {
        enabled: false,
        initialDelayMs: 500,
        maxDelayMs: 2000,
        factor: 2,
        jitter: false,
      },
      logging: { level: "error", pretty: false },
    } as any);

    const dummyContext = {
      resolveProjectRunner: () => "runner-infra-test",
      resolveAnyRunner: () => "runner-infra-test",
      runnerRegistry: {
        list: () => [{ id: "runner-infra-test" }],
      },
      logAudit: () => {},
      request: async (runnerId: string, method: string, params: any) => {
        const handler = (runner as any).rpcRouter.handlers.get(method);
        if (!handler) throw new Error(`Method ${method} not handled`);
        return await handler(params);
      },
      communicationService: {
        ackMessage: async () => ({ status: "acknowledged", acknowledgedAt: Date.now() }),
      },
    } as any;

    mcpServer = createLocalBridgeMcpServer(dummyContext);
  });

  afterAll(async () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("registers all 63 new infrastructure tools on McpServer", () => {
    const tools = (mcpServer as any)._registeredTools || {};
    const toolNames = Object.keys(tools);

    // Browser tools (30)
    expect(toolNames).toContain("localbridge_browser_launch");
    expect(toolNames).toContain("localbridge_browser_close");
    expect(toolNames).toContain("localbridge_browser_list");
    expect(toolNames).toContain("localbridge_browser_status");
    expect(toolNames).toContain("localbridge_browser_open");
    expect(toolNames).toContain("localbridge_browser_snapshot");
    expect(toolNames).toContain("localbridge_browser_screenshot");
    expect(toolNames).toContain("localbridge_browser_click");
    expect(toolNames).toContain("localbridge_browser_type");
    expect(toolNames).toContain("localbridge_browser_download");
    expect(toolNames).toContain("localbridge_browser_upload");

    // Agent Plan / Todo / Supervisor / Budget tools (20)
    expect(toolNames).toContain("localbridge_agent_plan_create");
    expect(toolNames).toContain("localbridge_agent_plan_get");
    expect(toolNames).toContain("localbridge_agent_plan_update");
    expect(toolNames).toContain("localbridge_agent_plan_complete");
    expect(toolNames).toContain("localbridge_agent_plan_list");
    expect(toolNames).toContain("localbridge_agent_todo_create");
    expect(toolNames).toContain("localbridge_agent_todo_complete");
    expect(toolNames).toContain("localbridge_agent_delegate");
    expect(toolNames).toContain("localbridge_agent_fork");
    expect(toolNames).toContain("localbridge_agent_join");
    expect(toolNames).toContain("localbridge_agent_supervise");
    expect(toolNames).toContain("localbridge_agent_dependency_create");
    expect(toolNames).toContain("localbridge_agent_budget_set");
    expect(toolNames).toContain("localbridge_agent_budget_check");

    // Event Bus tools (6)
    expect(toolNames).toContain("localbridge_event_publish");
    expect(toolNames).toContain("localbridge_event_subscribe");
    expect(toolNames).toContain("localbridge_event_unsubscribe");
    expect(toolNames).toContain("localbridge_event_poll");
    expect(toolNames).toContain("localbridge_event_history");
    expect(toolNames).toContain("localbridge_event_replay");

    // Trace & Observability tools (7)
    expect(toolNames).toContain("localbridge_trace_start");
    expect(toolNames).toContain("localbridge_trace_end");
    expect(toolNames).toContain("localbridge_trace_record");
    expect(toolNames).toContain("localbridge_trace_get");
    expect(toolNames).toContain("localbridge_trace_list");
    expect(toolNames).toContain("localbridge_metrics_get");
    expect(toolNames).toContain("localbridge_observability_summary");

    expect(toolNames.length).toBe(297);
  });

  it("executes Plan & Todo MCP tool calls successfully", async () => {
    const tools = (mcpServer as any)._registeredTools;

    // Create plan
    const createTool = tools["localbridge_agent_plan_create"];
    const planRes = await createTool.handler({
      title: "MCP Integration Plan",
      goal: "Test MCP tool execution",
      steps: [{ title: "Step 1" }],
    });
    expect(planRes.isError).toBeFalsy();
    const planData = JSON.parse(planRes.content[0].text);
    expect(planData.plan.planId).toBeDefined();

    // Get plan
    const getTool = tools["localbridge_agent_plan_get"];
    const getRes = await getTool.handler({ planId: planData.plan.planId });
    const getData = JSON.parse(getRes.content[0].text);
    expect(getData.plan.title).toBe("MCP Integration Plan");

    // Create Todo
    const createTodoTool = tools["localbridge_agent_todo_create"];
    const todoRes = await createTodoTool.handler({
      title: "Write MCP tests",
      planId: planData.plan.planId,
    });
    const todoData = JSON.parse(todoRes.content[0].text);
    expect(todoData.todo.todoId).toBeDefined();
  });

  it("executes Event Bus MCP tool calls successfully", async () => {
    const tools = (mcpServer as any)._registeredTools;

    // Subscribe
    const subTool = tools["localbridge_event_subscribe"];
    const subRes = await subTool.handler({
      subscriberId: "mcp_client_1",
      topicPattern: "mcp.*",
    });
    const subData = JSON.parse(subRes.content[0].text);
    const subId = subData.subscription.subscriptionId;

    // Publish
    const pubTool = tools["localbridge_event_publish"];
    const pubRes = await pubTool.handler({
      topic: "mcp.tool_called",
      payload: { tool: "test_tool" },
    });
    expect(pubRes.isError).toBeFalsy();

    // Poll
    const pollTool = tools["localbridge_event_poll"];
    const pollRes = await pollTool.handler({ subscriptionId: subId });
    const pollData = JSON.parse(pollRes.content[0].text);
    expect(pollData.events.length).toBe(1);
    expect(pollData.events[0].topic).toBe("mcp.tool_called");
  });

  it("executes Trace & Observability MCP tool calls successfully", async () => {
    const tools = (mcpServer as any)._registeredTools;

    // Trace start
    const startTool = tools["localbridge_trace_start"];
    const startRes = await startTool.handler({
      name: "McpCallTracing",
      service: "mcp-server",
    });
    const startData = JSON.parse(startRes.content[0].text);
    const traceId = startData.traceId;
    const spanId = startData.spanId;

    // Trace end
    const endTool = tools["localbridge_trace_end"];
    const endRes = await endTool.handler({
      spanId,
      status: "ok",
    });
    expect(endRes.isError).toBeFalsy();

    // Trace get
    const getTool = tools["localbridge_trace_get"];
    const getRes = await getTool.handler({ traceId });
    const getData = JSON.parse(getRes.content[0].text);
    expect(getData.spans.length).toBe(1);

    // Metrics get
    const metricsTool = tools["localbridge_metrics_get"];
    const metricsRes = await metricsTool.handler({ category: "all" });
    const metricsData = JSON.parse(metricsRes.content[0].text);
    expect(metricsData.metrics.memoryUsageMb).toBeGreaterThan(0);

    // Observability summary
    const summaryTool = tools["localbridge_observability_summary"];
    const summaryRes = await summaryTool.handler({ timeWindowMinutes: 60 });
    const summaryData = JSON.parse(summaryRes.content[0].text);
    expect(summaryData.summary.totalTraces).toBeGreaterThanOrEqual(1);
  });
});
