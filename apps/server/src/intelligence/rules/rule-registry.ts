import crypto from "node:crypto";
import {
  type GlobalRule,
  type RuleScope,
  type RuleStatus,
  type RulePriority,
  type RuleConflictReport,
  RULE_PRIORITY_RANK,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import type { Logger } from "@localbridge/shared";

export class GlobalRuleRegistry {
  constructor(
    private readonly store: IntelligenceStore,
    private readonly logger?: Logger
  ) {}

  addRule(params: {
    ruleId?: string;
    name: string;
    content: string;
    scope?: RuleScope;
    scopeId?: string;
    priority?: RulePriority;
    tags?: string[];
    provenance?: { source: string; author?: string; importedFrom?: string };
  }): GlobalRule {
    const id = params.ruleId || `rule_${crypto.randomUUID()}`;
    const priority = params.priority || "USER_GLOBAL";
    const rank = RULE_PRIORITY_RANK[priority] ?? 60;
    const now = Date.now();

    // Conflict check against higher priority rules
    const conflict = this.detectConflicts({
      name: params.name,
      content: params.content,
      priority,
      scope: params.scope || "GLOBAL",
      scopeId: params.scopeId,
    });

    if (conflict.hasConflict) {
      this.logger?.warn(
        { conflicts: conflict.conflicts, ruleName: params.name },
        "Rule conflict detected with higher priority rule"
      );
    }

    const rule: GlobalRule = {
      ruleId: id,
      name: params.name,
      content: params.content,
      scope: params.scope || "GLOBAL",
      scopeId: params.scopeId,
      priority,
      priorityRank: rank,
      status: "ACTIVE",
      version: 1,
      tags: params.tags || [],
      provenance: params.provenance || { source: "user" },
      createdAt: now,
      updatedAt: now,
    };

    return this.store.saveRule(rule);
  }

  getRule(ruleId: string): GlobalRule | null {
    return this.store.getRule(ruleId);
  }

  updateRule(ruleId: string, params: Partial<GlobalRule>): GlobalRule {
    const existing = this.store.getRule(ruleId);
    if (!existing) {
      throw new Error(`Rule '${ruleId}' not found`);
    }
    const cleanParams: Partial<GlobalRule> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) {
        (cleanParams as any)[k] = v;
      }
    }
    const updated: GlobalRule = {
      ...existing,
      ...cleanParams,
      ruleId,
      updatedAt: Date.now(),
    };
    return this.store.saveRule(updated);
  }

  listRules(filter?: { scope?: RuleScope; scopeId?: string; status?: RuleStatus }): GlobalRule[] {
    return this.store.listRules(filter);
  }

  deleteRule(ruleId: string): boolean {
    const existing = this.store.getRule(ruleId);
    if (existing?.priority === "SYSTEM") {
      throw new Error(`Cannot delete SYSTEM rule '${ruleId}'; system rules are immutable.`);
    }
    return this.store.deleteRule(ruleId);
  }

  toggleRule(ruleId: string, enabled: boolean): boolean {
    const existing = this.store.getRule(ruleId);
    if (existing?.priority === "SYSTEM" && !enabled) {
      throw new Error(`Cannot disable SYSTEM rule '${ruleId}'; system rules are mandatory.`);
    }
    return this.store.toggleRule(ruleId, enabled);
  }

  /**
   * Conflict Detection Engine:
   * Compares the candidate rule content and directives against existing active rules.
   * If a lower priority rule contradicts a higher priority rule, the higher priority rule always wins.
   */
  detectConflicts(candidate: {
    name: string;
    content: string;
    priority: RulePriority;
    scope: RuleScope;
    scopeId?: string;
  }): RuleConflictReport {
    const activeRules = this.store.listRules({ status: "ACTIVE" });
    const conflicts: RuleConflictReport["conflicts"] = [];
    const candRank = RULE_PRIORITY_RANK[candidate.priority] ?? 50;

    const candLower = candidate.content.toLowerCase();
    const isCandForbid = /(?:forbidden|cannot|must not|prohibited|never|disallow|deny)/i.test(candLower);
    const isCandAllow = /(?:allowed|can|permit|must allow|auto|always)/i.test(candLower);

    for (const rule of activeRules) {
      const ruleRank = rule.priorityRank;
      const ruleLower = rule.content.toLowerCase();
      const isRuleForbid = /(?:forbidden|cannot|must not|prohibited|never|disallow|deny)/i.test(ruleLower);
      const isRuleAllow = /(?:allowed|can|permit|must allow|auto|always)/i.test(ruleLower);

      // Check subject overlap (e.g. both talking about delete, tmp, execute, outside, etc.)
      const sharedWords = ["delete", "remove", "outside", "shell", "exec", "write", "network", "token"];
      const hasTopicOverlap = sharedWords.some((w) => candLower.includes(w) && ruleLower.includes(w));

      if (hasTopicOverlap && ((isCandForbid && isRuleAllow) || (isCandAllow && isRuleForbid))) {
        const winningPriority = ruleRank >= candRank ? rule.priority : candidate.priority;
        const winningRuleId = ruleRank >= candRank ? rule.ruleId : "candidate";
        conflicts.push({
          ruleAId: candidate.name,
          ruleBId: rule.ruleId,
          reason: `Contradictory directives regarding '${candidate.name}' vs '${rule.name}'. Higher priority (${winningPriority}) wins.`,
          winningRuleId,
          winningPriority,
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  exportRules(): GlobalRule[] {
    return this.store.listRules();
  }

  importRules(rules: GlobalRule[]): { imported: number; conflicts: number } {
    let imported = 0;
    let conflicts = 0;

    for (const r of rules) {
      const rep = this.detectConflicts({
        name: r.name,
        content: r.content,
        priority: r.priority,
        scope: r.scope,
        scopeId: r.scopeId,
      });
      if (rep.hasConflict) conflicts++;
      this.store.saveRule(r);
      imported++;
    }

    return { imported, conflicts };
  }
}
