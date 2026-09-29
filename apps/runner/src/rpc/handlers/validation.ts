import type {
  UnifiedValidationParams,
  UnifiedValidationResult,
} from "@localbridge/protocol";
import type { UnifiedValidationService } from "../../validation/validation-service.js";

export function createValidationRunHandler(service: UnifiedValidationService) {
  return async (params: UnifiedValidationParams): Promise<UnifiedValidationResult> => {
    return service.run(params);
  };
}
