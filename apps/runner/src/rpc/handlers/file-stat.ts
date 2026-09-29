import type {
  FileStatParams,
  FileStatResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator } from "@localbridge/security";

export function createFileStatHandler(
  fsService: FilesystemService,
  approvalManager?: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FileStatParams): Promise<FileStatResult> => {
    const project = projectRegistry
      ? projectRegistry.get(params.projectId)
      : { enabled: true, accessMode: "read-write", trustPolicy: undefined };

    if (!project) {
      if (!fsService.isSafetyLayerDisabled?.()) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          `Project "${params.projectId}" not found`
        );
      }
    } else if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${params.projectId}" is currently disabled`
      );
    }

    const effectiveProject = project ?? {
      enabled: true,
      accessMode: "read-write" as const,
      trustPolicy: undefined,
    };

    const isSessionTrusted = projectRegistry
      ? projectRegistry.isSessionTrusted(params.projectId)
      : false;

    const evalResult = TrustPolicyEvaluator.evaluate({
      projectId: params.projectId,
      operation: "file.stat",
      relativePath: params.path,
      projectEnabled: effectiveProject.enabled,
      projectAccessMode: effectiveProject.accessMode as "read-only" | "read-write",
      trustPolicy: effectiveProject.trustPolicy,
      isSessionTrusted,
    });

    if (!fsService.isSafetyLayerDisabled?.()) {
      if (evalResult.decision === "deny") {
        if (evalResult.decisionSource === "protected-file") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
            evalResult.reason || `Access to sensitive file "${params.path}" is blocked.`
          );
        }
        throw new LocalBridgeError(
          LocalBridgeErrorCode.POLICY_DENIED,
          evalResult.reason || `Operation "file.stat" denied by policy.`
        );
      }

      const payload = {
        projectId: params.projectId,
        path: params.path,
      };
      const pHash = canonicalPayloadHash(payload);

      if (evalResult.decision === "ask") {
        if (!approvalManager) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.APPROVAL_REQUIRED,
            `Operation "file.stat" requires human approval.`
          );
        }

        approvalManager.handleOperationApproval({
          projectId: params.projectId,
          operation: "file.stat",
          risk: "CAUTION",
          summary: `Stat file "${params.path}" in project "${params.projectId}"`,
          payloadHash: pHash,
          approvalId: params.approvalId,
          timeoutMs: 300000,
          decisionSource: evalResult.decisionSource,
          isProtectedFile: evalResult.decisionSource === "protected-file",
        });
      }
    }

    return fsService.stat(params);
  };
}
