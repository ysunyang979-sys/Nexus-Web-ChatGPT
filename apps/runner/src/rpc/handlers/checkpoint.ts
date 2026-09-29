import type {
  CheckpointCreateParams,
  CheckpointCreateResult,
  CheckpointListParams,
  CheckpointListResult,
  CheckpointGetParams,
  CheckpointGetResult,
  CheckpointRestoreParams,
  CheckpointRestoreResult,
  CheckpointDeleteParams,
  CheckpointDeleteResult,
} from "@localbridge/protocol";
import type { WorkspaceCheckpointService } from "../../checkpoints/checkpoint-service.js";

export function createCheckpointCreateHandler(service: WorkspaceCheckpointService) {
  return async (params: CheckpointCreateParams): Promise<CheckpointCreateResult> => {
    return service.create(params);
  };
}

export function createCheckpointListHandler(service: WorkspaceCheckpointService) {
  return async (params: CheckpointListParams): Promise<CheckpointListResult> => {
    return service.list(params);
  };
}

export function createCheckpointGetHandler(service: WorkspaceCheckpointService) {
  return async (params: CheckpointGetParams): Promise<CheckpointGetResult> => {
    return service.get(params);
  };
}

export function createCheckpointRestoreHandler(service: WorkspaceCheckpointService) {
  return async (params: CheckpointRestoreParams): Promise<CheckpointRestoreResult> => {
    return service.restore(params);
  };
}

export function createCheckpointDeleteHandler(service: WorkspaceCheckpointService) {
  return async (params: CheckpointDeleteParams): Promise<CheckpointDeleteResult> => {
    return service.delete(params);
  };
}
