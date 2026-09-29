import { z } from "zod";

// ============================================================================
// 1. Skill Runtime Schemas
// ============================================================================

export const SkillSourceEnum = z.enum(["BUILT_IN", "USER_UPLOADED", "AI_GENERATED"]);
export type SkillSourceType = z.infer<typeof SkillSourceEnum>;

export const SkillStatusEnum = z.enum([
  "DRAFT",
  "GENERATED",
  "CANDIDATE",
  "VALIDATING",
  "ACTIVE",
  "DISABLED",
  "REJECTED",
  "DEPRECATED",
]);
export type SkillStatusType = z.infer<typeof SkillStatusEnum>;

export const SkillStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  actionName: z.string(),
  toolName: z.string(),
  description: z.string(),
  paramsTemplate: z.record(z.any()).optional(),
  preconditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
});
export type SkillStep = z.infer<typeof SkillStepSchema>;

export const SkillVersionSchema = z.object({
  version: z.string(), // SemVer e.g. "1.0.0"
  skillId: z.string(),
  name: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()).default([]),
  steps: z.array(SkillStepSchema).default([]),
  tools: z.array(z.string()).default([]),
  parameters: z.record(z.any()).default({}),
  preconditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
  errorHandling: z.record(z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  instructions: z.string().default(""),
  source: SkillSourceEnum.default("USER_UPLOADED"),
  hash: z.string(),
  changelog: z.string().optional(),
  createdAt: z.number(),
});
export type SkillVersion = z.infer<typeof SkillVersionSchema>;

export const AiSkillCandidateEvidenceSchema = z.object({
  whySkill: z.string(),
  sourceTaskId: z.string(),
  sourceSessionId: z.string().optional(),
  actionIds: z.array(z.string()).default([]),
  executionIds: z.array(z.string()).default([]),
  toolNames: z.array(z.string()).default([]),
  executionResults: z.record(z.any()).default({}),
  successCount: z.number().int().nonnegative().default(0),
  failureCount: z.number().int().nonnegative().default(0),
  executionCount: z.number().int().nonnegative().optional(),
  tasks: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
});
export type AiSkillCandidateEvidence = z.infer<typeof AiSkillCandidateEvidenceSchema>;

