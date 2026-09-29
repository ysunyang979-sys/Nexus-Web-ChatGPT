import os from "node:os";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type DirectoryListParams,
  type DirectoryListResult,
  type FileStatParams,
  type FileStatResult,
  type FileReadParams,
  type FileReadResult,
  type FileCreateParams,
  type FileCreateResult,
  type FileWriteParams,
  type FileWriteResult,
  type FilePatchParams,
  type FilePatchResult,
  type FileDeleteParams,
  type FileDeleteResult,
  type FileRestoreParams,
  type FileRestoreResult,
  type FsDeleteParams,
  type FsDeleteResult,
  type FsMoveParams,
  type FsMoveResult,
  type FsCopyParams,
  type FsCopyResult,
  type FsMkdirParams,
  type FsMkdirResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import type { WorkspaceResolver } from "../worktree/resolver.js";
import { BackupService } from "../backup/service.js";
import { listDirectory } from "./directory.js";
import { statFile } from "./file-stat.js";
import { readTextFile } from "./file-read.js";
import { createFile } from "./file-create.js";
import { writeFile } from "./file-write.js";
import { patchFile } from "./file-patch.js";
import { deleteFile } from "./file-delete.js";
import { restoreFile } from "./file-restore.js";
import {
  universalDelete,
  universalMove,
  universalCopy,
  universalMkdir,
} from "./fs-universal.js";

/**
 * Runner Filesystem Service.
 * Exposes safe filesystem operations within authorized project boundaries.
 * Guarantees that physical paths never leave the Runner.
 */
