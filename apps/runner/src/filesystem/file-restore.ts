import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FileRestoreResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import type { BackupService } from "../backup/service.js";
import { atomicWriteFile } from "./atomic-write.js";
import { computeSha256 } from "./hash.js";

export interface RestoreFileParams {
  projectId: string;
  canonicalRoot: string;
  operationId: string;
  backupService: BackupService;
  unrestricted?: boolean;
}

/**
 * Safely restore a file to its previous state prior to a write, patch, or delete operation.
 * Rejects if backup not found or if the file was modified concurrently (RESTORE_CONFLICT).
 */
export function restoreFile(params: RestoreFileParams): FileRestoreResult {
  const { projectId, canonicalRoot, operationId, backupService, unrestricted = false } = params;

  // 1. Retrieve backup
  const { metadata, content } = backupService.getBackup(projectId, operationId);

  // 2. Resolve sandbox target path
  const resolved = resolveProjectPath(canonicalRoot, metadata.relativePath, {
    mustExist: false,
    allowSensitive: true,
    unrestricted,
  });

  // 3. Verify target state and conflict detection
  if (metadata.operation === "write" || metadata.operation === "patch") {
    if (!fs.existsSync(resolved.absolutePath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RESTORE_CONFLICT,
        `Cannot restore "${metadata.relativePath}": file no longer exists`
      );
    }

    const lstat = fs.lstatSync(resolved.absolutePath);
    if (lstat.isSymbolicLink()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_SYMLINK_WRITE_BLOCKED,
        `Cannot restore: target "${metadata.relativePath}" is a symbolic link`
      );
    }

    const currentContent = fs.readFileSync(resolved.absolutePath);
    const currentHash = computeSha256(currentContent);

    if (currentHash !== metadata.newHash) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RESTORE_CONFLICT,
        `Cannot restore "${metadata.relativePath}": file content has changed since operation "${operationId}"`
      );
    }
  } else if (metadata.operation === "delete") {
    if (fs.existsSync(resolved.absolutePath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RESTORE_CONFLICT,
        `Cannot restore deleted file "${metadata.relativePath}": a file already exists at this path`
      );
    }

    const parentDir = path.dirname(resolved.absolutePath);
    if (!fs.existsSync(parentDir)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PARENT_DIRECTORY_NOT_FOUND,
        `Cannot restore deleted file "${metadata.relativePath}": parent directory does not exist`
      );
    }
  }

  // 4. Atomically restore file content
  atomicWriteFile(resolved.absolutePath, content, { mode: metadata.mode });

  return {
    operationId,
    projectId,
    path: metadata.relativePath,
    restoredHash: metadata.oldHash,
    bytesRestored: content.length,
  };
}
