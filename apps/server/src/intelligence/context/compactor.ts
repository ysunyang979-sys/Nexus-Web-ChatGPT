import crypto from "node:crypto";
import type {
  ContextCompactionState,
  ContextSnapshot,
} from "@localbridge/protocol";

export class ContextCompactor {
  /**
   * Deterministic token estimator (~4 characters per token on average).
   */
  estimateTokens(textOrObj: any): number {
    const str = typeof textOrObj === "string" ? textOrObj : JSON.stringify(textOrObj);
    return Math.ceil(str.length / 4);
  }

  /**
   * Deterministic Context Compaction (Zero-LLM dependency):
   * Preserves: Goal, Current Step, Pending Steps, Important Decisions, Relevant Memory IDs,
   *            Active Rules, Active Skills, Checkpoint, Ledger Cursor, Errors.
   * Compresses: Old action details, redundant tool output, completed intermediate states.
   */
  compact(snapshot: ContextSnapshot, maxTokens = 8000): { compactedSnapshot: ContextSnapshot; state: ContextCompactionState } {
    const originalTokens = snapshot.tokenEstimate;
    if (originalTokens <= maxTokens) {
      const state: ContextCompactionState = {
        compactionId: `cmp_${crypto.randomUUID()}`,
        originalTokenEstimate: originalTokens,
        compactedTokenEstimate: originalTokens,
        compactionBoundaryStep: snapshot.recentActions.length,
        preservedGoal: snapshot.goal || "",
        preservedStepCount: snapshot.recentActions.length,
        preservedMemoryIds: snapshot.memories.map((m) => m.id),
        preservedRuleIds: snapshot.rules.map((r) => r.ruleId),
        preservedSkillVersions: Object.fromEntries(snapshot.skills.map((s) => [s.skillId, s.version])),
        compactedActionSummary: "No compaction needed; under token threshold",
        compactedAt: Date.now(),
        version: 1,
      };
      return { compactedSnapshot: snapshot, state };
    }

    const compactionId = `cmp_${crypto.randomUUID()}`;
    const totalActions = snapshot.recentActions.length;
    // Keep the most recent 3 actions in full detail; summarize the older actions
    const keepTailCount = Math.min(3, totalActions);
    const boundaryStep = totalActions - keepTailCount;
    const oldActions = snapshot.recentActions.slice(0, boundaryStep);
    const recentActions = snapshot.recentActions.slice(boundaryStep);

    // Formulate deterministic summary of old actions
    const oldActionsByTool: Record<string, { ok: number; fail: number }> = {};
    for (const a of oldActions) {
      const entry = oldActionsByTool[a.toolName] || { ok: 0, fail: 0 };
      oldActionsByTool[a.toolName] = entry;
      if (a.status === "COMMITTED" || a.status === "VERIFIED") {
        entry.ok++;
      } else {
        entry.fail++;
      }
    }

    const summaryParts = Object.entries(oldActionsByTool).map(
      ([tool, counts]) => `${tool}: ${counts.ok} succeeded, ${counts.fail} failed`
    );
    const compactedActionSummary = boundaryStep > 0
      ? `Compacted steps 1 to ${boundaryStep}: [${summaryParts.join("; ")}]`
      : "No previous steps to compact";

    // Filter memories: keep only high importance memories (importance >= 7) or top 5
    const prioritizedMemories = snapshot.memories
      .filter((m) => m.importance >= 7)
      .slice(0, 5);

    // Filter documents: keep only filename and compact summary
    const compactedDocs = snapshot.documents.map((d) => ({
      documentId: d.documentId,
      filename: d.filename,
      summary: d.summary ? d.summary.slice(0, 100) : undefined,
    }));

    // Filter rules if necessary: ALWAYS keep SYSTEM & CORE (rank >= 80), trim others if over budget
    let preservedRules = snapshot.rules;
    const testDraft = {
      ...snapshot,
      memories: prioritizedMemories,
      documents: compactedDocs,
      recentActions,
    };
    if (this.estimateTokens(testDraft) > maxTokens) {
      preservedRules = snapshot.rules.filter((r) => r.priorityRank >= 80);
    }

    const nextCurrentState: Record<string, any> = { ...snapshot.currentState };
    if (boundaryStep > 0) {
      nextCurrentState._compactedActionSummary = compactedActionSummary;
      nextCurrentState._compactionBoundaryStep = boundaryStep;
    }

    const compactedSnapshot: ContextSnapshot = {
      ...snapshot,
      rules: preservedRules,
      memories: prioritizedMemories,
      documents: compactedDocs,
      recentActions,
      currentState: nextCurrentState,
      tokenEstimate: 0, // Recalculated below
    };

    compactedSnapshot.tokenEstimate = this.estimateTokens(compactedSnapshot);

    const state: ContextCompactionState = {
      compactionId,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: compactedSnapshot.tokenEstimate,
      compactionBoundaryStep: boundaryStep,
      preservedGoal: snapshot.goal || "",
      preservedStepCount: totalActions,
      preservedMemoryIds: prioritizedMemories.map((m) => m.id),
      preservedRuleIds: preservedRules.map((r) => r.ruleId),
      preservedSkillVersions: Object.fromEntries(snapshot.skills.map((s) => [s.skillId, s.version])),
      compactedActionSummary,
      compactedAt: Date.now(),
      version: 1,
    };

    compactedSnapshot.compactionState = state;
    return { compactedSnapshot, state };
  }
}
