import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  MemoryEntry,
  MemoryScope,
  MemorySetParams,
  MemorySetResult,
  MemoryGetParams,
  MemoryGetResult,
  MemorySearchParams,
  MemorySearchResult,
  MemoryDeleteParams,
  MemoryDeleteResult,
  MemoryPurgeParams,
  MemoryPurgeResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class AgentMemoryService {
  private readonly memoryFile: string;
  private entries: Map<string, MemoryEntry> = new Map();

  constructor(
    runnerStateDir: string,
    private readonly logger?: Logger
  ) {
    const memoryDir = path.join(runnerStateDir, "memory");
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.memoryFile = path.join(memoryDir, "agent-memory.json");
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.memoryFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.memoryFile, "utf-8")) as MemoryEntry[];
      for (const e of data) {
        this.entries.set(this.buildKey(e.scope, e.key, e.scopeId), e);
      }
      this.logger?.debug({ count: this.entries.size }, "Loaded agent memory entries");
    } catch (err) {
      this.logger?.warn({ err }, "Failed to read agent memory file");
    }
  }

  private save(): void {
    try {
      const tmp = `${this.memoryFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(Array.from(this.entries.values()), null, 2), "utf-8");
      fs.renameSync(tmp, this.memoryFile);
    } catch (err) {
      this.logger?.warn({ err }, "Failed to persist agent memory file");
    }
  }

  private buildKey(scope: MemoryScope, key: string, scopeId?: string): string {
    return `${scope}::${scopeId || ""}::${key}`;
  }

  async set(params: MemorySetParams): Promise<MemorySetResult> {
    const mapKey = this.buildKey(params.scope, params.key, params.scopeId);
    const existing = this.entries.get(mapKey);
    const now = Date.now();

    const entry: MemoryEntry = {
      id: existing?.id || `mem_${crypto.randomUUID()}`,
      key: params.key,
      value: params.value,
      scope: params.scope,
      scopeId: params.scopeId,
      tags: params.tags || existing?.tags || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.entries.set(mapKey, entry);
    this.save();

    this.logger?.info({ scope: params.scope, key: params.key, scopeId: params.scopeId }, "Saved agent memory");
    return { entry };
  }

  async get(params: MemoryGetParams): Promise<MemoryGetResult> {
    const mapKey = this.buildKey(params.scope, params.key, params.scopeId);
    const entry = this.entries.get(mapKey) || null;
    return { entry };
  }

  async search(params: MemorySearchParams): Promise<MemorySearchResult> {
    let list = Array.from(this.entries.values());

    if (params.scope) {
      list = list.filter((e) => e.scope === params.scope);
    }
    if (params.scopeId) {
      list = list.filter((e) => e.scopeId === params.scopeId);
    }
    if (params.tag) {
      list = list.filter((e) => e.tags && e.tags.includes(params.tag!));
    }
    if (params.query) {
      const q = params.query.toLowerCase();
      list = list.filter((e) => {
        const keyMatch = e.key.toLowerCase().includes(q);
        const valMatch = typeof e.value === "string" ? e.value.toLowerCase().includes(q) : JSON.stringify(e.value).toLowerCase().includes(q);
        return keyMatch || valMatch;
      });
    }

    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const paginated = list.slice(0, params.limit || 50);

    return {
      entries: paginated,
      total: list.length,
    };
  }

  async delete(params: MemoryDeleteParams): Promise<MemoryDeleteResult> {
    const mapKey = this.buildKey(params.scope, params.key, params.scopeId);
    const existed = this.entries.delete(mapKey);
    if (existed) {
      this.save();
    }
    return { deleted: existed };
  }

  async purge(params: MemoryPurgeParams): Promise<MemoryPurgeResult> {
    let count = 0;
    for (const [k, e] of this.entries.entries()) {
      if (e.scope === params.scope && (!params.scopeId || e.scopeId === params.scopeId)) {
        this.entries.delete(k);
        count++;
      }
    }
    if (count > 0) {
      this.save();
    }
    return { purgedCount: count };
  }
}
