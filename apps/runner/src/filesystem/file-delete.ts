import fs from "node:fs";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FileDeleteResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import type { BackupService } from "../backup/service.js";
import { computeSha256 } from "./hash.js";

export interface DeleteFileParams {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  expectedHash: string;
  backupService: BackupService;
  unrestricted?: boolean;
}

/**
 * Safely delete an existing file with conflict detection and automated quarantine backup.
 */
export function deleteFile(params: DeleteFileParams): FileDeleteResult {
  const {
    projectId,
    canonicalRoot,
    projectRelativePath,
    expectedHash,
    backupService,
    unrestricted = false,
  } = params;

  // 1. Resolve sandbox path (must exist)
  const resolved = resolveProjectPath(canonicalRoot, projectRelativePath, {
    mustExist: true,
    allowSensitive: true,
    unrestricted,
  });

  // 2. Validate file type and block symlinks
  const lstat = fs.lstatSync(resolved.absolutePath);
  if (lstat.isSymbolicLink()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_SYMLINK_WRITE_BLOCKED,
      `Deleting symbolic links is blocked for "${resolved.relativePath}"`
    );
  }

  if (!lstat.isFile()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_NOT_REGULAR,
      `Target "${resolved.relativePath}" is not a regular file`
    );
  }

  // 3. Read old content and verify expectedHash
  const oldContent = fs.readFileSync(resolved.absolutePath);
  const oldHash = computeSha256(oldContent);

  if (expectedHash !== oldHash) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_CONFLICT,
      `Conflict detected on "${resolved.relativePath}": actual hash is "${oldHash}", but expected "${expectedHash}"`
    );
  }

  // 4. Create quarantine backup before unlinking
  const operationId = backupService.generateOperationId();
  backupService.createBackup({
    operationId,
    projectId,
    relativePath: resolved.relativePath,
    operation: "delete",
    oldContent,
    oldHash,
    newHash: null,
    mode: lstat.mode,
  });

  // 5. Unlink
  try {
    fs.unlinkSync(resolved.absolutePath);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_BUSY,
        `Cannot delete file: file is currently locked or access was denied: ${error.code}`
      );
    }
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_DELETE_FAILED,
      `Failed to delete file: ${error.message || String(err)}`
    );
  }

  return {
    operationId,
    projectId,
    path: resolved.relativePath,
    oldHash,
    deleted: true,
    backupCreated: true,
  };
}
