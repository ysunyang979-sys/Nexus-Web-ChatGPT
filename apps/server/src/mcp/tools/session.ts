import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  SessionStartParamsSchema,
  SessionListParamsSchema,
  SessionStatusParamsSchema,
  SessionEventsParamsSchema,
  SessionCheckpointParamsSchema,
  SessionHandoffParamsSchema,
  SessionFinishParamsSchema,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerSessionTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_session_start
  server.registerTool(
    "localbridge_session_start",
    {
      description:
        "Start a new persistent workflow session for an authorized project to track, correlate, and persist development context.",
      inputSchema: toMcpSchema(SessionStartParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_start,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (context.isPaused()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.AI_ACCESS_PAUSED,
            "LocalBridge AI access is paused by local user"
          );
        }

        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_start",
          projectId,
        });

        const result = context.workflowSessionManager.startSession({
          projectId: args.projectId,
          goal: args.goal,
          goals: args.goals,
          title: args.title,
          createdBy: "chat",
        });

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_start",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_session_list
  server.registerTool(
    "localbridge_session_list",
    {
      description:
        "List recent workflow sessions for a project with state filtering and cursor-based pagination.",
      inputSchema: toMcpSchema(SessionListParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_list",
          projectId,
        });

        const result = context.workflowSessionManager.listSessions(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_session_status
  server.registerTool(
    "localbridge_session_status",
    {
      description:
        "Retrieve core status, metrics, touched files count, active jobs, and latest checkpoint for a workflow session.",
      inputSchema: toMcpSchema(SessionStatusParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_status,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_status",
        });

        const result = context.workflowSessionManager.getSessionStatus({
          sessionId: args.sessionId,
          projectId: args.projectId,
        });

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_status",
          projectId: result.projectId ?? args.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_status",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_session_events
  server.registerTool(
    "localbridge_session_events",
    {
      description:
        "Retrieve paginated timeline events for a workflow session with stable cursor-based pagination.",
      inputSchema: toMcpSchema(SessionEventsParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_events,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_events",
        });

        const result = context.workflowSessionManager.getSessionEvents(args);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_events",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_events",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_session_checkpoint
  server.registerTool(
    "localbridge_session_checkpoint",
    {
      description:
        "Save an operator/AI development checkpoint note with summary, next steps, and blockers into an active session.",
      inputSchema: toMcpSchema(SessionCheckpointParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_checkpoint,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (context.isPaused()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.AI_ACCESS_PAUSED,
            "LocalBridge AI access is paused by local user"
          );
        }

        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_checkpoint",
        });

        const result = context.workflowSessionManager.addCheckpoint({
          ...args,
          createdBy: "chat",
        });

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_checkpoint",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_checkpoint",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_session_handoff
  server.registerTool(
    "localbridge_session_handoff",
    {
      description:
        "Generate a deterministic, sanitized handoff packet capturing session goal, real-time Git state, touched files, jobs, approvals, and latest checkpoint for seamless cross-chat resumption.",
      inputSchema: toMcpSchema(SessionHandoffParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_handoff,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { sessionId } = args;
      try {
        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_handoff",
        });

        const result = await context.workflowSessionManager.buildHandoffPacket(sessionId);

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_handoff",
          projectId: result.project?.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          ...result,
          handoff: result,
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_handoff",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_session_finish
  server.registerTool(
    "localbridge_session_finish",
    {
      description:
        "Finish a workflow session with outcome 'completed' or 'abandoned'. Blocked if active background jobs or pending approvals exist.",
      inputSchema: toMcpSchema(SessionFinishParamsSchema, { preserveStrict: true }),
      annotations: TOOL_ANNOTATIONS.localbridge_session_finish,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        if (context.isPaused()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.AI_ACCESS_PAUSED,
            "LocalBridge AI access is paused by local user"
          );
        }

        if (!context.workflowSessionManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SESSION_INTERNAL_ERROR,
            "WorkflowSessionManager is not initialized"
          );
        }

        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_session_finish",
        });

        const result = context.workflowSessionManager.finishSession({
          ...args,
          finishedBy: "chat",
        });

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_session_finish",
          projectId: result.projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_session_finish",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
