import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Tool Registry & Annotation Audit", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let tools: any[] = [];

  const EXPECTED_23_TOOLS = [
    "localbridge_project_list",
    "localbridge_project_info",
    "localbridge_directory_list",
    "localbridge_file_stat",
    "localbridge_file_read",
    "localbridge_file_create",
    "localbridge_file_write",
    "localbridge_file_patch",
    "localbridge_file_delete",
    "localbridge_file_restore",
    "localbridge_git_info",
    "localbridge_git_status",
    "localbridge_git_diff",
    "localbridge_git_log",
    "localbridge_git_stage",
    "localbridge_git_unstage",
    "localbridge_git_branch_create",
    "localbridge_git_branch_switch",
    "localbridge_git_commit",
    "localbridge_command_classify",
    "localbridge_command_run",
    "localbridge_job_start",
    "localbridge_job_status",
    "localbridge_job_logs",
    "localbridge_job_cancel",
    "localbridge_job_list",
    "localbridge_build_start",
    "localbridge_test_start",
    "localbridge_approval_status",
    "localbridge_code_document_symbols",
    "localbridge_code_workspace_symbols",
    "localbridge_code_definition",
    "localbridge_code_references",
    "localbridge_code_hover",
    "localbridge_code_diagnostics",
    "localbridge_code_call_hierarchy",
    "localbridge_code_impact",
    "localbridge_session_start",
    "localbridge_session_list",
    "localbridge_session_status",
    "localbridge_session_events",
    "localbridge_session_checkpoint",
    "localbridge_session_handoff",
    "localbridge_session_finish",
    "localbridge_worktree_create",
    "localbridge_worktree_list",
    "localbridge_worktree_status",
    "localbridge_worktree_diff",
    "localbridge_worktree_remove",
    "localbridge_runtime_start",
    "localbridge_runtime_list",
    "localbridge_runtime_status",
    "localbridge_runtime_logs",
    "localbridge_runtime_restart",
    "localbridge_runtime_stop",
    "localbridge_fs_delete",
    "localbridge_fs_move",
    "localbridge_fs_copy",
    "localbridge_fs_mkdir",
    "localbridge_skill_list",
    "localbridge_skill_get",
    "localbridge_skill_match",
    "localbridge_laya_status",
    "localbridge_laya_assess",
    "localbridge_environment_detect",
    "localbridge_project_detect",
    "localbridge_terminal_start",
    "localbridge_terminal_write",
    "localbridge_terminal_read",
    "localbridge_terminal_resize",
    "localbridge_terminal_status",
    "localbridge_terminal_stop",
    "localbridge_terminal_list",
    "localbridge_process_list",
    "localbridge_process_status",
    "localbridge_process_kill",
    "localbridge_process_tree",
    "localbridge_port_list",
    "localbridge_port_kill",
    "localbridge_agent_task_create",
    "localbridge_agent_task_status",
    "localbridge_agent_task_logs",
    "localbridge_agent_task_cancel",
    "localbridge_agent_task_pause",
    "localbridge_agent_task_resume",
    "localbridge_agent_task_list",
    "localbridge_agent_task_approve",
  ];

  const PROHIBITED_TOOLS = [
    "project_add",
    "project_authorize",
    "project_set_access",
    "project_set_execution",
    "token_create",
    "token_revoke",
    "runner_register",
    "shell_run",
    "raw_command",
    "cmd_run",
    "exec",
    "read_env",
    "read_credentials",
    "dump_config",
    "get_runner_state",
    "system.ping",
    "system.info",
    "runner.hello",
    "rpc.call",
    "localbridge.call",
    "runner.request",
  ];

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-tools-"));
    dbFilePath = path.join(tmpDir, "mcp-tools.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    const createdMcp = serverInstance.tokenService.createToken({
      name: "mcp-tools-test",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = createdMcp.token;

    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "list_req",
        method: "tools/list",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    tools = data.result?.tools ?? [];
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("registers all official tools on tools/list", () => {
    expect(tools.length).toBe(332);

    const registeredNames = new Set(tools.map((t: any) => t.name));
    for (const expected of EXPECTED_23_TOOLS) {
      expect(registeredNames.has(expected)).toBe(true);
    }
  });

  it("strictly prohibits management, execution escape, secret dump, and generic RPC tools", () => {
    const registeredNames = new Set(tools.map((t: any) => t.name));

    for (const prohibited of PROHIBITED_TOOLS) {
      expect(registeredNames.has(prohibited)).toBe(false);
    }
  });

  it("verifies accurate annotations (readOnlyHint, destructiveHint, idempotentHint) for all tools", () => {
    for (const tool of tools) {
      const expectedAnnotation = (TOOL_ANNOTATIONS as any)[tool.name];
      expect(expectedAnnotation).toBeDefined();
      expect(tool.annotations).toMatchObject(expectedAnnotation);
    }
  });

  it("verifies every tool has a non-empty description and valid inputSchema", () => {
    for (const tool of tools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("verifies localbridge_command_run exposes explicit object schema with approvalId for ChatGPT compatibility", () => {
    const cmdRunTool = tools.find((t: any) => t.name === "localbridge_command_run");
    expect(cmdRunTool).toBeDefined();
    expect(cmdRunTool.inputSchema.type).toBe("object");
    expect(cmdRunTool.inputSchema.properties).toBeDefined();
    expect(cmdRunTool.inputSchema.anyOf).toBeUndefined();

    // Required fields
    expect(cmdRunTool.inputSchema.required).toContain("projectId");
    expect(cmdRunTool.inputSchema.required).toContain("kind");

    // Explicit properties
    const props = cmdRunTool.inputSchema.properties;
    expect(props.projectId).toBeDefined();
    expect(props.projectId.type).toBe("string");

    expect(props.kind).toBeDefined();
    expect(props.kind.type).toBe("string");
    expect(props.kind.enum).toEqual([
      "tool-version",
      "node-script",
      "python-script",
      "package-script",
      "shell-command",
    ]);

    expect(props.tool).toBeDefined();
    expect(props.path).toBeDefined();
    expect(props.manager).toBeDefined();
    expect(props.script).toBeDefined();
    expect(props.args).toBeDefined();
    expect(props.cwd).toBeDefined();
    expect(props.timeoutMs).toBeDefined();

    // approvalId must be present, type string, optional (NOT in required)
    expect(props.approvalId).toBeDefined();
    expect(props.approvalId.type).toBe("string");
    expect(cmdRunTool.inputSchema.required).not.toContain("approvalId");
  });

  it("verifies localbridge_command_classify exposes explicit object schema with properties", () => {
    const classifyTool = tools.find((t: any) => t.name === "localbridge_command_classify");
    expect(classifyTool).toBeDefined();
    expect(classifyTool.inputSchema.type).toBe("object");
    expect(classifyTool.inputSchema.properties).toBeDefined();
    expect(classifyTool.inputSchema.anyOf).toBeUndefined();

    expect(classifyTool.inputSchema.required).toContain("projectId");
    expect(classifyTool.inputSchema.required).toContain("kind");
    expect(classifyTool.inputSchema.properties.projectId.type).toBe("string");
    expect(classifyTool.inputSchema.properties.kind.enum).toBeDefined();
  });

  it("verifies localbridge_job_start exposes explicit object schema with approvalId and nested command properties", () => {
    const jobStartTool = tools.find((t: any) => t.name === "localbridge_job_start");
    expect(jobStartTool).toBeDefined();
    expect(jobStartTool.inputSchema.type).toBe("object");
    expect(jobStartTool.inputSchema.properties).toBeDefined();

    const props = jobStartTool.inputSchema.properties;
    expect(props.approvalId).toBeDefined();
    expect(props.approvalId.type).toBe("string");
    expect(jobStartTool.inputSchema.required).not.toContain("approvalId");

    expect(props.command).toBeDefined();
    expect(props.command.type).toBe("object");
    expect(props.command.properties).toBeDefined();
    expect(props.command.properties.projectId).toBeDefined();
    expect(props.command.properties.kind).toBeDefined();
  });

  it("verifies localbridge_build_start and localbridge_test_start expose explicit approvalId", () => {
    for (const toolName of ["localbridge_build_start", "localbridge_test_start"]) {
      const tool = tools.find((t: any) => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.properties.approvalId).toBeDefined();
      expect(tool.inputSchema.properties.approvalId.type).toBe("string");
      expect(tool.inputSchema.required).not.toContain("approvalId");
    }
  });
});
