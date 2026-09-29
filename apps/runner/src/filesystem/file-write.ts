import fs from "node:fs";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FileWriteResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import type { BackupService } from "../backup/service.js";
import { atomicWriteFile } from "./atomic-write.js";
import { computeSha256 } from "./hash.js";

const MAX_WRITEABLE_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB

export interface WriteFileParams {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  expectedHash: string;
  content: string;
  backupService: BackupService;
  unrestricted?: boolean;
}

/**
 * Safely overwrite an existing file with conflict detection and automated backup.
 * Rejects if file does not exist, is a symlink, or hash mismatches expectedHash.
 */
export function writeFile(params: WriteFileParams): FileWriteResult {
  const {
    projectId,
    canonicalRoot,
    projectRelativePath,
    expectedHash,
    content,
    backupService,
    unrestricted = false,
  } = params;

  // 1. Resolve sandbox path (target must exist)
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
      `Modifying symbolic links is blocked for "${resolved.relativePath}"`
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

  // 4. Validate new content
  if (content.includes("\0")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.BINARY_FILE,
      "Binary content (NUL bytes) is not supported for file writing"
    );
  }

  const newBuffer = Buffer.from(content, "utf-8");
  if (newBuffer.length > MAX_WRITEABLE_FILE_SIZE) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_TOO_LARGE,
      `Content size (${newBuffer.length} bytes) exceeds 8 MiB limit`
    );
  }

  const newHash = computeSha256(newBuffer);
  const operationId = backupService.generateOperationId();

  // 5. Create backup before write
  backupService.createBackup({
    operationId,
    projectId,
    relativePath: resolved.relativePath,
    operation: "write",
    oldContent,
    oldHash,
    newHash,
    mode: lstat.mode,
  });

  // 6. Atomic replacement
  atomicWriteFile(resolved.absolutePath, newBuffer, { mode: lstat.mode });

  return {
    operationId,
    projectId,
    path: resolved.relativePath,
    oldHash,
    newHash,
    bytesBefore: oldContent.length,
    bytesAfter: newBuffer.length,
    backupCreated: true,
  };
}
