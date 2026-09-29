import type Database from "better-sqlite3";
import crypto from "node:crypto";
import type {
  VersionedSkillRecord,
  SkillVersion,
  AiSkillCandidate,
  SkillValidationReport,
  SkillStatusType,
  SkillSourceType,
  EnhancedMemoryEntry,
  EnhancedMemoryScope,
  MemoryType,
  MemoryRecallParams,
  MemoryCandidate,
  MemoryCandidateStatus,
  GlobalRule,
  RuleScope,
  RuleStatus,
  RulePriority,
  KnowledgeDocument,
  KnowledgeImportResult,
  KnowledgeType,
  ContextSnapshot,
  ContextCompactionState,
} from "@localbridge/protocol";
import { RULE_PRIORITY_RANK } from "@localbridge/protocol";
import { LocalStorageEngine } from "./storage/index.js";

export class IntelligenceStore {
  private storageEngine?: LocalStorageEngine;

  constructor(
    private readonly db: Database.Database,
    storageEngine?: LocalStorageEngine
  ) {
    if (storageEngine) {
      this.storageEngine = storageEngine;
    } else {
      let customPath: string | undefined;
      try {
        const row = this.db
          .prepare("SELECT value FROM system_settings WHERE key = 'intelligence_storage_path'")
          .get() as any;
        if (row?.value) {
          customPath = row.value;
        }
      } catch {}
      this.storageEngine = new LocalStorageEngine(customPath);
      this.storageEngine.initialize();
    }
  }

  public getStorageEngine(): LocalStorageEngine {
    if (!this.storageEngine) {
      this.storageEngine = new LocalStorageEngine();
      this.storageEngine.initialize();
    }
    return this.storageEngine;
  }

  public setStorageEngine(engine: LocalStorageEngine): void {
    this.storageEngine = engine;
  }

  // ==========================================================================
  // 1. Skills & Versions
  // ==========================================================================

  saveSkill(skill: Omit<VersionedSkillRecord, "versions">): void {
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_skills (
        id, name, active_version, description, source, status, project_id, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        active_version = excluded.active_version,
        description = excluded.description,
        source = excluded.source,
        status = excluded.status,
        project_id = excluded.project_id,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      skill.skillId,
      skill.name,
      skill.activeVersion,
      skill.description,
      skill.source,
      skill.status,
      skill.projectId || null,
      JSON.stringify(skill.tags || []),
      skill.createdAt || Date.now(),
      skill.updatedAt || Date.now()
    );

    this.getStorageEngine().writeSkill(skill);
  }

