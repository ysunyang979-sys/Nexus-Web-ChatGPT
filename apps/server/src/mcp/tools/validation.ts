import {
  UnifiedValidationParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerValidationTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_validation_run
  server.registerTool(
    "localbridge_validation_run",
    {
      description: "Run automated project validation (typecheck, lint, build, test, format) across Node, Rust, Python, Go, and Java ecosystems.",
      inputSchema: toMcpSchema(UnifiedValidationParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", { toolName: "localbridge_validation_run", ...args });
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.ValidationRun, args);
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_validation_run", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_validation_run", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
