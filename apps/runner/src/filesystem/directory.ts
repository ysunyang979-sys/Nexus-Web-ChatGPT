import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type DirectoryEntry,
  type DirectoryListResult,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { sanitizeFsError } from "./errors.js";

export interface ListDirectoryOptions {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath?: string;
  limit?: number;
  cursor?: string | null;
  unrestricted?: boolean;
}

/**
 * Lists the contents of a directory (strictly non-recursive, single level).
 * Completely omits sensitive entries and tracks sensitiveEntriesFiltered flag.
 * Inspects symlink accessibility without leaking real physical targets.
 */
export function listDirectory(options: ListDirectoryOptions): DirectoryListResult {
  const {
    projectId,
    canonicalRoot,
    projectRelativePath = ".",
    limit = 100,
    cursor,
    unrestricted = false,
  } = options;

  const normalizedInput = projectRelativePath === "" ? "." : projectRelativePath;

  // 1. Sensitive directory path check
  if (!unrestricted && isSensitiveFile(normalizedInput)) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
      "Access to sensitive credential path is blocked"
    );
  }

  // 2. Resolve directory in sandbox
  const resolved = resolveProjectPath(canonicalRoot, normalizedInput, {
    mustExist: true,
    unrestricted,
  });

  // 3. Must be a directory
  let dirStat: fs.Stats;
  try {
    dirStat = fs.statSync(resolved.canonicalPath);
  } catch (err) {
    sanitizeFsError(err, "Failed to inspect directory target");
  }

  if (!dirStat.isDirectory()) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.NOT_A_DIRECTORY,
      "Target path is not a directory"
    );
  }

  // 4. Read directory entries
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(resolved.canonicalPath, { withFileTypes: true });
  } catch (err) {
    sanitizeFsError(err, "Failed to read directory contents");
  }

  let sensitiveEntriesFiltered = false;
  const entries: DirectoryEntry[] = [];

  const baseRel =
    resolved.relativePath === "." || resolved.relativePath === ""
      ? ""
      : resolved.relativePath;

  for (const dirent of dirents) {
    const entryRelative = baseRel ? `${baseRel}/${dirent.name}` : dirent.name;

    // Check sensitive file policy: omit sensitive entries entirely from results
    if (!unrestricted && isSensitiveFile(entryRelative)) {
      sensitiveEntriesFiltered = true;
      continue;
    }

    const entryPhysicalPath = path.join(resolved.canonicalPath, dirent.name);

    if (dirent.isDirectory()) {
      let modifiedAt: number | undefined;
      try {
        const s = fs.statSync(entryPhysicalPath);
        modifiedAt = Math.floor(s.mtimeMs);
      } catch {
        // Ignore stat errors for deleted entries
      }
      entries.push({
        name: dirent.name,
        type: "directory",
        modifiedAt,
      });
    } else if (dirent.isFile()) {
      let size: number | undefined;
      let modifiedAt: number | undefined;
      try {
        const s = fs.statSync(entryPhysicalPath);
        size = s.size;
        modifiedAt = Math.floor(s.mtimeMs);
      } catch {
        // Ignore stat errors
      }
      entries.push({
        name: dirent.name,
        type: "file",
        size,
        modifiedAt,
      });
    } else if (dirent.isSymbolicLink()) {
      let accessible = false;
      try {
        resolveProjectPath(canonicalRoot, entryRelative, { mustExist: true, unrestricted });
        accessible = true;
      } catch {
        accessible = false;
      }
      entries.push({
        name: dirent.name,
        type: "symlink",
        accessible,
      });
    }
  }

  // 5. Deterministic sorting across all entries by normalized name
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true })
  );

  // 6. Pagination with opaque base64url cursor
  const offset = decodeCursor(cursor);
  const clampedLimit = Math.max(1, Math.min(limit, 200));
  const pageEntries = entries.slice(offset, offset + clampedLimit);

  const nextCursor =
    offset + clampedLimit < entries.length
      ? encodeCursor(offset + clampedLimit)
      : null;

  return {
    projectId,
    path: resolved.relativePath || ".",
    entries: pageEntries,
    nextCursor,
    sensitiveEntriesFiltered,
  };
}
