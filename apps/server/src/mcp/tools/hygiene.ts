import {
  WorkspaceHygieneCheckParamsSchema,
  WorkspaceCleanParamsSchema,
  WorkspaceResetFileParamsSchema,
  WorkspaceCleanUntrackedParamsSchema,
  WorkspaceKillZombiesParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerHygieneTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_workspace_hygiene_check
  server.registerTool(
    "localbridge_workspace_hygiene_check",
    {
      description: "Analyze workspace health: check uncommitted git changes, untracked files, temp build files, and zombie processes.",
      inputSchema: toMcpSchema(WorkspaceHygieneCheckParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.HygieneCheck, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_workspace_clean
  server.registerTool(
    "localbridge_workspace_clean",
    {
      description: "Clean up temporary build files, stale caches, and test artifacts safely.",
      inputSchema: toMcpSchema(WorkspaceCleanParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.HygieneClean, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_workspace_reset_file
  server.registerTool(
    "localbridge_workspace_reset_file",
    {
      description: "Revert an individual modified file back to git HEAD state.",
      inputSchema: toMcpSchema(WorkspaceResetFileParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.HygieneResetFile, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_workspace_clean_untracked
  server.registerTool(
    "localbridge_workspace_clean_untracked",
    {
      description: "Remove untracked junk files from the workspace directory.",
      inputSchema: toMcpSchema(WorkspaceCleanUntrackedParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.HygieneCleanUntracked, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_workspace_kill_zombies
  server.registerTool(
    "localbridge_workspace_kill_zombies",
    {
      description: "Terminate orphaned runner child processes and zombie runtimes.",
      inputSchema: toMcpSchema(WorkspaceKillZombiesParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args || {};

      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_workspace_kill_zombies",
          projectId,
        });

        if (!projectId || typeof projectId !== "string") {
          throw new Error("Missing or invalid 'projectId' parameter.");
        }

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.HygieneKillZombies, args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_workspace_kill_zombies",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_workspace_kill_zombies",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (err as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
