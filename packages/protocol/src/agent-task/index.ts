import { z } from "zod";

export const AgentTaskStateSchema = z.enum([
  "created",
  "queued",
  "assigned",
  "attempting",
  "planning",
  "running",
  "waiting",
  "verifying",
  "checkpointing",
  "checkpointed",
  "recovering",
  "paused",
  "interrupted",
  "disconnected",
  "waiting_for_agent",
  "waiting_for_human",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "resource_limited",
]);
export type AgentTaskState = z.infer<typeof AgentTaskStateSchema>;

export const DurableActionStatusSchema = z.enum([
  "PLANNED",
  "PREPARED",
  "STARTED",
  "EXECUTED",
  "OBSERVED",
  "POST_STATE",
  "VERIFYING",
  "VERIFIED",
  "COMMITTED",
  "FAILED",
  "ROLLED_BACK",
  "RETRY_UNSAFE",
  "UNKNOWN",
  "RECOVERING",
]);
export type DurableActionStatus = z.infer<typeof DurableActionStatusSchema>;

export const DurableActionSchema = z.object({
  actionId: z.string(),
  idempotencyKey: z.string(),
  taskId: z.string().optional(),
  executionId: z.string().optional(),
  parentActionId: z.string().optional(),
  attemptId: z.number().int().nonnegative().default(1),
  actionName: z.string(),
  toolName: z.string().optional(),
  method: z.string().optional(),
  capability: z.string().optional(),
  resourceId: z.string().optional(),
  inputHash: z.string().optional(),
  argumentsHash: z.string().optional(),
  category: z.string().optional(),
  precondition: z.any().optional(),
  executionState: z.string().optional(),
  params: z.record(z.any()).default({}),
  status: DurableActionStatusSchema.default("PREPARED"),
  preparedAt: z.number(),
  startedAt: z.number().optional(),
  executedAt: z.number().optional(),
  verifiedAt: z.number().optional(),
  committedAt: z.number().optional(),
  completedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  isIdempotent: z.boolean().default(false),
  alreadyExecuted: z.boolean().default(false),
  alreadyVerified: z.boolean().default(false),
  needsRetry: z.boolean().default(false),
  safeToRetry: z.boolean().default(true),
  retryCount: z.number().int().nonnegative().default(0),
  checkpointId: z.string().optional(),
  preStateHash: z.string().optional(),
  postStateHash: z.string().optional(),
  worldStateHash: z.string().optional(),
  observation: z.any().optional(),
  verification: z.any().optional(),
  verificationStatus: z.enum(["pending", "verifying", "verified", "failed", "unverified"]).optional(),
  verificationResult: z.object({
    verified: z.boolean(),
    details: z.any().optional(),
  }).optional(),
  result: z.any().optional(),
  sideEffects: z.object({
    modifiedFiles: z.array(z.string()).optional(),
    createdFiles: z.array(z.string()).optional(),
    deletedFiles: z.array(z.string()).optional(),
    processes: z.array(z.any()).optional(),
    windows: z.array(z.any()).optional(),
    outputSummary: z.string().optional(),
  }).optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  summary: z.string().optional(),
});
export type DurableAction = z.infer<typeof DurableActionSchema>;

export const ExecutionContextSchema = z.object({
  taskId: z.string().optional(),
  executionId: z.string().optional(),
  sessionId: z.string().optional(),
  runnerId: z.string().optional(),
  actionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  checkpointId: z.string().optional(),
  toolName: z.string().optional(),
  method: z.string().optional(),
  callerPurpose: z.string().optional(),
});
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

export const DurableActionLedgerEntrySchema = DurableActionSchema.extend({
  taskId: z.string(),
  executionId: z.string(),
  toolName: z.string(),
  method: z.string(),
  argumentsHash: z.string(),
});
export type DurableActionLedgerEntry = z.infer<typeof DurableActionLedgerEntrySchema>;