export const AiSkillCandidateSchema = z.object({
  candidateId: z.string(),
  skillId: z.string(),
  name: z.string(),
  description: z.string(),
  proposedBy: z.string().default("WebAI/GPT"),
  extractedSteps: z.array(SkillStepSchema).default([]),
  tools: z.array(z.string()).default([]),
  parameters: z.record(z.any()).default({}),
  preconditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
  errorHandling: z.record(z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  instructions: z.string().default(""),
  evidence: AiSkillCandidateEvidenceSchema,
  status: SkillStatusEnum.default("CANDIDATE"),
  reviewNotes: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type AiSkillCandidate = z.infer<typeof AiSkillCandidateSchema>;
export type SkillCandidateProposal = AiSkillCandidate;

export const SkillValidationReportSchema = z.object({
  skillId: z.string(),
  version: z.string().optional(),
  validationStatus: z.enum(["valid", "invalid", "warning"]),
  schemaValid: z.boolean(),
  dependenciesValid: z.boolean(),
  toolsValid: z.boolean(),
  parametersValid: z.boolean(),
  securityValid: z.boolean(),
  dryRunValid: z.boolean(),
  validationErrors: z.array(z.string()).default([]),
  validationWarnings: z.array(z.string()).default([]),
  validatedAt: z.number(),
  validatorVersion: z.string().default("1.0.0"),
});
export type SkillValidationReport = z.infer<typeof SkillValidationReportSchema>;

export const VersionedSkillRecordSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  activeVersion: z.string(),
  description: z.string(),
  source: SkillSourceEnum,
  status: SkillStatusEnum,
  tags: z.array(z.string()).default([]),
  projectId: z.string().optional(),
  versions: z.array(SkillVersionSchema).default([]),
  latestValidation: SkillValidationReportSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type VersionedSkillRecord = z.infer<typeof VersionedSkillRecordSchema>;

// ============================================================================
// 2. Memory Runtime Schemas
// ============================================================================

export const EnhancedMemoryScopeEnum = z.enum([
  "GLOBAL",
  "USER",
  "PROJECT",
  "SESSION",
  "TASK",
  "AGENT",
  "STEP",
]);
export type EnhancedMemoryScope = z.infer<typeof EnhancedMemoryScopeEnum>;

export const MemoryTypeEnum = z.enum([
  "FACT",
  "PREFERENCE",
  "EPISODIC",
  "SEMANTIC",
  "PROCEDURAL",
  "EXPERIENCE",
  "DECISION",
  "ARTIFACT",
  "ERROR",
  "SOLUTION",
]);
export type MemoryType = z.infer<typeof MemoryTypeEnum>;

export const MemorySourceEnum = z.enum([
  "USER",
  "AI",
  "CONVERSATION",
  "SKILL",
  "TASK",
  "ACTION",
  "PROJECT",
  "FILE",
  "IMPORT",
  "SYSTEM",
]);
export type MemorySource = z.infer<typeof MemorySourceEnum>;

export const MemoryStatusEnum = z.enum(["ACTIVE", "ARCHIVED", "FORGOTTEN"]);
export type MemoryStatus = z.infer<typeof MemoryStatusEnum>;

export const MemoryCandidateStatusEnum = z.enum([
  "GENERATED",
  "CANDIDATE",
  "REVIEW",
  "ACCEPTED",
  "PERSISTED",
  "REJECTED",
]);
export type MemoryCandidateStatus = z.infer<typeof MemoryCandidateStatusEnum>;

export const MemoryProvenanceSchema = z.object({
  source: MemorySourceEnum,
  skillId: z.string().optional(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  actionIds: z.array(z.string()).default([]),
  executionId: z.string().optional(),
  result: z.enum(["SUCCESS", "FAILURE", "PARTIAL", "UNKNOWN"]).optional(),
  evidence: z.string().optional(),
  observedPath: z.string().optional(),
  recoveryAction: z.string().optional(),
});
export type MemoryProvenance = z.infer<typeof MemoryProvenanceSchema>;

export const MemoryRelationsSchema = z.object({
  relatedMemoryIds: z.array(z.string()).default([]),
  conflictsWith: z.array(z.string()).default([]),
  supersedes: z.array(z.string()).default([]),
});
export type MemoryRelations = z.infer<typeof MemoryRelationsSchema>;

export const EnhancedMemoryEntrySchema = z.object({
  id: z.string(),
  key: z.string(),
  content: z.string(),
  type: MemoryTypeEnum.default("FACT"),
  scope: EnhancedMemoryScopeEnum.default("PROJECT"),
  scopeId: z.string().optional(),
  importance: z.number().min(0).max(10).default(5),
  confidence: z.number().min(0).max(1).default(1.0),
  source: MemorySourceEnum.default("USER"),
  provenance: MemoryProvenanceSchema.optional(),
  version: z.number().int().positive().default(1),
  relations: MemoryRelationsSchema.default({}),
  status: MemoryStatusEnum.default("ACTIVE"),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type EnhancedMemoryEntry = z.infer<typeof EnhancedMemoryEntrySchema>;

export const MemoryCandidateSchema = z.object({
  candidateId: z.string(),
  key: z.string(),
  content: z.string(),
  type: MemoryTypeEnum.default("EXPERIENCE"),
  scope: EnhancedMemoryScopeEnum.default("PROJECT"),
  scopeId: z.string().optional(),
  importance: z.number().min(0).max(10).default(5),
  confidence: z.number().min(0).max(1).default(0.8),
  source: MemorySourceEnum.default("ACTION"),
  provenance: MemoryProvenanceSchema,
  tags: z.array(z.string()).default([]),
  status: MemoryCandidateStatusEnum.default("CANDIDATE"),
  reviewNotes: z.string().optional(),
  reviewedAt: z.number().optional(),
  createdAt: z.number(),
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export const MemoryRecallParamsSchema = z.object({
  query: z.string().optional(),
  scope: EnhancedMemoryScopeEnum.optional(),
  scopeId: z.string().optional(),
  type: MemoryTypeEnum.optional(),
  tag: z.string().optional(),
  skillId: z.string().optional(),
  minImportance: z.number().min(0).max(10).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});
export type MemoryRecallParams = z.infer<typeof MemoryRecallParamsSchema>;

export const MemoryRecallResultSchema = z.object({
  memories: z.array(EnhancedMemoryEntrySchema),
  total: z.number().int().nonnegative(),
  query: z.string().optional(),
  recallReasoning: z.array(z.string()).default([]),
});
export type MemoryRecallResult = z.infer<typeof MemoryRecallResultSchema>;

// ============================================================================
// 3. Global Rule Registry Schemas
// ============================================================================

export const RulePriorityEnum = z.enum([
  "SYSTEM",
  "CORE_GLOBAL",
  "USER_GLOBAL",
  "PROJECT",
  "TASK",
  "SKILL",
]);
export type RulePriority = z.infer<typeof RulePriorityEnum>;

export const RULE_PRIORITY_RANK: Record<RulePriority, number> = {
  SYSTEM: 100,
  CORE_GLOBAL: 80,
  USER_GLOBAL: 60,
  PROJECT: 40,
  TASK: 20,
  SKILL: 10,
};

export const RuleScopeEnum = z.enum(["GLOBAL", "USER_GLOBAL", "PROJECT", "TASK", "SKILL"]);
export type RuleScope = z.infer<typeof RuleScopeEnum>;

export const RuleStatusEnum = z.enum(["ACTIVE", "DISABLED", "DEPRECATED"]);
export type RuleStatus = z.infer<typeof RuleStatusEnum>;

export const GlobalRuleSchema = z.object({
  ruleId: z.string(),
  name: z.string(),
  content: z.string(),
  scope: RuleScopeEnum.default("GLOBAL"),
  scopeId: z.string().optional(),
  priority: RulePriorityEnum.default("USER_GLOBAL"),
  priorityRank: z.number().int().default(60),
  status: RuleStatusEnum.default("ACTIVE"),
  version: z.number().int().positive().default(1),
  tags: z.array(z.string()).default([]),
  provenance: z
    .object({
      source: z.string().default("user"),
      author: z.string().optional(),
      importedFrom: z.string().optional(),
    })
    .default({ source: "user" }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type GlobalRule = z.infer<typeof GlobalRuleSchema>;

export const RuleConflictReportSchema = z.object({
  hasConflict: z.boolean(),
  conflicts: z
    .array(
      z.object({
        ruleAId: z.string(),
        ruleBId: z.string(),
        reason: z.string(),
        winningRuleId: z.string(),
        winningPriority: RulePriorityEnum,
      })
    )
    .default([]),
});
export type RuleConflictReport = z.infer<typeof RuleConflictReportSchema>;

// ============================================================================
// 4. Knowledge Import & Documents Schemas
// ============================================================================

export const KnowledgeTypeEnum = z.enum(["MEMORY", "RULE", "SKILL", "DOCUMENT"]);
export type KnowledgeType = z.infer<typeof KnowledgeTypeEnum>;

export const KnowledgeDocumentSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  fileHash: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  source: z.string().default("upload"),
  contentReference: z.string().optional(),
  textSummary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
  createdAt: z.number(),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const KnowledgeImportResultSchema = z.object({
  importId: z.string(),
  fileHash: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  detectedType: KnowledgeTypeEnum,
  explicitType: KnowledgeTypeEnum.optional(),
  source: z.string(),
  result: z.enum(["success", "partial", "failed", "duplicate"]),
  registeredId: z.string().optional(),
  registeredCount: z.number().int().nonnegative().default(1),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  createdAt: z.number(),
});
export type KnowledgeImportResult = z.infer<typeof KnowledgeImportResultSchema>;

// ============================================================================
// 5. Context Runtime & Compaction Schemas
// ============================================================================

export const ContextCompactionStateSchema = z.object({
  compactionId: z.string(),
  originalTokenEstimate: z.number().int().nonnegative(),
  compactedTokenEstimate: z.number().int().nonnegative(),
  compactionBoundaryStep: z.number().int().nonnegative(),
  preservedGoal: z.string(),
  preservedStepCount: z.number().int().nonnegative(),
  preservedMemoryIds: z.array(z.string()).default([]),
  preservedRuleIds: z.array(z.string()).default([]),
  preservedSkillVersions: z.record(z.string()).default({}),
  compactedActionSummary: z.string(),
  compactedAt: z.number(),
  version: z.number().int().positive().default(1),
});
export type ContextCompactionState = z.infer<typeof ContextCompactionStateSchema>;

export const ContextSnapshotSchema = z.object({
  contextId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
  goal: z.string().optional(),
  rules: z.array(GlobalRuleSchema).default([]),
  memories: z.array(EnhancedMemoryEntrySchema).default([]),
  skills: z
    .array(
      z.object({
        skillId: z.string(),
        version: z.string(),
        name: z.string(),
        stepsCount: z.number().int().nonnegative(),
      })
    )
    .default([]),
  documents: z
    .array(
      z.object({
        documentId: z.string(),
        filename: z.string(),
        summary: z.string().optional(),
      })
    )
    .default([]),
  currentState: z.record(z.any()).default({}),
  recentActions: z
    .array(
      z.object({
        actionId: z.string(),
        toolName: z.string(),
        status: z.string(),
        durationMs: z.number().optional(),
      })
    )
    .default([]),
  checkpoint: z
    .object({
      checkpointId: z.string(),
      step: z.number().int().nonnegative(),
    })
    .optional(),
  files: z.array(z.string()).default([]),
  tokenEstimate: z.number().int().nonnegative(),
  compactionState: ContextCompactionStateSchema.optional(),
  traceMetadata: z.object({
    usedMemoryIds: z.array(z.string()).default([]),
    usedRuleIds: z.array(z.string()).default([]),
    usedSkillVersions: z.record(z.string()).default({}),
    usedDocumentIds: z.array(z.string()).default([]),
    checkpointId: z.string().optional(),
    actionIds: z.array(z.string()).default([]),
    contextHash: z.string(),
  }),
  createdAt: z.number(),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

// ============================================================================
// 6. Intelligence MCP Tool Request Schemas
// ============================================================================

export const SkillCreateParamsSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default("1.0.0"),
  capabilities: z.array(z.string()).default([]),
  steps: z.array(SkillStepSchema).default([]),
  tools: z.array(z.string()).default([]),
  parameters: z.record(z.any()).default({}),
  preconditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
  errorHandling: z.record(z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  instructions: z.string().default(""),
  source: SkillSourceEnum.default("USER_UPLOADED"),
  projectId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type SkillCreateParams = z.infer<typeof SkillCreateParamsSchema>;

export const SkillValidateParamsSchema = z.object({
  skillId: z.string().optional(),
  version: z.string().optional(),
  skillData: z.record(z.any()).optional(),
});
export type SkillValidateParams = z.infer<typeof SkillValidateParamsSchema>;

export const SkillActivateParamsSchema = z.object({
  skillId: z.string(),
  version: z.string(),
});
export type SkillActivateParams = z.infer<typeof SkillActivateParamsSchema>;

export const SkillVersionListParamsSchema = z.object({
  skillId: z.string(),
});
export type SkillVersionListParams = z.infer<typeof SkillVersionListParamsSchema>;

export const SkillRollbackParamsSchema = z.object({
  skillId: z.string(),
  targetVersion: z.string(),
});
export type SkillRollbackParams = z.infer<typeof SkillRollbackParamsSchema>;

export const SkillCandidateProposeParamsSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  description: z.string(),
  proposedBy: z.string().default("WebAI/GPT"),
  extractedSteps: z.array(SkillStepSchema).default([]),
  tools: z.array(z.string()).default([]),
  parameters: z.record(z.any()).default({}),
  preconditions: z.array(z.string()).default([]),
  successConditions: z.array(z.string()).default([]),
  errorHandling: z.record(z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  instructions: z.string().default(""),
  evidence: AiSkillCandidateEvidenceSchema,
});
export type SkillCandidateProposeParams = z.infer<typeof SkillCandidateProposeParamsSchema>;

export const SkillCandidateReviewParamsSchema = z.object({
  candidateId: z.string(),
  action: z.enum(["accept", "reject"]),
  reviewNotes: z.string().optional(),
  reviewedBy: z.string().default("user"),
});
export type SkillCandidateReviewParams = z.infer<typeof SkillCandidateReviewParamsSchema>;

export const MemoryCandidateCreateParamsSchema = z.object({
  key: z.string(),
  content: z.string(),
  type: MemoryTypeEnum.default("EXPERIENCE"),
  scope: EnhancedMemoryScopeEnum.default("PROJECT"),
  scopeId: z.string().optional(),
  importance: z.number().min(0).max(10).default(5),
  confidence: z.number().min(0).max(1).default(0.8),
  source: MemorySourceEnum.default("ACTION"),
  provenance: MemoryProvenanceSchema,
  tags: z.array(z.string()).default([]),
});
export type MemoryCandidateCreateParams = z.infer<typeof MemoryCandidateCreateParamsSchema>;

export const MemoryCandidateAcceptParamsSchema = z.object({
  candidateId: z.string(),
  reviewNotes: z.string().optional(),
});
export type MemoryCandidateAcceptParams = z.infer<typeof MemoryCandidateAcceptParamsSchema>;

export const MemoryArchiveParamsSchema = z.object({
  id: z.string(),
  forget: z.boolean().default(false),
});
export type MemoryArchiveParams = z.infer<typeof MemoryArchiveParamsSchema>;

export const MemoryConsolidateParamsSchema = z.object({
  scope: EnhancedMemoryScopeEnum.optional(),
  scopeId: z.string().optional(),
});
export type MemoryConsolidateParams = z.infer<typeof MemoryConsolidateParamsSchema>;

export const RuleListParamsSchema = z.object({
  scope: RuleScopeEnum.optional(),
  scopeId: z.string().optional(),
  activeOnly: z.boolean().default(true),
});
export type RuleListParams = z.infer<typeof RuleListParamsSchema>;

export const RuleGetParamsSchema = z.object({
  ruleId: z.string(),
});
export type RuleGetParams = z.infer<typeof RuleGetParamsSchema>;

export const RuleCreateParamsSchema = z.object({
  ruleId: z.string().optional(),
  name: z.string(),
  content: z.string(),
  scope: RuleScopeEnum.default("GLOBAL"),
  scopeId: z.string().optional(),
  priority: RulePriorityEnum.default("USER_GLOBAL"),
  tags: z.array(z.string()).default([]),
  provenance: z
    .object({
      source: z.string().default("user"),
      author: z.string().optional(),
      importedFrom: z.string().optional(),
    })
    .optional(),
});
export type RuleCreateParams = z.infer<typeof RuleCreateParamsSchema>;

export const RuleUpdateParamsSchema = z.object({
  ruleId: z.string(),
  name: z.string().optional(),
  content: z.string().optional(),
  priority: RulePriorityEnum.optional(),
  status: RuleStatusEnum.optional(),
  tags: z.array(z.string()).optional(),
});
export type RuleUpdateParams = z.infer<typeof RuleUpdateParamsSchema>;

export const RuleDeleteParamsSchema = z.object({
  ruleId: z.string(),
});
export type RuleDeleteParams = z.infer<typeof RuleDeleteParamsSchema>;

export const KnowledgeImportParamsSchema = z.object({
  filename: z.string(),
  content: z.string().optional(),
  filePath: z.string().optional(),
  explicitType: KnowledgeTypeEnum.optional(),
  source: z.string().default("upload"),
  projectId: z.string().optional(),
});
export type KnowledgeImportParams = z.infer<typeof KnowledgeImportParamsSchema>;

export const KnowledgeListParamsSchema = z.object({
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
  tag: z.string().optional(),
});
export type KnowledgeListParams = z.infer<typeof KnowledgeListParamsSchema>;

export const KnowledgeGetParamsSchema = z.object({
  documentId: z.string(),
});
export type KnowledgeGetParams = z.infer<typeof KnowledgeGetParamsSchema>;

export const ContextBuildParamsSchema = z.object({
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
  goal: z.string().optional(),
  query: z.string().optional(),
  recentActions: z.array(z.any()).default([]),
  files: z.array(z.string()).default([]),
  maxTokens: z.number().int().positive().optional(),
  persistSnapshot: z.boolean().default(true),
});
export type ContextBuildParams = z.infer<typeof ContextBuildParamsSchema>;

export const ContextGetParamsSchema = z.object({
  contextId: z.string(),
});
export type ContextGetParams = z.infer<typeof ContextGetParamsSchema>;

export const ContextCompactParamsSchema = z.object({
  contextId: z.string().optional(),
  snapshot: ContextSnapshotSchema.optional(),
  targetTokenLimit: z.number().int().positive().default(4000),
});
export type ContextCompactParams = z.infer<typeof ContextCompactParamsSchema>;

// ============================================================================
// 7. Intelligence Storage & Control Center Schemas
// ============================================================================

export const IntelligenceStorageStatusEnum = z.enum([
  "HEALTHY",
  "INITIALIZING",
  "DEGRADED",
  "MIGRATING",
  "ERROR",
]);
export type IntelligenceStorageStatus = z.infer<typeof IntelligenceStorageStatusEnum>;

export const IntelligenceStorageStatsSchema = z.object({
  rootDir: z.string(),
  status: IntelligenceStorageStatusEnum,
  totalItems: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  sizeFormatted: z.string(),
  lastWriteTime: z.number(),
  counts: z.object({
    memory: z.number().int().nonnegative(),
    knowledge: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
    context: z.number().int().nonnegative(),
    candidates: z.number().int().nonnegative(),
    rules: z.number().int().nonnegative(),
  }),
  domainCounts: z.object({
    memory: z.number().int().nonnegative(),
    knowledge: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
    context: z.number().int().nonnegative(),
    candidates: z.number().int().nonnegative(),
    rules: z.number().int().nonnegative(),
  }).optional(),
  directories: z.object({
    memory: z.string(),
    knowledge: z.string(),
    skills: z.string(),
    context: z.string(),
    system: z.string(),
    wal: z.string(),
  }),
});
export type IntelligenceStorageStats = z.infer<typeof IntelligenceStorageStatsSchema>;

export const IntelligenceStorageConfigSchema = z.object({
  rootDir: z.string(),
  autoSync: z.boolean().default(true),
  walEnabled: z.boolean().default(true),
});
export type IntelligenceStorageConfig = z.infer<typeof IntelligenceStorageConfigSchema>;

export const IntelligenceStorageScanResultSchema = z.object({
  valid: z.boolean(),
  scannedFilesCount: z.number().int().nonnegative(),
  repairedCount: z.number().int().nonnegative(),
  validItems: z.number().int().nonnegative().default(0),
  tombstones: z.number().int().nonnegative().default(0),
  corruptedFiles: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  lastScanTime: z.number(),
});
export type IntelligenceStorageScanResult = z.infer<typeof IntelligenceStorageScanResultSchema>;

export const SkillLearningParamsSchema = z.object({
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  actions: z.array(z.any()).optional(),
  goal: z.string().optional(),
  appName: z.string().optional(),
  autoRegister: z.boolean().default(false),
});
export type SkillLearningParams = z.infer<typeof SkillLearningParamsSchema>;

