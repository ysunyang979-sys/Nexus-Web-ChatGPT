import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ContentIndexRecord } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export interface IndexEntry {
  path: string;
  filename: string;
  extension: string;
  size: number;
  modifiedAt: string;
  mtimeMs: number;
  hash: string;
  extractedText: string;
  metadata?: Record<string, any>;
}

export class ContentIndexer {
  private index: Map<string, IndexEntry> = new Map();
  private readonly indexPath: string;
  private readonly supportedExtensions = new Set([
    ".txt",
    ".md",
    ".json",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".html",
    ".css",
    ".yaml",
    ".yml",
    ".xml",
    ".csv",
    ".log",
  ]);

  constructor(
    runnerStateDir: string,
    private readonly logger?: Logger
  ) {
    const dir = path.join(runnerStateDir, "discovery");
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    this.indexPath = path.join(dir, "content-index.json");
    this.loadIndex();
  }

  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = fs.readFileSync(this.indexPath, "utf8");
        const list: IndexEntry[] = JSON.parse(raw);
        for (const entry of list) {
          this.index.set(this.normalizePath(entry.path), entry);
        }
      } catch (err: any) {
        this.logger?.warn({ err: err?.message }, "Failed to load content index, initializing empty");
      }
    }
  }

  saveIndex(): void {
    try {
      const list = Array.from(this.index.values());
      fs.writeFileSync(this.indexPath, JSON.stringify(list, null, 2), "utf8");
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "Failed to save content index");
    }
  }

  private normalizePath(p: string): string {
    return path.resolve(p).toLowerCase().replace(/\\/g, "/");
  }

  /**
   * Incrementally index a single file
   */
  indexFile(filePath: string): IndexEntry | null {
    const norm = this.normalizePath(filePath);
    if (!fs.existsSync(filePath)) {
      this.index.delete(norm);
      for (const [k, e] of this.index.entries()) {
        if (this.normalizePath(e.path) === norm || e.path === filePath) {
          this.index.delete(k);
        }
      }
      this.saveIndex();
      return null;
    }

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;

      const ext = path.extname(filePath).toLowerCase();
      if (!this.supportedExtensions.has(ext)) return null;

      const existing = this.index.get(norm);
      if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
        return existing;
      }

      // Max 2MB to prevent memory exhaustion
      if (stat.size > 2 * 1024 * 1024) {
        return null;
      }

      const content = fs.readFileSync(filePath, "utf8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      const entry: IndexEntry = {
        path: path.resolve(filePath),
        filename: path.basename(filePath),
        extension: ext,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        hash,
        extractedText: content,
        metadata: {
          lineCount: content.split("\n").length,
        },
      };

      this.index.set(norm, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Invalidate or remove a file from index
   */
  removeFile(filePath: string): boolean {
    const norm = this.normalizePath(filePath);
    const existed = this.index.delete(norm);
    if (existed) {
      this.saveIndex();
    }
    return existed;
  }

  /**
   * Scan directory incrementally (supports recursive indexing)
   */
  async indexDirectory(dirPath: string, maxDepth = 4, maxFiles = 1000): Promise<{ indexed: number; updated: number }> {
    if (!fs.existsSync(dirPath)) return { indexed: 0, updated: 0 };

    let count = 0;
    let updatedCount = 0;

    const queue: { dir: string; depth: number }[] = [{ dir: dirPath, depth: 0 }];

    while (queue.length > 0 && count < maxFiles) {
      const { dir, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          // Skip noisy directories
          if (/node_modules|\.git|\.turbo|\.cache|dist|build|target|\.vs/i.test(e.name)) {
            continue;
          }
          if (depth < maxDepth) {
            queue.push({ dir: fullPath, depth: depth + 1 });
          }
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (this.supportedExtensions.has(ext)) {
            const norm = this.normalizePath(fullPath);
            const prev = this.index.get(norm);
            const res = this.indexFile(fullPath);
            if (res) {
              count++;
              if (!prev || prev.hash !== res.hash) {
                updatedCount++;
              }
            }
          }
        }
      }
    }

    this.saveIndex();
    return { indexed: count, updated: updatedCount };
  }

  /**
   * Search indexed files for query content or filename
   */
  search(
    query: string,
    options?: {
      extensions?: string[];
      limit?: number;
      directories?: string[];
    }
  ): ContentIndexRecord[] {
    const limit = options?.limit ?? 20;
    const exts = options?.extensions?.map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));
    const allowedExts = exts ? new Set(exts) : null;
    const lowerQuery = query.toLowerCase().trim();

    const results: ContentIndexRecord[] = [];

    for (const [k, entry] of Array.from(this.index.entries())) {
      if (!fs.existsSync(entry.path)) {
        this.index.delete(k);
        continue;
      }
      if (allowedExts && !allowedExts.has(entry.extension.toLowerCase())) {
        continue;
      }

      if (options?.directories && options.directories.length > 0) {
        const matchesDir = options.directories.some((d) => this.normalizePath(entry.path).startsWith(this.normalizePath(d)));
        if (!matchesDir) continue;
      }

      // Check content match or filename match
      const contentIdx = entry.extractedText.toLowerCase().indexOf(lowerQuery);
      const filenameMatch = entry.filename.toLowerCase().includes(lowerQuery);

      if (contentIdx !== -1 || filenameMatch) {
        let snippet = "";
        if (contentIdx !== -1) {
          const start = Math.max(0, contentIdx - 60);
          const end = Math.min(entry.extractedText.length, contentIdx + lowerQuery.length + 60);
          snippet = (start > 0 ? "..." : "") + entry.extractedText.slice(start, end).replace(/[\r\n]+/g, " ") + (end < entry.extractedText.length ? "..." : "");
        } else {
          snippet = entry.extractedText.slice(0, 120).replace(/[\r\n]+/g, " ");
        }

        results.push({
          path: entry.path,
          filename: entry.filename,
          extension: entry.extension,
          size: entry.size,
          modifiedAt: entry.modifiedAt,
          hash: entry.hash,
          snippet,
          metadata: entry.metadata,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Get total index count
   */
  size(): number {
    return this.index.size;
  }

  /**
   * Get single file record
   */
  getByPath(filePath: string): IndexEntry | undefined {
    return this.index.get(this.normalizePath(filePath));
  }
}