export class FilesystemService {
  private readonly backupService: BackupService;
  private readonly logger?: Logger;
  private readonly fileChangeListeners: Array<(projectId: string, path: string, content?: string) => void> = [];
  private workspaceResolver?: WorkspaceResolver;
  private safetyLayerDisabled: boolean = false;

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    backupServiceOrLogger?: BackupService | Logger,
    logger?: Logger
  ) {
    if (backupServiceOrLogger && "createBackup" in backupServiceOrLogger) {
      this.backupService = backupServiceOrLogger;
      this.logger = logger;
    } else {
      this.logger = backupServiceOrLogger as Logger | undefined;
      const defaultBackupDir = path.join(os.tmpdir(), "localbridge-backups");
      this.backupService = new BackupService(defaultBackupDir, this.logger);
    }
  }

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
    this.logger?.info({ disabled }, "Safety layer status updated in FilesystemService");
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  isUnrestrictedForProject(projectId?: string): boolean {
    if (!this.safetyLayerDisabled) return false;
    return true;
  }

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  private getEffectiveRoot(projectId: string, sessionId?: string): string {
    if (this.workspaceResolver) {
      const resolved = this.workspaceResolver.resolve(projectId, sessionId);
      return resolved.workspaceRoot;
    }
    const project = this.getAuthorizedProject(projectId);
    return project.canonicalRoot;
  }

  onFileChange(listener: (projectId: string, path: string, content?: string) => void): void {
    this.fileChangeListeners.push(listener);
  }

  private notifyFileChange(projectId: string, path: string, content?: string): void {
    for (const listener of this.fileChangeListeners) {
      try {
        listener(projectId, path, content);
      } catch {}
    }
  }

  getBackupService(): BackupService {
    return this.backupService;
  }

  /**
   * Resolve authorized and enabled project by ID.
   */
  private getAuthorizedProject(projectId: string) {
    const project = this.projectRegistry.get(projectId);
    if (!project) {
      if (this.safetyLayerDisabled) {
        let root = process.platform === "win32" ? (process.env.SystemDrive ? `${process.env.SystemDrive}\\` : "C:\\") : "/";
        const match = projectId.match(/^([a-zA-Z])(?::|盘|_drive|-drive)?$/i);
        if (match) {
          root = `${match[1].toUpperCase()}:\\`;
        }
        return {
          id: projectId,
          name: projectId === "drive-c" ? "C盘" : projectId,
          root,
          canonicalRoot: root,
          enabled: true,
          accessMode: "read-write",
          executionMode: "project-code",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is currently disabled`
      );
    }

    return project;
  }

  private assertReadWriteAccess(project: { id: string; accessMode: string }): void {
    if (!this.safetyLayerDisabled && project.accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_READ_ONLY,
        `Project "${project.id}" is in read-only mode`
      );
    }
  }

  /** Validate authorization before consuming a protected-action approval. */
  assertDeleteAuthorized(projectId: string): void {
    const project = this.getAuthorizedProject(projectId);
    this.assertReadWriteAccess(project);
  }

  /**
   * List single-level directory contents (non-recursive).
   */
  async listDirectory(params: DirectoryListParams): Promise<DirectoryListResult> {
    const project = this.getAuthorizedProject(params.projectId);

    this.logger?.debug(
      {
        event: "fs_list_directory",
        projectId: params.projectId,
        path: params.path,
      },
      `Listing directory "${params.path ?? "."}" in project "${params.projectId}"`
    );

    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    return listDirectory({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      limit: params.limit,
      cursor: params.cursor,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
  }

  /**
   * Inspect file or directory metadata.
   */
  async stat(params: FileStatParams): Promise<FileStatResult> {
    const project = this.getAuthorizedProject(params.projectId);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.debug(
      {
        event: "fs_stat",
        projectId: params.projectId,
        path: params.path,
      },
      `Inspecting metadata for "${params.path}" in project "${params.projectId}"`
    );

    return statFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
  }

  /**
   * Read UTF-8 text file lines.
   */
  async readText(params: FileReadParams): Promise<FileReadResult> {
    const project = this.getAuthorizedProject(params.projectId);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.debug(
      {
        event: "fs_read_text",
        projectId: params.projectId,
        path: params.path,
        startLine: params.startLine,
        maxLines: params.maxLines,
      },
      `Reading text lines from "${params.path}" in project "${params.projectId}"`
    );

    return readTextFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      startLine: params.startLine,
      maxLines: params.maxLines,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
  }

  /**
   * Create a new file within project sandbox. Requires read-write access.
   */
  async createFile(params: FileCreateParams): Promise<FileCreateResult> {
    const project = this.getAuthorizedProject(params.projectId);
    this.assertReadWriteAccess(project);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.info(
      {
        event: "fs_create_file",
        projectId: params.projectId,
        path: params.path,
      },
      `Creating file "${params.path}" in project "${params.projectId}"`
    );

    const result = await createFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      content: params.content,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
    this.notifyFileChange(params.projectId, params.path, params.content);
    return result;
  }

  /**
   * Overwrite an existing file with conflict detection and automated backup. Requires read-write access.
   */
  async writeFile(params: FileWriteParams): Promise<FileWriteResult> {
    const project = this.getAuthorizedProject(params.projectId);
    this.assertReadWriteAccess(project);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.info(
      {
        event: "fs_write_file",
        projectId: params.projectId,
        path: params.path,
      },
      `Writing file "${params.path}" in project "${params.projectId}"`
    );

    const result = await writeFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      expectedHash: params.expectedHash,
      content: params.content,
      backupService: this.backupService,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
    this.notifyFileChange(params.projectId, params.path, params.content);
    return result;
  }

  /**
   * Patch an existing file with sequential in-memory search/replace and backup. Requires read-write access.
   */
  async patchFile(params: FilePatchParams): Promise<FilePatchResult> {
    const project = this.getAuthorizedProject(params.projectId);
    this.assertReadWriteAccess(project);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.info(
      {
        event: "fs_patch_file",
        projectId: params.projectId,
        path: params.path,
        replacementsCount: params.replacements.length,
      },
      `Patching file "${params.path}" in project "${params.projectId}"`
    );

    const result = await patchFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      expectedHash: params.expectedHash,
      replacements: params.replacements,
      backupService: this.backupService,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
    this.notifyFileChange(params.projectId, params.path);
    return result;
  }

  /**
   * Delete an existing file with conflict detection and quarantine backup. Requires read-write access.
   */
  async deleteFile(params: FileDeleteParams): Promise<FileDeleteResult> {
    const project = this.getAuthorizedProject(params.projectId);
    this.assertReadWriteAccess(project);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.info(
      {
        event: "fs_delete_file",
        projectId: params.projectId,
        path: params.path,
      },
      `Deleting file "${params.path}" in project "${params.projectId}"`
    );

    const result = await deleteFile({
      projectId: project.id,
      canonicalRoot,
      projectRelativePath: params.path,
      expectedHash: params.expectedHash,
      backupService: this.backupService,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
    this.notifyFileChange(params.projectId, params.path);
    return result;
  }

  /**
   * Restore a file to its previous state prior to an operation. Requires read-write access.
   */
  async restoreFile(params: FileRestoreParams): Promise<FileRestoreResult> {
    const project = this.getAuthorizedProject(params.projectId);
    this.assertReadWriteAccess(project);
    const canonicalRoot = this.getEffectiveRoot(params.projectId, (params as any).sessionId);

    this.logger?.info(
      {
        event: "fs_restore_file",
        projectId: params.projectId,
        operationId: params.operationId,
      },
      `Restoring file for operation "${params.operationId}" in project "${params.projectId}"`
    );

    return restoreFile({
      projectId: project.id,
      canonicalRoot,
      operationId: params.operationId,
      backupService: this.backupService,
      unrestricted: this.isUnrestrictedForProject(params.projectId),
    });
  }

  /**
   * Universal file and directory deletion.
   * Supports force deletion of binaries, recursive directory removal, symlink safety, and device scope.
   */
  async fsDelete(
    params: FsDeleteParams,
    isFullControl = false,
    isDeviceScope = false,
    customStateDir?: string
  ): Promise<FsDeleteResult> {
    let canonicalRoot: string | undefined;
    if (params.projectId) {
      const project = this.getAuthorizedProject(params.projectId);
      if (!isFullControl) {
        this.assertReadWriteAccess(project);
      }
      canonicalRoot = this.getEffectiveRoot(params.projectId, params.sessionId);
    } else if (!isDeviceScope) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        "projectId is required for project-scoped deletion"
      );
    }

    this.logger?.info(
      {
        event: "fs_universal_delete",
        projectId: params.projectId,
        path: params.path,
        recursive: params.recursive,
        force: params.force,
        isFullControl,
        isDeviceScope,
      },
      `Executing universal fs_delete on "${params.path}" (recursive=${params.recursive}, force=${params.force})`
    );

    const result = universalDelete(params, {
      canonicalRoot,
      isDeviceScope,
      isFullControl,
      customStateDir,
      unrestricted: isDeviceScope ? this.safetyLayerDisabled : this.isUnrestrictedForProject(params.projectId),
    });

    if (params.projectId) {
      this.notifyFileChange(params.projectId, params.path);
    }
    return result;
  }

  /**
   * Universal file and directory move / rename.
   */
  async fsMove(
    params: FsMoveParams,
    isFullControl = false,
    isDeviceScope = false,
    customStateDir?: string
  ): Promise<FsMoveResult> {
    let canonicalRoot: string | undefined;
    if (params.projectId) {
      const project = this.getAuthorizedProject(params.projectId);
      if (!isFullControl) {
        this.assertReadWriteAccess(project);
      }
      canonicalRoot = this.getEffectiveRoot(params.projectId, params.sessionId);
    } else if (!isDeviceScope) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        "projectId is required for project-scoped move"
      );
    }

    this.logger?.info(
      {
        event: "fs_universal_move",
        projectId: params.projectId,
        sourcePath: params.sourcePath,
        targetPath: params.targetPath,
        overwrite: params.overwrite,
      },
      `Moving "${params.sourcePath}" to "${params.targetPath}"`
    );

    const result = universalMove(params, {
      canonicalRoot,
      isDeviceScope,
      isFullControl,
      customStateDir,
      unrestricted: isDeviceScope ? this.safetyLayerDisabled : this.isUnrestrictedForProject(params.projectId),
    });

    if (params.projectId) {
      this.notifyFileChange(params.projectId, params.sourcePath);
      this.notifyFileChange(params.projectId, params.targetPath);
    }
    return result;
  }

  /**
   * Universal file and directory copy.
   */
  async fsCopy(
    params: FsCopyParams,
    isFullControl = false,
    isDeviceScope = false,
    customStateDir?: string
  ): Promise<FsCopyResult> {
    let canonicalRoot: string | undefined;
    if (params.projectId) {
      const project = this.getAuthorizedProject(params.projectId);
      if (!isFullControl) {
        this.assertReadWriteAccess(project);
      }
      canonicalRoot = this.getEffectiveRoot(params.projectId, params.sessionId);
    } else if (!isDeviceScope) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        "projectId is required for project-scoped copy"
      );
    }

    this.logger?.info(
      {
        event: "fs_universal_copy",
        projectId: params.projectId,
        sourcePath: params.sourcePath,
        targetPath: params.targetPath,
        recursive: params.recursive,
        overwrite: params.overwrite,
      },
      `Copying "${params.sourcePath}" to "${params.targetPath}"`
    );

    const result = universalCopy(params, {
      canonicalRoot,
      isDeviceScope,
      isFullControl,
      customStateDir,
      unrestricted: isDeviceScope ? this.safetyLayerDisabled : this.isUnrestrictedForProject(params.projectId),
    });

    if (params.projectId) {
      this.notifyFileChange(params.projectId, params.targetPath);
    }
    return result;
  }

  /**
   * Universal directory creation.
   */
  async fsMkdir(
    params: FsMkdirParams,
    isFullControl = false,
    isDeviceScope = false,
    customStateDir?: string
  ): Promise<FsMkdirResult> {
    let canonicalRoot: string | undefined;
    if (params.projectId) {
      const project = this.getAuthorizedProject(params.projectId);
      if (!isFullControl) {
        this.assertReadWriteAccess(project);
      }
      canonicalRoot = this.getEffectiveRoot(params.projectId, params.sessionId);
    } else if (!isDeviceScope) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        "projectId is required for project-scoped mkdir"
      );
    }

    this.logger?.info(
      {
        event: "fs_universal_mkdir",
        projectId: params.projectId,
        path: params.path,
        recursive: params.recursive,
      },
      `Creating directory "${params.path}"`
    );

    const result = universalMkdir(params, {
      canonicalRoot,
      isDeviceScope,
      isFullControl,
      customStateDir,
      unrestricted: isDeviceScope ? this.safetyLayerDisabled : this.isUnrestrictedForProject(params.projectId),
    });

    if (params.projectId) {
      this.notifyFileChange(params.projectId, params.path);
    }
    return result;
  }
}