export const DurableComputerStateSchema = z.object({
  activeWindow: z.object({
    title: z.string().nullable().optional(),
    handle: z.string().optional(),
    processName: z.string().optional(),
    processId: z.number().int().optional(),
    isForeground: z.boolean().optional(),
  }).nullable().optional(),
  processes: z.array(z.object({
    pid: z.number().int(),
    name: z.string(),
    commandLine: z.string().optional(),
  })).default([]),
  screenHash: z.string().optional(),
  clipboardHash: z.string().optional(),
  windows: z.array(z.any()).default([]),
  resolution: z.string().optional(),
  stateHash: z.string().optional(),
  capturedAt: z.number().optional(),
});
export type DurableComputerState = z.infer<typeof DurableComputerStateSchema>;

export const DurableContextStateSchema = z.object({
  criticalContext: z.record(z.any()).default({}),
  summaryContext: z.string().default(""),
  executionHistory: z.array(z.any()).default([]),
  failureHistory: z.array(z.any()).default([]),
  verificationHistory: z.array(z.any()).default([]),
  rawContextSummary: z.string().optional(),
});
export type DurableContextState = z.infer<typeof DurableContextStateSchema>;

export const AgentResourcePolicySchema = z.object({
  maxWallTimeMs: z.number().int().positive().default(7200000), // 2 hours
  maxIterations: z.number().int().positive().default(100),
  maxCpuTimeMs: z.number().int().positive().optional(),
  maxMemoryBytes: z.number().int().positive().default(4294967296), // 4 GB
  maxDiskWriteBytes: z.number().int().positive().default(5368709120), // 5 GB
  maxOutputBytes: z.number().int().positive().default(104857600), // 100 MB
  maxTerminalSessions: z.number().int().positive().default(4),
  maxRuntimes: z.number().int().positive().default(8),
  maxProcesses: z.number().int().positive().default(64),
  maxConcurrentActions: z.number().int().positive().default(5),
  maxSameActionRepeats: z.number().int().positive().default(3),
  maxFailures: z.number().int().positive().default(10),
  maxActions: z.number().int().positive().default(500),
});
export type AgentResourcePolicy = z.infer<typeof AgentResourcePolicySchema>;

export const AgentResourceUsageSchema = z.object({
  wallTimeMs: z.number().nonnegative().default(0),
  cpuTimeMs: z.number().nonnegative().default(0),
  memoryBytes: z.number().nonnegative().default(0),
  diskWriteBytes: z.number().nonnegative().default(0),
  outputBytes: z.number().nonnegative().default(0),
  activeTerminalSessions: z.number().nonnegative().default(0),
  activeRuntimes: z.number().nonnegative().default(0),
  activeProcesses: z.number().nonnegative().default(0),
  actionsExecuted: z.number().nonnegative().default(0),
  iterations: z.number().nonnegative().default(0),
  failures: z.number().nonnegative().default(0),
});
export type AgentResourceUsage = z.infer<typeof AgentResourceUsageSchema>;

export const AgentCheckpointSchema = z.object({
  schemaVersion: z.number().int().default(2),
  checkpointId: z.string(),
  agentTaskId: z.string(),
  taskId: z.string().optional(),
  executionId: z.string().optional(),
  timestamp: z.string(),
  createdAtMs: z.number().optional(),
  taskState: AgentTaskStateSchema.optional(),
  executionState: z.string().optional(),
  currentStep: z.number().int().nonnegative().optional(),
  completedSteps: z.number().int().nonnegative().optional(),
  failedSteps: z.number().int().nonnegative().optional(),
  actionHistory: z.array(DurableActionSchema).default([]),
  computerState: DurableComputerStateSchema.optional(),
  context: DurableContextStateSchema.optional(),
  artifacts: z.array(z.string()).default([]),
  verificationResults: z.array(z.any()).default([]),
  pendingAction: z.any().optional(),
  recoveryMetadata: z.object({
    retryCount: z.number().int().default(0),
    failureReason: z.string().optional(),
    isSafeToResume: z.boolean().default(true),
    lastVerifiedAt: z.number().optional(),
    checkpointTrigger: z.enum(["manual", "periodic", "pre_risky", "post_verification", "on_failure", "pre_attempt"]).default("periodic"),
  }).optional(),
  intelligenceState: z
    .object({
      memoryIds: z.array(z.string()).default([]),
      ruleIds: z.array(z.string()).default([]),
      skillVersions: z.record(z.string()).default({}),
      contextHash: z.string().optional(),
      compactionBoundary: z.number().int().optional(),
      ledgerPosition: z.number().int().optional(),
      lastCommittedActionId: z.string().optional(),
    })
    .optional(),
  // Legacy & compatibility fields:
  iteration: z.number().int().nonnegative().default(0),
  phase: z.enum(["observe", "plan", "execute", "evaluate"]).or(z.string()).default("observe"),
  goal: z.string().default(""),
  observations: z.array(z.any()).default([]),
  actions: z.array(z.any()).default([]),
  activeRuntimeIds: z.array(z.string()).default([]),
  activeTerminalSessionIds: z.array(z.string()).default([]),
  activeProcessIds: z.array(z.number().int()).default([]),
  modifiedFiles: z.array(z.string()).default([]),
  lastCommand: z.string().optional(),
  lastOutputSequence: z.number().optional(),
  nextAction: z.string().optional(),
});
export type AgentCheckpoint = z.infer<typeof AgentCheckpointSchema>;

