import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { MCP_TOOL_SCOPE, requiredScopeForTool, hasToolScope, type McpScope } from "../apps/server/src/mcp/scope-policy.js";
import { TOOL_ANNOTATIONS } from "../apps/server/src/mcp/annotations.js";
import { createLocalBridgeMcpServer } from "../apps/server/src/mcp/server.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

const CODE_INTELLIGENCE_TOOLS = [
  "localbridge_code_document_symbols",
  "localbridge_code_workspace_symbols",
  "localbridge_code_definition",
  "localbridge_code_references",
  "localbridge_code_hover",
  "localbridge_code_diagnostics",
  "localbridge_code_call_hierarchy",
  "localbridge_code_impact",
] as const;

describe("P3-A MCP Tool Scope Parity & Authorization", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let readOnlyToken: string;
  let emptyScopeToken: string;
  let fullToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-parity-"));
    dbFilePath = path.join(tmpDir, "parity.db");

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

    // Create token with ONLY "read" scope
    const readTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-read-only-client",
      type: "mcp",
      scopes: ["read"],
    });
    readOnlyToken = readTokenRecord.token;

    // Create token with empty scope set
    const emptyTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-empty-scope-client",
      type: "mcp",
      scopes: [],
    });
    emptyScopeToken = emptyTokenRecord.token;

    // Create token with full scopes
    const fullTokenRecord = serverInstance.tokenService.createToken({
      name: "mcp-full-client",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    fullToken = fullTokenRecord.token;
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

  async function postMcp(body: any, token: string) {
    return fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        connection: "close",
      },
      body: JSON.stringify(body),
    });
  }

  it("enforces dynamic scope parity: ToolRegistry - ScopeRegistry = 0", () => {
    const dummyContext = new McpContext({} as any, {} as any, undefined, {} as any, {} as any);
    const server = createLocalBridgeMcpServer(dummyContext);

    // Retrieve all tools registered on the server instance
    const registeredToolNames: string[] = Object.keys((server as any)._registeredTools ?? {});
    expect(registeredToolNames.length).toBeGreaterThan(0);

    const mappedTools: string[] = [];
    const unmappedTools: string[] = [];

    for (const toolName of registeredToolNames) {
      const scope = requiredScopeForTool(toolName);
      if (scope) {
        mappedTools.push(toolName);
      } else {
        unmappedTools.push(toolName);
      }
    }

    const scopeKeys = Object.keys(MCP_TOOL_SCOPE);
    const extraInScope = scopeKeys.filter((k) => !registeredToolNames.includes(k));

    expect(unmappedTools, `Found unmapped tools: ${unmappedTools.join(", ")}`).toEqual([]);
    expect(extraInScope, `Found scope mappings for unregistered tools: ${extraInScope.join(", ")}`).toEqual([]);
    expect(mappedTools.length).toBe(registeredToolNames.length);
    expect(registeredToolNames.length).toBeGreaterThanOrEqual(87);
  });

  it("ensures every tool scope is strictly a valid standard release scope", () => {
    const validScopes = new Set<McpScope>(["read", "write", "execute"]);
    for (const [toolName, scope] of Object.entries(MCP_TOOL_SCOPE)) {
      expect(
        validScopes.has(scope),
        `Tool "${toolName}" has invalid non-standard scope "${scope}"`
      ).toBe(true);
    }
  });

  it("maps all 8 Code Intelligence tools to 'read' scope with readOnlyHint: true", () => {
    for (const toolName of CODE_INTELLIGENCE_TOOLS) {
      const scope = requiredScopeForTool(toolName);
      expect(scope, `${toolName} must be mapped to 'read' scope`).toBe("read");

      const annotations = TOOL_ANNOTATIONS[toolName];
      expect(annotations, `${toolName} must have annotations`).toBeDefined();
      expect(annotations?.readOnlyHint, `${toolName} must declare readOnlyHint: true`).toBe(true);
    }
  });

  it("fails closed for unknown tool with MCP_SCOPE_DENIED", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "call-unknown",
        method: "tools/call",
        params: {
          name: "localbridge_non_existent_tool",
          arguments: {},
        },
      },
      readOnlyToken
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32003);
    expect(json.error.message).toBe("Forbidden: unknown tool has no authorized scope mapping");
    expect(json.error.data?.code).toBe("MCP_SCOPE_DENIED");
  });

  it("authorizes all 8 Code Intelligence tools with a read-only token", async () => {
    for (const toolName of CODE_INTELLIGENCE_TOOLS) {
      const res = await postMcp(
        {
          jsonrpc: "2.0",
          id: `call-${toolName}`,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: {
              projectId: "proj_any",
              filePath: "src/index.ts",
              query: "test",
              line: 1,
              character: 1,
            },
          },
        },
        readOnlyToken
      );

      // Must NOT be 403 Forbidden
      expect(
        res.status,
        `Tool ${toolName} failed scope authorization with status ${res.status}`
      ).not.toBe(403);

      const json = (await res.json()) as any;
      // It must not return MCP_SCOPE_DENIED error
      if (json.error) {
        expect(json.error.data?.code).not.toBe("MCP_SCOPE_DENIED");
        expect(json.error.message).not.toContain("Forbidden");
      }
    }
  });

  it("denies write tool to a read-only token with 403 MCP_SCOPE_DENIED", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "call-write",
        method: "tools/call",
        params: {
          name: "localbridge_file_write",
          arguments: {
            projectId: "proj_any",
            path: "test.txt",
            content: "hello",
          },
        },
      },
      readOnlyToken
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error?.code).toBe(-32003);
    expect(json.error?.message).toContain('Forbidden: tool "localbridge_file_write" requires scope "write"');
    expect(json.error?.data?.code).toBe("MCP_SCOPE_DENIED");
    expect(json.error?.data?.requiredScope).toBe("write");
  });

  it("denies execute tool to a read-only token with 403 MCP_SCOPE_DENIED", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "call-exec",
        method: "tools/call",
        params: {
          name: "localbridge_command_run",
          arguments: {
            projectId: "proj_any",
            command: "echo test",
          },
        },
      },
      readOnlyToken
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error?.code).toBe(-32003);
    expect(json.error?.message).toContain('Forbidden: tool "localbridge_command_run" requires scope "execute"');
    expect(json.error?.data?.code).toBe("MCP_SCOPE_DENIED");
    expect(json.error?.data?.requiredScope).toBe("execute");
  });

  it("denies any tool to an empty scope token", async () => {
    for (const toolName of ["localbridge_project_list", "localbridge_file_write", "localbridge_command_run"]) {
      const res = await postMcp(
        {
          jsonrpc: "2.0",
          id: `call-empty-${toolName}`,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: {},
          },
        },
        emptyScopeToken
      );

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.error?.data?.code).toBe("MCP_SCOPE_DENIED");
    }
  });
});
