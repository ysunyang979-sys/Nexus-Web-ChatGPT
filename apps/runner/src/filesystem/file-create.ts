import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FileCreateResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import { atomicWriteFile } from "./atomic-write.js";
import { computeSha256 } from "./hash.js";

const MAX_WRITEABLE_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB

export interface CreateFileParams {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  content: string;
  unrestricted?: boolean;
}

/**
 * Safely create a new file within the authorized project sandbox.
 * Rejects if file already exists or direct parent directory does not exist.
 */
export function createFile(params: CreateFileParams): FileCreateResult {
  const { projectId, canonicalRoot, projectRelativePath, content, unrestricted = false } = params;

  // 1. Resolve sandbox path without requiring target to exist
  const resolved = resolveProjectPath(canonicalRoot, projectRelativePath, {
    mustExist: false,
    allowSensitive: true,
    unrestricted,
  });

  // 2. Direct parent directory check (no implicit mkdir -p)
  const parentDir = path.dirname(resolved.absolutePath);
  if (!fs.existsSync(parentDir)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.PARENT_DIRECTORY_NOT_FOUND,
      `Parent directory does not exist for "${resolved.relativePath}"`
    );
  }

  const parentStat = fs.statSync(parentDir);
  if (!parentStat.isDirectory()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.NOT_A_DIRECTORY,
      `Parent path for "${resolved.relativePath}" is not a directory`
    );
  }

  // 3. Target file must not exist (check lstat to catch broken symlinks as well)
  try {
    const existingStat = fs.lstatSync(resolved.absolutePath);
    if (existingStat.isSymbolicLink()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_SYMLINK_WRITE_BLOCKED,
        `Cannot create file: a symbolic link already exists at "${resolved.relativePath}"`
      );
    }
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_ALREADY_EXISTS,
      `File already exists at "${resolved.relativePath}"`
    );
  } catch (err) {
    if (err instanceof LocalBridgeError) throw err;
    // ENOENT is expected - file must not exist
  }

  // 4. Validate content
  if (content.includes("\0")) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.BINARY_FILE,
      "Binary content (NUL bytes) is not supported for file creation"
    );
  }

  const buffer = Buffer.from(content, "utf-8");
  if (buffer.length > MAX_WRITEABLE_FILE_SIZE) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_TOO_LARGE,
      `Content size (${buffer.length} bytes) exceeds 8 MiB limit`
    );
  }

  // 5. Atomic write
  atomicWriteFile(resolved.absolutePath, buffer, { mode: 0o644 });

  const newHash = computeSha256(buffer);
  const operationId = `op_${crypto.randomUUID()}`;

  return {
    operationId,
    projectId,
    path: resolved.relativePath,
    newHash,
    bytes: buffer.length,
  };
}
