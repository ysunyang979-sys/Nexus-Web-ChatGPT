import {
  AgentTaskCreateParamsSchema,
  AgentTaskStatusParamsSchema,
  AgentTaskLogsParamsSchema,
  AgentTaskCancelParamsSchema,
  AgentTaskPauseParamsSchema,
  AgentTaskResumeParamsSchema,
  AgentTaskListParamsSchema,
  AgentTaskApproveParamsSchema,
  AgentTaskAssignParamsSchema,
  AgentTaskAttemptParamsSchema,
  AgentTaskCodingRunParamsSchema,
  AgentTaskHeartbeatParamsSchema,
  AgentTaskReconcileParamsSchema,
  AgentTaskCompleteParamsSchema,
  AgentTaskHandoffParamsSchema,
  AgentTaskCheckpointCreateParamsSchema,
  AgentTaskCheckpointRestoreParamsSchema,
  AgentTaskCheckpointListParamsSchema,
  AgentTaskDisconnectParamsSchema,
  AgentTaskTakeoverParamsSchema,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    return context.resolveProjectRunner(projectId);
  }
  const runners = context.runnerRegistry.list();
  const first = runners[0];
  if (!first) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.RUNNER_OFFLINE,
      "No runner is currently connected and online"
    );
  }
  return first.id;
}

export function registerAgentTaskTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_agent_task_create
  server.registerTool(
    "localbridge_agent_task_create",
    {
      description:
        "Create a long-term autonomous Agent Task with hard resource governance limits (wall time, CPU/memory, action budget, disk quota, failure loop detection).",
      inputSchema: toMcpSchema(AgentTaskCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_agent_task_create",
          projectId,
        });

        const runnerId = resolveRunner(context, projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskCreate,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_agent_task_create",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_agent_task_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_agent_task_status
  server.registerTool(
    "localbridge_agent_task_status",
    {
      description:
        "Query the real-time status of an Agent Task, including current phase, resource usage, iteration counters, pending approvals, and latest checkpoint.",
      inputSchema: toMcpSchema(AgentTaskStatusParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_status,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskStatus,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_agent_task_logs
  server.registerTool(
    "localbridge_agent_task_logs",
    {
      description:
        "Fetch sequence-based incremental execution logs for an Agent Task (observation, plan, action, command, terminal, process, port, approval, checkpoint).",
      inputSchema: toMcpSchema(AgentTaskLogsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_logs,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskLogs,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_agent_task_cancel
  server.registerTool(
    "localbridge_agent_task_cancel",
    {
      description:
        "Cancel an active Agent Task, stop its decision loop, and terminate all agent-owned runtimes, terminals, and processes.",
      inputSchema: toMcpSchema(AgentTaskCancelParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_cancel,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskCancel,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_agent_task_pause
  server.registerTool(
    "localbridge_agent_task_pause",
    {
      description:
        "Pause the Agent decision loop while keeping all owned development terminals, runtimes, and processes running.",
      inputSchema: toMcpSchema(AgentTaskPauseParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_pause,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskPause,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_agent_task_resume
  server.registerTool(
    "localbridge_agent_task_resume",
    {
      description:
        "Resume a paused Agent Task with fresh observation and state reconciliation against live OS processes and ports.",
      inputSchema: toMcpSchema(AgentTaskResumeParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_resume,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskResume,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_agent_task_list
  server.registerTool(
    "localbridge_agent_task_list",
    {
      description: "List long-term Agent Tasks filtered by project ID or state.",
      inputSchema: toMcpSchema(AgentTaskListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskList,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 8. localbridge_agent_task_approve
  server.registerTool(
    "localbridge_agent_task_approve",
    {
      description: "Approve or reject a pending security approval required by an Agent Task.",
      inputSchema: toMcpSchema(AgentTaskApproveParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_approve,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.AgentTaskApprove,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 9. localbridge_agent_task_assign
  server.registerTool(
    "localbridge_agent_task_assign",
    {
      description: "Assign an Agent Task to a specific agent executor or coding role.",
      inputSchema: toMcpSchema(AgentTaskAssignParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskAssign, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 10. localbridge_agent_task_attempt
  server.registerTool(
    "localbridge_agent_task_attempt",
    {
      description: "Record a new execution attempt with strategy notes, git baseline, and attempt tracking.",
      inputSchema: toMcpSchema(AgentTaskAttemptParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskAttempt, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 11. localbridge_agent_task_coding_run
  server.registerTool(
    "localbridge_agent_task_coding_run",
    {
      description: "Trigger or update a Coding Run inside an agent task attempt (connecting files, terminal, runtime, git).",
      inputSchema: toMcpSchema(AgentTaskCodingRunParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskCodingRun, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 12. localbridge_agent_task_heartbeat
  server.registerTool(
    "localbridge_agent_task_heartbeat",
    {
      description: "Emit a heartbeat for an active Agent Task with current step and progress status.",
      inputSchema: toMcpSchema(AgentTaskHeartbeatParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskHeartbeat, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 13. localbridge_agent_task_reconcile
  server.registerTool(
    "localbridge_agent_task_reconcile",
    {
      description: "Reconcile task state after disconnection, interruption, or timeout.",
      inputSchema: toMcpSchema(AgentTaskReconcileParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskReconcile, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 14. localbridge_agent_task_complete
  server.registerTool(
    "localbridge_agent_task_complete",
    {
      description: "Mark an Agent Task as completed, failed, or cancelled with final artifacts and verification summary.",
      inputSchema: toMcpSchema(AgentTaskCompleteParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskComplete, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 15. localbridge_agent_task_handoff
  server.registerTool(
    "localbridge_agent_task_handoff",
    {
      description: "Handoff task context, checkpoint, and remaining subtasks to another agent or session.",
      inputSchema: toMcpSchema(AgentTaskHandoffParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskHandoff, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 16. localbridge_agent_task_checkpoint_create
  server.registerTool(
    "localbridge_agent_task_checkpoint_create",
    {
      description: "Manually trigger or record a durable checkpoint for an Agent Task with full computer and context state.",
      inputSchema: toMcpSchema(AgentTaskCheckpointCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_checkpoint_create,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskCheckpointCreate, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 17. localbridge_agent_task_checkpoint_restore
  server.registerTool(
    "localbridge_agent_task_checkpoint_restore",
    {
      description: "Restore an Agent Task to a specific historical checkpoint, verifying live Windows state.",
      inputSchema: toMcpSchema(AgentTaskCheckpointRestoreParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_checkpoint_restore,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskCheckpointRestore, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 18. localbridge_agent_task_checkpoint_list
  server.registerTool(
    "localbridge_agent_task_checkpoint_list",
    {
      description: "List all durable checkpoints for an Agent Task sorted by creation time.",
      inputSchema: toMcpSchema(AgentTaskCheckpointListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_checkpoint_list,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskCheckpointList, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 19. localbridge_agent_task_disconnect
  server.registerTool(
    "localbridge_agent_task_disconnect",
    {
      description: "Mark an Agent Task as disconnected when the external Agent loses connection, safely persisting state.",
      inputSchema: toMcpSchema(AgentTaskDisconnectParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_disconnect,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskDisconnect, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 20. localbridge_agent_task_takeover
  server.registerTool(
    "localbridge_agent_task_takeover",
    {
      description: "Allow a human operator or secondary supervisor to take over an Agent Task or return control.",
      inputSchema: toMcpSchema(AgentTaskTakeoverParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_agent_task_takeover,
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.AgentTaskTakeover, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