export const AgentTaskLogTypeSchema = z.enum([
  "system",
  "observation",
  "plan",
  "action",
  "command",
  "terminal",
  "process",
  "port",
  "approval",
  "error",
  "checkpoint",
  "resource",
]);
export type AgentTaskLogType = z.infer<typeof AgentTaskLogTypeSchema>;

export const AgentTaskLogEntrySchema = z.object({
  id: z.string(),
  agentTaskId: z.string(),
  sequence: z.number().int().nonnegative(),
  logType: AgentTaskLogTypeSchema,
  level: z.enum(["info", "warn", "error", "debug"]),
  message: z.string(),
  data: z.record(z.any()).optional(),
  timestamp: z.number(),
});
export type AgentTaskLogEntry = z.infer<typeof AgentTaskLogEntrySchema>;

export const AgentTaskSummarySchema = z.object({
  agentTaskId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  assignedAgentId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  state: AgentTaskStateSchema,
  iteration: z.number().int(),
  actionCount: z.number().int(),
  actionsExecuted: z.number().int().optional(),
  failureCount: z.number().int(),
  waitingForApproval: z.boolean(),
  createdAt: z.number(),
  startedAt: z.number().nullable().optional(),
  deadlineAt: z.number(),
  finishedAt: z.number().nullable().optional(),
});
export type AgentTaskSummary = z.infer<typeof AgentTaskSummarySchema>;

// 1. Agent Task Create
export const AgentTaskCreateParamsSchema = z.object({
  projectId: z.string(),
  sessionId: z.string().optional(),
  title: z.string().min(1).max(200),
  goal: z.string().min(1),
  resourcePolicy: AgentResourcePolicySchema.partial().optional(),
});
export type AgentTaskCreateParams = z.infer<typeof AgentTaskCreateParamsSchema>;

export const AgentTaskCreateResultSchema = z.object({
  agentTaskId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  state: AgentTaskStateSchema,
  deadlineAt: z.number(),
  resourcePolicy: AgentResourcePolicySchema,
  createdAt: z.number(),
});
export type AgentTaskCreateResult = z.infer<typeof AgentTaskCreateResultSchema>;

// 2. Agent Task Status
export const AgentTaskStatusParamsSchema = z.object({
  agentTaskId: z.string(),
});
export type AgentTaskStatusParams = z.infer<typeof AgentTaskStatusParamsSchema>;

export const AgentTaskStatusResultSchema = AgentTaskSummarySchema.extend({
  resourcePolicy: AgentResourcePolicySchema,
  resourceUsage: AgentResourceUsageSchema,
  pendingApprovalId: z.string().nullable().optional(),
  lastFailureFingerprint: z.string().nullable().optional(),
  sameActionRepeats: z.number().int(),
  latestCheckpoint: AgentCheckpointSchema.nullable().optional(),
  executionEvidence: z.record(z.any()).optional(),
  modifiedFiles: z.array(z.string()).default([]),
  lastToolResult: z.record(z.any()).optional(),
  artifacts: z.array(z.string()).default([]),
  checkpointCount: z.number().int().nonnegative().optional(),
});
export type AgentTaskStatusResult = z.infer<typeof AgentTaskStatusResultSchema>;

