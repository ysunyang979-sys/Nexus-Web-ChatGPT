import fs from "node:fs";
import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FileReadResult,
  type FileLine,
} from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import { probeBinaryAndEncoding } from "./binary.js";
import { sanitizeFsError } from "./errors.js";

export const MAX_READ_LINES = 500;
export const DEFAULT_READ_LINES = 300;
export const MAX_READ_CONTENT_BYTES = 131072; // 128 KiB
export const MAX_READABLE_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB
export const MAX_LINE_BYTES = 131072; // 128 KiB

export interface ReadTextFileOptions {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  startLine?: number;
  maxLines?: number;
  unrestricted?: boolean;
}

/**
 * Reads a slice of lines from a UTF-8 text file.
 * Opens strictly in read-only mode ("r"), verifies regular file status via fstat,
 * probes for binary/non-UTF-8 content, strips UTF-8 BOM, and enforces strict window limits.
 */
export function readTextFile(options: ReadTextFileOptions): FileReadResult {
  const {
    projectId,
    canonicalRoot,
    projectRelativePath,
    startLine = 1,
    maxLines = DEFAULT_READ_LINES,
    unrestricted = false,
  } = options;

  // 1. Validate input line parameters
  const requestedStart = Math.max(1, startLine);
  const requestedMaxLines = Math.max(1, Math.min(maxLines, MAX_READ_LINES));

  // 2. Resolve target in sandbox
  const resolved = resolveProjectPath(canonicalRoot, projectRelativePath, {
    mustExist: true,
    allowSensitive: true,
    unrestricted,
  });

  // 4. Open file strictly with "r" mode
  let fd: number;
  try {
    fd = fs.openSync(resolved.canonicalPath, "r");
  } catch (err) {
    sanitizeFsError(err, "Failed to open target file");
  }

  try {
    // 5. fstat validation on open file descriptor
    const stat = fs.fstatSync(fd);

    if (!stat.isFile()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_NOT_REGULAR,
        "Target path is not a regular file"
      );
    }

    if (stat.size > MAX_READABLE_FILE_SIZE) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_TOO_LARGE,
        `File size (${stat.size} bytes) exceeds maximum readable limit of 8 MiB`
      );
    }

    // Handle empty file
    if (stat.size === 0) {
      return {
        projectId,
        path: resolved.relativePath,
        encoding: "utf-8",
        contentHash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        startLine: requestedStart,
        endLine: 0,
        nextLine: null,
        truncated: false,
        lines: [],
      };
    }

    // 6. Binary probe & strict UTF-8 decodability check
    probeBinaryAndEncoding(fd, stat.size);

    // 7. Read full file content
    const buffer = Buffer.alloc(stat.size);
    fs.readSync(fd, buffer, 0, stat.size, 0);

    // Strengthened binary detection on full buffer
    if (buffer.includes(0x00)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BINARY_FILE,
        "Binary files are not supported"
      );
    }

    const contentHash = `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;

    let text: string;
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(buffer);
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_ENCODING_UNSUPPORTED,
        "File contains invalid UTF-8 sequences"
      );
    }

    // 8. Handle UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    // 9. Split lines and process window
    const allLines = text.split(/\r?\n/);
    const totalLines = allLines.length;
    const startIndex = requestedStart - 1;

    if (startIndex >= totalLines) {
      return {
        projectId,
        path: resolved.relativePath,
        encoding: "utf-8",
        contentHash,
        startLine: requestedStart,
        endLine: totalLines,
        nextLine: null,
        truncated: false,
        lines: [],
      };
    }

    const lines: FileLine[] = [];
    let cumulativeBytes = 0;
    let truncated = false;
    let nextLine: number | null = null;

    for (let i = startIndex; i < totalLines && lines.length < requestedMaxLines; i++) {
      const lineText = allLines[i]!;
      const lineBytes = Buffer.byteLength(lineText, "utf-8");

      // Single line limit check (128 KiB)
      if (lineBytes > MAX_LINE_BYTES) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_LINE_TOO_LONG,
          `Line ${i + 1} exceeds maximum allowable line size of 128 KiB`
        );
      }

      // Check cumulative content byte limit (128 KiB)
      if (cumulativeBytes + lineBytes > MAX_READ_CONTENT_BYTES && lines.length > 0) {
        truncated = true;
        nextLine = i + 1;
        break;
      }

      lines.push({
        line: i + 1,
        text: lineText,
      });
      cumulativeBytes += lineBytes;
    }

    const endLine = lines.length > 0 ? lines[lines.length - 1]!.line : requestedStart - 1;

    if (!truncated) {
      const lastProcessedIndex = startIndex + lines.length;
      nextLine = lastProcessedIndex < totalLines ? lastProcessedIndex + 1 : null;
    }

    return {
      projectId,
      path: resolved.relativePath,
      encoding: "utf-8",
      contentHash,
      startLine: requestedStart,
      endLine,
      nextLine,
      truncated,
      lines,
    };
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // Ignore close error
    }
  }
}
