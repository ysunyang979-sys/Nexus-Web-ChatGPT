import fs from "node:fs";
import path from "node:path";
import type { LocalResource, LocalResourceType } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class LocalResourceRegistry {
  private resourcesById: Map<string, LocalResource> = new Map();
  private resourcesByPath: Map<string, string> = new Map(); // normalizedPath -> resourceId
  private readonly registryFilePath: string;

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
    this.registryFilePath = path.join(dir, "resource-registry.json");
    this.load();
  }

  private normalizePath(p: string): string {
    return path.resolve(p).toLowerCase().replace(/\\/g, "/");
  }

  private load(): void {
    if (fs.existsSync(this.registryFilePath)) {
      try {
        const raw = fs.readFileSync(this.registryFilePath, "utf8");
        const list: LocalResource[] = JSON.parse(raw);
        for (const res of list) {
          this.register(res, false);
        }
      } catch (err: any) {
        this.logger?.warn({ err: err?.message }, "Failed to load resource registry");
      }
    }
  }

  save(): void {
    try {
      const list = Array.from(this.resourcesById.values());
      fs.writeFileSync(this.registryFilePath, JSON.stringify(list, null, 2), "utf8");
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "Failed to save resource registry");
    }
  }

  register(resource: LocalResource, persist = true): void {
    const normPath = this.normalizePath(resource.path);
    this.resourcesById.set(resource.resourceId, resource);
    this.resourcesByPath.set(normPath, resource.resourceId);

    if (persist) {
      this.save();
    }
  }

  registerBatch(resources: LocalResource[]): void {
    for (const res of resources) {
      const normPath = this.normalizePath(res.path);
      this.resourcesById.set(res.resourceId, res);
      this.resourcesByPath.set(normPath, res.resourceId);
    }
    this.save();
  }

  getById(id: string): LocalResource | undefined {
    return this.resourcesById.get(id);
  }

  getByPath(targetPath: string): LocalResource | undefined {
    const norm = this.normalizePath(targetPath);
    const id = this.resourcesByPath.get(norm);
    if (!id) return undefined;
    return this.resourcesById.get(id);
  }

  getByType(type: LocalResourceType): LocalResource[] {
    const results: LocalResource[] = [];
    for (const res of this.resourcesById.values()) {
      if (res.type === type) {
        results.push(res);
      }
    }
    return results;
  }

  invalidate(resourceIdOrPath: string): boolean {
    let id = resourceIdOrPath;
    const norm = this.normalizePath(resourceIdOrPath);
    if (this.resourcesByPath.has(norm)) {
      id = this.resourcesByPath.get(norm)!;
    }

    const res = this.resourcesById.get(id);
    if (res) {
      res.exists = false;
      res.accessible = false;
      res.verified = false;
      if (res.metadata) {
        res.metadata.invalidatedAt = new Date().toISOString();
      } else {
        res.metadata = { invalidatedAt: new Date().toISOString() };
      }
      this.save();
      return true;
    }
    return false;
  }

  delete(resourceIdOrPath: string): boolean {
    let id = resourceIdOrPath;
    const norm = this.normalizePath(resourceIdOrPath);
    if (this.resourcesByPath.has(norm)) {
      id = this.resourcesByPath.get(norm)!;
    }

    const res = this.resourcesById.get(id);
    if (res) {
      this.resourcesById.delete(id);
      this.resourcesByPath.delete(this.normalizePath(res.path));
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Natural Language / Semantic Search with relevance ranking
   */
  find(
    query: string,
    options?: {
      types?: LocalResourceType[];
      limit?: number;
      verify?: boolean;
    }
  ): LocalResource[] {
    const limit = options?.limit ?? 50;
    const allowedTypes = options?.types ? new Set(options.types) : null;
    const qLower = query.toLowerCase().trim();
    const qTokens = qLower
      .split(/[\s_\-.]+/)
      .filter((t) => t.length > 0 && !["exe", "app", "application", "bin", "64", "x64", "x86"].includes(t));

    const scored: { resource: LocalResource; score: number }[] = [];

    for (const res of this.resourcesById.values()) {
      if (allowedTypes && !allowedTypes.has(res.type)) {
        continue;
      }

      const resNameLower = res.name.toLowerCase();
      const resPathLower = res.path.toLowerCase();
      const exeNameLower = res.executablePath ? path.basename(res.executablePath).toLowerCase() : "";

      let score = 0;

      // 1. Exact match on name or exe name
      if (resNameLower === qLower || exeNameLower === qLower) {
        score = 100;
      } else if (res.aliases && res.aliases.some((a) => a.toLowerCase() === qLower)) {
        score = 95;
      } else if (resNameLower.startsWith(qLower) || exeNameLower.startsWith(qLower)) {
        score = 85;
      } else if (res.aliases && res.aliases.some((a) => a.toLowerCase().startsWith(qLower))) {
        score = 80;
      } else if (resNameLower.includes(qLower) || exeNameLower.includes(qLower)) {
        score = 70;
      } else if (res.aliases && res.aliases.some((a) => a.toLowerCase().includes(qLower))) {
        score = 65;
      } else if (resPathLower.includes(qLower)) {
        score = 50;
      } else if (qTokens.length > 0) {
        // Token overlap scoring
        let tokenMatches = 0;
        for (const token of qTokens) {
          if (
            resNameLower.includes(token) ||
            exeNameLower.includes(token) ||
            (res.aliases && res.aliases.some((a) => a.toLowerCase().includes(token)))
          ) {
            tokenMatches++;
          }
        }
        if (tokenMatches > 0) {
          score = 30 + Math.round((tokenMatches / qTokens.length) * 30);
        }
      }

      if (score > 0) {
        // If verify option is enabled, update live exists flag
        if (options?.verify && res.type === "application" && res.executablePath) {
          res.exists = fs.existsSync(res.executablePath);
          res.verified = res.exists;
        } else if (options?.verify && (res.type === "file" || res.type === "directory")) {
          res.exists = fs.existsSync(res.path);
          res.verified = res.exists;
        }

        scored.push({ resource: res, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.resource);
  }

  size(): number {
    return this.resourcesById.size;
  }

  all(): LocalResource[] {
    return Array.from(this.resourcesById.values());
  }
}