// 3. Agent Task Logs
export const AgentTaskLogsParamsSchema = z.object({
  agentTaskId: z.string(),
  fromSequence: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(1000).default(100),
  logType: AgentTaskLogTypeSchema.optional(),
});
export type AgentTaskLogsParams = z.infer<typeof AgentTaskLogsParamsSchema>;

export const AgentTaskLogsResultSchema = z.object({
  agentTaskId: z.string(),
  logs: z.array(AgentTaskLogEntrySchema),
  latestSequence: z.number().int(),
  hasMore: z.boolean(),
});
export type AgentTaskLogsResult = z.infer<typeof AgentTaskLogsResultSchema>;

// 4. Agent Task Cancel
export const AgentTaskCancelParamsSchema = z.object({
  agentTaskId: z.string(),
  reason: z.string().optional(),
});
export type AgentTaskCancelParams = z.infer<typeof AgentTaskCancelParamsSchema>;

export const AgentTaskCancelResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("cancelled"),
  cancelledAt: z.number(),
  reason: z.string().optional(),
});
export type AgentTaskCancelResult = z.infer<typeof AgentTaskCancelResultSchema>;

// 5. Agent Task Pause
export const AgentTaskPauseParamsSchema = z.object({
  agentTaskId: z.string(),
  reason: z.string().optional(),
});
export type AgentTaskPauseParams = z.infer<typeof AgentTaskPauseParamsSchema>;

export const AgentTaskPauseResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("paused"),
  pausedAt: z.number(),
  reason: z.string().optional(),
});
export type AgentTaskPauseResult = z.infer<typeof AgentTaskPauseResultSchema>;

// 6. Agent Task Resume
export const ComputerStateCheckSchema = z.object({
  status: z.enum(["STATE_MATCH", "STATE_MISMATCH", "STATE_UNVERIFIED", "NO_CHECKPOINT_STATE"]),
  stateDiff: z.record(z.any()).optional(),
  canResume: z.boolean(),
  activeWindow: z.any().optional(),
  checkpointState: z.any().optional(),
  suggestedAction: z.string().optional(),
});
export type ComputerStateCheck = z.infer<typeof ComputerStateCheckSchema>;

export const AgentTaskResumeParamsSchema = z.object({
  agentTaskId: z.string(),
});
export type AgentTaskResumeParams = z.infer<typeof AgentTaskResumeParamsSchema>;

export const AgentTaskResumeResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.string(),
  canResume: z.boolean().default(true),
  resumedAt: z.number(),
  reconciledActualState: z.record(z.any()).optional(),
  computerStateCheck: ComputerStateCheckSchema.optional(),
  resumedFromCheckpointId: z.string().optional(),
  pendingActionsCount: z.number().optional(),
  executedActionsCount: z.number().optional(),
  idempotentSkipCount: z.number().optional(),
});
export type AgentTaskResumeResult = z.infer<typeof AgentTaskResumeResultSchema>;

// 7. Agent Task List
export const AgentTaskListParamsSchema = z.object({
  projectId: z.string().optional(),
  state: AgentTaskStateSchema.optional(),
});
export type AgentTaskListParams = z.infer<typeof AgentTaskListParamsSchema>;

export const AgentTaskListResultSchema = z.object({
  tasks: z.array(AgentTaskSummarySchema),
  total: z.number().int(),
});
export type AgentTaskListResult = z.infer<typeof AgentTaskListResultSchema>;

