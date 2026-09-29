import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type FsDeleteParams,
  type FsDeleteResult,
  type FsMoveParams,
  type FsMoveResult,
  type FsCopyParams,
  type FsCopyResult,
  type FsMkdirParams,
  type FsMkdirResult,
} from "@localbridge/protocol";
import {
  resolveProjectPath,
  assertSurvivalBoundarySafe,
  isPathInside,
} from "@localbridge/security";
import { computeSha256 } from "./hash.js";

export interface UniversalFsContext {
  canonicalRoot?: string;
  isDeviceScope?: boolean;
  isFullControl?: boolean;
  customStateDir?: string;
  unrestricted?: boolean;
}

/**
 * Resolves a path for universal filesystem operations.
 * - Under project scope: enforces sandbox resolution inside canonicalRoot.
 * - Under device scope (Full Control) or unrestricted: allows absolute paths while enforcing survival boundary.
 */
function resolveUniversalPath(
  targetPath: string,
  context: UniversalFsContext,
  mustExist = true
): string {
  let resolvedAbsolute: string;

  if (context.isDeviceScope || context.unrestricted) {
    if (path.isAbsolute(targetPath)) {
      resolvedAbsolute = path.resolve(targetPath);
    } else if (context.canonicalRoot) {
      resolvedAbsolute = path.resolve(context.canonicalRoot, targetPath);
    } else {
      resolvedAbsolute = path.resolve(targetPath);
    }
  } else {
    if (!context.canonicalRoot) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        "Project canonical root is required for project-scoped filesystem operations"
      );
    }

    const lexicalTarget = path.resolve(context.canonicalRoot, targetPath);
    if (!isPathInside(context.canonicalRoot, lexicalTarget)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PATH_TRAVERSAL,
        `Target path "${targetPath}" escapes project root`
      );
    }

    let isDirectSymlink = false;
    try {
      const st = fs.lstatSync(lexicalTarget);
      if (st.isSymbolicLink()) {
        isDirectSymlink = true;
      }
    } catch {}

    if (isDirectSymlink) {
      resolvedAbsolute = lexicalTarget;
    } else {
      const resolved = resolveProjectPath(context.canonicalRoot, targetPath, {
        mustExist,
        allowSensitive: true,
      });
      resolvedAbsolute = resolved.absolutePath;
    }
  }

  // Nexus Survival Boundary is strictly enforced in all scopes
  assertSurvivalBoundarySafe(resolvedAbsolute, context.customStateDir);

  if (mustExist && !fs.existsSync(resolvedAbsolute)) {
    // Check if broken symlink exists
    try {
      fs.lstatSync(resolvedAbsolute);
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PATH_TRAVERSAL,
        `Target path does not exist: "${targetPath}"`
      );
    }
  }

  return resolvedAbsolute;
}

/**
 * Universal File & Directory Deletion.
 * Supports:
 * - Single file deletion (text or binary like PNG, DAT, MP4).
 * - Bypass expectedHash when force === true or Full Control is active.
 * - Recursive directory deletion (e.g. hexo-blog, node_modules).
 * - Symlink and junction no-follow safety: unlinks only the link itself, never external targets.
 * - Graceful error accumulation for locked or inaccessible files (EBUSY / EPERM).
 */
