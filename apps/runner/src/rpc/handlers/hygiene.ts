import type {
  WorkspaceHygieneCheckParams,
  WorkspaceHygieneCheckResult,
  WorkspaceCleanParams,
  WorkspaceCleanResult,
  WorkspaceResetFileParams,
  WorkspaceResetFileResult,
  WorkspaceCleanUntrackedParams,
  WorkspaceCleanUntrackedResult,
  WorkspaceKillZombiesParams,
  WorkspaceKillZombiesResult,
} from "@localbridge/protocol";
import type { WorkspaceHygieneService } from "../../hygiene/hygiene-service.js";

export function createHygieneCheckHandler(service: WorkspaceHygieneService) {
  return async (params: WorkspaceHygieneCheckParams): Promise<WorkspaceHygieneCheckResult> => {
    return service.check(params);
  };
}

export function createHygieneCleanHandler(service: WorkspaceHygieneService) {
  return async (params: WorkspaceCleanParams): Promise<WorkspaceCleanResult> => {
    return service.clean(params);
  };
}

export function createHygieneResetFileHandler(service: WorkspaceHygieneService) {
  return async (params: WorkspaceResetFileParams): Promise<WorkspaceResetFileResult> => {
    return service.resetFile(params);
  };
}

export function createHygieneCleanUntrackedHandler(service: WorkspaceHygieneService) {
  return async (params: WorkspaceCleanUntrackedParams): Promise<WorkspaceCleanUntrackedResult> => {
    return service.cleanUntracked(params);
  };
}

export function createHygieneKillZombiesHandler(service: WorkspaceHygieneService) {
  return async (params: WorkspaceKillZombiesParams): Promise<WorkspaceKillZombiesResult> => {
    return service.killZombies(params);
  };
}