// 8. Agent Task Approve
export const AgentTaskApproveParamsSchema = z.object({
  agentTaskId: z.string(),
  approvalId: z.string(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});
export type AgentTaskApproveParams = z.infer<typeof AgentTaskApproveParamsSchema>;

export const AgentTaskApproveResultSchema = z.object({
  agentTaskId: z.string(),
  approvalId: z.string(),
  action: z.enum(["approve", "reject"]),
  state: AgentTaskStateSchema,
  message: z.string(),
});
export type AgentTaskApproveResult = z.infer<typeof AgentTaskApproveResultSchema>;

// 9. Agent Task Assign
export const AgentTaskAssignParamsSchema = z.object({
  agentTaskId: z.string(),
  agentId: z.string(),
  role: z.string().optional(),
});
export type AgentTaskAssignParams = z.infer<typeof AgentTaskAssignParamsSchema>;

export const AgentTaskAssignResultSchema = z.object({
  agentTaskId: z.string(),
  agentId: z.string(),
  state: AgentTaskStateSchema,
  assignedAt: z.number(),
});
export type AgentTaskAssignResult = z.infer<typeof AgentTaskAssignResultSchema>;

// 10. Agent Task Attempt
export const AgentTaskAttemptParamsSchema = z.object({
  agentTaskId: z.string(),
  plan: z.string().optional(),
  checkpointBefore: z.boolean().default(true),
});
export type AgentTaskAttemptParams = z.infer<typeof AgentTaskAttemptParamsSchema>;

export const AgentTaskAttemptResultSchema = z.object({
  agentTaskId: z.string(),
  attemptNumber: z.number().int().positive(),
  state: AgentTaskStateSchema,
  checkpointId: z.string().optional(),
  startedAt: z.number(),
});
export type AgentTaskAttemptResult = z.infer<typeof AgentTaskAttemptResultSchema>;

// 11. Agent Task Coding Run
export const AgentTaskCodingRunParamsSchema = z.object({
  agentTaskId: z.string(),
  instruction: z.string(),
  targetFiles: z.array(z.string()).optional(),
  autoTest: z.boolean().default(true),
});
export type AgentTaskCodingRunParams = z.infer<typeof AgentTaskCodingRunParamsSchema>;

export const AgentTaskCodingRunResultSchema = z.object({
  agentTaskId: z.string(),
  phase: z.string(),
  filesModified: z.array(z.string()),
  testPassed: z.boolean().optional(),
  status: AgentTaskStateSchema,
  message: z.string(),
});
export type AgentTaskCodingRunResult = z.infer<typeof AgentTaskCodingRunResultSchema>;

// 12. Agent Task Heartbeat
export const AgentTaskHeartbeatParamsSchema = z.object({
  agentTaskId: z.string(),
  agentId: z.string().optional(),
  progressNote: z.string().optional(),
  progressPercent: z.number().optional(),
  activeProcessIds: z.array(z.number().int()).optional(),
});
export type AgentTaskHeartbeatParams = z.infer<typeof AgentTaskHeartbeatParamsSchema>;

export const AgentTaskHeartbeatResultSchema = z.object({
  agentTaskId: z.string(),
  alive: z.boolean(),
  deadlineRemainingMs: z.number().int(),
  state: AgentTaskStateSchema,
  lastHeartbeatAt: z.number(),
  progressPercent: z.number().optional(),
});
export type AgentTaskHeartbeatResult = z.infer<typeof AgentTaskHeartbeatResultSchema>;

// 13. Agent Task Reconcile
export const AgentTaskReconcileParamsSchema = z.object({
  agentTaskId: z.string(),
  cleanZombieProcesses: z.boolean().default(true),
  recoverCheckpointIfFailed: z.boolean().default(true),
});
export type AgentTaskReconcileParams = z.infer<typeof AgentTaskReconcileParamsSchema>;

export const AgentTaskReconcileResultSchema = z.object({
  agentTaskId: z.string(),
  previousState: AgentTaskStateSchema,
  reconciledState: AgentTaskStateSchema,
  activeProcesses: z.number().int().nonnegative(),
  recoveredFromCheckpoint: z.boolean(),
  reconciledAt: z.number(),
});
export type AgentTaskReconcileResult = z.infer<typeof AgentTaskReconcileResultSchema>;

// 14. Agent Task Complete
export const AgentTaskCompleteParamsSchema = z.object({
  agentTaskId: z.string(),
  summary: z.string(),
  artifactsProduced: z.array(z.string()).optional(),
  validationPassed: z.boolean().default(true),
});
export type AgentTaskCompleteParams = z.infer<typeof AgentTaskCompleteParamsSchema>;

export const AgentTaskCompleteResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.literal("completed"),
  completedAt: z.number(),
  summary: z.string(),
  artifacts: z.array(z.string()),
});
export type AgentTaskCompleteResult = z.infer<typeof AgentTaskCompleteResultSchema>;

