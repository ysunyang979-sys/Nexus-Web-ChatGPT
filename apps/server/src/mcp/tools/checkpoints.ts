import {
  CheckpointCreateParamsSchema,
  CheckpointListParamsSchema,
  CheckpointGetParamsSchema,
  CheckpointRestoreParamsSchema,
  CheckpointDeleteParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerCheckpointTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_checkpoint_create
  server.registerTool(
    "localbridge_checkpoint_create",
    {
      description: "Create an atomic workspace snapshot/checkpoint capturing modified files and git state for safe rollback.",
      inputSchema: toMcpSchema(CheckpointCreateParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CheckpointCreate, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_checkpoint_list
  server.registerTool(
    "localbridge_checkpoint_list",
    {
      description: "List available workspace checkpoints for a project.",
      inputSchema: toMcpSchema(CheckpointListParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CheckpointList, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_checkpoint_get
  server.registerTool(
    "localbridge_checkpoint_get",
    {
      description: "Get detailed manifest and file list for a specific checkpoint.",
      inputSchema: toMcpSchema(CheckpointGetParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CheckpointGet, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_checkpoint_restore
  server.registerTool(
    "localbridge_checkpoint_restore",
    {
      description: "Atomically restore workspace to a previous checkpoint state, reverting code changes.",
      inputSchema: toMcpSchema(CheckpointRestoreParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CheckpointRestore, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_checkpoint_delete
  server.registerTool(
    "localbridge_checkpoint_delete",
    {
      description: "Delete an unwanted checkpoint and clean up stored snapshot files.",
      inputSchema: toMcpSchema(CheckpointDeleteParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CheckpointDelete, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
