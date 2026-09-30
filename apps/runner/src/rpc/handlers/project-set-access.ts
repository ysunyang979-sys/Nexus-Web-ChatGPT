import type {
  ProjectSetAccessParams,
  ProjectSetAccessResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";

export function createProjectSetAccessHandler(registry: ProjectRegistry) {
  return async (params: ProjectSetAccessParams): Promise<ProjectSetAccessResult> => {
    registry.setAccessMode(params.projectId, params.accessMode);
    const updated = registry.get(params.projectId);
    return {
      id: params.projectId,
      name: updated?.name ?? params.projectId,
      enabled: updated?.enabled ?? true,
      accessMode: updated?.accessMode ?? params.accessMode,
      executionMode: updated?.executionMode ?? "disabled",
      cancelledJobsCount: 0,
    } as ProjectSetAccessResult;
  };
}
