import { z } from "zod";
export * from "./canonical-registry.js";

export const ToolRiskLevelSchema = z.enum(["safe", "low", "medium", "high", "destructive", "critical"]);
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;

export const UnifiedToolDefinitionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  version: z.string().default("1.0.0").optional(),
  schemaVersion: z.string().default("2026-07-28").optional(),
  providerVersion: z.string().default("1.0.0").optional(),
  namespace: z.string().optional(),
  category: z.string().optional(),
  description: z.string(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()).optional(),
  providerId: z.string().optional(),
  providerImplementation: z.string().optional(),
  runnerAdapter: z.string().optional(),
  rpcMethod: z.string().optional(),
  executionMode: z.string().optional(),
  permissions: z.array(z.string()),
  riskLevel: ToolRiskLevelSchema,
  safetyClassification: z.string().optional(),
  permissionModel: z.string().optional(),
  mcpScope: z.string().optional(),
  supportsDryRun: z.boolean().default(false),
  supportsIdempotency: z.boolean().default(false).optional(),
  supportsCancellation: z.boolean().default(false).optional(),
  supportsCheckpoint: z.boolean().default(true).optional(),
  supportsObservation: z.boolean().default(true),
  supportsRecovery: z.boolean().default(true),
  timeoutMs: z.number().int().nonnegative().default(30000).optional(),
  timeout: z.number().int().nonnegative().default(30000),
  enabled: z.boolean().default(true).optional(),
  aliases: z.array(z.string()).optional(),
});
export type UnifiedToolDefinition = z.infer<typeof UnifiedToolDefinitionSchema>;

export const ActionLifecycleStatusSchema = z.enum([
  "planned",
  "selected",
  "dispatched",
  "running",
  "completed",
  "failed",
  "observed",
  "validated",
]);
export type ActionLifecycleStatus = z.infer<typeof ActionLifecycleStatusSchema>;

export const UnifiedActionSchema = z.object({
  actionId: z.string(),
  taskId: z.string(),
  agentId: z.string().optional(),
  iteration: z.number().int().nonnegative(),
  tool: z.string(),
  arguments: z.record(z.any()).default({}),
  reason: z.string().optional(),
  riskLevel: ToolRiskLevelSchema.optional(),
  status: ActionLifecycleStatusSchema.default("planned"),
  createdAt: z.number().optional(),
  completedAt: z.number().optional(),
});
export type UnifiedAction = z.infer<typeof UnifiedActionSchema>;

export const UnifiedObservationSchema = z.object({
  observationId: z.string(),
  actionId: z.string(),
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  timestamp: z.number(),
  status: z.enum(["success", "failure", "partial"]),
  result: z.any().optional(),
  evidence: z.any().optional(),
  error: z.string().nullable().optional(),
  errorCategory: z.string().optional(),
});
export type UnifiedObservation = z.infer<typeof UnifiedObservationSchema>;

export const ErrorCategorySchema = z.enum([
  "NETWORK_ERROR",
  "TIMEOUT",
  "FILE_NOT_FOUND",
  "PERMISSION_DENIED",
  "PROCESS_NOT_FOUND",
  "WINDOW_NOT_FOUND",
  "INVALID_INPUT",
  "TOOL_ERROR",
  "APPLICATION_ERROR",
  "VISION_ERROR",
  "DOCUMENT_ERROR",
  "RESOURCE_LIMIT",
  "RATE_LIMIT",
  "UNKNOWN_ERROR",
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const RecoveryStrategySchema = z.enum([
  "retry",
  "replan",
  "fallback",
  "ask_user",
  "rollback",
  "checkpoint_restore",
  "abort",
]);
export type RecoveryStrategy = z.infer<typeof RecoveryStrategySchema>;

export const RecoveryPlanSchema = z.object({
  errorCategory: ErrorCategorySchema,
  fingerprint: z.string(),
  strategy: RecoveryStrategySchema,
  fallbackTool: z.string().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(3),
  checkpointId: z.string().optional(),
  rationale: z.string(),
});
export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;

export const ToolRegistryListParamsSchema = z.object({
  category: z.string().optional(),
  riskLevel: ToolRiskLevelSchema.optional(),
});
export type ToolRegistryListParams = z.infer<typeof ToolRegistryListParamsSchema>;

export const ToolRegistryListResultSchema = z.object({
  tools: z.array(UnifiedToolDefinitionSchema),
  totalCount: z.number().int().nonnegative(),
});
export type ToolRegistryListResult = z.infer<typeof ToolRegistryListResultSchema>;

export const ToolRegistryGetParamsSchema = z.object({
  name: z.string(),
});
export type ToolRegistryGetParams = z.infer<typeof ToolRegistryGetParamsSchema>;

export const ToolRegistryGetResultSchema = z.object({
  tool: UnifiedToolDefinitionSchema.nullable(),
});
export type ToolRegistryGetResult = z.infer<typeof ToolRegistryGetResultSchema>;
