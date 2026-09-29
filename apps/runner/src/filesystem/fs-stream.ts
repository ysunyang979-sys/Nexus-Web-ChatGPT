import fs from "node:fs";
import crypto from "node:crypto";
import type {
  FileReadStreamParams,
  FileReadStreamResult,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";

export interface StreamReadOptions {
  canonicalRoot: string;
  unrestricted?: boolean;
}

export function readFileStreamChunk(
  params: FileReadStreamParams,
  options: StreamReadOptions
): FileReadStreamResult {
  const { canonicalRoot, unrestricted = false } = options;

  const resolved = resolveProjectPath(canonicalRoot, params.path, {
    mustExist: true,
    unrestricted,
  });

  const stats = fs.statSync(resolved.canonicalPath);
  const totalSizeBytes = stats.size;
  const offsetBytes = Math.min(params.offsetBytes, totalSizeBytes);
  const maxBytes = Math.min(params.maxBytes || 1048576, totalSizeBytes - offsetBytes);

  const fd = fs.openSync(resolved.canonicalPath, "r");
  const buffer = Buffer.alloc(maxBytes);
  const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, offsetBytes);
  fs.closeSync(fd);

  const slice = buffer.subarray(0, bytesRead);
  const content = slice.toString("utf-8");
  const isLastChunk = offsetBytes + bytesRead >= totalSizeBytes;
  const sha256 = crypto.createHash("sha256").update(slice).digest("hex");

  return {
    projectId: params.projectId,
    path: resolved.relativePath,
    offsetBytes,
    bytesRead,
    totalSizeBytes,
    content,
    isLastChunk,
    sha256,
  };
}
