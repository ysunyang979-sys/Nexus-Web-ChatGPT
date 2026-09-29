import fs from "node:fs";
import path from "node:path";
import type { FileStatResult } from "@localbridge/protocol";
import { resolveProjectPath } from "@localbridge/security";
import { sanitizeFsError } from "./errors.js";

export interface StatFileOptions {
  projectId: string;
  canonicalRoot: string;
  projectRelativePath: string;
  unrestricted?: boolean;
}

/**
 * Inspect metadata of a file, directory, or symlink within the sandbox.
 * Rejects sensitive files and escaping symlinks with zero physical path leakage.
 */
export function statFile(options: StatFileOptions): FileStatResult {
  const { projectId, canonicalRoot, projectRelativePath, unrestricted = false } = options;

  // 1. Resolve target in sandbox (enforcing canonical containment and symlink escape checks)
  const resolved = resolveProjectPath(canonicalRoot, projectRelativePath, {
    mustExist: true,
    allowSensitive: true,
    unrestricted,
  });

  // 2. Inspect target stats
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved.canonicalPath);
  } catch (err) {
    sanitizeFsError(err, "Failed to stat target path");
  }

  const normalizedRelativePath = path.posix.normalize(
    projectRelativePath.replace(/\\/g, "/")
  );

  const name =
    normalizedRelativePath === "." || normalizedRelativePath === ""
      ? path.basename(canonicalRoot)
      : path.posix.basename(normalizedRelativePath);

  if (stat.isDirectory()) {
    return {
      projectId,
      path: normalizedRelativePath,
      name,
      type: "directory",
      modifiedAt: Math.floor(stat.mtimeMs),
    };
  }

  return {
    projectId,
    path: normalizedRelativePath,
    name,
    type: "file",
    size: stat.size,
    modifiedAt: Math.floor(stat.mtimeMs),
  };
}
