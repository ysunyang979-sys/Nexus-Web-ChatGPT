import type {
  FsDeleteParams,
  FsDeleteResult,
  FsMoveParams,
  FsMoveResult,
  FsCopyParams,
  FsCopyResult,
  FsMkdirParams,
  FsMkdirResult,
} from "@localbridge/protocol";
import { LocalBridgeError, LocalBridgeErrorCode } from "@localbridge/protocol";
import { canonicalPayloadHash } from "@localbridge/shared";
import type { FilesystemService } from "../../filesystem/index.js";
import type { ApprovalManager } from "../../approvals/index.js";
import type { ProjectRegistry } from "../../projects/index.js";
import { TrustPolicyEvaluator } from "@localbridge/security";

export function createFsDeleteHandler(
  fsService: FilesystemService,
  approvalManager: ApprovalManager,
  projectRegistry?: ProjectRegistry,
  customStateDir?: string
) {
  return async (
    params: FsDeleteParams & { isFullControl?: boolean; isDeviceScope?: boolean }
  ): Promise<FsDeleteResult> => {
    const isFullControl = Boolean(params.isFullControl);
    const isDeviceScope = Boolean(params.isDeviceScope);

    if (params.projectId && projectRegistry) {
      const project = projectRegistry.get(params.projectId);
      if (!project) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          `Project "${params.projectId}" not found`
        );
      }
      if (!project.enabled) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_DISABLED,
          `Project "${params.projectId}" is currently disabled`
        );
      }

      if (!isFullControl && !fsService.isSafetyLayerDisabled?.()) {
        const isSessionTrusted = projectRegistry.isSessionTrusted(params.projectId);
        const evalResult = TrustPolicyEvaluator.evaluate({
          projectId: params.projectId,
          operation: "file.delete",
          relativePath: params.path,
          projectEnabled: project.enabled,
          projectAccessMode: project.accessMode as "read-only" | "read-write",
          trustPolicy: project.trustPolicy,
          isSessionTrusted,
        });

        if (evalResult.decision === "deny") {
          if (project.accessMode !== "read-write") {
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

        if (evalResult.decision === "ask") {
          const payloadHash = canonicalPayloadHash({
            projectId: params.projectId,
            path: params.path,
            recursive: params.recursive,
            force: params.force,
          });
          approvalManager.handleOperationApproval({
            projectId: params.projectId,
            operation: "file.delete",
            risk: "DANGEROUS",
            summary: `Delete "${params.path}" in project "${params.projectId}" (recursive=${params.recursive})`,
            payloadHash,
            approvalId: params.approvalId,
            timeoutMs: 300000,
            decisionSource: evalResult.decisionSource,
            isProtectedFile: evalResult.decisionSource === "protected-file",
          });
        }
      }
    }

    return fsService.fsDelete(params, isFullControl, isDeviceScope, customStateDir);
  };
}

export function createFsMoveHandler(
  fsService: FilesystemService,
  _approvalManager: ApprovalManager,
  projectRegistry?: ProjectRegistry,
  customStateDir?: string
) {
  return async (
    params: FsMoveParams & { isFullControl?: boolean; isDeviceScope?: boolean }
  ): Promise<FsMoveResult> => {
    const isFullControl = Boolean(params.isFullControl);
    const isDeviceScope = Boolean(params.isDeviceScope);

    if (params.projectId && projectRegistry && !isFullControl && !fsService.isSafetyLayerDisabled?.()) {
      const project = projectRegistry.get(params.projectId);
      if (!project) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          `Project "${params.projectId}" not found`
        );
      }
      if (!project.enabled) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_DISABLED,
          `Project "${params.projectId}" is currently disabled`
        );
      }
      if (project.accessMode !== "read-write") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_READ_ONLY,
          `Project "${params.projectId}" is in read-only mode`
        );
      }
    }

    return fsService.fsMove(params, isFullControl, isDeviceScope, customStateDir);
  };
}

export function createFsCopyHandler(
  fsService: FilesystemService,
  _approvalManager: ApprovalManager,
  projectRegistry?: ProjectRegistry,
  customStateDir?: string
) {
  return async (
    params: FsCopyParams & { isFullControl?: boolean; isDeviceScope?: boolean }
  ): Promise<FsCopyResult> => {
    const isFullControl = Boolean(params.isFullControl);
    const isDeviceScope = Boolean(params.isDeviceScope);

    if (params.projectId && projectRegistry && !isFullControl && !fsService.isSafetyLayerDisabled?.()) {
      const project = projectRegistry.get(params.projectId);
      if (!project) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          `Project "${params.projectId}" not found`
        );
      }
      if (!project.enabled) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_DISABLED,
          `Project "${params.projectId}" is currently disabled`
        );
      }
      if (project.accessMode !== "read-write") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_READ_ONLY,
          `Project "${params.projectId}" is in read-only mode`
        );
      }
    }

    return fsService.fsCopy(params, isFullControl, isDeviceScope, customStateDir);
  };
}

export function createFsMkdirHandler(
  fsService: FilesystemService,
  _approvalManager: ApprovalManager,
  projectRegistry?: ProjectRegistry,
  customStateDir?: string
) {
  return async (
    params: FsMkdirParams & { isFullControl?: boolean; isDeviceScope?: boolean }
  ): Promise<FsMkdirResult> => {
    const isFullControl = Boolean(params.isFullControl);
    const isDeviceScope = Boolean(params.isDeviceScope);

    if (params.projectId && projectRegistry && !isFullControl && !fsService.isSafetyLayerDisabled?.()) {
      const project = projectRegistry.get(params.projectId);
      if (!project) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          `Project "${params.projectId}" not found`
        );
      }
      if (!project.enabled) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_DISABLED,
          `Project "${params.projectId}" is currently disabled`
        );
      }
      if (project.accessMode !== "read-write") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_READ_ONLY,
          `Project "${params.projectId}" is in read-only mode`
        );
      }
    }

    return fsService.fsMkdir(params, isFullControl, isDeviceScope, customStateDir);
  };
}