  saveSkillVersion(version: SkillVersion): void {
    const versionId = `${version.skillId}::${version.version}`;
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_skill_versions (
        id, skill_id, version, name, description, capabilities_json, steps_json,
        tools_json, parameters_json, preconditions_json, success_conditions_json,
        error_handling_json, dependencies_json, instructions, source, hash,
        changelog, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(skill_id, version) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        capabilities_json = excluded.capabilities_json,
        steps_json = excluded.steps_json,
        tools_json = excluded.tools_json,
        parameters_json = excluded.parameters_json,
        preconditions_json = excluded.preconditions_json,
        success_conditions_json = excluded.success_conditions_json,
        error_handling_json = excluded.error_handling_json,
        dependencies_json = excluded.dependencies_json,
        instructions = excluded.instructions,
        source = excluded.source,
        hash = excluded.hash,
        changelog = excluded.changelog
    `);

    stmt.run(
      versionId,
      version.skillId,
      version.version,
      version.name,
      version.description,
      JSON.stringify(version.capabilities || []),
      JSON.stringify(version.steps || []),
      JSON.stringify(version.tools || []),
      JSON.stringify(version.parameters || {}),
      JSON.stringify(version.preconditions || []),
      JSON.stringify(version.successConditions || []),
      JSON.stringify(version.errorHandling || {}),
      JSON.stringify(version.dependencies || []),
      version.instructions || "",
      version.source || "USER_UPLOADED",
      version.hash,
      version.changelog || null,
      version.createdAt || Date.now()
    );

    this.getStorageEngine().writeSkillVersion(version);
  }

  getSkill(skillId: string): VersionedSkillRecord | null {
    const skillRow = this.db
      .prepare(`SELECT * FROM intelligence_skills WHERE id = ?`)
      .get(skillId) as any;
    if (!skillRow) return null;

    const versionRows = this.db
      .prepare(`SELECT * FROM intelligence_skill_versions WHERE skill_id = ? ORDER BY created_at DESC`)
      .all(skillId) as any[];

    const validationRow = this.db
      .prepare(`SELECT * FROM intelligence_skill_validations WHERE skill_id = ? ORDER BY validated_at DESC LIMIT 1`)
      .get(skillId) as any;

    return {
      skillId: skillRow.id,
      name: skillRow.name,
      activeVersion: skillRow.active_version,
      description: skillRow.description,
      source: skillRow.source as SkillSourceType,
      status: skillRow.status as SkillStatusType,
      projectId: skillRow.project_id || undefined,
      tags: JSON.parse(skillRow.tags_json || "[]"),
      versions: versionRows.map((v) => ({
        version: v.version,
        skillId: v.skill_id,
        name: v.name,
        description: v.description,
        capabilities: JSON.parse(v.capabilities_json || "[]"),
        steps: JSON.parse(v.steps_json || "[]"),
        tools: JSON.parse(v.tools_json || "[]"),
        parameters: JSON.parse(v.parameters_json || "{}"),
        preconditions: JSON.parse(v.preconditions_json || "[]"),
        successConditions: JSON.parse(v.success_conditions_json || "[]"),
        errorHandling: JSON.parse(v.error_handling_json || "{}"),
        dependencies: JSON.parse(v.dependencies_json || "[]"),
        instructions: v.instructions || "",
        source: v.source as SkillSourceType,
        hash: v.hash,
        changelog: v.changelog || undefined,
        createdAt: v.created_at,
      })),
      latestValidation: validationRow ? JSON.parse(validationRow.report_json) : undefined,
      createdAt: skillRow.created_at,
      updatedAt: skillRow.updated_at,
    };
  }

  listSkills(filter?: {
    projectId?: string;
    status?: SkillStatusType;
    source?: SkillSourceType;
  }): VersionedSkillRecord[] {
    let query = `SELECT * FROM intelligence_skills WHERE 1=1`;
    const params: any[] = [];

    if (filter?.status) {
      query += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.source) {
      query += ` AND source = ?`;
      params.push(filter.source);
    }
    if (filter?.projectId) {
      query += ` AND (project_id = ? OR project_id IS NULL)`;
      params.push(filter.projectId);
    }

    query += ` ORDER BY updated_at DESC`;
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.getSkill(r.id)!).filter(Boolean);
  }

  activateSkillVersion(skillId: string, version: string): boolean {
    const v = this.db
      .prepare(`SELECT 1 FROM intelligence_skill_versions WHERE skill_id = ? AND version = ?`)
      .get(skillId, version);
    if (!v) return false;

    this.db
      .prepare(`UPDATE intelligence_skills SET active_version = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?`)
      .run(version, Date.now(), skillId);
    return true;
  }

  rollbackSkillVersion(skillId: string, targetVersion: string): boolean {
    return this.activateSkillVersion(skillId, targetVersion);
  }

  deleteSkill(skillId: string): boolean {
    this.db.prepare(`DELETE FROM intelligence_skill_validations WHERE skill_id = ?`).run(skillId);
    this.db.prepare(`DELETE FROM intelligence_skill_versions WHERE skill_id = ?`).run(skillId);
    const res = this.db.prepare(`DELETE FROM intelligence_skills WHERE id = ?`).run(skillId);
    try {
      this.getStorageEngine().deleteSkill(skillId);
    } catch {}
    return res.changes > 0;
  }

  deleteSkillCandidate(candidateId: string): boolean {
    const res = this.db.prepare(`DELETE FROM intelligence_skill_candidates WHERE candidate_id = ?`).run(candidateId);
    try {
      this.getStorageEngine().deleteSkillCandidate(candidateId);
    } catch {}
    return res.changes > 0;
  }

  // Candidates
  saveSkillCandidate(cand: AiSkillCandidate): void {
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_skill_candidates (
        candidate_id, skill_id, name, description, proposed_by, extracted_steps_json,
        tools_json, parameters_json, preconditions_json, success_conditions_json,
        error_handling_json, dependencies_json, instructions, evidence_json, status,
        review_notes, reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(candidate_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        extracted_steps_json = excluded.extracted_steps_json,
        tools_json = excluded.tools_json,
        parameters_json = excluded.parameters_json,
        preconditions_json = excluded.preconditions_json,
        success_conditions_json = excluded.success_conditions_json,
        error_handling_json = excluded.error_handling_json,
        dependencies_json = excluded.dependencies_json,
        instructions = excluded.instructions,
        evidence_json = excluded.evidence_json,
        status = excluded.status,
        review_notes = excluded.review_notes,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      cand.candidateId,
      cand.skillId,
      cand.name,
      cand.description,
      cand.proposedBy || "WebAI/GPT",
      JSON.stringify(cand.extractedSteps || []),
      JSON.stringify(cand.tools || []),
      JSON.stringify(cand.parameters || {}),
      JSON.stringify(cand.preconditions || []),
      JSON.stringify(cand.successConditions || []),
      JSON.stringify(cand.errorHandling || {}),
      JSON.stringify(cand.dependencies || []),
      cand.instructions || "",
      JSON.stringify(cand.evidence || {}),
      cand.status || "CANDIDATE",
      cand.reviewNotes || null,
      cand.reviewedBy || null,
      cand.reviewedAt || null,
      cand.createdAt || Date.now(),
      cand.updatedAt || Date.now()
    );

    this.getStorageEngine().writeSkillCandidate(cand);
  }

  getSkillCandidate(candidateId: string): AiSkillCandidate | null {
    const r = this.db
      .prepare(`SELECT * FROM intelligence_skill_candidates WHERE candidate_id = ?`)
      .get(candidateId) as any;
    if (!r) return null;

    return {
      candidateId: r.candidate_id,
      skillId: r.skill_id,
      name: r.name,
      description: r.description,
      proposedBy: r.proposed_by,
      extractedSteps: JSON.parse(r.extracted_steps_json || "[]"),
      tools: JSON.parse(r.tools_json || "[]"),
      parameters: JSON.parse(r.parameters_json || "{}"),
      preconditions: JSON.parse(r.preconditions_json || "[]"),
      successConditions: JSON.parse(r.success_conditions_json || "[]"),
      errorHandling: JSON.parse(r.error_handling_json || "{}"),
      dependencies: JSON.parse(r.dependencies_json || "[]"),
      instructions: r.instructions || "",
      evidence: JSON.parse(r.evidence_json),
      status: r.status as SkillStatusType,
      reviewNotes: r.review_notes || undefined,
      reviewedBy: r.reviewed_by || undefined,
      reviewedAt: r.reviewed_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  listSkillCandidates(status?: SkillStatusType): AiSkillCandidate[] {
    let query = `SELECT candidate_id FROM intelligence_skill_candidates`;
    const params: any[] = [];
    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.getSkillCandidate(r.candidate_id)!).filter(Boolean);
  }

  reviewSkillCandidate(
    candidateId: string,
    status: SkillStatusType,
    notes?: string,
    reviewer?: string
  ): boolean {
    const res = this.db
      .prepare(
        `UPDATE intelligence_skill_candidates SET status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE candidate_id = ?`
      )
      .run(status, notes || null, reviewer || "user", Date.now(), Date.now(), candidateId);
    return res.changes > 0;
  }

  saveSkillValidation(report: SkillValidationReport): void {
    const id = `val_${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO intelligence_skill_validations (id, skill_id, version, validation_status, report_json, validated_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        report.skillId,
        report.version || null,
        report.validationStatus,
        JSON.stringify(report),
        report.validatedAt || Date.now()
      );
  }

  getSkillValidation(skillId: string): SkillValidationReport | null {
    const r = this.db
      .prepare(
        `SELECT report_json FROM intelligence_skill_validations WHERE skill_id = ? ORDER BY validated_at DESC LIMIT 1`
      )
      .get(skillId) as any;
    return r ? JSON.parse(r.report_json) : null;
  }

  // ==========================================================================
  // 2. Memory Runtime
  // ==========================================================================

  saveMemory(mem: EnhancedMemoryEntry): EnhancedMemoryEntry {
    const now = Date.now();
    const id = mem.id || `mem_${crypto.randomUUID()}`;
    const entry: EnhancedMemoryEntry = {
      ...mem,
      id,
      createdAt: mem.createdAt || now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO intelligence_memories (
        id, key, content, type, scope, scope_id, importance, confidence,
        source, provenance_json, version, relations_json, status, tags_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        type = excluded.type,
        scope = excluded.scope,
        scope_id = excluded.scope_id,
        importance = excluded.importance,
        confidence = excluded.confidence,
        source = excluded.source,
        provenance_json = excluded.provenance_json,
        version = intelligence_memories.version + 1,
        relations_json = excluded.relations_json,
        status = excluded.status,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      entry.id,
      entry.key,
      entry.content,
      entry.type,
      entry.scope,
      entry.scopeId || null,
      entry.importance,
      entry.confidence,
      entry.source,
      JSON.stringify(entry.provenance || {}),
      entry.version || 1,
      JSON.stringify(entry.relations || {}),
      entry.status || "ACTIVE",
      JSON.stringify(entry.tags || []),
      entry.createdAt,
      entry.updatedAt
    );

    this.getStorageEngine().writeMemory(entry);

    return entry;
  }

  getMemory(id: string): EnhancedMemoryEntry | null {
    const r = this.db.prepare(`SELECT * FROM intelligence_memories WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      key: r.key,
      content: r.content,
      type: r.type as MemoryType,
      scope: r.scope as EnhancedMemoryScope,
      scopeId: r.scope_id || undefined,
      importance: r.importance,
      confidence: r.confidence,
      source: r.source,
      provenance: JSON.parse(r.provenance_json || "{}"),
      version: r.version,
      relations: JSON.parse(r.relations_json || "{}"),
      status: r.status,
      tags: JSON.parse(r.tags_json || "[]"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  getMemoryByKey(key: string, scope: EnhancedMemoryScope, scopeId?: string): EnhancedMemoryEntry | null {
    let query = `SELECT id FROM intelligence_memories WHERE key = ? AND scope = ?`;
    const params: any[] = [key, scope];
    if (scopeId) {
      query += ` AND scope_id = ?`;
      params.push(scopeId);
    } else {
      query += ` AND scope_id IS NULL`;
    }
    query += ` AND status = 'ACTIVE' LIMIT 1`;
    const r = this.db.prepare(query).get(...params) as any;
    return r ? this.getMemory(r.id) : null;
  }

  recallMemories(params: MemoryRecallParams): { memories: EnhancedMemoryEntry[]; total: number } {
    let query = `SELECT * FROM intelligence_memories WHERE 1=1`;
    const sqlParams: any[] = [];

    if (!params.includeArchived) {
      query += ` AND status = 'ACTIVE'`;
    }
    if (params.scope) {
      query += ` AND scope = ?`;
      sqlParams.push(params.scope);
    }
    if (params.scopeId) {
      query += ` AND scope_id = ?`;
      sqlParams.push(params.scopeId);
    }
    if (params.type) {
      query += ` AND type = ?`;
      sqlParams.push(params.type);
    }
    if (params.minImportance !== undefined) {
      query += ` AND importance >= ?`;
      sqlParams.push(params.minImportance);
    }
    if (params.minConfidence !== undefined) {
      query += ` AND confidence >= ?`;
      sqlParams.push(params.minConfidence);
    }
    if (params.query) {
      query += ` AND (key LIKE ? OR content LIKE ? OR tags_json LIKE ?)`;
      const term = `%${params.query}%`;
      sqlParams.push(term, term, term);
    }
    if (params.tag) {
      query += ` AND tags_json LIKE ?`;
      sqlParams.push(`%"${params.tag}"%`);
    }

    // Sort by importance DESC, confidence DESC, updated_at DESC
    query += ` ORDER BY importance DESC, confidence DESC, updated_at DESC`;

    const allMatching = this.db.prepare(query).all(...sqlParams) as any[];
    const total = allMatching.length;
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    const slice = allMatching.slice(offset, offset + limit);

    const memories = slice.map((r) => ({
      id: r.id,
      key: r.key,
      content: r.content,
      type: r.type as MemoryType,
      scope: r.scope as EnhancedMemoryScope,
      scopeId: r.scope_id || undefined,
      importance: r.importance,
      confidence: r.confidence,
      source: r.source,
      provenance: JSON.parse(r.provenance_json || "{}"),
      version: r.version,
      relations: JSON.parse(r.relations_json || "{}"),
      status: r.status,
      tags: JSON.parse(r.tags_json || "[]"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { memories, total };
  }

  deleteMemory(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM intelligence_memories WHERE id = ?`).run(id);
    this.getStorageEngine().deleteMemory(id);
    return res.changes > 0;
  }

  archiveMemory(id: string): boolean {
    const res = this.db
      .prepare(`UPDATE intelligence_memories SET status = 'ARCHIVED', updated_at = ? WHERE id = ?`)
      .run(Date.now(), id);
    this.getStorageEngine().archiveMemory(id);
    return res.changes > 0;
  }

  // Memory Candidate
  saveMemoryCandidate(cand: MemoryCandidate): void {
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_memory_candidates (
        candidate_id, key, content, type, scope, scope_id, importance,
        confidence, source, provenance_json, tags_json, status, review_notes,
        reviewed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(candidate_id) DO UPDATE SET
        content = excluded.content,
        type = excluded.type,
        scope = excluded.scope,
        scope_id = excluded.scope_id,
        importance = excluded.importance,
        confidence = excluded.confidence,
        source = excluded.source,
        provenance_json = excluded.provenance_json,
        tags_json = excluded.tags_json,
        status = excluded.status,
        review_notes = excluded.review_notes,
        reviewed_at = excluded.reviewed_at
    `);

    stmt.run(
      cand.candidateId,
      cand.key,
      cand.content,
      cand.type,
      cand.scope,
      cand.scopeId || null,
      cand.importance,
      cand.confidence,
      cand.source,
      JSON.stringify(cand.provenance),
      JSON.stringify(cand.tags || []),
      cand.status || "CANDIDATE",
      cand.reviewNotes || null,
      cand.reviewedAt || null,
      cand.createdAt || Date.now()
    );

    this.getStorageEngine().writeMemoryCandidate(cand);
  }

  getMemoryCandidate(candidateId: string): MemoryCandidate | null {
    const r = this.db
      .prepare(`SELECT * FROM intelligence_memory_candidates WHERE candidate_id = ?`)
      .get(candidateId) as any;
    if (!r) return null;
    return {
      candidateId: r.candidate_id,
      key: r.key,
      content: r.content,
      type: r.type as MemoryType,
      scope: r.scope as EnhancedMemoryScope,
      scopeId: r.scope_id || undefined,
      importance: r.importance,
      confidence: r.confidence,
      source: r.source,
      provenance: JSON.parse(r.provenance_json),
      tags: JSON.parse(r.tags_json || "[]"),
      status: r.status as MemoryCandidateStatus,
      reviewNotes: r.review_notes || undefined,
      reviewedAt: r.reviewed_at || undefined,
      createdAt: r.created_at,
    };
  }

  listMemoryCandidates(filter?: MemoryCandidateStatus | { status?: MemoryCandidateStatus }): MemoryCandidate[] {
    const status = typeof filter === "string" ? filter : filter?.status;
    let query = `SELECT candidate_id FROM intelligence_memory_candidates`;
    const params: any[] = [];
    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;
    const rows = (params.length > 0 ? this.db.prepare(query).all(...params) : this.db.prepare(query).all()) as any[];
    return rows.map((r) => this.getMemoryCandidate(r.candidate_id)!).filter(Boolean);
  }

  acceptMemoryCandidate(candidateId: string, reviewNotes?: string): EnhancedMemoryEntry | null {
    const cand = this.getMemoryCandidate(candidateId);
    if (!cand) return null;

    // Save as formal memory
    const entry: EnhancedMemoryEntry = {
      id: `mem_${cand.candidateId.replace(/^cand_/, "")}`,
      key: cand.key,
      content: cand.content,
      type: cand.type,
      scope: cand.scope,
      scopeId: cand.scopeId,
      importance: cand.importance,
      confidence: cand.confidence,
      source: cand.source,
      provenance: cand.provenance,
      version: 1,
      relations: { relatedMemoryIds: [], conflictsWith: [], supersedes: [] },
      status: "ACTIVE",
      tags: cand.tags,
      createdAt: cand.createdAt,
      updatedAt: Date.now(),
    };

    this.saveMemory(entry);

    // Update candidate status to ACCEPTED
    this.db
      .prepare(
        `UPDATE intelligence_memory_candidates SET status = 'ACCEPTED', review_notes = ?, reviewed_at = ? WHERE candidate_id = ?`
      )
      .run(reviewNotes || "Accepted by user", Date.now(), candidateId);

    return entry;
  }

  rejectMemoryCandidate(candidateId: string, reviewNotes?: string): boolean {
    const res = this.db
      .prepare(
        `UPDATE intelligence_memory_candidates SET status = 'REJECTED', review_notes = ?, reviewed_at = ? WHERE candidate_id = ?`
      )
      .run(reviewNotes || "Rejected", Date.now(), candidateId);
    return res.changes > 0;
  }

  deleteMemoryCandidate(candidateId: string): boolean {
    const res = this.db.prepare(`DELETE FROM intelligence_memory_candidates WHERE candidate_id = ?`).run(candidateId);
    return res.changes > 0;
  }

  // ==========================================================================
  // 3. Global Rule Registry
  // ==========================================================================

  saveRule(rule: GlobalRule): GlobalRule {
    const now = Date.now();
    const id = rule.ruleId || `rule_${crypto.randomUUID()}`;
    const rank = rule.priorityRank ?? (RULE_PRIORITY_RANK as any)[rule.priority] ?? 60;

    const entry: GlobalRule = {
      ...rule,
      ruleId: id,
      priorityRank: rank,
      createdAt: rule.createdAt || now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO intelligence_rules (
        rule_id, name, content, scope, scope_id, priority, priority_rank,
        status, version, tags_json, provenance_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rule_id) DO UPDATE SET
        name = excluded.name,
        content = excluded.content,
        scope = excluded.scope,
        scope_id = excluded.scope_id,
        priority = excluded.priority,
        priority_rank = excluded.priority_rank,
        status = excluded.status,
        version = intelligence_rules.version + 1,
        tags_json = excluded.tags_json,
        provenance_json = excluded.provenance_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      entry.ruleId,
      entry.name,
      entry.content,
      entry.scope,
      entry.scopeId || null,
      entry.priority,
      entry.priorityRank,
      entry.status || "ACTIVE",
      entry.version || 1,
      JSON.stringify(entry.tags || []),
      JSON.stringify(entry.provenance || { source: "user" }),
      entry.createdAt,
      entry.updatedAt
    );

    return entry;
  }

  getRule(ruleId: string): GlobalRule | null {
    const r = this.db.prepare(`SELECT * FROM intelligence_rules WHERE rule_id = ?`).get(ruleId) as any;
    if (!r) return null;
    return {
      ruleId: r.rule_id,
      name: r.name,
      content: r.content,
      scope: r.scope as RuleScope,
      scopeId: r.scope_id || undefined,
      priority: r.priority as RulePriority,
      priorityRank: r.priority_rank,
      status: r.status as RuleStatus,
      version: r.version,
      tags: JSON.parse(r.tags_json || "[]"),
      provenance: JSON.parse(r.provenance_json || "{}"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  listRules(filter?: { scope?: RuleScope; scopeId?: string; status?: RuleStatus }): GlobalRule[] {
    let query = `SELECT * FROM intelligence_rules WHERE 1=1`;
    const params: any[] = [];
    if (filter?.status) {
      query += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.scope) {
      query += ` AND scope = ?`;
      params.push(filter.scope);
    }
    if (filter?.scopeId) {
      query += ` AND (scope_id = ? OR scope_id IS NULL)`;
      params.push(filter.scopeId);
    }

    // High priority rank first (SYSTEM=100 > CORE=80 > USER=60)
    query += ` ORDER BY priority_rank DESC, updated_at DESC`;
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      ruleId: r.rule_id,
      name: r.name,
      content: r.content,
      scope: r.scope as RuleScope,
      scopeId: r.scope_id || undefined,
      priority: r.priority as RulePriority,
      priorityRank: r.priority_rank,
      status: r.status as RuleStatus,
      version: r.version,
      tags: JSON.parse(r.tags_json || "[]"),
      provenance: JSON.parse(r.provenance_json || "{}"),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  deleteRule(ruleId: string): boolean {
    const res = this.db.prepare(`DELETE FROM intelligence_rules WHERE rule_id = ?`).run(ruleId);
    return res.changes > 0;
  }

  toggleRule(ruleId: string, enabled: boolean): boolean {
    const status: RuleStatus = enabled ? "ACTIVE" : "DISABLED";
    const res = this.db
      .prepare(`UPDATE intelligence_rules SET status = ?, updated_at = ? WHERE rule_id = ?`)
      .run(status, Date.now(), ruleId);
    return res.changes > 0;
  }

  // ==========================================================================
  // 4. Knowledge Documents & Import History
  // ==========================================================================

  saveDocument(doc: KnowledgeDocument): void {
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_documents (
        document_id, filename, file_hash, mime_type, size_bytes, source,
        content_reference, text_summary, tags_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        filename = excluded.filename,
        text_summary = excluded.text_summary,
        tags_json = excluded.tags_json,
        metadata_json = excluded.metadata_json
    `);

    stmt.run(
      doc.documentId,
      doc.filename,
      doc.fileHash,
      doc.mimeType,
      doc.sizeBytes,
      doc.source || "upload",
      doc.contentReference || null,
      doc.textSummary || null,
      JSON.stringify(doc.tags || []),
      JSON.stringify(doc.metadata || {}),
      doc.createdAt || Date.now()
    );

    this.getStorageEngine().writeDocument(doc);
  }

  deleteDocument(documentId: string): boolean {
    const res = this.db.prepare(`DELETE FROM intelligence_documents WHERE document_id = ?`).run(documentId);
    this.getStorageEngine().deleteDocument(documentId);
    return res.changes > 0;
  }

  getDocument(documentId: string): KnowledgeDocument | null {
    const r = this.db.prepare(`SELECT * FROM intelligence_documents WHERE document_id = ?`).get(documentId) as any;
    if (!r) return null;
    return {
      documentId: r.document_id,
      filename: r.filename,
      fileHash: r.file_hash,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      source: r.source,
      contentReference: r.content_reference || undefined,
      textSummary: r.text_summary || undefined,
      tags: JSON.parse(r.tags_json || "[]"),
      metadata: JSON.parse(r.metadata_json || "{}"),
      createdAt: r.created_at,
    };
  }

  getDocumentByHash(hash: string): KnowledgeDocument | null {
    const r = this.db.prepare(`SELECT document_id FROM intelligence_documents WHERE file_hash = ? LIMIT 1`).get(hash) as any;
    return r ? this.getDocument(r.document_id) : null;
  }

  listDocuments(filter?: { tag?: string; search?: string; limit?: number; offset?: number }): KnowledgeDocument[] {
    let query = `SELECT * FROM intelligence_documents WHERE 1=1`;
    const params: any[] = [];
    if (filter?.search) {
      query += ` AND (filename LIKE ? OR text_summary LIKE ?)`;
      const term = `%${filter.search}%`;
      params.push(term, term);
    }
    if (filter?.tag) {
      query += ` AND tags_json LIKE ?`;
      params.push(`%"${filter.tag}"%`);
    }
    query += ` ORDER BY created_at DESC`;
    if (filter?.limit) {
      query += ` LIMIT ?`;
      params.push(filter.limit);
      if (filter?.offset) {
        query += ` OFFSET ?`;
        params.push(filter.offset);
      }
    }
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      documentId: r.document_id,
      filename: r.filename,
      fileHash: r.file_hash,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      source: r.source,
      contentReference: r.content_reference || undefined,
      textSummary: r.text_summary || undefined,
      tags: JSON.parse(r.tags_json || "[]"),
      metadata: JSON.parse(r.metadata_json || "{}"),
      createdAt: r.created_at,
    }));
  }

