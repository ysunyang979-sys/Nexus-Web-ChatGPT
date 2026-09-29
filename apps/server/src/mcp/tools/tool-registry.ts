import { z } from "zod";
import { RunnerRpcMethods, defaultCanonicalToolRegistry } from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

const ListToolParamsSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.string().optional(),
  executionMode: z.string().optional(),
  providerId: z.string().optional(),
  includeDisabled: z.boolean().optional(),
});

const GetToolParamsSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
});

export function registerToolRegistryTools(server: McpServer, context: McpContext): void {
  // 1. list
  const listHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result: any = await context.request(runnerId, RunnerRpcMethods.ToolRegistryList, args || {});
      if (result && Array.isArray(result.tools)) {
        return formatToolSuccess({
          ...result,
          totalCount: result.totalCount ?? result.tools.length,
        });
      }
      const tools = defaultCanonicalToolRegistry.list(args);
      return formatToolSuccess({
        tools,
        totalCount: tools.length,
        version: defaultCanonicalToolRegistry.version(),
      });
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_tool_registry_list",
    {
      description: "List all tools registered in the unified Tool Registry with risk levels, permissions, and timeout metadata.",
      inputSchema: toMcpSchema(ListToolParamsSchema),
    },
    listHandler
  );
  server.registerTool(
    "tool_registry_list",
    {
      description: "Alias for localbridge_tool_registry_list.",
      inputSchema: toMcpSchema(ListToolParamsSchema),
    },
    listHandler
  );

  // 2. get
  const getHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result: any = await context.request(runnerId, RunnerRpcMethods.ToolRegistryGet, args);
      if (result && "tool" in result) {
        return formatToolSuccess(result);
      }
      const tool = defaultCanonicalToolRegistry.get(args?.name, { version: args?.version });
      return formatToolSuccess({
        tool: tool || null,
        found: Boolean(tool),
      });
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_tool_registry_get",
    {
      description: "Get detailed unified tool definition and schemas by tool name.",
      inputSchema: toMcpSchema(GetToolParamsSchema),
    },
    getHandler
  );
  server.registerTool(
    "tool_registry_get",
    {
      description: "Alias for localbridge_tool_registry_get.",
      inputSchema: toMcpSchema(GetToolParamsSchema),
    },
    getHandler
  );
}
