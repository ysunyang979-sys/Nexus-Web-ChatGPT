import fs from "node:fs";
import path from "node:path";
import { LocalBridgeErrorCode } from "@localbridge/protocol";
import { SecurityPathError } from "./errors.js";
import { validateWindowsPathSecurity } from "./windows.js";
import { isAbsoluteDenyPath, isProtectedFile } from "./sensitive.js";

/**
 * =========================================================================
 * TOCTOU Security Notice:
 *
 * Path validation results MUST NEVER be cached as permanent authorizations.
 * Every filesystem operation in future phases MUST re-run sandbox validation
 * immediately before opening or modifying files, as symlinks and junctions
 * can be changed concurrently between check and access.
 * =========================================================================
 */

export interface ResolveProjectOptions {
  mustExist?: boolean; // default true
  allowSensitive?: boolean; // default true (protected files governed by TrustPolicyEvaluator)
  rejectProtectedFiles?: boolean; // default false (explicit rejection if requested)
  unrestricted?: boolean; // default false (when true, Command Safety Layer is disabled: allows access to all files and directories across the machine)
}

export interface ResolvedProjectPath {
  absolutePath: string; // normalized target path
  canonicalPath: string; // physical canonical realpath verified inside sandbox
  relativePath: string; // normalized safe relative path to canonical root (forward slashes)
}

/**
 * Strip Windows long-path prefix if returned by realpathSync.native
 */
function canonicalizePath(p: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch {
    resolved = fs.realpathSync(p);
  }
  if (process.platform === "win32" && resolved.startsWith("\\\\?\\")) {
    resolved = resolved.slice(4);
  }
  return path.normalize(resolved);
}

/**
 * Secure containment test that prevents prefix confusion attacks.
 * Uses path.relative() and checks for leading '..' segments and drive alignment.
 */
export function isPathInside(parentCanonical: string, childCanonical: string): boolean {
  const p = process.platform === "win32" ? path.normalize(parentCanonical).toLowerCase() : path.normalize(parentCanonical);
  const c = process.platform === "win32" ? path.normalize(childCanonical).toLowerCase() : path.normalize(childCanonical);

  if (p === c) {
    return true;
  }

  const rel = path.relative(p, c);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "..") {
    return false;
  }

  return true;
}

/**
 * Resolves and validates an untrusted relative project path within an authorized project root.
 * Enforces:
 * - Canonical root validation (must exist, must be directory)
 * - Null byte protection
 * - Windows device namespace and UNC path rejection
 * - Drive-relative and absolute path rejection
 * - NTFS Alternate Data Stream colon rejection
 * - Windows reserved names and trailing dot/space rejection
 * - Lexical traversal rejection (../, ..\, mixed)
 * - Prefix confusion rejection
 * - Symlink and Windows junction escape rejection via physical canonicalization
 * - Non-existing target nearest-ancestor containment verification
 * - Sensitive file policy enforcement
 */
