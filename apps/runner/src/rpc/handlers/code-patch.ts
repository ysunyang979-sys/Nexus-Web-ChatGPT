import type {
  CodePatchPreviewParams,
  CodePatchPreviewResult,
  CodePatchApplyParams,
  CodePatchApplyResult,
  CodePatchRollbackParams,
  CodePatchRollbackResult,
} from "@localbridge/protocol";
import type { CodePatchService } from "../../code-patch/patch-service.js";

export function createCodePatchPreviewHandler(service: CodePatchService) {
  return async (params: CodePatchPreviewParams): Promise<CodePatchPreviewResult> => {
    return service.preview(params);
  };
}

export function createCodePatchApplyHandler(service: CodePatchService) {
  return async (params: CodePatchApplyParams): Promise<CodePatchApplyResult> => {
    return service.apply(params);
  };
}

export function createCodePatchRollbackHandler(service: CodePatchService) {
  return async (params: CodePatchRollbackParams): Promise<CodePatchRollbackResult> => {
    return service.rollback(params);
  };
}
