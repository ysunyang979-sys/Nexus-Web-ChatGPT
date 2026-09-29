import type {
  AgentTaskAssignParams,
  AgentTaskAssignResult,
  AgentTaskAttemptParams,
  AgentTaskAttemptResult,
  AgentTaskCodingRunParams,
  AgentTaskCodingRunResult,
  AgentTaskHeartbeatParams,
  AgentTaskHeartbeatResult,
  AgentTaskReconcileParams,
  AgentTaskReconcileResult,
  AgentTaskCompleteParams,
  AgentTaskCompleteResult,
  AgentTaskHandoffParams,
  AgentTaskHandoffResult,
  AgentTaskCheckpointCreateParams,
  AgentTaskCheckpointCreateResult,
  AgentTaskCheckpointRestoreParams,
  AgentTaskCheckpointRestoreResult,
  AgentTaskCheckpointListParams,
  AgentTaskCheckpointListResult,
  AgentTaskDisconnectParams,
  AgentTaskDisconnectResult,
  AgentTaskTakeoverParams,
  AgentTaskTakeoverResult,
} from "@localbridge/protocol";
import type { AgentTaskManager } from "../../agent-task/agent-task-manager.js";
import type { WorkspaceCheckpointService } from "../../checkpoints/checkpoint-service.js";

export function createAgentTaskAssignHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskAssignParams): Promise<AgentTaskAssignResult> => {
    return agentTaskManager.assign(params);
  };
}

export function createAgentTaskAttemptHandler(
  agentTaskManager: AgentTaskManager,
  checkpointService?: WorkspaceCheckpointService
) {
  return async (params: AgentTaskAttemptParams): Promise<AgentTaskAttemptResult> => {
    return agentTaskManager.attempt(params, checkpointService);
  };
}

export function createAgentTaskCodingRunHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCodingRunParams): Promise<AgentTaskCodingRunResult> => {
    return agentTaskManager.codingRun(params);
  };
}

export function createAgentTaskHeartbeatHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskHeartbeatParams): Promise<AgentTaskHeartbeatResult> => {
    return agentTaskManager.heartbeat(params);
  };
}

export function createAgentTaskReconcileHandler(
  agentTaskManager: AgentTaskManager,
  checkpointService?: WorkspaceCheckpointService
) {
  return async (params: AgentTaskReconcileParams): Promise<AgentTaskReconcileResult> => {
    return agentTaskManager.reconcile(params, checkpointService);
  };
}

export function createAgentTaskCompleteHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCompleteParams): Promise<AgentTaskCompleteResult> => {
    return agentTaskManager.complete(params);
  };
}

export function createAgentTaskHandoffHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskHandoffParams): Promise<AgentTaskHandoffResult> => {
    return agentTaskManager.handoff(params);
  };
}

export function createAgentTaskCheckpointCreateHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCheckpointCreateParams): Promise<AgentTaskCheckpointCreateResult> => {
    return agentTaskManager.createTaskCheckpoint(params.agentTaskId, params);
  };
}

export function createAgentTaskCheckpointRestoreHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCheckpointRestoreParams): Promise<AgentTaskCheckpointRestoreResult> => {
    return agentTaskManager.restoreTaskCheckpoint(params.agentTaskId, params);
  };
}

export function createAgentTaskCheckpointListHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskCheckpointListParams): Promise<AgentTaskCheckpointListResult> => {
    return agentTaskManager.listTaskCheckpoints(params.agentTaskId, params.limit);
  };
}

export function createAgentTaskDisconnectHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskDisconnectParams): Promise<AgentTaskDisconnectResult> => {
    return agentTaskManager.disconnectAgent(params.agentTaskId, params);
  };
}

export function createAgentTaskTakeoverHandler(agentTaskManager: AgentTaskManager) {
  return async (params: AgentTaskTakeoverParams): Promise<AgentTaskTakeoverResult> => {
    return agentTaskManager.takeoverTask(params.agentTaskId, params);
  };
}