export function resolveProjectPath(
  canonicalProjectRoot: string,
  relativePath: string,
  options?: ResolveProjectOptions
): ResolvedProjectPath {
  const mustExist = options?.mustExist ?? true;
  const allowSensitive = options?.allowSensitive ?? true;
  const rejectProtectedFiles = options?.rejectProtectedFiles ?? false;
  const unrestricted = options?.unrestricted ?? false;

  // Unrestricted mode: Command Safety Layer is disabled, allowing unrestricted filesystem access
  if (unrestricted) {
    if (typeof relativePath !== "string") {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_NOT_ALLOWED,
        "Target path must be a string"
      );
    }

    validateWindowsPathSecurity(relativePath, { unrestricted: true });

    const realRoot =
      canonicalProjectRoot && fs.existsSync(canonicalProjectRoot)
        ? canonicalizePath(canonicalProjectRoot)
        : process.cwd();

    const hasDriveOrIsUnc =
      process.platform === "win32"
        ? /^[a-zA-Z]:([\\/]|$)/.test(relativePath) || relativePath.startsWith("\\\\") || relativePath.startsWith("//")
        : path.isAbsolute(relativePath);

    const absoluteTarget = hasDriveOrIsUnc
      ? path.resolve(relativePath)
      : path.resolve(realRoot, relativePath);

    if (fs.existsSync(absoluteTarget)) {
      const canonicalTarget = canonicalizePath(absoluteTarget);
      let safeRel: string;
      try {
        safeRel = path.relative(realRoot, canonicalTarget).replace(/\\/g, "/");
      } catch {
        safeRel = canonicalTarget.replace(/\\/g, "/");
      }
      return {
        absolutePath: absoluteTarget,
        canonicalPath: canonicalTarget,
        relativePath: safeRel || ".",
      };
    }

    if (mustExist) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.FILE_NOT_FOUND,
        `Target file or directory does not exist: "${relativePath}"`
      );
    }

    let curr = absoluteTarget;
    const missingSegments: string[] = [];
    while (!fs.existsSync(curr)) {
      const parent = path.dirname(curr);
      if (parent === curr) break;
      missingSegments.unshift(path.basename(curr));
      curr = parent;
    }

    if (!fs.existsSync(curr)) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.FILE_NOT_FOUND,
        `No existing ancestor directory found for "${relativePath}"`
      );
    }

    const canonicalParent = canonicalizePath(curr);
    const canonicalTarget = path.join(canonicalParent, ...missingSegments);
    let safeRel: string;
    try {
      safeRel = path.relative(realRoot, canonicalTarget).replace(/\\/g, "/");
    } catch {
      safeRel = canonicalTarget.replace(/\\/g, "/");
    }

    return {
      absolutePath: absoluteTarget,
      canonicalPath: canonicalTarget,
      relativePath: safeRel || ".",
    };
  }

  // 1. Validate canonical project root
  if (!canonicalProjectRoot || typeof canonicalProjectRoot !== "string") {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
      "Canonical project root must be a non-empty string"
    );
  }

  if (!fs.existsSync(canonicalProjectRoot)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
      `Authorized project root does not exist on disk: ${canonicalProjectRoot}`
    );
  }

  const rootStat = fs.statSync(canonicalProjectRoot);
  if (!rootStat.isDirectory()) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY,
      `Authorized project root is not a directory: ${canonicalProjectRoot}`
    );
  }

  const realRoot = canonicalizePath(canonicalProjectRoot);

  // 2. Validate input relativePath string
  if (typeof relativePath !== "string") {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_NOT_ALLOWED,
      "Relative path must be a string"
    );
  }

  // Windows & cross-platform lexical security validation
  validateWindowsPathSecurity(relativePath);

  // Check lexical traversal attempts
  const normalizedRel = path.normalize(relativePath);
  if (
    normalizedRel === ".." ||
    normalizedRel.startsWith(`..${path.sep}`) ||
    normalizedRel.startsWith("../") ||
    normalizedRel.startsWith("..\\") ||
    normalizedRel.split(/[\\/]/).includes("..")
  ) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Path traversal rejected: "${relativePath}"`
    );
  }

  // 3. Resolve absolute target path
  const absoluteTarget = path.resolve(realRoot, relativePath);

  // 4. Prefix confusion & lexical containment check
  if (!isPathInside(realRoot, absoluteTarget)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_TRAVERSAL,
      `Target path "${relativePath}" lexically escapes project root`
    );
  }

  // 5. Canonical resolution and physical containment check
  if (fs.existsSync(absoluteTarget)) {
    const canonicalTarget = canonicalizePath(absoluteTarget);

    if (!isPathInside(realRoot, canonicalTarget)) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE,
        `Path "${relativePath}" resolves outside authorized project root via symlink or junction`
      );
    }

    const safeRel = path.relative(realRoot, canonicalTarget).replace(/\\/g, "/");

    // 1. Absolute security boundary: always denied, regardless of trust policy or approval
    if (isAbsoluteDenyPath(safeRel)) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_NOT_ALLOWED,
        `Access to absolute protected path "${safeRel}" is denied by security boundary`
      );
    }

    // 2. Protected files: governed by TrustPolicyEvaluator. Only rejected here if explicitly requested or allowSensitive is false
    if ((rejectProtectedFiles || !allowSensitive) && isProtectedFile(safeRel)) {
      throw new SecurityPathError(
        LocalBridgeErrorCode.PATH_NOT_ALLOWED,
        `Access to sensitive file "${safeRel}" denied by policy`
      );
    }

    return {
      absolutePath: absoluteTarget,
      canonicalPath: canonicalTarget,
      relativePath: safeRel,
    };
  }

  // Target does not exist on disk
  if (mustExist) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.FILE_NOT_FOUND,
      `Target file or directory does not exist: "${relativePath}"`
    );
  }

  // Non-existing target: walk up to find nearest existing ancestor
  let curr = absoluteTarget;
  const missingSegments: string[] = [];
  while (!fs.existsSync(curr)) {
    const parent = path.dirname(curr);
    if (parent === curr) break;
    missingSegments.unshift(path.basename(curr));
    curr = parent;
  }

  if (!fs.existsSync(curr)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.FILE_NOT_FOUND,
      `No existing ancestor directory found for "${relativePath}"`
    );
  }

  const canonicalParent = canonicalizePath(curr);
  if (!isPathInside(realRoot, canonicalParent)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE,
      `Ancestor directory of "${relativePath}" resolves outside authorized project root via symlink or junction`
    );
  }

  const canonicalTarget = path.join(canonicalParent, ...missingSegments);
  if (!isPathInside(realRoot, canonicalTarget)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_SYMLINK_ESCAPE,
      `Target path "${relativePath}" escapes authorized project root`
    );
  }

  const safeRel = path.relative(realRoot, canonicalTarget).replace(/\\/g, "/");

  // 1. Absolute security boundary: always denied, regardless of trust policy or approval
  if (isAbsoluteDenyPath(safeRel)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_NOT_ALLOWED,
      `Access to absolute protected path "${safeRel}" is denied by security boundary`
    );
  }

  // 2. Protected files: governed by TrustPolicyEvaluator. Only rejected here if explicitly requested or allowSensitive is false
  if ((rejectProtectedFiles || !allowSensitive) && isProtectedFile(safeRel)) {
    throw new SecurityPathError(
      LocalBridgeErrorCode.PATH_NOT_ALLOWED,
      `Access to sensitive file "${safeRel}" denied by policy`
    );
  }

  return {
    absolutePath: absoluteTarget,
    canonicalPath: canonicalTarget,
    relativePath: safeRel,
  };
}