export function universalDelete(
  params: FsDeleteParams,
  context: UniversalFsContext
): FsDeleteResult {
  const isForce = Boolean(params.force || context.isFullControl);
  const targetPath = resolveUniversalPath(params.path, context, true);

  const affectedPaths: string[] = [];
  const failed: Array<{ path: string; reason: string }> = [];
  let filesAffected = 0;
  let directoriesAffected = 0;
  let bytesAffected = 0;

  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(targetPath);
  } catch (err: any) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_DELETE_FAILED,
      `Cannot inspect target "${params.path}": ${err.message}`
    );
  }

  // 1. Target is a symbolic link or junction -> delete link only, never follow!
  if (lstat.isSymbolicLink()) {
    try {
      try {
        fs.unlinkSync(targetPath);
      } catch {
        fs.rmdirSync(targetPath);
      }
      affectedPaths.push(targetPath);
      filesAffected++;
      return {
        success: true,
        affectedPaths,
        filesAffected,
        directoriesAffected,
        bytesAffected: 0,
      };
    } catch (err: any) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_DELETE_FAILED,
        `Failed to delete symlink "${params.path}": ${err.message}`
      );
    }
  }

  // 2. Target is a regular file
  if (!lstat.isDirectory()) {
    if (params.expectedHash) {
      const content = fs.readFileSync(targetPath);
      const actualHash = computeSha256(content);
      if (params.expectedHash !== actualHash) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_CONFLICT,
          `Conflict detected on "${params.path}": actual hash is "${actualHash}", but expected "${params.expectedHash}"`
        );
      }
    } else if (!isForce) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        `Deleting file "${params.path}" requires expectedHash unless force=true or Full Control is enabled`
      );
    }

    try {
      try {
        fs.chmodSync(targetPath, 0o666);
      } catch {}
      fs.unlinkSync(targetPath);
      affectedPaths.push(targetPath);
      filesAffected = 1;
      bytesAffected = lstat.size;

      return {
        success: true,
        affectedPaths,
        filesAffected,
        directoriesAffected: 0,
        bytesAffected,
      };
    } catch (err: any) {
      const isLocked = err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES";
      if (isLocked) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.FILE_BUSY,
          `File is currently locked or access was denied: ${err.message}`
        );
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_DELETE_FAILED,
        `Failed to delete file "${params.path}": ${err.message}`
      );
    }
  }

  // 3. Target is a directory
  if (!params.recursive) {
    const entries = fs.readdirSync(targetPath);
    if (entries.length > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_DELETE_FAILED,
        `Directory "${params.path}" is not empty. Specify recursive: true to delete directory contents.`
      );
    }
    fs.rmdirSync(targetPath);
    directoriesAffected = 1;
    affectedPaths.push(targetPath);
    return {
      success: true,
      affectedPaths,
      filesAffected: 0,
      directoriesAffected: 1,
      bytesAffected: 0,
    };
  }

  // Recursive directory deletion with depth-first traversal and symlink no-follow
  function deleteRecursive(currentDir: string): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err: any) {
      failed.push({ path: currentDir, reason: err.message });
      return;
    }

    for (const entry of entries) {
      const fullChildPath = path.join(currentDir, entry.name);

      // Survival boundary check for each nested path
      try {
        assertSurvivalBoundarySafe(fullChildPath, context.customStateDir);
      } catch (err: any) {
        failed.push({ path: fullChildPath, reason: err.message });
        continue;
      }

      let childStat: fs.Stats;
      try {
        childStat = fs.lstatSync(fullChildPath);
      } catch (err: any) {
        failed.push({ path: fullChildPath, reason: err.message });
        continue;
      }

      // If symlink or junction: UNLINK ONLY, NEVER FOLLOW!
      if (childStat.isSymbolicLink()) {
        try {
          try {
            fs.unlinkSync(fullChildPath);
          } catch {
            fs.rmdirSync(fullChildPath);
          }
          affectedPaths.push(fullChildPath);
          filesAffected++;
        } catch (err: any) {
          failed.push({ path: fullChildPath, reason: err.message });
        }
        continue;
      }

      if (childStat.isDirectory()) {
        deleteRecursive(fullChildPath);
        try {
          fs.rmdirSync(fullChildPath);
          affectedPaths.push(fullChildPath);
          directoriesAffected++;
        } catch (err: any) {
          failed.push({ path: fullChildPath, reason: err.message });
        }
      } else {
        try {
          try {
            fs.chmodSync(fullChildPath, 0o666);
          } catch {}
          fs.unlinkSync(fullChildPath);
          affectedPaths.push(fullChildPath);
          filesAffected++;
          bytesAffected += childStat.size;
        } catch (err: any) {
          failed.push({ path: fullChildPath, reason: err.message });
        }
      }
    }
  }

  deleteRecursive(targetPath);

  // If the targetPath is not the project root itself, delete the target directory too
  const isProjectRoot = context.canonicalRoot && path.resolve(targetPath) === path.resolve(context.canonicalRoot);
  if (!isProjectRoot) {
    try {
      fs.rmdirSync(targetPath);
      affectedPaths.push(targetPath);
      directoriesAffected++;
    } catch (err: any) {
      failed.push({ path: targetPath, reason: err.message });
    }
  }

  const hasFailures = failed.length > 0;
  return {
    success: !hasFailures,
    affectedPaths,
    filesAffected,
    directoriesAffected,
    bytesAffected,
    partialSuccess: hasFailures && (filesAffected > 0 || directoriesAffected > 0),
    failed: hasFailures ? failed : undefined,
  };
}

