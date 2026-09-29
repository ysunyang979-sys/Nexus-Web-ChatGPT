import { z } from "zod";

export const WorkflowStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  name: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  detail: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowWorkOnProjectParamsSchema = z.object({
  projectId: z.string(),
  goal: z.string().min(1),
  agentRole: z.string().default("autonomous-coder"),
  autoCheckpoint: z.boolean().default(true),
  autoValidate: z.boolean().default(true),
  autoClean: z.boolean().default(true),
  maxIterations: z.number().int().positive().default(10),
});
export type WorkflowWorkOnProjectParams = z.infer<typeof WorkflowWorkOnProjectParamsSchema>;

export const WorkflowWorkOnProjectResultSchema = z.object({
  workflowId: z.string(),
  taskId: z.string(),
  sessionId: z.string(),
  checkpointId: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]),
  steps: z.array(WorkflowStepSchema),
  message: z.string(),
});
export type WorkflowWorkOnProjectResult = z.infer<typeof WorkflowWorkOnProjectResultSchema>;

export const WorkflowFinishCodingTaskParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  sessionId: z.string().optional(),
  runValidation: z.boolean().default(true),
  cleanZombies: z.boolean().default(true),
  createFinalCheckpoint: z.boolean().default(true),
});
export type WorkflowFinishCodingTaskParams = z.infer<typeof WorkflowFinishCodingTaskParamsSchema>;

export const WorkflowFinishCodingTaskResultSchema = z.object({
  taskId: z.string(),
  completed: z.boolean(),
  validationPassed: z.boolean(),
  gitDirtyFilesCount: z.number().int().nonnegative(),
  checkpointId: z.string().optional(),
  summary: z.string(),
  finishedAt: z.number(),
});
export type WorkflowFinishCodingTaskResult = z.infer<typeof WorkflowFinishCodingTaskResultSchema>;

export const CodingAgentStatusSchema = z.object({
  agentId: z.string(),
  taskId: z.string(),
  phase: z.enum([
    "idle",
    "analyzing",
    "planning",
    "editing",
    "executing",
    "testing",
    "validating",
    "reconciling",
    "completed",
    "failed",
  ]),
  activeFiles: z.array(z.string()).default([]),
  activeJobId: z.string().optional(),
  activeTerminalId: z.string().optional(),
  activeRuntimeId: z.string().optional(),
  lastError: z.string().optional(),
  validationSummary: z.string().optional(),
  iteration: z.number().int().nonnegative(),
  updatedAt: z.number(),
});
export type CodingAgentStatus = z.infer<typeof CodingAgentStatusSchema>;

export const CodingAgentStartParamsSchema = z.object({
  projectId: z.string(),
  goal: z.string().min(1),
  sessionId: z.string().optional(),
  plan: z.array(z.string()).optional(),
});
export type CodingAgentStartParams = z.infer<typeof CodingAgentStartParamsSchema>;

export const CodingAgentStartResultSchema = z.object({
  agentId: z.string(),
  taskId: z.string(),
  status: CodingAgentStatusSchema,
});
export type CodingAgentStartResult = z.infer<typeof CodingAgentStartResultSchema>;

export const CodingAgentObserveParamsSchema = z.object({
  agentId: z.string(),
});
export type CodingAgentObserveParams = z.infer<typeof CodingAgentObserveParamsSchema>;

export const CodingAgentObserveResultSchema = z.object({
  status: CodingAgentStatusSchema,
});
export type CodingAgentObserveResult = z.infer<typeof CodingAgentObserveResultSchema>;

export const CodingAgentCancelParamsSchema = z.object({
  agentId: z.string(),
  reason: z.string().optional(),
  rollbackToCheckpoint: z.boolean().default(false),
});
export type CodingAgentCancelParams = z.infer<typeof CodingAgentCancelParamsSchema>;

export const CodingAgentCancelResultSchema = z.object({
  cancelled: z.boolean(),
  message: z.string(),
});
export type CodingAgentCancelResult = z.infer<typeof CodingAgentCancelResultSchema>;
