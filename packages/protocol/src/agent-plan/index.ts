import { z } from "zod";

// --- Plan & Step Types ---

export const PlanStepStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "blocked",
  "completed",
  "failed",
  "cancelled",
]);
export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;

export const PlanStepSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: PlanStepStatusSchema.default("pending"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dependencies: z.array(z.string()).default([]),
  assignedAgent: z.string().optional(),
  attempts: z.number().default(0),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  result: z.any().optional(),
  artifacts: z.array(z.string()).default([]),
  checkpoint: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const AgentPlanSchema = z.object({
  planId: z.string(),
  agentTaskId: z.string().optional(),
  sessionId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  status: PlanStatusSchema.default("active"),
  steps: z.array(PlanStepSchema),
  dependencies: z.array(z.string()).default([]),
  currentStep: z.string().optional(),
  completedSteps: z.array(z.string()).default([]),
  failedSteps: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.any()).optional(),
});
export type AgentPlan = z.infer<typeof AgentPlanSchema>;

// Plan Tools Schemas
export const AgentPlanCreateParamsSchema = z.object({
  agentTaskId: z.string().optional(),
  sessionId: z.string().optional(),
  title: z.string().min(1),
  goal: z.string().min(1),
  steps: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      dependencies: z.array(z.string()).optional(),
      assignedAgent: z.string().optional(),
    })
  ),
  dependencies: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AgentPlanCreateParams = z.infer<typeof AgentPlanCreateParamsSchema>;

export const AgentPlanCreateResultSchema = z.object({
  plan: AgentPlanSchema,
});
export type AgentPlanCreateResult = z.infer<typeof AgentPlanCreateResultSchema>;

export const AgentPlanGetParamsSchema = z.object({
  planId: z.string(),
});
export type AgentPlanGetParams = z.infer<typeof AgentPlanGetParamsSchema>;

export const AgentPlanGetResultSchema = z.object({
  plan: AgentPlanSchema,
});
export type AgentPlanGetResult = z.infer<typeof AgentPlanGetResultSchema>;