/**
 * Universal File & Directory Move / Rename.
 */
export function universalMove(
  params: FsMoveParams,
  context: UniversalFsContext
): FsMoveResult {
  const sourcePath = resolveUniversalPath(params.sourcePath, context, true);
  const targetPath = resolveUniversalPath(params.targetPath, context, false);

  if (sourcePath === targetPath) {
    return {
      success: true,
      sourcePath: params.sourcePath,
      targetPath: params.targetPath,
      filesAffected: 0,
      directoriesAffected: 0,
    };
  }

  const targetExists = fs.existsSync(targetPath);
  if (targetExists) {
    if (!params.overwrite) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_ALREADY_EXISTS,
        `Target path already exists: "${params.targetPath}". Set overwrite=true to replace.`
      );
    }
    // Delete target path first
    universalDelete({ path: params.targetPath, force: true, recursive: true }, context);
  }

  // Ensure target parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const lstat = fs.lstatSync(sourcePath);
  const isDir = lstat.isDirectory();

  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (err: any) {
    // Cross-device fallback
    if (err.code === "EXDEV") {
      fs.cpSync(sourcePath, targetPath, { recursive: true, dereference: false });
      universalDelete({ path: params.sourcePath, force: true, recursive: true }, context);
    } else {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_WRITE_FAILED,
        `Failed to move "${params.sourcePath}" to "${params.targetPath}": ${err.message}`
      );
    }
  }

  return {
    success: true,
    sourcePath: params.sourcePath,
    targetPath: params.targetPath,
    filesAffected: isDir ? 0 : 1,
    directoriesAffected: isDir ? 1 : 0,
  };
}

/**
 * Universal File & Directory Copy.
 */
export function universalCopy(
  params: FsCopyParams,
  context: UniversalFsContext
): FsCopyResult {
  const sourcePath = resolveUniversalPath(params.sourcePath, context, true);
  const targetPath = resolveUniversalPath(params.targetPath, context, false);

  const targetExists = fs.existsSync(targetPath);
  if (targetExists && !params.overwrite) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_ALREADY_EXISTS,
      `Target path already exists: "${params.targetPath}". Set overwrite=true to replace.`
    );
  }

  // Ensure target parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const lstat = fs.lstatSync(sourcePath);
  const isDir = lstat.isDirectory();

  let filesAffected = 0;
  let directoriesAffected = 0;
  let bytesAffected = 0;

  try {
    if (isDir) {
      if (!params.recursive) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.INVALID_REQUEST,
          `Cannot copy directory "${params.sourcePath}" without recursive: true`
        );
      }
      fs.cpSync(sourcePath, targetPath, {
        recursive: true,
        force: params.overwrite,
        dereference: false, // NEVER follow symlinks!
      });
      // Count copied files & bytes
      function countTree(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const sub = path.join(dir, entry.name);
          const st = fs.lstatSync(sub);
          if (st.isDirectory()) {
            directoriesAffected++;
            countTree(sub);
          } else {
            filesAffected++;
            bytesAffected += st.size;
          }
        }
      }
      directoriesAffected++;
      countTree(targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
      filesAffected = 1;
      bytesAffected = lstat.size;
    }
  } catch (err: any) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_WRITE_FAILED,
      `Failed to copy "${params.sourcePath}" to "${params.targetPath}": ${err.message}`
    );
  }

  return {
    success: true,
    sourcePath: params.sourcePath,
    targetPath: params.targetPath,
    filesAffected,
    directoriesAffected,
    bytesAffected,
  };
}

/**
 * Universal Directory Creation.
 */
export function universalMkdir(
  params: FsMkdirParams,
  context: UniversalFsContext
): FsMkdirResult {
  const targetPath = resolveUniversalPath(params.path, context, false);

  if (fs.existsSync(targetPath)) {
    const st = fs.statSync(targetPath);
    if (!st.isDirectory()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.FILE_ALREADY_EXISTS,
        `A non-directory item already exists at "${params.path}"`
      );
    }
    return {
      success: true,
      path: params.path,
      created: false,
    };
  }

  try {
    fs.mkdirSync(targetPath, { recursive: params.recursive ?? true });
    return {
      success: true,
      path: params.path,
      created: true,
    };
  } catch (err: any) {
    throw new LocalBridgeError(
      LocalBridgeErrorCode.FILE_WRITE_FAILED,
      `Failed to create directory "${params.path}": ${err.message}`
    );
  }
}