  recordImport(res: KnowledgeImportResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO intelligence_knowledge_imports (
        import_id, file_hash, filename, mime_type, detected_type, explicit_type,
        source, result, registered_id, registered_count, errors_json, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(import_id) DO UPDATE SET
        result = excluded.result,
        registered_id = excluded.registered_id,
        registered_count = excluded.registered_count,
        errors_json = excluded.errors_json,
        warnings_json = excluded.warnings_json
    `);

    stmt.run(
      res.importId,
      res.fileHash,
      res.filename,
      res.mimeType,
      res.detectedType,
      res.explicitType || null,
      res.source,
      res.result,
      res.registeredId || null,
      res.registeredCount || 1,
      JSON.stringify(res.errors || []),
      JSON.stringify(res.warnings || []),
      res.createdAt || Date.now()
    );

    this.getStorageEngine().writeImport(res);
  }

  getImportByHash(hash: string): KnowledgeImportResult | null {
    const r = this.db
      .prepare(`SELECT * FROM intelligence_knowledge_imports WHERE file_hash = ? ORDER BY created_at DESC LIMIT 1`)
      .get(hash) as any;
    if (!r) return null;
    return {
      importId: r.import_id,
      fileHash: r.file_hash,
      filename: r.filename,
      mimeType: r.mime_type,
      detectedType: r.detected_type as KnowledgeType,
      explicitType: r.explicit_type ? (r.explicit_type as KnowledgeType) : undefined,
      source: r.source,
      result: r.result,
      registeredId: r.registered_id || undefined,
      registeredCount: r.registered_count,
      errors: JSON.parse(r.errors_json || "[]"),
      warnings: JSON.parse(r.warnings_json || "[]"),
      createdAt: r.created_at,
    };
  }

  listImports(): KnowledgeImportResult[] {
    const rows = this.db
      .prepare(`SELECT * FROM intelligence_knowledge_imports ORDER BY created_at DESC LIMIT 100`)
      .all() as any[];
    return rows.map((r) => ({
      importId: r.import_id,
      fileHash: r.file_hash,
      filename: r.filename,
      mimeType: r.mime_type,
      detectedType: r.detected_type as KnowledgeType,
      explicitType: r.explicit_type ? (r.explicit_type as KnowledgeType) : undefined,
      source: r.source,
      result: r.result,
      registeredId: r.registered_id || undefined,
      registeredCount: r.registered_count,
      errors: JSON.parse(r.errors_json || "[]"),
      warnings: JSON.parse(r.warnings_json || "[]"),
      createdAt: r.created_at,
    }));
  }

  // ==========================================================================
  // 5. Context Snapshots & Compaction
  // ==========================================================================

  saveContextSnapshot(rawSnapshot: any): void {
    let snapshot: ContextSnapshot = rawSnapshot;
    let compactionState: any = null;
    if (rawSnapshot?.compactedSnapshot) {
      snapshot = rawSnapshot.compactedSnapshot;
      compactionState = rawSnapshot.state;
    }
    const contextId = snapshot.contextId || `ctx_${crypto.randomUUID()}`;
    snapshot.contextId = contextId;
    if (compactionState && !(snapshot as any).compactionState) {
      (snapshot as any).compactionState = compactionState;
    }

    const stmt = this.db.prepare(`
      INSERT INTO intelligence_context_snapshots (
        context_id, task_id, session_id, project_id, goal, snapshot_json, token_estimate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        token_estimate = excluded.token_estimate
    `);

    stmt.run(
      contextId,
      snapshot.taskId || null,
      snapshot.sessionId || null,
      snapshot.projectId || null,
      snapshot.goal || null,
      JSON.stringify(snapshot),
      snapshot.tokenEstimate || 0,
      snapshot.createdAt || Date.now()
    );

    this.getStorageEngine().writeContextSnapshot(snapshot);
  }

  deleteContextSnapshot(contextId: string): boolean {
    let changes = 0;
    if (!contextId || contextId === "null" || contextId === "undefined") {
      const res = this.db.prepare(`DELETE FROM intelligence_context_snapshots WHERE context_id IS NULL OR context_id = ''`).run();
      changes += res.changes;
    } else {
      let res = this.db.prepare(`DELETE FROM intelligence_context_snapshots WHERE context_id = ?`).run(contextId);
      changes += res.changes;

      if (res.changes === 0 && contextId.startsWith("ctx_legacy_")) {
        const rowId = parseInt(contextId.replace("ctx_legacy_", ""), 10);
        if (!isNaN(rowId)) {
          const legacyRes = this.db.prepare(`DELETE FROM intelligence_context_snapshots WHERE rowid = ?`).run(rowId);
          changes += legacyRes.changes;
        }
      }

      if (changes === 0) {
        // Fallback: search inside snapshot_json
        const jsonMatchRes = this.db.prepare(
          `DELETE FROM intelligence_context_snapshots WHERE snapshot_json LIKE ?`
        ).run(`%"contextId":"${contextId}"%`);
        changes += jsonMatchRes.changes;
      }
    }

    this.getStorageEngine().deleteContextSnapshot(contextId);
    return changes > 0;
  }

  listContextSnapshots(limit = 50): ContextSnapshot[] {
    const rows = this.db
      .prepare(`SELECT rowid, context_id, snapshot_json FROM intelligence_context_snapshots ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as any[];

    const snapshots: ContextSnapshot[] = [];

    for (const r of rows) {
      try {
        let parsed = JSON.parse(r.snapshot_json);
        if (parsed.compactedSnapshot) {
          const inner = parsed.compactedSnapshot;
          if (parsed.state && !inner.compactionState) {
            inner.compactionState = parsed.state;
          }
          parsed = inner;
        }

        const effectiveId = parsed.contextId || r.context_id || `ctx_legacy_${r.rowid}`;
        parsed.contextId = effectiveId;

        // Auto-heal DB row if context_id was null
        if (!r.context_id) {
          try {
            this.db.prepare(`
              UPDATE intelligence_context_snapshots 
              SET context_id = ?, goal = ?, token_estimate = ?, snapshot_json = ? 
              WHERE rowid = ?
            `).run(effectiveId, parsed.goal || null, parsed.tokenEstimate || 0, JSON.stringify(parsed), r.rowid);
          } catch {}
        }

        snapshots.push(parsed);
      } catch {}
    }

    return snapshots;
  }

  getContextSnapshot(contextId: string): ContextSnapshot | null {
    const r = this.db
      .prepare(`SELECT snapshot_json FROM intelligence_context_snapshots WHERE context_id = ?`)
      .get(contextId) as any;
    return r ? JSON.parse(r.snapshot_json) : null;
  }

  getLatestContextSnapshot(taskId: string): ContextSnapshot | null {
    const r = this.db
      .prepare(
        `SELECT snapshot_json FROM intelligence_context_snapshots WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(taskId) as any;
    return r ? JSON.parse(r.snapshot_json) : null;
  }

  saveCompaction(compaction: ContextCompactionState, contextId: string, taskId?: string): void {
    this.db
      .prepare(`
        INSERT INTO intelligence_context_compactions (
          compaction_id, context_id, task_id, original_tokens, compacted_tokens, compaction_state_json, compacted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(compaction_id) DO NOTHING
      `)
      .run(
        compaction.compactionId,
        contextId,
        taskId || null,
        compaction.originalTokenEstimate,
        compaction.compactedTokenEstimate,
        JSON.stringify(compaction),
        compaction.compactedAt || Date.now()
      );

    this.getStorageEngine().writeCompaction(compaction, contextId);
  }

  getCompaction(compactionId: string): ContextCompactionState | null {
    const r = this.db
      .prepare(`SELECT compaction_state_json FROM intelligence_context_compactions WHERE compaction_id = ?`)
      .get(compactionId) as any;
    return r ? JSON.parse(r.compaction_state_json) : null;
  }
}
