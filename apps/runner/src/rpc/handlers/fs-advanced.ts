import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FsSearchParams,
  type FsSearchResult,
  type FsGrepParams,
  type FsGrepResult,
  type FileReadStreamParams,
  type FileReadStreamResult,
  type FsBatchParams,
  type FsBatchResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../../projects/index.js";
import type { FilesystemService } from "../../filesystem/service.js";
import type { WorkspaceResolver } from "../../worktree/resolver.js";
import { searchProjectFiles } from "../../filesystem/fs-search.js";
import { grepProjectFiles } from "../../filesystem/fs-grep.js";
import { readFileStreamChunk } from "../../filesystem/fs-stream.js";

function getProjectRoot(
  projectId: string,
  projectRegistry: ProjectRegistry,
  workspaceResolver?: WorkspaceResolver
): string {
  const project = projectRegistry.get(projectId);
  if (!project) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.PROJECT_NOT_FOUND,
      `Project "${projectId}" not found in project registry`
    );
  }
  if (!project.enabled) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.PROJECT_DISABLED,
      `Project "${projectId}" is currently disabled`
    );
  }
  if (workspaceResolver) {
    const resolved = workspaceResolver.resolve(projectId);
    return resolved.workspaceRoot;
  }
  return project.canonicalRoot;
}

export function createFsSearchHandler(
  projectRegistry: ProjectRegistry,
  workspaceResolver?: WorkspaceResolver
) {
  return async (params: FsSearchParams): Promise<FsSearchResult> => {
    const root = getProjectRoot(params.projectId, projectRegistry, workspaceResolver);
    return searchProjectFiles(params, { canonicalRoot: root });
  };
}

export function createFsGrepHandler(
  projectRegistry: ProjectRegistry,
  workspaceResolver?: WorkspaceResolver
) {
  return async (params: FsGrepParams): Promise<FsGrepResult> => {
    const root = getProjectRoot(params.projectId, projectRegistry, workspaceResolver);
    return grepProjectFiles(params, { canonicalRoot: root });
  };
}

export function createFileReadStreamHandler(
  projectRegistry: ProjectRegistry,
  workspaceResolver?: WorkspaceResolver
) {
  return async (params: FileReadStreamParams): Promise<FileReadStreamResult> => {
    const root = getProjectRoot(params.projectId, projectRegistry, workspaceResolver);
    return readFileStreamChunk(params, { canonicalRoot: root });
  };
}

export function createFsBatchHandler(
  projectRegistry: ProjectRegistry,
  filesystemService: FilesystemService
) {
  return async (params: FsBatchParams): Promise<FsBatchResult> => {
    const project = projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${params.projectId}" not found`
      );
    }

    const results: Array<{
      action: string;
      path: string;
      success: boolean;
      error?: string;
    }> = [];

    let completedCount = 0;

    for (const op of params.operations) {
      try {
        if (op.action === "delete") {
          await filesystemService.fsDelete({
            projectId: params.projectId,
            path: op.sourcePath,
            recursive: true,
            force: op.force,
          });
          results.push({ action: op.action, path: op.sourcePath, success: true });
          completedCount++;
        } else if (op.action === "copy") {
          if (!op.targetPath) {
            throw new Error(`targetPath is required for copy operation`);
          }
          await filesystemService.fsCopy({
            projectId: params.projectId,
            sourcePath: op.sourcePath,
            targetPath: op.targetPath,
            overwrite: op.force,
            recursive: true,
          });
          results.push({ action: op.action, path: op.sourcePath, success: true });
          completedCount++;
        } else if (op.action === "move") {
          if (!op.targetPath) {
            throw new Error(`targetPath is required for move operation`);
          }
          await filesystemService.fsMove({
            projectId: params.projectId,
            sourcePath: op.sourcePath,
            targetPath: op.targetPath,
            overwrite: op.force,
          });
          results.push({ action: op.action, path: op.sourcePath, success: true });
          completedCount++;
        }
      } catch (err: any) {
        results.push({
          action: op.action,
          path: op.sourcePath,
          success: false,
          error: err?.message || String(err),
        });
      }
    }

    return {
      projectId: params.projectId,
      success: results.every((r) => r.success),
      operationsCompleted: completedCount,
      results,
    };
  };
}
