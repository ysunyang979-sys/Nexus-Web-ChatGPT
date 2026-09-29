import crypto from "node:crypto";
import type {
  ContextSnapshot,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import type { GlobalRuleRegistry } from "../rules/rule-registry.js";
import type { MemoryRuntime } from "../memory/runtime.js";
import type { VersionedSkillRegistry } from "../skill/versioned-registry.js";
import type { KnowledgeImporter } from "../knowledge/importer.js";
import { ContextCompactor } from "./compactor.js";
import type { Logger } from "@localbridge/shared";

export class ContextBuilder {
  private readonly compactor: ContextCompactor;

  constructor(
    private readonly store: IntelligenceStore,
    private readonly ruleRegistry: GlobalRuleRegistry,
    private readonly memoryRuntime: MemoryRuntime,
    private readonly skillRegistry: VersionedSkillRegistry,
    private readonly knowledgeImporter: KnowledgeImporter,
    private readonly logger?: Logger
  ) {
    this.compactor = new ContextCompactor();
  }

  getCompactor(): ContextCompactor {
    return this.compactor;
  }

  /**
   * Build dynamic context snapshot by aggregating active rules, recalled memories,
   * active skills, knowledge docs, and execution state.
   */
  async buildContext(params: {
    taskId?: string;
    sessionId?: string;
    projectId?: string;
    goal?: string;
    recentActions?: any[];
    currentState?: Record<string, any>;
    checkpoint?: { checkpointId: string; step: number };
    files?: string[];
    maxTokens?: number;
  }): Promise<ContextSnapshot> {
    const contextId = `ctx_${crypto.randomUUID()}`;
    const now = Date.now();

    // 1. Fetch active Rules sorted by priority (SYSTEM > CORE > USER > PROJECT)
    const activeRules = this.ruleRegistry.listRules({ status: "ACTIVE" });
    const scopedRules = activeRules.filter((r) => {
      if (r.scope === "PROJECT" && params.projectId && r.scopeId && r.scopeId !== params.projectId) {
        return false;
      }
      return true;
    });

    // 2. Recall Memories (Project isolated + Global)
    const memoryRecall = this.memoryRuntime.recall({
      query: params.goal,
      scope: params.projectId ? "PROJECT" : undefined,
      scopeId: params.projectId,
      minImportance: 4,
      limit: 15,
      offset: 0,
      includeArchived: false,
    });

    // 3. Fetch active Skills
    const skillsList = this.skillRegistry.listSkills({
      projectId: params.projectId,
      status: "ACTIVE",
    });
    const skills = skillsList.map((s) => ({
      skillId: s.skillId,
      version: s.activeVersion,
      name: s.name,
      stepsCount: s.versions.find((v) => v.version === s.activeVersion)?.steps.length || 0,
    }));

    // 4. Fetch relevant Knowledge Documents
    const docs = this.knowledgeImporter.listDocuments().slice(0, 5).map((d) => ({
      documentId: d.documentId,
      filename: d.filename,
      summary: d.textSummary,
    }));

    // Formulate initial snapshot
    const initialSnapshot: ContextSnapshot = {
      contextId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      goal: params.goal,
      rules: scopedRules,
      memories: memoryRecall.memories,
      skills,
      documents: docs,
      currentState: params.currentState || {},
      recentActions: params.recentActions || [],
      checkpoint: params.checkpoint,
      files: params.files || [],
      tokenEstimate: 0,
      traceMetadata: {
        usedMemoryIds: memoryRecall.memories.map((m) => m.id),
        usedRuleIds: scopedRules.map((r) => r.ruleId),
        usedSkillVersions: Object.fromEntries(skills.map((s) => [s.skillId, s.version])),
        usedDocumentIds: docs.map((d) => d.documentId),
        checkpointId: params.checkpoint?.checkpointId,
        actionIds: (params.recentActions || []).map((a) => a.actionId).filter(Boolean),
        contextHash: "",
      },
      createdAt: now,
    };

    initialSnapshot.tokenEstimate = this.compactor.estimateTokens(initialSnapshot);

    // 5. Context Compaction if exceeding threshold
    const maxTokens = params.maxTokens || 8000;
    const { compactedSnapshot } = this.compactor.compact(initialSnapshot, maxTokens);

    // 6. Compute Context Hash
    const contextContentString = JSON.stringify({
      goal: compactedSnapshot.goal,
      rules: compactedSnapshot.rules.map((r) => r.ruleId),
      memories: compactedSnapshot.memories.map((m) => m.id),
      skills: compactedSnapshot.skills,
      checkpoint: compactedSnapshot.checkpoint,
    });
    const contextHash = crypto.createHash("sha256").update(contextContentString).digest("hex");
    compactedSnapshot.traceMetadata.contextHash = contextHash;

    // 7. Save Snapshot & Compaction State
    this.store.saveContextSnapshot(compactedSnapshot);
    if (compactedSnapshot.compactionState) {
      this.store.saveCompaction(compactedSnapshot.compactionState, contextId, params.taskId);
    }

    this.logger?.info(
      { contextId, taskId: params.taskId, tokens: compactedSnapshot.tokenEstimate, contextHash },
      "Built and persisted context snapshot"
    );

    return compactedSnapshot;
  }

  getContextSnapshot(contextId: string): ContextSnapshot | null {
    return this.store.getContextSnapshot(contextId);
  }

  getSnapshot(contextId: string): ContextSnapshot | null {
    return this.store.getContextSnapshot(contextId);
  }

  getLatestContext(taskId: string): ContextSnapshot | null {
    return this.store.getLatestContextSnapshot(taskId);
  }
}
