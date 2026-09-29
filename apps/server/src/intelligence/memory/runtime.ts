import crypto from "node:crypto";
import type {
  EnhancedMemoryEntry,
  EnhancedMemoryScope,
  MemoryType,
  MemoryRecallParams,
  MemoryRecallResult,
  MemoryCandidate,
  MemoryCandidateStatus,
  MemoryProvenance,
  MemorySource,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import type { Logger } from "@localbridge/shared";

export class MemoryRuntime {
  constructor(
    private readonly store: IntelligenceStore,
    private readonly logger?: Logger
  ) {}

  /**
   * Create or update a formal memory in the authoritative IntelligenceStore.
   */
  setMemory(params: {
    id?: string;
    key: string;
    content: string;
    type?: MemoryType;
    scope?: EnhancedMemoryScope;
    scopeId?: string;
    importance?: number;
    confidence?: number;
    source?: MemorySource;
    provenance?: MemoryProvenance;
    tags?: string[];
  }): EnhancedMemoryEntry {
    const existing = params.id
      ? this.store.getMemory(params.id)
      : this.store.getMemoryByKey(params.key, params.scope || "PROJECT", params.scopeId);

    const now = Date.now();
    const relations = existing?.relations || { relatedMemoryIds: [], conflictsWith: [], supersedes: [] };

    // Check conflict with other memories in the same scope
    if (!existing) {
      const candidates = this.store.recallMemories({
        query: params.key,
        scope: params.scope,
        scopeId: params.scopeId,
        limit: 5,
        offset: 0,
        includeArchived: false,
      });
      for (const m of candidates.memories) {
        if (m.key.toLowerCase() === params.key.toLowerCase() && m.id !== params.id) {
          relations.conflictsWith = Array.from(new Set([...(relations.conflictsWith || []), m.id]));
        }
      }
    }

    const entry: EnhancedMemoryEntry = {
      id: existing?.id || params.id || `mem_${crypto.randomUUID()}`,
      key: params.key,
      content: params.content,
      type: params.type || existing?.type || "FACT",
      scope: params.scope || existing?.scope || "PROJECT",
      scopeId: params.scopeId || existing?.scopeId,
      importance: params.importance !== undefined ? params.importance : existing?.importance ?? 5,
      confidence: params.confidence !== undefined ? params.confidence : existing?.confidence ?? 1.0,
      source: params.source || existing?.source || "USER",
      provenance: params.provenance || existing?.provenance,
      version: (existing?.version || 0) + 1,
      relations,
      status: "ACTIVE",
      tags: params.tags || existing?.tags || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const saved = this.store.saveMemory(entry);
    this.logger?.info({ id: saved.id, key: saved.key, scope: saved.scope }, "Persisted authoritative memory");
    return saved;
  }

  getMemory(id: string): EnhancedMemoryEntry | null {
    return this.store.getMemory(id);
  }

  getMemoryByKey(key: string, scope: EnhancedMemoryScope = "PROJECT", scopeId?: string): EnhancedMemoryEntry | null {
    return this.store.getMemoryByKey(key, scope, scopeId);
  }

  /**
   * Recall memories with strict Scope Isolation, importance weighting, and provenance reasoning.
   */
  recall(params: MemoryRecallParams): MemoryRecallResult {
    const { memories } = this.store.recallMemories(params);
    const reasoning: string[] = [];

    // Filter out memories that belong to another project if scope is PROJECT
    const isolated = memories.filter((m) => {
      if (m.scope === "PROJECT" && params.scopeId && m.scopeId && m.scopeId !== params.scopeId) {
        return false;
      }
      return true;
    });

    for (const m of isolated) {
      const prov = m.provenance;
      const provInfo = prov?.skillId ? ` via Skill '${prov.skillId}'` : prov?.taskId ? ` via Task '${prov.taskId}'` : "";
      reasoning.push(
        `Recalled [${m.type}] '${m.key}' (Importance: ${m.importance}, Conf: ${m.confidence}${provInfo})`
      );
    }

    return {
      memories: isolated,
      total: isolated.length,
      query: params.query,
      recallReasoning: reasoning,
    };
  }

  deleteMemory(id: string): boolean {
    return this.store.deleteMemory(id);
  }

  archiveMemory(id: string): boolean {
    return this.store.archiveMemory(id);
  }

  forgetMemory(id: string): boolean {
    // Forget deletes or marks forgotten
    return this.store.deleteMemory(id);
  }

  /**
   * Consolidate duplicate, overlapping, or conflicting active memories across a given scope.
   */
  consolidate(params?: { scope?: EnhancedMemoryScope; scopeId?: string }): {
    consolidatedCount: number;
    supersededCount: number;
    activeTotal: number;
    details: Array<{ key: string; action: string; reason: string }>;
  } {
    const filterScope = params?.scope;
    const filterScopeId = params?.scopeId;

    const recallResult = this.store.recallMemories({
      scope: filterScope,
      scopeId: filterScopeId,
      limit: 1000,
      offset: 0,
      includeArchived: false,
    });

    const memories = recallResult.memories.filter((m) => m.status === "ACTIVE");
    const details: Array<{ key: string; action: string; reason: string }> = [];
    let consolidatedCount = 0;
    let supersededCount = 0;

    const groups = new Map<string, EnhancedMemoryEntry[]>();
    for (const mem of memories) {
      const normKey = mem.key.trim().toLowerCase();
      if (!groups.has(normKey)) {
        groups.set(normKey, []);
      }
      groups.get(normKey)!.push(mem);
    }

    for (const [, group] of groups.entries()) {
      if (group.length > 1) {
        group.sort(
          (a, b) => b.importance * b.confidence - a.importance * a.confidence || b.updatedAt - a.updatedAt
        );
        const primary = group[0];
        if (!primary) continue;
        const duplicates = group.slice(1);

        const allTags = Array.from(new Set(group.flatMap((g) => g.tags || [])));
        const allContents = Array.from(new Set(group.map((g) => g.content.trim())));
        const mergedContent = allContents.length === 1 ? primary.content : allContents.join("\n---\n");

        primary.content = mergedContent;
        primary.tags = allTags;
        primary.confidence = Math.min(1.0, primary.confidence + 0.05);
        primary.importance = Math.max(...group.map((g) => g.importance));
        primary.updatedAt = Date.now();
        primary.provenance = {
          source: "SYSTEM",
          evidence: `Consolidated from ${group.length} duplicates (${group.map((g) => g.id).join(", ")})`,
          actionIds: [],
        };
        this.store.saveMemory(primary);
        consolidatedCount++;

        for (const dup of duplicates) {
          dup.status = "ARCHIVED";
          dup.relations = {
            ...(dup.relations || { relatedMemoryIds: [] }),
            supersedes: Array.from(new Set([...(dup.relations?.supersedes || []), primary.id])),
          };
          this.store.saveMemory(dup);
          supersededCount++;
        }

        details.push({
          key: primary.key,
          action: "CONSOLIDATED",
          reason: `Merged ${group.length} matching memory entries into canonical record ${primary.id}`,
        });
      }
    }

    const remainingActive = this.store.recallMemories({
      scope: filterScope,
      scopeId: filterScopeId,
      limit: 1000,
      offset: 0,
      includeArchived: false,
    }).memories.filter((m) => m.status === "ACTIVE").length;

    this.logger?.info(
      { consolidatedCount, supersededCount, remainingActive },
      "Memory consolidation completed"
    );

    return {
      consolidatedCount,
      supersededCount,
      activeTotal: remainingActive,
      details,
    };
  }

  /**
   * Consolidate duplicate or related memories into a single high-confidence entry.
   */
  consolidateMemories(memoryIds: string[], consolidatedKey: string, consolidatedContent: string): EnhancedMemoryEntry | null {
    if (memoryIds.length === 0) return null;

    const sourceMemories = memoryIds.map((id) => this.store.getMemory(id)).filter(Boolean) as EnhancedMemoryEntry[];
    if (sourceMemories.length === 0) return null;

    const maxImportance = Math.max(...sourceMemories.map((m) => m.importance));
    const avgConfidence = sourceMemories.reduce((acc, m) => acc + m.confidence, 0) / sourceMemories.length;
    const combinedTags = Array.from(new Set(sourceMemories.flatMap((m) => m.tags)));
    const primary = sourceMemories[0]!;

    const consolidated = this.setMemory({
      key: consolidatedKey,
      content: consolidatedContent,
      type: primary.type,
      scope: primary.scope,
      scopeId: primary.scopeId,
      importance: maxImportance,
      confidence: Math.min(1.0, avgConfidence + 0.05), // Consolidation boosts confidence
      source: "SYSTEM",
      provenance: {
        source: "SYSTEM",
        evidence: `Consolidated from memories: ${memoryIds.join(", ")}`,
        actionIds: [],
      },
      tags: combinedTags,
    });

    // Mark previous memories as superseded
    for (const m of sourceMemories) {
      if (m.id !== consolidated.id) {
        m.status = "ARCHIVED";
        m.relations = {
          ...m.relations,
          supersedes: Array.from(new Set([...(m.relations.supersedes || []), consolidated.id])),
        };
        this.store.saveMemory(m);
      }
    }

    return consolidated;
  }

  // ==========================================================================
  // Candidate Lifecycle
  // ==========================================================================

  proposeCandidate(params: {
    key: string;
    content: string;
    type?: MemoryType;
    scope?: EnhancedMemoryScope;
    scopeId?: string;
    importance?: number;
    confidence?: number;
    source?: MemorySource;
    provenance: MemoryProvenance;
    tags?: string[];
  }): MemoryCandidate {
    const candidateId = `cand_${crypto.randomUUID()}`;
    const candidate: MemoryCandidate = {
      candidateId,
      key: params.key,
      content: params.content,
      type: params.type || "EXPERIENCE",
      scope: params.scope || "PROJECT",
      scopeId: params.scopeId,
      importance: params.importance ?? 5,
      confidence: params.confidence ?? 0.8,
      source: params.source || "ACTION",
      provenance: params.provenance,
      tags: params.tags || [],
      status: "CANDIDATE",
      createdAt: Date.now(),
    };

    this.store.saveMemoryCandidate(candidate);
    this.logger?.info({ candidateId, key: candidate.key }, "Registered memory candidate for review");
    return candidate;
  }

  createCandidate(params: any): MemoryCandidate {
    return this.proposeCandidate(params);
  }

  listCandidates(filter?: MemoryCandidateStatus | { status?: MemoryCandidateStatus }): MemoryCandidate[] {
    return this.store.listMemoryCandidates(filter);
  }

  acceptCandidate(candidateId: string, notes?: string): EnhancedMemoryEntry | null {
    return this.store.acceptMemoryCandidate(candidateId, notes);
  }

  rejectCandidate(candidateId: string, notes?: string): boolean {
    return this.store.rejectMemoryCandidate(candidateId, notes);
  }

  deleteCandidate(candidateId: string): boolean {
    return this.store.deleteMemoryCandidate(candidateId);
  }
}
