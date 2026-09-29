import fs from "node:fs";
import path from "node:path";
import type {
  FsSearchParams,
  FsSearchResult,
  FsSearchMatch,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";

export interface SearchOptions {
  canonicalRoot: string;
  unrestricted?: boolean;
}

export function searchProjectFiles(
  params: FsSearchParams,
  options: SearchOptions
): FsSearchResult {
  const { canonicalRoot, unrestricted = false } = options;
  const startRel = !params.path || params.path === "" ? "." : params.path;

  const resolved = resolveProjectPath(canonicalRoot, startRel, {
    mustExist: true,
    unrestricted,
  });

  const matches: FsSearchMatch[] = [];
  const maxResults = params.maxResults || 100;
  let truncated = false;

  const queryLower = params.query.toLowerCase();
  const allowedExts = params.fileExtensions?.map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));

  const queue: string[] = [resolved.canonicalPath];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (ent.name === ".git" || ent.name === "node_modules" || ent.name === ".nexus") {
        continue;
      }

      const fullPath = path.join(currentDir, ent.name);
      let relPath: string;
      try {
        relPath = path.relative(canonicalRoot, fullPath).replace(/\\/g, "/");
      } catch {
        relPath = fullPath.replace(/\\/g, "/");
      }

      if (!unrestricted && isSensitiveFile(relPath)) {
        continue;
      }

      const nameLower = ent.name.toLowerCase();
      const isDir = ent.isDirectory();
      const isFile = ent.isFile();

      const filterType = params.type || "all";
      let matched = false;
      if (nameLower.includes(queryLower)) {
        if (filterType === "directory" && isDir) matched = true;
        else if (filterType === "file" && isFile) matched = true;
        else if (filterType === "all") matched = true;
      }

      if (matched && isFile && allowedExts && allowedExts.length > 0) {
        const ext = path.extname(nameLower);
        if (!allowedExts.includes(ext)) {
          matched = false;
        }
      }

      if (matched) {
        let sizeBytes: number | undefined;
        let modifiedAt: number | undefined;
        try {
          const s = fs.statSync(fullPath);
          sizeBytes = s.size;
          modifiedAt = Math.floor(s.mtimeMs);
        } catch {}

        matches.push({
          relativePath: relPath,
          name: ent.name,
          type: isDir ? "directory" : "file",
          sizeBytes,
          modifiedAt,
        });

        if (matches.length >= maxResults) {
          truncated = true;
          return {
            projectId: params.projectId,
            matches,
            totalFound: matches.length,
            truncated,
          };
        }
      }

      if (isDir) {
        queue.push(fullPath);
      }
    }
  }

  return {
    projectId: params.projectId,
    matches,
    totalFound: matches.length,
    truncated,
  };
}
