import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type {
  FsGrepParams,
  FsGrepResult,
  FsGrepFileMatch,
  FsGrepMatchLine,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";

export interface GrepOptions {
  canonicalRoot: string;
  unrestricted?: boolean;
}

function isBinaryFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function grepProjectFiles(
  params: FsGrepParams,
  options: GrepOptions
): Promise<FsGrepResult> {
  const { canonicalRoot, unrestricted = false } = options;
  const startRel = !params.path || params.path === "" ? "." : params.path;

  const resolved = resolveProjectPath(canonicalRoot, startRel, {
    mustExist: true,
    unrestricted,
  });

  const fileMatches: FsGrepFileMatch[] = [];
  let totalMatches = 0;
  let filesSearched = 0;
  let truncated = false;

  const maxFiles = params.maxFiles || 50;
  const maxMatchesPerFile = params.maxMatchesPerFile || 20;
  const allowedExts = params.fileExtensions?.map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));

  let regex: RegExp;
  try {
    const patternStr = params.pattern ?? (params as any).query;
    if (!patternStr) {
      throw new Error("Missing search pattern in grepProjectFiles");
    }
    const flags = params.caseSensitive ? "g" : "gi";
    regex = params.isRegex
      ? new RegExp(patternStr, flags)
      : new RegExp(patternStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  } catch (err) {
    throw new Error(`Invalid search pattern or regex: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fileQueue: string[] = [];

  // Crawl files
  const dirQueue = [resolved.canonicalPath];
  while (dirQueue.length > 0 && fileQueue.length < 500) {
    const current = dirQueue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (ent.name === ".git" || ent.name === "node_modules" || ent.name === ".nexus") continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        dirQueue.push(full);
      } else if (ent.isFile()) {
        if (allowedExts && allowedExts.length > 0) {
          const ext = path.extname(ent.name.toLowerCase());
          if (!allowedExts.includes(ext)) continue;
        }
        fileQueue.push(full);
      }
    }
  }

  // Grep files line by line
  for (const filePath of fileQueue) {
    let relPath: string;
    try {
      relPath = path.relative(canonicalRoot, filePath).replace(/\\/g, "/");
    } catch {
      relPath = filePath.replace(/\\/g, "/");
    }

    if (!unrestricted && isSensitiveFile(relPath)) continue;
    if (isBinaryFile(filePath)) continue;

    filesSearched++;
    const matchingLines: FsGrepMatchLine[] = [];

    const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineNum = 0;
    for await (const line of rl) {
      lineNum++;
      regex.lastIndex = 0;
      if (regex.test(line)) {
        matchingLines.push({
          lineNumber: lineNum,
          lineText: line.length > 300 ? `${line.slice(0, 300)}...` : line,
        });
        totalMatches++;
        if (matchingLines.length >= maxMatchesPerFile) break;
      }
    }

    if (matchingLines.length > 0) {
      fileMatches.push({
        relativePath: relPath,
        lines: matchingLines,
      });

      if (fileMatches.length >= maxFiles) {
        truncated = true;
        break;
      }
    }
  }

  return {
    projectId: params.projectId,
    fileMatches,
    totalMatches,
    filesSearched,
    truncated,
  };
}