// 15. Agent Task Handoff
export const AgentTaskHandoffParamsSchema = z.object({
  agentTaskId: z.string(),
  toAgentId: z.string(),
  note: z.string().optional(),
});
export type AgentTaskHandoffParams = z.infer<typeof AgentTaskHandoffParamsSchema>;

export const AgentTaskHandoffResultSchema = z.object({
  agentTaskId: z.string(),
  fromAgentId: z.string().optional(),
  toAgentId: z.string(),
  state: AgentTaskStateSchema,
  handoffAt: z.number(),
});
export type AgentTaskHandoffResult = z.infer<typeof AgentTaskHandoffResultSchema>;

// 16. Agent Task Checkpoint Create
export const AgentTaskCheckpointCreateParamsSchema = z.object({
  agentTaskId: z.string(),
  trigger: z.enum(["manual", "periodic", "pre_risky", "post_verification", "on_failure", "pre_attempt"]).default("manual"),
  description: z.string().optional(),
  includeComputerState: z.boolean().default(true),
});
export type AgentTaskCheckpointCreateParams = z.infer<typeof AgentTaskCheckpointCreateParamsSchema>;

export const AgentTaskCheckpointCreateResultSchema = z.object({
  checkpoint: AgentCheckpointSchema,
  success: z.boolean(),
  checkpointId: z.string(),
  agentTaskId: z.string(),
  createdAt: z.number(),
});
export type AgentTaskCheckpointCreateResult = z.infer<typeof AgentTaskCheckpointCreateResultSchema>;

// 17. Agent Task Checkpoint List
export const AgentTaskCheckpointListParamsSchema = z.object({
  agentTaskId: z.string(),
  limit: z.number().int().positive().default(20),
});
export type AgentTaskCheckpointListParams = z.infer<typeof AgentTaskCheckpointListParamsSchema>;

export const AgentTaskCheckpointListResultSchema = z.object({
  agentTaskId: z.string(),
  checkpoints: z.array(AgentCheckpointSchema),
  total: z.number().int().nonnegative(),
});
export type AgentTaskCheckpointListResult = z.infer<typeof AgentTaskCheckpointListResultSchema>;

// 18. Agent Task Checkpoint Restore
export const AgentTaskCheckpointRestoreParamsSchema = z.object({
  agentTaskId: z.string(),
  checkpointId: z.string(),
  verifyStateBeforeResume: z.boolean().default(true),
});
export type AgentTaskCheckpointRestoreParams = z.infer<typeof AgentTaskCheckpointRestoreParamsSchema>;

export const AgentTaskCheckpointRestoreResultSchema = z.object({
  agentTaskId: z.string(),
  checkpointId: z.string(),
  restoredAt: z.number(),
  computerStateCheck: ComputerStateCheckSchema.optional(),
  success: z.boolean(),
  message: z.string(),
});
export type AgentTaskCheckpointRestoreResult = z.infer<typeof AgentTaskCheckpointRestoreResultSchema>;

// 19. Agent Task Disconnect
export const AgentTaskDisconnectParamsSchema = z.object({
  agentTaskId: z.string(),
  agentId: z.string().optional(),
  reason: z.string().optional(),
});
export type AgentTaskDisconnectParams = z.infer<typeof AgentTaskDisconnectParamsSchema>;

export const AgentTaskDisconnectResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.string(),
  disconnectedAt: z.number(),
  checkpointId: z.string().optional(),
});
export type AgentTaskDisconnectResult = z.infer<typeof AgentTaskDisconnectResultSchema>;

// 20. Agent Task Takeover
export const AgentTaskTakeoverParamsSchema = z.object({
  agentTaskId: z.string(),
  takeoverBy: z.string().default("human"),
  action: z.enum(["takeover", "return_control"]),
  reason: z.string().optional(),
});
export type AgentTaskTakeoverParams = z.infer<typeof AgentTaskTakeoverParamsSchema>;

export const AgentTaskTakeoverResultSchema = z.object({
  agentTaskId: z.string(),
  state: z.string(),
  takeoverAt: z.number(),
  message: z.string(),
});
export type AgentTaskTakeoverResult = z.infer<typeof AgentTaskTakeoverResultSchema>;