export const AgentPlanUpdateParamsSchema = z.object({
  planId: z.string(),
  status: PlanStatusSchema.optional(),
  currentStep: z.string().optional(),
  steps: z.array(PlanStepSchema).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AgentPlanUpdateParams = z.infer<typeof AgentPlanUpdateParamsSchema>;

export const AgentPlanUpdateResultSchema = z.object({
  plan: AgentPlanSchema,
});
export type AgentPlanUpdateResult = z.infer<typeof AgentPlanUpdateResultSchema>;

export const AgentPlanDeleteParamsSchema = z.object({
  planId: z.string(),
});
export type AgentPlanDeleteParams = z.infer<typeof AgentPlanDeleteParamsSchema>;

export const AgentPlanDeleteResultSchema = z.object({
  planId: z.string(),
  deleted: z.boolean(),
});
export type AgentPlanDeleteResult = z.infer<typeof AgentPlanDeleteResultSchema>;

export const AgentPlanCompleteParamsSchema = z.object({
  planId: z.string(),
  result: z.any().optional(),
  artifacts: z.array(z.string()).optional(),
});
export type AgentPlanCompleteParams = z.infer<typeof AgentPlanCompleteParamsSchema>;

export const AgentPlanCompleteResultSchema = z.object({
  plan: AgentPlanSchema,
});
export type AgentPlanCompleteResult = z.infer<typeof AgentPlanCompleteResultSchema>;

export const AgentPlanListParamsSchema = z.object({
  agentTaskId: z.string().optional(),
  sessionId: z.string().optional(),
  status: PlanStatusSchema.optional(),
  limit: z.number().default(50),
});
export type AgentPlanListParams = z.infer<typeof AgentPlanListParamsSchema>;

export const AgentPlanListResultSchema = z.object({
  plans: z.array(AgentPlanSchema),
  total: z.number(),
});
export type AgentPlanListResult = z.infer<typeof AgentPlanListResultSchema>;

// --- Todo Types & Schemas ---

export const TodoStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const AgentTodoSchema = z.object({
  todoId: z.string(),
  agentTaskId: z.string().optional(),
  planId: z.string().optional(),
  stepId: z.string().optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  title: z.string(),
  status: TodoStatusSchema.default("pending"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  notes: z.string().optional(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
});
export type AgentTodo = z.infer<typeof AgentTodoSchema>;

export const AgentTodoCreateParamsSchema = z.object({
  agentTaskId: z.string().optional(),
  planId: z.string().optional(),
  stepId: z.string().optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  notes: z.string().optional(),
});
export type AgentTodoCreateParams = z.infer<typeof AgentTodoCreateParamsSchema>;

export const AgentTodoCreateResultSchema = z.object({
  todo: AgentTodoSchema,
});
export type AgentTodoCreateResult = z.infer<typeof AgentTodoCreateResultSchema>;

export const AgentTodoUpdateParamsSchema = z.object({
  todoId: z.string(),
  title: z.string().optional(),
  status: TodoStatusSchema.optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  notes: z.string().optional(),
});
export type AgentTodoUpdateParams = z.infer<typeof AgentTodoUpdateParamsSchema>;

export const AgentTodoUpdateResultSchema = z.object({
  todo: AgentTodoSchema,
});
export type AgentTodoUpdateResult = z.infer<typeof AgentTodoUpdateResultSchema>;

export const AgentTodoCompleteParamsSchema = z.object({
  todoId: z.string(),
  notes: z.string().optional(),
});
export type AgentTodoCompleteParams = z.infer<typeof AgentTodoCompleteParamsSchema>;

export const AgentTodoCompleteResultSchema = z.object({
  todo: AgentTodoSchema,
});
export type AgentTodoCompleteResult = z.infer<typeof AgentTodoCompleteResultSchema>;

export const AgentTodoListParamsSchema = z.object({
  agentTaskId: z.string().optional(),
  planId: z.string().optional(),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  status: TodoStatusSchema.optional(),
});
export type AgentTodoListParams = z.infer<typeof AgentTodoListParamsSchema>;

export const AgentTodoListResultSchema = z.object({
  todos: z.array(AgentTodoSchema),
  total: z.number(),
});
export type AgentTodoListResult = z.infer<typeof AgentTodoListResultSchema>;

// --- Delegation, Fork, Join, Supervise ---

export const AgentDelegateParamsSchema = z.object({
  parentAgentId: z.string(),
  childAgentRole: z.string(),
  taskTitle: z.string(),
  planStepId: z.string().optional(),
  context: z.record(z.any()).optional(),
  timeoutMs: z.number().default(60000),
});
export type AgentDelegateParams = z.infer<typeof AgentDelegateParamsSchema>;

export const AgentDelegateResultSchema = z.object({
  delegationId: z.string(),
  childAgentId: z.string(),
  taskId: z.string(),
  status: z.string(),
});
export type AgentDelegateResult = z.infer<typeof AgentDelegateResultSchema>;

export const AgentForkParamsSchema = z.object({
  parentAgentId: z.string(),
  inheritTasks: z.boolean().default(true),
  inheritPlan: z.boolean().default(true),
  isolatedMemory: z.boolean().default(true),
  role: z.string().optional(),
  quota: z.record(z.any()).optional(),
});
export type AgentForkParams = z.infer<typeof AgentForkParamsSchema>;

export const AgentForkResultSchema = z.object({
  forkedAgentId: z.string(),
  forkedSessionId: z.string(),
  parentAgentId: z.string(),
  createdAt: z.number(),
});
export type AgentForkResult = z.infer<typeof AgentForkResultSchema>;

export const AgentJoinParamsSchema = z.object({
  parentAgentId: z.string(),
  childAgentIds: z.array(z.string()),
  timeoutMs: z.number().default(30000),
});
export type AgentJoinParams = z.infer<typeof AgentJoinParamsSchema>;

export const AgentJoinResultSchema = z.object({
  allJoined: z.boolean(),
  results: z.record(z.any()),
  activeChildrenCount: z.number(),
});
export type AgentJoinResult = z.infer<typeof AgentJoinResultSchema>;

export const AgentSuperviseParamsSchema = z.object({
  supervisorAgentId: z.string(),
  targetAgentIds: z.array(z.string()).optional(),
  action: z
    .enum(["status", "reconcile", "retry", "pause", "resume", "escalate"])
    .default("status"),
  reason: z.string().optional(),
});
export type AgentSuperviseParams = z.infer<typeof AgentSuperviseParamsSchema>;

export const AgentSuperviseResultSchema = z.object({
  action: z.string(),
  supervisedAgents: z.array(
    z.object({
      agentId: z.string(),
      status: z.string(),
      lastHeartbeatAgoMs: z.number(),
      healthy: z.boolean(),
      actionTaken: z.string(),
    })
  ),
  overallHealth: z.enum(["healthy", "degraded", "critical"]),
});
export type AgentSuperviseResult = z.infer<typeof AgentSuperviseResultSchema>;

// --- Agent Dependency ---

export const AgentDependencySchema = z.object({
  dependencyId: z.string(),
  agentId: z.string(),
  dependsOnAgentId: z.string(),
  reason: z.string().optional(),
  status: z.enum(["waiting", "satisfied", "failed"]).default("waiting"),
  createdAt: z.number(),
});
export type AgentDependency = z.infer<typeof AgentDependencySchema>;

export const AgentDependencyCreateParamsSchema = z.object({
  agentId: z.string(),
  dependsOnAgentId: z.string(),
  reason: z.string().optional(),
});
export type AgentDependencyCreateParams = z.infer<typeof AgentDependencyCreateParamsSchema>;

export const AgentDependencyCreateResultSchema = z.object({
  dependency: AgentDependencySchema,
});
export type AgentDependencyCreateResult = z.infer<typeof AgentDependencyCreateResultSchema>;

export const AgentDependencyListParamsSchema = z.object({
  agentId: z.string().optional(),
  dependsOnAgentId: z.string().optional(),
});
export type AgentDependencyListParams = z.infer<typeof AgentDependencyListParamsSchema>;

export const AgentDependencyListResultSchema = z.object({
  dependencies: z.array(AgentDependencySchema),
  total: z.number(),
});
export type AgentDependencyListResult = z.infer<typeof AgentDependencyListResultSchema>;

export const AgentDependencyRemoveParamsSchema = z.object({
  dependencyId: z.string(),
});
export type AgentDependencyRemoveParams = z.infer<typeof AgentDependencyRemoveParamsSchema>;

export const AgentDependencyRemoveResultSchema = z.object({
  dependencyId: z.string(),
  removed: z.boolean(),
});
export type AgentDependencyRemoveResult = z.infer<typeof AgentDependencyRemoveResultSchema>;

// --- Agent Budget & Quotas ---

export const AgentBudgetQuotaSchema = z.object({
  maxRuntimeMs: z.number().default(3600000), // 1 hour
  maxToolCalls: z.number().default(500),
  maxProcesses: z.number().default(10),
  maxMemoryMb: z.number().default(2048),
  maxCpuPercent: z.number().default(80),
  maxArtifacts: z.number().default(50),
  maxArtifactSizeBytes: z.number().default(104857600), // 100MB
  maxBrowserSessions: z.number().default(3),
  maxConcurrentAgents: z.number().default(5),
});
export type AgentBudgetQuota = z.infer<typeof AgentBudgetQuotaSchema>;

export const AgentBudgetUsageSchema = z.object({
  runtimeMs: z.number().default(0),
  toolCalls: z.number().default(0),
  processes: z.number().default(0),
  memoryMb: z.number().default(0),
  cpuPercent: z.number().default(0),
  artifacts: z.number().default(0),
  artifactSizeBytes: z.number().default(0),
  browserSessions: z.number().default(0),
  concurrentAgents: z.number().default(0),
});
export type AgentBudgetUsage = z.infer<typeof AgentBudgetUsageSchema>;

export const AgentBudgetSchema = z.object({
  targetId: z.string(), // agentId or projectId or sessionId
  targetType: z.enum(["agent", "project", "session"]),
  quota: AgentBudgetQuotaSchema,
  usage: AgentBudgetUsageSchema,
  status: z.enum(["normal", "warning", "exceeded", "locked"]).default("normal"),
  lastCheckedAt: z.number(),
});
export type AgentBudget = z.infer<typeof AgentBudgetSchema>;

export const AgentBudgetSetParamsSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(["agent", "project", "session"]).default("agent"),
  quota: AgentBudgetQuotaSchema.partial(),
});
export type AgentBudgetSetParams = z.infer<typeof AgentBudgetSetParamsSchema>;

export const AgentBudgetSetResultSchema = z.object({
  budget: AgentBudgetSchema,
});
export type AgentBudgetSetResult = z.infer<typeof AgentBudgetSetResultSchema>;

export const AgentBudgetGetParamsSchema = z.object({
  targetId: z.string(),
});
export type AgentBudgetGetParams = z.infer<typeof AgentBudgetGetParamsSchema>;

export const AgentBudgetGetResultSchema = z.object({
  budget: AgentBudgetSchema,
});
export type AgentBudgetGetResult = z.infer<typeof AgentBudgetGetResultSchema>;

export const AgentBudgetCheckParamsSchema = z.object({
  targetId: z.string(),
  increment: AgentBudgetUsageSchema.partial().optional(),
});
export type AgentBudgetCheckParams = z.infer<typeof AgentBudgetCheckParamsSchema>;

export const AgentBudgetCheckResultSchema = z.object({
  targetId: z.string(),
  allowed: z.boolean(),
  status: z.enum(["normal", "warning", "exceeded", "locked"]),
  exceededFields: z.array(z.string()),
  actionRequired: z.enum(["none", "pause", "approval_required", "cancel"]),
});
export type AgentBudgetCheckResult = z.infer<typeof AgentBudgetCheckResultSchema>;
