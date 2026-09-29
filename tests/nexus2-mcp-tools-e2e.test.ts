import { describe, it, expect } from "vitest";
import { createLocalBridgeMcpServer } from "../apps/server/src/mcp/server.js";
import { MCP_TOOL_SCOPE } from "../apps/server/src/mcp/scope-policy.js";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";

describe("Nexus 2.0 MCP Tools End-to-End Suite", () => {
  const dummyContext = {
    resolveProjectRunner: () => "runner_mock_1",
    runnerRegistry: {
      list: () => [{ id: "runner_mock_1" }],
    },
    logAudit: () => {},
    request: async () => ({ success: true }),
  } as any;

  const server = createLocalBridgeMcpServer(dummyContext);
  const registeredTools = Object.keys((server as any)._registeredTools || {});

  it("verifies that all production MCP tools are registered", () => {
    expect(registeredTools.length).toBeGreaterThanOrEqual(156);
  });

  it("verifies all 7 Terminal Session tools are registered and mapped", () => {
    const terminalTools = [
      "localbridge_terminal_start",
      "localbridge_terminal_write",
      "localbridge_terminal_read",
      "localbridge_terminal_resize",
      "localbridge_terminal_status",
      "localbridge_terminal_stop",
      "localbridge_terminal_list",
    ];

    for (const tool of terminalTools) {
      expect(registeredTools).toContain(tool);
      expect(MCP_TOOL_SCOPE[tool]).toBeDefined();
      expect(TOOL_ANNOTATIONS[tool]).toBeDefined();
    }
  });

  it("verifies all 4 Process Management tools are registered and mapped", () => {
    const processTools = [
      "localbridge_process_list",
      "localbridge_process_status",
      "localbridge_process_kill",
      "localbridge_process_tree",
    ];

    for (const tool of processTools) {
      expect(registeredTools).toContain(tool);
      expect(MCP_TOOL_SCOPE[tool]).toBeDefined();
      expect(TOOL_ANNOTATIONS[tool]).toBeDefined();
    }
  });

  it("verifies all 2 Port Management tools are registered and mapped", () => {
    const portTools = [
      "localbridge_port_list",
      "localbridge_port_kill",
    ];

    for (const tool of portTools) {
      expect(registeredTools).toContain(tool);
      expect(MCP_TOOL_SCOPE[tool]).toBeDefined();
      expect(TOOL_ANNOTATIONS[tool]).toBeDefined();
    }
  });

  it("verifies all 8 Long-term Agent Task tools are registered and mapped", () => {
    const agentTaskTools = [
      "localbridge_agent_task_create",
      "localbridge_agent_task_status",
      "localbridge_agent_task_logs",
      "localbridge_agent_task_cancel",
      "localbridge_agent_task_pause",
      "localbridge_agent_task_resume",
      "localbridge_agent_task_list",
      "localbridge_agent_task_approve",
    ];

    for (const tool of agentTaskTools) {
      expect(registeredTools).toContain(tool);
      expect(MCP_TOOL_SCOPE[tool]).toBeDefined();
      expect(TOOL_ANNOTATIONS[tool]).toBeDefined();
    }
  });

  it("verifies zero unmapped scopes across all tools", () => {
    expect(Object.keys(MCP_TOOL_SCOPE).length).toBeGreaterThanOrEqual(156);
    for (const tool of registeredTools) {
      expect(MCP_TOOL_SCOPE[tool]).toBeDefined();
    }
  });
});
