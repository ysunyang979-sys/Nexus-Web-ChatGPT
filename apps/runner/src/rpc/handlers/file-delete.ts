import type {
  FileDeleteParams,
  FileDeleteResult,
} from "@localbridge/protocol";
import type { FilesystemService } from "../../filesystem/index.js";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator, isProtectedFile, isBuildDefinitionFile } from "@localbridge/security";

export function createFileDeleteHandler(
  fsService: FilesystemService,
  approvalManager: ApprovalManager,
  projectRegistry?: ProjectRegistry
) {
  return async (params: FileDeleteParams): Promise<FileDeleteResult> => {
    fsService.assertDeleteAuthorized(params.projectId);
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
      operation: "file.delete",
      relativePath: params.path,
      projectEnabled: effectiveProject.enabled,
      projectAccessMode: effectiveProject.accessMode as "read-only" | "read-write",
      trustPolicy: effectiveProject.trustPolicy,
      isSessionTrusted,
    });

    const payload = {
      projectId: params.projectId,
      path: params.path,
      expectedHash: params.expectedHash,
    };

    if (!fsService.isSafetyLayerDisabled?.()) {
      if (evalResult.decision === "deny") {
        if (effectiveProject.accessMode !== "read-write") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.PROJECT_READ_ONLY,
            `Project "${params.projectId}" is in read-only mode`
          );
        }
        throw new LocalBridgeError(
          LocalBridgeErrorCode.POLICY_DENIED,
          evalResult.reason || `Operation "file.delete" denied by policy.`
        );
      }

      const pHash = canonicalPayloadHash(payload);

      const isFollowPolicy = effectiveProject.trustPolicy?.protectedFilesPolicy === "follow-policy" && evalResult.decision === "allow";
      const isProtected = !isFollowPolicy && (evalResult.decisionSource === "protected-file" || isProtectedFile(params.path));
      const isBuildDef = !isFollowPolicy && isBuildDefinitionFile(params.path);
      const needsApproval = evalResult.decision === "ask" || isProtected || isBuildDef;

      if (needsApproval) {
        approvalManager.handleOperationApproval({
          projectId: params.projectId,
          operation: "file.delete",
          risk: "DANGEROUS",
          summary: `Delete file "${params.path}" in project "${params.projectId}"`,
          payloadHash: pHash,
          approvalId: params.approvalId,
          timeoutMs: 300000,
          decisionSource: isProtected
            ? "protected-file"
            : isBuildDef
            ? "build-definition"
            : evalResult.decisionSource,
          isProtectedFile: isProtected,
          isBuildDefinition: isBuildDef,
          callerPurpose: params.callerPurpose,
        });
      }
    }

    return fsService.deleteFile({
      ...payload,
      sessionId: params.sessionId,
    });
  };
}
