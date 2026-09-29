import {
  ContextBuildParamsSchema,
  ContextGetParamsSchema,
  ContextCompactParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerContextTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_context_build
  server.registerTool(
    "localbridge_context_build",
    {
      description: "Build a coherent, dynamically aggregated context snapshot combining rules, recalled memories, active skills, files, and recent actions.",
      inputSchema: toMcpSchema(ContextBuildParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_context_build,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        const snapshot = await context.intelligenceRuntime.contextBuilder.buildContext({
          taskId: args?.taskId,
          sessionId: args?.sessionId,
          projectId: args?.projectId,
          goal: args?.goal,
          recentActions: args?.recentActions || [],
          files: args?.files || [],
          maxTokens: args?.maxTokens,
        });

        return formatToolSuccess(snapshot);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 2. localbridge_context_get
  server.registerTool(
    "localbridge_context_get",
    {
      description: "Retrieve an existing context snapshot by its ID.",
      inputSchema: toMcpSchema(ContextGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_context_get,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        const snapshot = context.intelligenceRuntime.contextBuilder.getSnapshot(args.contextId);
        if (!snapshot) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.NOT_FOUND,
            `Context snapshot '${args.contextId}' not found`
          );
        }

        return formatToolSuccess(snapshot);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 3. localbridge_context_compact
  server.registerTool(
    "localbridge_context_compact",
    {
      description: "Perform deterministic, zero-LLM context compaction on a snapshot or existing context to fit within target token limits.",
      inputSchema: toMcpSchema(ContextCompactParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_context_compact,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        let snapshot = args.snapshot;
        if (!snapshot && args.contextId) {
          snapshot = context.intelligenceRuntime.contextBuilder.getSnapshot(args.contextId);
        }

        if (!snapshot) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INVALID_REQUEST,
            "Either valid 'snapshot' or 'contextId' must be provided"
          );
        }

        const compactor = context.intelligenceRuntime.contextBuilder.getCompactor();
        const { compactedSnapshot, state } = compactor.compact(snapshot, args?.targetTokenLimit || 4000);
        compactedSnapshot.compactionState = state;

        // Update snapshot in store
        context.intelligenceRuntime.store.saveContextSnapshot(compactedSnapshot);
        context.intelligenceRuntime.store.saveCompaction(state, compactedSnapshot.contextId, compactedSnapshot.taskId);

        return formatToolSuccess({ ...compactedSnapshot, compactionState: state });
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );
}
