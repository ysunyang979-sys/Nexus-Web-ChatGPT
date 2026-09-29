import fs from "node:fs";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FilePatchResult,
  type PatchReplacement,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import type { BackupService } from "../backup/service.js";
import { atomicWriteFile } from "./atomic-write.js";
import { computeSha256 } from "./hash.js";
import { applyPatches } from "./patch.js";

const MAX_WRITEABLE_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB

export interface PatchFileParams {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  expectedHash: string;
  replacements: PatchReplacement[];
  backupService: BackupService;
  unrestricted?: boolean;
}

/**
 * Safely patch an existing file with sequential in-memory search/replace, conflict detection, and backup.
 */
export function patchFile(params: PatchFileParams): FilePatchResult {
  const {
    projectId,
    canonicalRoot,
    projectRelativePath,
    expectedHash,
    replacements,
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
      `Patching symbolic links is blocked for "${resolved.relativePath}"`
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

  if (oldContent.includes(0x00)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.BINARY_FILE,
      "Cannot patch binary file (contains NUL bytes)"
    );
  }

  const oldHash = computeSha256(oldContent);
  if (expectedHash !== oldHash) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_CONFLICT,
      `Conflict detected on "${resolved.relativePath}": actual hash is "${oldHash}", but expected "${expectedHash}"`
    );
  }

  // 4. Decode text
  let oldText: string;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    oldText = decoder.decode(oldContent);
  } catch {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_ENCODING_UNSUPPORTED,
      "File contains invalid UTF-8 sequences"
    );
  }

  // 5. Apply patches sequentially in-memory
  const { updatedText, replacementsApplied } = applyPatches(
    oldText,
    replacements
  );

  if (updatedText.includes("\0")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.BINARY_FILE,
      "Patch produced binary content (NUL bytes)"
    );
  }

  const newBuffer = Buffer.from(updatedText, "utf-8");
  if (newBuffer.length > MAX_WRITEABLE_FILE_SIZE) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_TOO_LARGE,
      `Patched content size (${newBuffer.length} bytes) exceeds 8 MiB limit`
    );
  }

  const newHash = computeSha256(newBuffer);
  const operationId = backupService.generateOperationId();

  // 6. Create backup before write
  backupService.createBackup({
    operationId,
    projectId,
    relativePath: resolved.relativePath,
    operation: "patch",
    oldContent,
    oldHash,
    newHash,
    mode: lstat.mode,
  });

  // 7. Atomic write
  atomicWriteFile(resolved.absolutePath, newBuffer, { mode: lstat.mode });

  return {
    operationId,
    projectId,
    path: resolved.relativePath,
    oldHash,
    newHash,
    bytesBefore: oldContent.length,
    bytesAfter: newBuffer.length,
    replacementsApplied,
  };
}
