import { z } from "zod";
import crypto from "node:crypto";
import { RunnerRpcMethods } from "./methods.js";
import { RunnerCapabilitiesSchema, RunnerToolsSchema } from "../models/runner.js";
import {
  CodeDocumentSymbolsParamsSchema,
  CodeWorkspaceSymbolsParamsSchema,
  CodeDefinitionParamsSchema,
  CodeReferencesParamsSchema,
  CodeHoverParamsSchema,
  CodeDiagnosticsParamsSchema,
  CodeCallHierarchyParamsSchema,
  CodeImpactParamsSchema,
  LspStatusParamsSchema,
  LspRestartParamsSchema,
  LspStopParamsSchema,
  DocumentSymbolsResultSchema,
  WorkspaceSymbolsResultSchema,
  DefinitionResultSchema,
  ReferencesResultSchema,
  HoverResultSchema,
  DiagnosticsResultSchema,
  CallHierarchyResultSchema,
  CodeImpactResultSchema,
  LspStatusResultSchema,
  LspRestartResultSchema,
  LspStopResultSchema,
  type CodeDocumentSymbolsParams,
  type CodeWorkspaceSymbolsParams,
  type CodeDefinitionParams,
  type CodeReferencesParams,
  type CodeHoverParams,
  type CodeDiagnosticsParams,
  type CodeCallHierarchyParams,
  type CodeImpactParams,
  type LspStatusParams,
  type LspRestartParams,
  type LspStopParams,
  type DocumentSymbolsResult,
  type WorkspaceSymbolsResult,
  type DefinitionResult,
  type ReferencesResult,
  type HoverResult,
  type DiagnosticsResult,
  type CallHierarchyResult,
  type CodeImpactResult,
  type LspStatusResult,
  type LspRestartResult,
  type LspStopResult,
} from "../code/index.js";
import {
  WorktreeCreateParamsSchema,
  WorktreeCreateResultSchema,
  WorktreeListParamsSchema,
  WorktreeListResultSchema,
  WorktreeStatusParamsSchema,
  WorktreeStatusResultSchema,
  WorktreeDiffParamsSchema,
  WorktreeDiffResultSchema,
  WorktreeRemoveParamsSchema,
  WorktreeRemoveResultSchema,
  type WorktreeCreateParams,
  type WorktreeCreateResult,
  type WorktreeListParams,
  type WorktreeListResult,
  type WorktreeStatusParams,
  type WorktreeStatusResult,
  type WorktreeDiffParams,
  type WorktreeDiffResult,
  type WorktreeRemoveParams,
  type WorktreeRemoveResult,
} from "../worktree/index.js";
import {
  RuntimeStartParamsSchema,
  RuntimeStartResultSchema,
  RuntimeListParamsSchema,
  RuntimeListResultSchema,
  RuntimeStatusParamsSchema,
  RuntimeStatusResultSchema,
  RuntimeLogsParamsSchema,
  RuntimeLogsResultSchema,
  RuntimeRestartParamsSchema,
  RuntimeRestartResultSchema,
  RuntimeStopParamsSchema,
  RuntimeStopResultSchema,
  type RuntimeStartParams,
  type RuntimeStartResult,
  type RuntimeListParams,
  type RuntimeListResult,
  type RuntimeStatusParams,
  type RuntimeStatusResult,
  type RuntimeLogsParams,
  type RuntimeLogsResult,
  type RuntimeRestartParams,
  type RuntimeRestartResult,
  type RuntimeStopParams,
  type RuntimeStopResult,
} from "../runtime/index.js";
import {
  FsDeleteParamsSchema,
  FsDeleteResultSchema,
  FsMoveParamsSchema,
  FsMoveResultSchema,
  FsCopyParamsSchema,
  FsCopyResultSchema,
  FsMkdirParamsSchema,
  FsMkdirResultSchema,
  type FsDeleteParams,
  type FsDeleteResult,
  type FsMoveParams,
  type FsMoveResult,
  type FsCopyParams,
  type FsCopyResult,
  type FsMkdirParams,
  type FsMkdirResult,
} from "../full-control/index.js";
import {
  EnvironmentDetectParamsSchema,
  EnvironmentDetectResultSchema,
  ProjectDetectParamsSchema,
  ProjectDetectResultSchema,
  type EnvironmentDetectParams,
  type EnvironmentDetectResult,
  type ProjectDetectParams,
  type ProjectDetectResult,
} from "../environment/index.js";
import {
  TerminalStartParamsSchema,
  TerminalStartResultSchema,
  TerminalWriteParamsSchema,
  TerminalWriteResultSchema,
  TerminalReadParamsSchema,
  TerminalReadResultSchema,
  TerminalResizeParamsSchema,
  TerminalResizeResultSchema,
  TerminalStatusParamsSchema,
  TerminalStatusResultSchema,
  TerminalStopParamsSchema,
  TerminalStopResultSchema,
  TerminalListParamsSchema,
  TerminalListResultSchema,
  type TerminalStartParams,
  type TerminalStartResult,
  type TerminalWriteParams,
  type TerminalWriteResult,
  type TerminalReadParams,
  type TerminalReadResult,
  type TerminalResizeParams,
  type TerminalResizeResult,
  type TerminalStatusParams,
  type TerminalStatusResult,
  type TerminalStopParams,
  type TerminalStopResult,
  type TerminalListParams,
  type TerminalListResult,
} from "../terminal/index.js";
import {
  ProcessListParamsSchema,
  ProcessListResultSchema,
  ProcessStatusParamsSchema,
  ProcessStatusResultSchema,
  ProcessKillParamsSchema,
  ProcessKillResultSchema,
  ProcessTreeParamsSchema,
  ProcessTreeResultSchema,
  type ProcessListParams,
  type ProcessListResult,
  type ProcessStatusParams,
  type ProcessStatusResult,
  type ProcessKillParams,
  type ProcessKillResult,
  type ProcessTreeParams,
  type ProcessTreeResult,
} from "../process/index.js";
import {
  PortListParamsSchema,
  PortListResultSchema,
  PortKillParamsSchema,
  PortKillResultSchema,
  type PortListParams,
  type PortListResult,
  type PortKillParams,
  type PortKillResult,
} from "../port/index.js";
import {
  AgentTaskCreateParamsSchema,
  AgentTaskCreateResultSchema,
  AgentTaskStatusParamsSchema,
  AgentTaskStatusResultSchema,
  AgentTaskLogsParamsSchema,
  AgentTaskLogsResultSchema,
  AgentTaskCancelParamsSchema,
  AgentTaskCancelResultSchema,
  AgentTaskPauseParamsSchema,
  AgentTaskPauseResultSchema,
  AgentTaskResumeParamsSchema,
  AgentTaskResumeResultSchema,
  AgentTaskListParamsSchema,
  AgentTaskListResultSchema,
  AgentTaskApproveParamsSchema,
  AgentTaskApproveResultSchema,
  type AgentTaskCreateParams,
  type AgentTaskCreateResult,
  type AgentTaskStatusParams,
  type AgentTaskStatusResult,
  type AgentTaskLogsParams,
  type AgentTaskLogsResult,
  type AgentTaskCancelParams,
  type AgentTaskCancelResult,
  type AgentTaskPauseParams,
  type AgentTaskPauseResult,
  type AgentTaskResumeParams,
  type AgentTaskResumeResult,
  type AgentTaskListParams,
  type AgentTaskListResult,
  type AgentTaskApproveParams,
  type AgentTaskApproveResult,
} from "../agent-task/index.js";

export type {
  EnvironmentDetectParams,
  EnvironmentDetectResult,
  ProjectDetectParams,
  ProjectDetectResult,
  TerminalStartParams,
  TerminalStartResult,
  TerminalWriteParams,
  TerminalWriteResult,
  TerminalReadParams,
  TerminalReadResult,
  TerminalResizeParams,
  TerminalResizeResult,
  TerminalStatusParams,
  TerminalStatusResult,
  TerminalStopParams,
  TerminalStopResult,
  TerminalListParams,
  TerminalListResult,
  ProcessListParams,
  ProcessListResult,
  ProcessStatusParams,
  ProcessStatusResult,
  ProcessKillParams,
  ProcessKillResult,
  ProcessTreeParams,
  ProcessTreeResult,
  PortListParams,
  PortListResult,
  PortKillParams,
  PortKillResult,
  AgentTaskCreateParams,
  AgentTaskCreateResult,
  AgentTaskStatusParams,
  AgentTaskStatusResult,
  AgentTaskLogsParams,
  AgentTaskLogsResult,
  AgentTaskCancelParams,
  AgentTaskCancelResult,
  AgentTaskPauseParams,
  AgentTaskPauseResult,
  AgentTaskResumeParams,
  AgentTaskResumeResult,
  AgentTaskListParams,
  AgentTaskListResult,
  AgentTaskApproveParams,
  AgentTaskApproveResult,
};

import {
  DiscoveryQueryParamsSchema,
  DiscoveryQueryResultSchema,
  LaunchApplicationParamsSchema,
  LaunchApplicationResultSchema,
  VerifyResourceParamsSchema,
  VerifyResourceResultSchema,
  ContentIndexQueryParamsSchema,
  ContentIndexQueryResultSchema,
  InspectResourceParamsSchema,
  InspectResourceResultSchema,
  DiscoveryRefreshParamsSchema,
  DiscoveryRefreshResultSchema,
  type DiscoveryQueryParams,
  type DiscoveryQueryResult,
  type LaunchApplicationParams,
  type LaunchApplicationResult,
  type VerifyResourceParams,
  type VerifyResourceResult,
  type ContentIndexQueryParams,
  type ContentIndexQueryResult,
  type InspectResourceParams,
  type InspectResourceResult,
  type DiscoveryRefreshParams,
  type DiscoveryRefreshResult,
} from "../discovery/index.js";

export const OperationIdSchema = z
  .string()
  .regex(/^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// Constraints
export const MIN_RPC_TIMEOUT = 1000;
export const MAX_RPC_TIMEOUT = 300000;
export const DEFAULT_RPC_TIMEOUT = 10000;
export const SYSTEM_PING_TIMEOUT = 5000;
export const SYSTEM_INFO_TIMEOUT = 10000;
export const PROJECT_LIST_TIMEOUT = 10000;
export const PROJECT_INFO_TIMEOUT = 5000;
export const PROJECT_VALIDATE_TIMEOUT = 5000;

export const MAX_RPC_MESSAGE_SIZE = 32 * 1024 * 1024; // 32 MiB (33,554,432 bytes)
export const MAX_PENDING_REQUESTS = 64;

export interface RpcRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Generate a cryptographically random, unique JSON-RPC 2.0 Request ID.
 * Format: req_<UUIDv4>
 */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

// 1. system.ping
export const SystemPingParamsSchema = z.object({}).strict();
export type SystemPingParams = z.infer<typeof SystemPingParamsSchema>;

export const SystemPingResultSchema = z.object({
  pong: z.literal(true),
  timestamp: z.number(),
  runnerId: z.string(),
});
export type SystemPingResult = z.infer<typeof SystemPingResultSchema>;

// 2. system.info
export const SystemInfoParamsSchema = z.object({}).strict();
export type SystemInfoParams = z.infer<typeof SystemInfoParamsSchema>;

export const SystemInfoResultSchema = z.object({
  runnerId: z.string(),
  runnerVersion: z.string(),
  protocolVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  hostname: z.string(),
  nodeVersion: z.string(),
  capabilities: RunnerCapabilitiesSchema,
  tools: RunnerToolsSchema,
});
export type SystemInfoResult = z.infer<typeof SystemInfoResultSchema>;

export const ProjectAccessModeSchema = z.enum(["read-only", "read-write"]);
export type ProjectAccessMode = z.infer<typeof ProjectAccessModeSchema>;

export const ProjectExecutionModeSchema = z.enum(["disabled", "safe-only", "project-code"]);
export type ProjectExecutionMode = z.infer<typeof ProjectExecutionModeSchema>;

// 3. project.list
export const ProjectListParamsSchema = z.object({}).strict();
export type ProjectListParams = z.infer<typeof ProjectListParamsSchema>;

export const ProjectListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  accessMode: ProjectAccessModeSchema.default("read-only"),
  executionMode: ProjectExecutionModeSchema.default("disabled"),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

export const ProjectListResultSchema = z.array(ProjectListItemSchema);
export type ProjectListResult = z.infer<typeof ProjectListResultSchema>;

// 4. project.info
export const ProjectInfoParamsSchema = z.object({
  projectId: z.string(),
}).strict();
export type ProjectInfoParams = z.infer<typeof ProjectInfoParamsSchema>;

export const ProjectInfoResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  healthy: z.boolean(),
  accessMode: ProjectAccessModeSchema.default("read-only"),
  executionMode: ProjectExecutionModeSchema.default("disabled"),
});
export type ProjectInfoResult = z.infer<typeof ProjectInfoResultSchema>;

// 5. project.validate
export const ProjectValidateParamsSchema = z.object({
  projectId: z.string(),
  path: z.string().optional(),
}).strict();
export type ProjectValidateParams = z.infer<typeof ProjectValidateParamsSchema>;

export const ProjectValidateResultSchema = z.object({
  valid: z.boolean(),
  isSensitive: z.boolean().optional(),
  reason: z.string().optional(),
});
export type ProjectValidateResult = z.infer<typeof ProjectValidateResultSchema>;

// 6. directory.list
export const DirectoryListParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string().default("."),
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z.string().nullable().optional(),
    sessionId: z.string().optional(),
  })
  .strict();
export type DirectoryListParams = z.infer<typeof DirectoryListParamsSchema>;

export const DirectoryEntrySchema = z
  .object({
    name: z.string(),
    type: z.enum(["file", "directory", "symlink"]),
    size: z.number().optional(),
    modifiedAt: z.number().optional(),
    accessible: z.boolean().optional(),
  })
  .strict();
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryListResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    entries: z.array(DirectoryEntrySchema),
    nextCursor: z.string().nullable(),
    sensitiveEntriesFiltered: z.boolean(),
  })
  .strict();
export type DirectoryListResult = z.infer<typeof DirectoryListResultSchema>;

// 7. file.stat
export const FileStatParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
  })
  .strict();
export type FileStatParams = z.infer<typeof FileStatParamsSchema>;

export const FileStatResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    name: z.string(),
    type: z.enum(["file", "directory", "symlink"]),
    size: z.number().optional(),
    modifiedAt: z.number(),
    accessible: z.boolean().optional(),
  })
  .strict();
export type FileStatResult = z.infer<typeof FileStatResultSchema>;

// 8. file.read
export const FileReadParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    startLine: z.number().int().min(1).default(1),
    maxLines: z.number().int().min(1).max(500).default(300),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FileReadParams = z.infer<typeof FileReadParamsSchema>;

export const FileLineSchema = z
  .object({
    line: z.number().int().min(1),
    text: z.string(),
  })
  .strict();
export type FileLine = z.infer<typeof FileLineSchema>;

export const FileReadResultSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    encoding: z.literal("utf-8"),
    contentHash: z.string(),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(0),
    nextLine: z.number().int().min(1).nullable(),
    truncated: z.boolean(),
    lines: z.array(FileLineSchema),
  })
  .strict();
export type FileReadResult = z.infer<typeof FileReadResultSchema>;

// 9. file.create
export const FileCreateParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    content: z.string(),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FileCreateParams = z.infer<typeof FileCreateParamsSchema>;

export const FileCreateResultSchema = z
  .object({
    operationId: OperationIdSchema,
    projectId: z.string(),
    path: z.string(),
    newHash: z.string(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type FileCreateResult = z.infer<typeof FileCreateResultSchema>;

// 10. file.write
export const FileWriteParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
    content: z.string(),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FileWriteParams = z.infer<typeof FileWriteParamsSchema>;

export const FileWriteResultSchema = z
  .object({
    operationId: OperationIdSchema,
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    newHash: z.string(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    backupCreated: z.boolean(),
  })
  .strict();
export type FileWriteResult = z.infer<typeof FileWriteResultSchema>;

// 11. file.patch
export const PatchReplacementSchema = z
  .object({
    search: z.string().min(1, "Search text cannot be empty"),
    replace: z.string(),
  })
  .strict();
export type PatchReplacement = z.infer<typeof PatchReplacementSchema>;

export const FilePatchParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
    replacements: z.array(PatchReplacementSchema).min(1, "At least one replacement is required"),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FilePatchParams = z.infer<typeof FilePatchParamsSchema>;

export const FilePatchResultSchema = z
  .object({
    operationId: OperationIdSchema,
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    newHash: z.string(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    replacementsApplied: z.number().int().positive(),
  })
  .strict();
export type FilePatchResult = z.infer<typeof FilePatchResultSchema>;

// 12. file.delete
export const FileDeleteParamsSchema = z
  .object({
    projectId: z.string(),
    path: z.string(),
    expectedHash: z.string(),
    approvalId: z.string().regex(/^approval_[0-9a-f-]{36}$/i).optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FileDeleteParams = z.infer<typeof FileDeleteParamsSchema>;

export const FileDeleteResultSchema = z
  .object({
    operationId: OperationIdSchema,
    projectId: z.string(),
    path: z.string(),
    oldHash: z.string(),
    deleted: z.boolean(),
    backupCreated: z.boolean(),
  })
  .strict();
export type FileDeleteResult = z.infer<typeof FileDeleteResultSchema>;

// 13. file.restore
export const FileRestoreParamsSchema = z
  .object({
    projectId: z.string(),
    operationId: OperationIdSchema,
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type FileRestoreParams = z.infer<typeof FileRestoreParamsSchema>;

export const FileRestoreResultSchema = z
  .object({
    operationId: OperationIdSchema,
    projectId: z.string(),
    path: z.string(),
    restoredHash: z.string(),
    bytesRestored: z.number().int().nonnegative(),
  })
  .strict();
export type FileRestoreResult = z.infer<typeof FileRestoreResultSchema>;

// 14. git.info
export const GitInfoParamsSchema = z
  .object({
    projectId: z.string(),
    sessionId: z.string().optional(),
  })
  .strict();
export type GitInfoParams = z.infer<typeof GitInfoParamsSchema>;

export const GitInfoResultSchema = z
  .object({
    projectId: z.string(),
    isRepository: z.boolean(),
    branch: z.string().nullable(),
    detached: z.boolean(),
    head: z.string().nullable(),
    shortHead: z.string().nullable(),
    hasUpstream: z.boolean(),
  })
  .strict();
export type GitInfoResult = z.infer<typeof GitInfoResultSchema>;

// 15. git.status
export const GitStatusEntryKindSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "typechanged",
  "untracked",
  "conflicted",
]);
export type GitStatusEntryKind = z.infer<typeof GitStatusEntryKindSchema>;

export const GitStatusEntrySchema = z
  .object({
    path: z.string(),
    indexStatus: z.string(),
    worktreeStatus: z.string(),
    kind: GitStatusEntryKindSchema,
    oldPath: z.string().optional(),
  })
  .strict();
export type GitStatusEntry = z.infer<typeof GitStatusEntrySchema>;

export const GitStatusParamsSchema = z
  .object({
    projectId: z.string(),
    sessionId: z.string().optional(),
  })
  .strict();
export type GitStatusParams = z.infer<typeof GitStatusParamsSchema>;

export const GitStatusResultSchema = z
  .object({
    projectId: z.string(),
    branch: z.string().nullable(),
    detached: z.boolean(),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
    clean: z.boolean(),
    entries: z.array(GitStatusEntrySchema),
    sensitiveEntriesFiltered: z.boolean(),
    truncated: z.boolean(),
  })
  .strict();
export type GitStatusResult = z.infer<typeof GitStatusResultSchema>;

// 16. git.diff
export const GitDiffScopeSchema = z.enum(["unstaged", "staged"]);
export type GitDiffScope = z.infer<typeof GitDiffScopeSchema>;

export const GitDiffParamsSchema = z
  .object({
    projectId: z.string(),
    scope: GitDiffScopeSchema.default("unstaged"),
    path: z.string().optional(),
    contextLines: z.number().int().min(0).max(20).default(3),
    sessionId: z.string().optional(),
  })
  .strict();
export type GitDiffParams = z.infer<typeof GitDiffParamsSchema>;

export const GitDiffResultSchema = z
  .object({
    projectId: z.string(),
    scope: GitDiffScopeSchema,
    files: z.array(z.string()),
    diff: z.string(),
    sensitiveEntriesFiltered: z.boolean(),
    symlinkEntriesFiltered: z.boolean(),
    submoduleEntriesFiltered: z.boolean(),
  })
  .strict();
export type GitDiffResult = z.infer<typeof GitDiffResultSchema>;

// 17. git.log
export const GitCommitSummarySchema = z
  .object({
    hash: z.string(),
    shortHash: z.string(),
    authorName: z.string(),
    timestamp: z.number().int(),
    subject: z.string(),
  })
  .strict();
export type GitCommitSummary = z.infer<typeof GitCommitSummarySchema>;

export const GitLogParamsSchema = z
  .object({
    projectId: z.string(),
    limit: z.number().int().min(1).max(100).default(20),
    path: z.string().optional(),
    sessionId: z.string().optional(),
  })
  .strict();
export type GitLogParams = z.infer<typeof GitLogParamsSchema>;

export const GitLogResultSchema = z
  .object({
    projectId: z.string(),
    commits: z.array(GitCommitSummarySchema),
  })
  .strict();
export type GitLogResult = z.infer<typeof GitLogResultSchema>;

// Git Write Schemas (P1-B)

// git.stage
export const GitStageParamsSchema = z
  .object({
    projectId: z.string(),
    paths: z.array(z.string().min(1)).min(1).max(128),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type GitStageParams = z.infer<typeof GitStageParamsSchema>;

export const GitStageResultSchema = z
  .object({
    projectId: z.string(),
    staged: z.array(z.string()),
  })
  .strict();
export type GitStageResult = z.infer<typeof GitStageResultSchema>;

export const GitStageToolInputSchema = z
  .object({
    projectId: z.string().describe("Target project identifier"),
    paths: z
      .array(z.string().min(1))
      .min(1)
      .max(128)
      .describe("Explicit relative file paths to stage within project bounds"),
    approvalId: z
      .string()
      .optional()
      .describe("Optional approval identifier used to execute an approved stage request"),
    sessionId: z
      .string()
      .optional()
      .describe("Optional workflow session ID to execute within bound worktree"),
  })
  .strict();

// git.unstage
export const GitUnstageParamsSchema = z
  .object({
    projectId: z.string(),
    paths: z.array(z.string().min(1)).min(1).max(128),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type GitUnstageParams = z.infer<typeof GitUnstageParamsSchema>;

export const GitUnstageResultSchema = z
  .object({
    projectId: z.string(),
    unstaged: z.array(z.string()),
  })
  .strict();
export type GitUnstageResult = z.infer<typeof GitUnstageResultSchema>;

export const GitUnstageToolInputSchema = z
  .object({
    projectId: z.string().describe("Target project identifier"),
    paths: z
      .array(z.string().min(1))
      .min(1)
      .max(128)
      .describe("Explicit relative file paths to unstage from git index (leaves worktree unchanged)"),
    approvalId: z
      .string()
      .optional()
      .describe("Optional approval identifier used to execute an approved unstage request"),
    sessionId: z
      .string()
      .optional()
      .describe("Optional workflow session ID to execute within bound worktree"),
  })
  .strict();

// git.branchCreate
export const GitBranchCreateParamsSchema = z
  .object({
    projectId: z.string(),
    branchName: z.string().min(1).max(255),
    startPoint: z.string().max(128).optional(),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type GitBranchCreateParams = z.infer<typeof GitBranchCreateParamsSchema>;

export const GitBranchCreateResultSchema = z
  .object({
    projectId: z.string(),
    branch: z.string(),
    commitHash: z.string(),
  })
  .strict();
export type GitBranchCreateResult = z.infer<typeof GitBranchCreateResultSchema>;

export const GitBranchCreateToolInputSchema = z
  .object({
    projectId: z.string().describe("Target project identifier"),
    branchName: z.string().min(1).max(255).describe("Name of the local branch to create"),
    startPoint: z
      .string()
      .max(128)
      .optional()
      .describe("Optional starting point commit hash or ref for the new branch"),
    approvalId: z
      .string()
      .optional()
      .describe("Optional approval identifier used to execute an approved branch creation request"),
    sessionId: z
      .string()
      .optional()
      .describe("Optional workflow session ID to execute within bound worktree"),
  })
  .strict();

// git.branchSwitch
export const GitBranchSwitchParamsSchema = z
  .object({
    projectId: z.string(),
    branchName: z.string().min(1).max(255),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type GitBranchSwitchParams = z.infer<typeof GitBranchSwitchParamsSchema>;

export const GitBranchSwitchResultSchema = z
  .object({
    projectId: z.string(),
    currentBranch: z.string(),
    previousBranch: z.string(),
  })
  .strict();
export type GitBranchSwitchResult = z.infer<typeof GitBranchSwitchResultSchema>;

export const GitBranchSwitchToolInputSchema = z
  .object({
    projectId: z.string().describe("Target project identifier"),
    branchName: z.string().min(1).max(255).describe("Name of existing local branch to switch to"),
    approvalId: z
      .string()
      .optional()
      .describe("Optional approval identifier used to execute an approved branch switch request"),
    sessionId: z
      .string()
      .optional()
      .describe("Optional workflow session ID to execute within bound worktree"),
  })
  .strict();

// git.commit
export const GitCommitParamsSchema = z
  .object({
    projectId: z.string(),
    message: z.string().min(1).max(4096),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type GitCommitParams = z.infer<typeof GitCommitParamsSchema>;

export const GitCommitResultSchema = z
  .object({
    projectId: z.string(),
    commitHash: z.string(),
    shortHash: z.string(),
    branch: z.string(),
    summary: z.string(),
  })
  .strict();
export type GitCommitResult = z.infer<typeof GitCommitResultSchema>;

export const GitCommitToolInputSchema = z
  .object({
    projectId: z.string().describe("Target project identifier"),
    message: z.string().min(1).max(4096).describe("Commit message describing staged changes"),
    approvalId: z
      .string()
      .optional()
      .describe("Optional approval identifier used to execute an approved commit request"),
    sessionId: z
      .string()
      .optional()
      .describe("Optional workflow session ID to execute within bound worktree"),
  })
  .strict();

// Command Risk Level
export const CommandRiskLevelSchema = z.enum(["SAFE", "CAUTION", "DANGEROUS"]);
export type CommandRiskLevel = z.infer<typeof CommandRiskLevelSchema>;

// Command Categories (P1-A)
export const CommandCategorySchema = z.enum([
  "inspect",
  "test",
  "lint",
  "typecheck",
  "build",
  "dev-server",
  "package-script",
  "package-install",
  "git-read",
  "custom-safe",
]);
export type CommandCategory = z.infer<typeof CommandCategorySchema>;

export const CommandExecutionModeSchema = z.enum([
  "disabled",
  "safe-development",
  "ask-before-execute",
  "custom",
]);
export type CommandExecutionMode = z.infer<typeof CommandExecutionModeSchema>;

// CommandSpec Discriminated Union
export const ToolVersionCommandSchema = z
  .object({
    kind: z.literal("tool-version"),
    projectId: z.string(),
    tool: z.enum([
      "node", "npm", "pnpm", "yarn", "bun", "deno",
      "python", "pip", "uv", "java", "javac", "go",
      "rustc", "cargo", "php", "composer", "ruby", "gem",
      "dotnet", "gcc", "g++", "clang", "cmake", "powershell", "pwsh", "docker", "git",
    ]),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type ToolVersionCommand = z.infer<typeof ToolVersionCommandSchema>;

export const NodeScriptCommandSchema = z
  .object({
    kind: z.literal("node-script"),
    projectId: z.string(),
    path: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type NodeScriptCommand = z.infer<typeof NodeScriptCommandSchema>;

export const PythonScriptCommandSchema = z
  .object({
    kind: z.literal("python-script"),
    projectId: z.string(),
    path: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type PythonScriptCommand = z.infer<typeof PythonScriptCommandSchema>;

export const PackageScriptCommandSchema = z
  .object({
    kind: z.literal("package-script"),
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm", "yarn", "bun"]),
    script: z.string(),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type PackageScriptCommand = z.infer<typeof PackageScriptCommandSchema>;

export const ShellCommandSchema = z
  .object({
    kind: z.literal("shell-command"),
    projectId: z.string(),
    command: z.string().min(1, "command is required"),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    env: z.record(z.string()).optional(),
    shell: z.enum(["cmd", "powershell", "pwsh", "bash", "sh"]).optional(),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type ShellCommand = z.infer<typeof ShellCommandSchema>;

// CommandSpec Discriminated Union
export const CommandSpecSchema = z.discriminatedUnion("kind", [
  ToolVersionCommandSchema,
  NodeScriptCommandSchema,
  PythonScriptCommandSchema,
  PackageScriptCommandSchema,
  ShellCommandSchema,
]);
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

/**
 * Explicit object schemas for MCP Tools (e.g. ChatGPT / OpenAI Tool Calling).
 * OpenAI and MCP clients require a flat `{ type: "object", properties: { ... } }`
 * schema to discover tool parameters instead of generic `{ [key: string]: any }`.
 */
export const CommandSpecToolSchema = z.object({
  projectId: z.string().describe("Target project identifier"),
  kind: z
    .enum(["tool-version", "node-script", "python-script", "package-script", "shell-command"])
    .describe("Kind of command to execute"),
  tool: z
    .string()
    .optional()
    .describe("Tool name for tool-version inspection (node, npm, pnpm, python, cargo, go, etc.)"),
  path: z
    .string()
    .optional()
    .describe("Relative path to script within project (required for node-script/python-script)"),
  manager: z
    .enum(["npm", "pnpm", "yarn", "bun"])
    .optional()
    .describe("Package manager for package-script (npm, pnpm, yarn, bun)"),
  script: z
    .string()
    .optional()
    .describe("Package script name (e.g. build, test, lint)"),
  command: z
    .string()
    .optional()
    .describe("Command or executable name to run (for shell-command, e.g. cargo, go, bun, deno)"),
  args: z
    .array(z.string())
    .max(64)
    .default([])
    .describe("Optional command arguments"),
  cwd: z
    .string()
    .default(".")
    .describe("Working directory relative to project root"),
  env: z
    .record(z.string())
    .optional()
    .describe("Optional additional environment variables"),
  shell: z
    .enum(["cmd", "powershell", "pwsh", "bash", "sh"])
    .optional()
    .describe("Optional shell to execute command within (cmd, powershell, pwsh, bash, sh)"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(60000)
    .describe("Command timeout in milliseconds"),
  sessionId: z
    .string()
    .optional()
    .describe("Optional workflow session ID to execute within bound worktree"),
  callerPurpose: z
    .string()
    .optional()
    .describe("Optional caller purpose identifier"),
});
export type CommandSpecTool = z.infer<typeof CommandSpecToolSchema>;

export const CommandClassifyToolInputSchema = CommandSpecToolSchema;
export type CommandClassifyToolInput = z.infer<typeof CommandClassifyToolInputSchema>;

export const CommandRunToolInputSchema = CommandSpecToolSchema.extend({
  approvalId: z
    .string()
    .optional()
    .describe("Optional approval identifier used to retry an approved command request."),
});
export type CommandRunToolInput = z.infer<typeof CommandRunToolInputSchema>;

export const JobStartToolInputSchema = z.object({
  command: CommandSpecToolSchema.describe("Command specification to run in background"),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(60000)
    .describe("Job timeout in milliseconds"),
  approvalId: z
    .string()
    .optional()
    .describe("Optional approval identifier used to retry an approved job request."),
  sessionId: z
    .string()
    .optional()
    .describe("Optional workflow session ID to execute within bound worktree"),
});
export type JobStartToolInput = z.infer<typeof JobStartToolInputSchema>;

/**
 * Sanitize raw command arguments received from an AI/MCP client to strictly conform
 * to the corresponding CommandSpec variant without unexpected undefined/null properties.
 */
export function sanitizeCommandSpec(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  const kind = raw.kind;
  const base: Record<string, any> = {
    projectId: raw.projectId,
    kind: raw.kind,
  };
  if (raw.approvalId !== undefined && raw.approvalId !== null && raw.approvalId !== "") {
    base.approvalId = raw.approvalId;
  }
  if (raw.sessionId !== undefined && raw.sessionId !== null && raw.sessionId !== "") {
    base.sessionId = raw.sessionId;
  }
  if (raw.callerPurpose !== undefined && raw.callerPurpose !== null && raw.callerPurpose !== "") {
    base.callerPurpose = raw.callerPurpose;
  }
  if (kind === "tool-version") {
    if (raw.tool !== undefined && raw.tool !== null) base.tool = raw.tool;
    return base;
  }
  if (kind === "node-script" || kind === "python-script") {
    if (raw.path !== undefined && raw.path !== null) base.path = raw.path;
    if (raw.args !== undefined && raw.args !== null) base.args = raw.args;
    if (raw.cwd !== undefined && raw.cwd !== null) base.cwd = raw.cwd;
    if (raw.timeoutMs !== undefined && raw.timeoutMs !== null) base.timeoutMs = raw.timeoutMs;
    return base;
  }
  if (kind === "package-script") {
    if (raw.manager !== undefined && raw.manager !== null) base.manager = raw.manager;
    if (raw.script !== undefined && raw.script !== null) base.script = raw.script;
    if (raw.args !== undefined && raw.args !== null) base.args = raw.args;
    if (raw.cwd !== undefined && raw.cwd !== null) base.cwd = raw.cwd;
    if (raw.timeoutMs !== undefined && raw.timeoutMs !== null) base.timeoutMs = raw.timeoutMs;
    return base;
  }
  if (kind === "shell-command") {
    if (raw.command !== undefined && raw.command !== null) base.command = raw.command;
    if (raw.args !== undefined && raw.args !== null) base.args = raw.args;
    if (raw.cwd !== undefined && raw.cwd !== null) base.cwd = raw.cwd;
    if (raw.env !== undefined && raw.env !== null) base.env = raw.env;
    if (raw.shell !== undefined && raw.shell !== null) base.shell = raw.shell;
    if (raw.timeoutMs !== undefined && raw.timeoutMs !== null) base.timeoutMs = raw.timeoutMs;
    return base;
  }
  return raw;
}


// 18. command.classify
export const CommandClassifyParamsSchema = CommandSpecSchema;
export type CommandClassifyParams = z.infer<typeof CommandClassifyParamsSchema>;

export const CommandClassifyResultSchema = z
  .object({
    risk: CommandRiskLevelSchema,
    reasons: z.array(z.string()),
    executesProjectCode: z.boolean(),
    mayModifyFiles: z.boolean(),
    mayAccessNetwork: z.boolean(),
    allowed: z.boolean(),
    reason: z.string().optional(),
  })
  .strict();
export type CommandClassifyResult = z.infer<typeof CommandClassifyResultSchema>;

// 19. command.run
export const CommandRunParamsSchema = CommandSpecSchema;
export type CommandRunParams = z.infer<typeof CommandRunParamsSchema>;

export const CommandRunResultSchema = z
  .object({
    projectId: z.string(),
    risk: z.enum(["SAFE", "CAUTION"]),
    exitCode: z.number().int(),
    signal: z.string().nullable(),
    durationMs: z.number().int().nonnegative(),
    stdout: z.string(),
    stderr: z.string(),
    timedOut: z.boolean(),
  })
  .strict();
export type CommandRunResult = z.infer<typeof CommandRunResultSchema>;

// Phase 9: Job States
export const JobStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "timed-out",
  "interrupted",
]);
export type JobState = z.infer<typeof JobStateSchema>;

// 20. job.start
export const JobStartParamsSchema = z
  .object({
    command: CommandSpecSchema,
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
    sessionId: z.string().optional(),
    callerPurpose: z.string().optional(),
  })
  .strict();
export type JobStartParams = z.infer<typeof JobStartParamsSchema>;

export const JobStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type JobStartResult = z.infer<typeof JobStartResultSchema>;

// 21. job.status
export const JobStatusParamsSchema = z
  .object({
    jobId: z.string(),
  })
  .strict();
export type JobStatusParams = z.infer<typeof JobStatusParamsSchema>;

export const JobStatusResultSchema = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    state: JobStateSchema,
    risk: CommandRiskLevelSchema,
    createdAt: z.number().int(),
    queuedAt: z.number().int().nullable().optional(),
    startedAt: z.number().int().nullable(),
    finishedAt: z.number().int().nullable(),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    durationMs: z.number().int().nonnegative(),
    outputTruncated: z.boolean().default(false),
    lastOutput: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();
export type JobStatusResult = z.infer<typeof JobStatusResultSchema>;

// 22. job.logs
export const JobLogChunkSchema = z
  .object({
    seq: z.number().int().positive(),
    stream: z.enum(["stdout", "stderr"]),
    timestamp: z.number().int(),
    text: z.string(),
  })
  .strict();
export type JobLogChunk = z.infer<typeof JobLogChunkSchema>;

export const JobLogsParamsSchema = z
  .object({
    jobId: z.string(),
    cursor: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict();
export type JobLogsParams = z.infer<typeof JobLogsParamsSchema>;

export const JobLogsResultSchema = z
  .object({
    jobId: z.string(),
    chunks: z.array(JobLogChunkSchema),
    nextCursor: z.string().nullable(),
    truncated: z.boolean(),
    droppedBytes: z.number().int().nonnegative(),
  })
  .strict();
export type JobLogsResult = z.infer<typeof JobLogsResultSchema>;

// 23. job.cancel
export const JobCancelParamsSchema = z
  .object({
    jobId: z.string(),
    projectId: z.string().optional(),
  })
  .strict();
export type JobCancelParams = z.infer<typeof JobCancelParamsSchema>;

export const JobCancelResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    alreadyTerminal: z.boolean(),
  })
  .strict();
export type JobCancelResult = z.infer<typeof JobCancelResultSchema>;

// 24. job.list
export const JobListParamsSchema = z
  .object({
    projectId: z.string().optional(),
    state: JobStateSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type JobListParams = z.infer<typeof JobListParamsSchema>;

export const JobSummarySchema = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    state: JobStateSchema,
    commandKind: z.string(),
    risk: CommandRiskLevelSchema,
    createdAt: z.number().int(),
    startedAt: z.number().int().nullable(),
    finishedAt: z.number().int().nullable(),
    exitCode: z.number().int().nullable(),
    outputTruncated: z.boolean().optional(),
    error: z.string().optional(),
  })
  .strict();
export type JobSummary = z.infer<typeof JobSummarySchema>;

export const JobListResultSchema = z
  .object({
    jobs: z.array(JobSummarySchema),
  })
  .strict();
export type JobListResult = z.infer<typeof JobListResultSchema>;

// 25. build.start
export const BuildStartParamsSchema = z
  .object({
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm"]).default("pnpm"),
    script: z.string().default("build"),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
  })
  .strict();
export type BuildStartParams = z.infer<typeof BuildStartParamsSchema>;

export const BuildStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type BuildStartResult = z.infer<typeof BuildStartResultSchema>;

// 26. test.start
export const TestStartParamsSchema = z
  .object({
    projectId: z.string(),
    manager: z.enum(["npm", "pnpm"]).default("pnpm"),
    script: z.string().default("test"),
    args: z.array(z.string()).max(64).default([]),
    cwd: z.string().default("."),
    timeoutMs: z.number().int().min(1000).max(300000).default(60000),
    approvalId: z.string().optional(),
  })
  .strict();
export type TestStartParams = z.infer<typeof TestStartParamsSchema>;

export const TestStartResultSchema = z
  .object({
    jobId: z.string(),
    state: JobStateSchema,
    createdAt: z.number().int(),
  })
  .strict();
export type TestStartResult = z.infer<typeof TestStartResultSchema>;

// 28. project.authorize
export const ProjectAuthorizeParamsSchema = z
  .object({
    path: z.string(),
    name: z.string().optional(),
    accessMode: ProjectAccessModeSchema.default("read-only"),
  })
  .strict();
export type ProjectAuthorizeParams = z.infer<typeof ProjectAuthorizeParamsSchema>;

export const ProjectAuthorizeResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    root: z.string(),
    enabled: z.boolean(),
    accessMode: ProjectAccessModeSchema,
    executionMode: ProjectExecutionModeSchema,
  })
  .strict();
export type ProjectAuthorizeResult = z.infer<typeof ProjectAuthorizeResultSchema>;

// 29. project.setAccess
export const ProjectSetAccessParamsSchema = z
  .object({
    projectId: z.string(),
    accessMode: ProjectAccessModeSchema,
  })
  .strict();
export type ProjectSetAccessParams = z.infer<typeof ProjectSetAccessParamsSchema>;

export const ProjectSetAccessResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    accessMode: ProjectAccessModeSchema,
    executionMode: ProjectExecutionModeSchema,
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectSetAccessResult = z.infer<typeof ProjectSetAccessResultSchema>;

// 30. project.setExecution
export const ProjectSetExecutionParamsSchema = z
  .object({
    projectId: z.string(),
    executionMode: ProjectExecutionModeSchema,
  })
  .strict();
export type ProjectSetExecutionParams = z.infer<typeof ProjectSetExecutionParamsSchema>;

export const ProjectSetExecutionResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    executionMode: ProjectExecutionModeSchema,
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectSetExecutionResult = z.infer<typeof ProjectSetExecutionResultSchema>;

// 31. project.remove
export const ProjectRemoveParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectRemoveParams = z.infer<typeof ProjectRemoveParamsSchema>;

export const ProjectRemoveResultSchema = z
  .object({
    id: z.string(),
    removed: z.boolean(),
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectRemoveResult = z.infer<typeof ProjectRemoveResultSchema>;

// 32. project.enable
export const ProjectEnableParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectEnableParams = z.infer<typeof ProjectEnableParamsSchema>;

export const ProjectEnableResultSchema = z
  .object({
    id: z.string(),
    enabled: z.literal(true),
  })
  .strict();
export type ProjectEnableResult = z.infer<typeof ProjectEnableResultSchema>;

// 33. project.disable
export const ProjectDisableParamsSchema = z
  .object({
    projectId: z.string(),
  })
  .strict();
export type ProjectDisableParams = z.infer<typeof ProjectDisableParamsSchema>;

export const ProjectDisableResultSchema = z
  .object({
    id: z.string(),
    disabled: z.literal(true),
    cancelledJobsCount: z.number().int().default(0),
  })
  .strict();
export type ProjectDisableResult = z.infer<typeof ProjectDisableResultSchema>;

// Approvals
export const ApprovalRiskSchema = z.enum(["CAUTION", "DANGEROUS"]);
export type ApprovalRisk = z.infer<typeof ApprovalRiskSchema>;

export const ApprovalStatusSchema = z.enum(["pending", "approved", "denied", "expired", "consumed"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    operation: z.string(),
    risk: ApprovalRiskSchema,
    summary: z.string(),
    payloadHash: z.string(),
    createdAt: z.number().int(),
    expiresAt: z.number().int(),
    status: ApprovalStatusSchema,
    resolvedAt: z.number().int().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    decisionSource: z.string().nullable().optional(),
    approvalMode: z.string().nullable().optional(),
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalRoutingModeSchema = z.enum(["chat", "auto-trusted", "desktop", "hybrid"]);
export type ApprovalRoutingMode = z.infer<typeof ApprovalRoutingModeSchema>;

export const ApprovalSetModeParamsSchema = z
  .object({
    mode: ApprovalRoutingModeSchema,
  })
  .strict();
export type ApprovalSetModeParams = z.infer<typeof ApprovalSetModeParamsSchema>;

export const ApprovalSetModeResultSchema = z
  .object({
    mode: ApprovalRoutingModeSchema,
    success: z.boolean(),
  })
  .strict();
export type ApprovalSetModeResult = z.infer<typeof ApprovalSetModeResultSchema>;

export const SecurityModeSchema = z.enum(["safe", "universal", "SAFE", "STANDARD", "UNRESTRICTED"]);
export type SecurityMode = z.infer<typeof SecurityModeSchema>;

export function isUnrestrictedMode(mode?: string | null): boolean {
  if (!mode) return false;
  const m = String(mode).toUpperCase();
  return m === "UNRESTRICTED" || m === "UNIVERSAL";
}

export function isStandardMode(mode?: string | null): boolean {
  if (!mode) return false;
  return String(mode).toUpperCase() === "STANDARD";
}

export function isSafeMode(mode?: string | null): boolean {
  if (!mode) return true;
  return String(mode).toUpperCase() === "SAFE";
}

export const SafetyLayerSetStatusParamsSchema = z
  .object({
    disabled: z.boolean().optional(),
    mode: SecurityModeSchema.optional(),
  });
export type SafetyLayerSetStatusParams = z.infer<typeof SafetyLayerSetStatusParamsSchema>;

export const SafetyLayerSetStatusResultSchema = z
  .object({
    disabled: z.boolean(),
    mode: SecurityModeSchema,
    securityMode: SecurityModeSchema,
    success: z.boolean(),
  });
export type SafetyLayerSetStatusResult = z.infer<typeof SafetyLayerSetStatusResultSchema>;

export const SafetyLayerGetStatusParamsSchema = z.object({}).passthrough();
export type SafetyLayerGetStatusParams = z.infer<typeof SafetyLayerGetStatusParamsSchema>;

export const SafetyLayerGetStatusResultSchema = z
  .object({
    disabled: z.boolean(),
    mode: SecurityModeSchema,
    securityMode: SecurityModeSchema,
  });
export type SafetyLayerGetStatusResult = z.infer<typeof SafetyLayerGetStatusResultSchema>;

// 34. approval.create
export const ApprovalCreateParamsSchema = z
  .object({
    projectId: z.string(),
    operation: z.string(),
    risk: ApprovalRiskSchema,
    summary: z.string(),
    payloadHash: z.string(),
    timeoutMs: z.number().int().min(1000).max(3600000).default(300000),
    decisionSource: z.string().optional(),
  })
  .strict();
export type ApprovalCreateParams = z.infer<typeof ApprovalCreateParamsSchema>;

export const ApprovalCreateResultSchema = ApprovalRequestSchema;
export type ApprovalCreateResult = z.infer<typeof ApprovalCreateResultSchema>;

// 35. approval.resolve
export const ApprovalResolveParamsSchema = z
  .object({
    approvalId: z.string(),
    action: z.enum(["approve", "deny"]),
    resolvedBy: z.string().default("local-user"),
    decisionSource: z.string().optional(),
  })
  .strict();
export type ApprovalResolveParams = z.infer<typeof ApprovalResolveParamsSchema>;

export const ApprovalResolveResultSchema = ApprovalRequestSchema;
export type ApprovalResolveResult = z.infer<typeof ApprovalResolveResultSchema>;

// 36. approval.list
export const ApprovalListParamsSchema = z
  .object({
    projectId: z.string().optional(),
    status: ApprovalStatusSchema.optional(),
  })
  .strict();
export type ApprovalListParams = z.infer<typeof ApprovalListParamsSchema>;

export const ApprovalListResultSchema = z.array(ApprovalRequestSchema);
export type ApprovalListResult = z.infer<typeof ApprovalListResultSchema>;

// 37. approval.get
export const ApprovalGetParamsSchema = z
  .object({
    approvalId: z.string(),
  })
  .strict();
export type ApprovalGetParams = z.infer<typeof ApprovalGetParamsSchema>;

export const ApprovalGetResultSchema = ApprovalRequestSchema;
export type ApprovalGetResult = z.infer<typeof ApprovalGetResultSchema>;

// 38. job.cancelAll
export const JobCancelAllParamsSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();
export type JobCancelAllParams = z.infer<typeof JobCancelAllParamsSchema>;

export const JobCancelAllResultSchema = z
  .object({
    cancelledCount: z.number().int().nonnegative(),
    jobIds: z.array(z.string()),
  })
  .strict();
export type JobCancelAllResult = z.infer<typeof JobCancelAllResultSchema>;

export const SystemShutdownParamsSchema = z.object({ reason: z.string().optional() }).strict();
export type SystemShutdownParams = z.infer<typeof SystemShutdownParamsSchema>;
export const SystemShutdownResultSchema = z.object({ accepted: z.literal(true) }).strict();
export type SystemShutdownResult = z.infer<typeof SystemShutdownResultSchema>;

// Trust & Approval Policy
export const ProjectTrustLevelSchema = z.enum(["standard", "session-trusted", "full-project-trust", "custom"]);
export type ProjectTrustLevel = z.infer<typeof ProjectTrustLevelSchema>;

export const FileActionPolicySchema = z.enum(["allow", "ask", "deny"]);
export type FileActionPolicy = z.infer<typeof FileActionPolicySchema>;

export const CommandActionPolicySchema = z.enum(["allow", "ask", "controlled", "deny"]);
export type CommandActionPolicy = z.infer<typeof CommandActionPolicySchema>;

export const ProtectedFilesPolicySchema = z.enum(["always-ask", "deny", "follow-policy"]);
export type ProtectedFilesPolicy = z.infer<typeof ProtectedFilesPolicySchema>;

export const ProjectCustomRulesSchema = z
  .object({
    files: z
      .object({
        read: FileActionPolicySchema.optional(),
        create: FileActionPolicySchema.optional(),
        write: FileActionPolicySchema.optional(),
        patch: FileActionPolicySchema.optional(),
        delete: FileActionPolicySchema.optional(),
        rename: FileActionPolicySchema.optional(),
      })
      .optional(),
    git: z
      .object({
        status: FileActionPolicySchema.optional(),
        diff: FileActionPolicySchema.optional(),
        log: FileActionPolicySchema.optional(),
        stage: FileActionPolicySchema.optional(),
        unstage: FileActionPolicySchema.optional(),
        commit: FileActionPolicySchema.optional(),
        createBranch: FileActionPolicySchema.optional(),
        switchBranch: FileActionPolicySchema.optional(),
        restore: FileActionPolicySchema.optional(),
      })
      .optional(),
    commands: z
      .object({
        inspect: FileActionPolicySchema.optional(),
        test: FileActionPolicySchema.optional(),
        lint: FileActionPolicySchema.optional(),
        typecheck: FileActionPolicySchema.optional(),
        build: FileActionPolicySchema.optional(),
        devServer: FileActionPolicySchema.optional(),
        packageScript: FileActionPolicySchema.optional(),
        packageInstall: FileActionPolicySchema.optional(),
        gitRead: FileActionPolicySchema.optional(),
        customSafe: FileActionPolicySchema.optional(),
        controlledCommand: FileActionPolicySchema.optional(),
      })
      .optional(),
  })
  .strict();
export type ProjectCustomRules = z.infer<typeof ProjectCustomRulesSchema>;

export const ProjectTrustPolicySchema = z
  .object({
    trustLevel: ProjectTrustLevelSchema,
    filePolicy: FileActionPolicySchema.optional(),
    canonicalRoot: z.string(),
    policyVersion: z.number().int().default(1),
    commandPolicy: CommandActionPolicySchema.default("ask"),
    protectedFilesPolicy: ProtectedFilesPolicySchema.default("always-ask"),
    customRules: ProjectCustomRulesSchema.optional(),
    updatedAt: z.number().int(),
  })
  .strict();
export type ProjectTrustPolicy = z.infer<typeof ProjectTrustPolicySchema>;

// 39. project.setTrustPolicy
export const ProjectSetTrustPolicyParamsSchema = z
  .object({
    projectId: z.string(),
    trustLevel: ProjectTrustLevelSchema,
    filePolicy: FileActionPolicySchema.optional(),
    commandPolicy: CommandActionPolicySchema.optional(),
    protectedFilesPolicy: ProtectedFilesPolicySchema.optional(),
    customRules: ProjectCustomRulesSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.trustLevel === "custom") {
        return !!data.customRules && Object.keys(data.customRules).length > 0;
      }
      return true;
    },
    {
      message: "Custom trust level requires customRules matrix",
      path: ["customRules"],
    }
  );
export type ProjectSetTrustPolicyParams = z.infer<typeof ProjectSetTrustPolicyParamsSchema>;

export const ProjectSetTrustPolicyResultSchema = z
  .object({
    projectId: z.string(),
    policy: ProjectTrustPolicySchema,
  })
  .strict();
export type ProjectSetTrustPolicyResult = z.infer<typeof ProjectSetTrustPolicyResultSchema>;

// 40. project.sessionTrust
export const ProjectSessionTrustParamsSchema = z
  .object({
    projectId: z.string(),
    action: z.enum(["grant", "revoke", "status"]).default("status"),
    operations: z.array(z.string()).optional(),
  })
  .strict();
export type ProjectSessionTrustParams = z.infer<typeof ProjectSessionTrustParamsSchema>;

export const ProjectSessionTrustResultSchema = z
  .object({
    projectId: z.string(),
    active: z.boolean(),
    operations: z.array(z.string()),
  })
  .strict();
export type ProjectSessionTrustResult = z.infer<typeof ProjectSessionTrustResultSchema>;

// 41. approval.bulkResolve
export const ApprovalBulkResolveParamsSchema = z
  .object({
    approvalIds: z.array(z.string()),
    action: z.enum(["approve", "deny"]),
    resolvedBy: z.string().default("desktop-user"),
  })
  .strict();
export type ApprovalBulkResolveParams = z.infer<typeof ApprovalBulkResolveParamsSchema>;

export const ApprovalBulkResolveResultSchema = z
  .object({
    resolved: z.array(ApprovalRequestSchema),
    failedIds: z.array(z.string()),
  })
  .strict();
export type ApprovalBulkResolveResult = z.infer<typeof ApprovalBulkResolveResultSchema>;

// Typed RPC Map
export interface RunnerRpcMap {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParams;
    result: SystemPingResult;
  };
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParams;
    result: SystemInfoResult;
  };
  [RunnerRpcMethods.SystemShutdown]: {
    params: SystemShutdownParams;
    result: SystemShutdownResult;
  };
  [RunnerRpcMethods.ProjectList]: {
    params: ProjectListParams;
    result: ProjectListResult;
  };
  [RunnerRpcMethods.ProjectInfo]: {
    params: ProjectInfoParams;
    result: ProjectInfoResult;
  };
  [RunnerRpcMethods.ProjectValidate]: {
    params: ProjectValidateParams;
    result: ProjectValidateResult;
  };
  [RunnerRpcMethods.DirectoryList]: {
    params: DirectoryListParams;
    result: DirectoryListResult;
  };
  [RunnerRpcMethods.FileStat]: {
    params: FileStatParams;
    result: FileStatResult;
  };
  [RunnerRpcMethods.FileRead]: {
    params: FileReadParams;
    result: FileReadResult;
  };
  [RunnerRpcMethods.FileCreate]: {
    params: FileCreateParams;
    result: FileCreateResult;
  };
  [RunnerRpcMethods.FileWrite]: {
    params: FileWriteParams;
    result: FileWriteResult;
  };
  [RunnerRpcMethods.FilePatch]: {
    params: FilePatchParams;
    result: FilePatchResult;
  };
  [RunnerRpcMethods.FileDelete]: {
    params: FileDeleteParams;
    result: FileDeleteResult;
  };
  [RunnerRpcMethods.FileRestore]: {
    params: FileRestoreParams;
    result: FileRestoreResult;
  };
  [RunnerRpcMethods.GitInfo]: {
    params: GitInfoParams;
    result: GitInfoResult;
  };
  [RunnerRpcMethods.GitStatus]: {
    params: GitStatusParams;
    result: GitStatusResult;
  };
  [RunnerRpcMethods.GitDiff]: {
    params: GitDiffParams;
    result: GitDiffResult;
  };
  [RunnerRpcMethods.GitLog]: {
    params: GitLogParams;
    result: GitLogResult;
  };
  [RunnerRpcMethods.GitStage]: {
    params: GitStageParams;
    result: GitStageResult;
  };
  [RunnerRpcMethods.GitUnstage]: {
    params: GitUnstageParams;
    result: GitUnstageResult;
  };
  [RunnerRpcMethods.GitBranchCreate]: {
    params: GitBranchCreateParams;
    result: GitBranchCreateResult;
  };
  [RunnerRpcMethods.GitBranchSwitch]: {
    params: GitBranchSwitchParams;
    result: GitBranchSwitchResult;
  };
  [RunnerRpcMethods.GitCommit]: {
    params: GitCommitParams;
    result: GitCommitResult;
  };
  [RunnerRpcMethods.CommandClassify]: {
    params: CommandClassifyParams;
    result: CommandClassifyResult;
  };
  [RunnerRpcMethods.CommandRun]: {
    params: CommandRunParams;
    result: CommandRunResult;
  };
  [RunnerRpcMethods.JobStart]: {
    params: JobStartParams;
    result: JobStartResult;
  };
  [RunnerRpcMethods.JobStatus]: {
    params: JobStatusParams;
    result: JobStatusResult;
  };
  [RunnerRpcMethods.JobLogs]: {
    params: JobLogsParams;
    result: JobLogsResult;
  };
  [RunnerRpcMethods.JobCancel]: {
    params: JobCancelParams;
    result: JobCancelResult;
  };
  [RunnerRpcMethods.JobList]: {
    params: JobListParams;
    result: JobListResult;
  };
  [RunnerRpcMethods.BuildStart]: {
    params: BuildStartParams;
    result: BuildStartResult;
  };
  [RunnerRpcMethods.TestStart]: {
    params: TestStartParams;
    result: TestStartResult;
  };
  [RunnerRpcMethods.ProjectAuthorize]: {
    params: ProjectAuthorizeParams;
    result: ProjectAuthorizeResult;
  };
  [RunnerRpcMethods.ProjectSetAccess]: {
    params: ProjectSetAccessParams;
    result: ProjectSetAccessResult;
  };
  [RunnerRpcMethods.ProjectSetExecution]: {
    params: ProjectSetExecutionParams;
    result: ProjectSetExecutionResult;
  };
  [RunnerRpcMethods.ProjectRemove]: {
    params: ProjectRemoveParams;
    result: ProjectRemoveResult;
  };
  [RunnerRpcMethods.ProjectEnable]: {
    params: ProjectEnableParams;
    result: ProjectEnableResult;
  };
  [RunnerRpcMethods.ProjectDisable]: {
    params: ProjectDisableParams;
    result: ProjectDisableResult;
  };
  [RunnerRpcMethods.ApprovalCreate]: {
    params: ApprovalCreateParams;
    result: ApprovalCreateResult;
  };
  [RunnerRpcMethods.ApprovalResolve]: {
    params: ApprovalResolveParams;
    result: ApprovalResolveResult;
  };
  [RunnerRpcMethods.ApprovalList]: {
    params: ApprovalListParams;
    result: ApprovalListResult;
  };
  [RunnerRpcMethods.ApprovalGet]: {
    params: ApprovalGetParams;
    result: ApprovalGetResult;
  };
  [RunnerRpcMethods.JobCancelAll]: {
    params: JobCancelAllParams;
    result: JobCancelAllResult;
  };
  [RunnerRpcMethods.ProjectSetTrustPolicy]: {
    params: ProjectSetTrustPolicyParams;
    result: ProjectSetTrustPolicyResult;
  };
  [RunnerRpcMethods.ProjectSessionTrust]: {
    params: ProjectSessionTrustParams;
    result: ProjectSessionTrustResult;
  };
  [RunnerRpcMethods.ApprovalBulkResolve]: {
    params: ApprovalBulkResolveParams;
    result: ApprovalBulkResolveResult;
  };
  [RunnerRpcMethods.ApprovalSetMode]: {
    params: ApprovalSetModeParams;
    result: ApprovalSetModeResult;
  };
  [RunnerRpcMethods.SafetyLayerSetStatus]: {
    params: SafetyLayerSetStatusParams;
    result: SafetyLayerSetStatusResult;
  };
  [RunnerRpcMethods.SafetyLayerGetStatus]: {
    params: SafetyLayerGetStatusParams;
    result: SafetyLayerGetStatusResult;
  };
  [RunnerRpcMethods.CodeDocumentSymbols]: {
    params: CodeDocumentSymbolsParams;
    result: DocumentSymbolsResult;
  };
  [RunnerRpcMethods.CodeWorkspaceSymbols]: {
    params: CodeWorkspaceSymbolsParams;
    result: WorkspaceSymbolsResult;
  };
  [RunnerRpcMethods.CodeDefinition]: {
    params: CodeDefinitionParams;
    result: DefinitionResult;
  };
  [RunnerRpcMethods.CodeReferences]: {
    params: CodeReferencesParams;
    result: ReferencesResult;
  };
  [RunnerRpcMethods.CodeHover]: {
    params: CodeHoverParams;
    result: HoverResult;
  };
  [RunnerRpcMethods.CodeDiagnostics]: {
    params: CodeDiagnosticsParams;
    result: DiagnosticsResult;
  };
  [RunnerRpcMethods.CodeCallHierarchy]: {
    params: CodeCallHierarchyParams;
    result: CallHierarchyResult;
  };
  [RunnerRpcMethods.CodeImpact]: {
    params: CodeImpactParams;
    result: CodeImpactResult;
  };
  [RunnerRpcMethods.LspStatus]: {
    params: LspStatusParams;
    result: LspStatusResult;
  };
  [RunnerRpcMethods.LspRestart]: {
    params: LspRestartParams;
    result: LspRestartResult;
  };
  [RunnerRpcMethods.LspStop]: {
    params: LspStopParams;
    result: LspStopResult;
  };
  [RunnerRpcMethods.WorktreeCreate]: {
    params: WorktreeCreateParams;
    result: WorktreeCreateResult;
  };
  [RunnerRpcMethods.WorktreeList]: {
    params: WorktreeListParams;
    result: WorktreeListResult;
  };
  [RunnerRpcMethods.WorktreeStatus]: {
    params: WorktreeStatusParams;
    result: WorktreeStatusResult;
  };
  [RunnerRpcMethods.WorktreeDiff]: {
    params: WorktreeDiffParams;
    result: WorktreeDiffResult;
  };
  [RunnerRpcMethods.WorktreeRemove]: {
    params: WorktreeRemoveParams;
    result: WorktreeRemoveResult;
  };
  [RunnerRpcMethods.RuntimeStart]: {
    params: RuntimeStartParams;
    result: RuntimeStartResult;
  };
  [RunnerRpcMethods.RuntimeList]: {
    params: RuntimeListParams;
    result: RuntimeListResult;
  };
  [RunnerRpcMethods.RuntimeStatus]: {
    params: RuntimeStatusParams;
    result: RuntimeStatusResult;
  };
  [RunnerRpcMethods.RuntimeLogs]: {
    params: RuntimeLogsParams;
    result: RuntimeLogsResult;
  };
  [RunnerRpcMethods.RuntimeRestart]: {
    params: RuntimeRestartParams;
    result: RuntimeRestartResult;
  };
  [RunnerRpcMethods.RuntimeStop]: {
    params: RuntimeStopParams;
    result: RuntimeStopResult;
  };
  [RunnerRpcMethods.FsDelete]: {
    params: FsDeleteParams;
    result: FsDeleteResult;
  };
  [RunnerRpcMethods.FsMove]: {
    params: FsMoveParams;
    result: FsMoveResult;
  };
  [RunnerRpcMethods.FsCopy]: {
    params: FsCopyParams;
    result: FsCopyResult;
  };
  [RunnerRpcMethods.FsMkdir]: {
    params: FsMkdirParams;
    result: FsMkdirResult;
  };
  [RunnerRpcMethods.EnvironmentDetect]: {
    params: EnvironmentDetectParams;
    result: EnvironmentDetectResult;
  };
  [RunnerRpcMethods.ProjectDetect]: {
    params: ProjectDetectParams;
    result: ProjectDetectResult;
  };
  [RunnerRpcMethods.TerminalStart]: {
    params: TerminalStartParams;
    result: TerminalStartResult;
  };
  [RunnerRpcMethods.TerminalWrite]: {
    params: TerminalWriteParams;
    result: TerminalWriteResult;
  };
  [RunnerRpcMethods.TerminalRead]: {
    params: TerminalReadParams;
    result: TerminalReadResult;
  };
  [RunnerRpcMethods.TerminalResize]: {
    params: TerminalResizeParams;
    result: TerminalResizeResult;
  };
  [RunnerRpcMethods.TerminalStatus]: {
    params: TerminalStatusParams;
    result: TerminalStatusResult;
  };
  [RunnerRpcMethods.TerminalStop]: {
    params: TerminalStopParams;
    result: TerminalStopResult;
  };
  [RunnerRpcMethods.TerminalList]: {
    params: TerminalListParams;
    result: TerminalListResult;
  };
  [RunnerRpcMethods.ProcessList]: {
    params: ProcessListParams;
    result: ProcessListResult;
  };
  [RunnerRpcMethods.ProcessStatus]: {
    params: ProcessStatusParams;
    result: ProcessStatusResult;
  };
  [RunnerRpcMethods.ProcessKill]: {
    params: ProcessKillParams;
    result: ProcessKillResult;
  };
  [RunnerRpcMethods.ProcessTree]: {
    params: ProcessTreeParams;
    result: ProcessTreeResult;
  };
  [RunnerRpcMethods.PortList]: {
    params: PortListParams;
    result: PortListResult;
  };
  [RunnerRpcMethods.PortKill]: {
    params: PortKillParams;
    result: PortKillResult;
  };
  [RunnerRpcMethods.AgentTaskCreate]: {
    params: AgentTaskCreateParams;
    result: AgentTaskCreateResult;
  };
  [RunnerRpcMethods.AgentTaskStatus]: {
    params: AgentTaskStatusParams;
    result: AgentTaskStatusResult;
  };
  [RunnerRpcMethods.AgentTaskLogs]: {
    params: AgentTaskLogsParams;
    result: AgentTaskLogsResult;
  };
  [RunnerRpcMethods.AgentTaskCancel]: {
    params: AgentTaskCancelParams;
    result: AgentTaskCancelResult;
  };
  [RunnerRpcMethods.AgentTaskPause]: {
    params: AgentTaskPauseParams;
    result: AgentTaskPauseResult;
  };
  [RunnerRpcMethods.AgentTaskResume]: {
    params: AgentTaskResumeParams;
    result: AgentTaskResumeResult;
  };
  [RunnerRpcMethods.AgentTaskList]: {
    params: AgentTaskListParams;
    result: AgentTaskListResult;
  };
  [RunnerRpcMethods.AgentTaskApprove]: {
    params: AgentTaskApproveParams;
    result: AgentTaskApproveResult;
  };
  [RunnerRpcMethods.DiscoveryQuery]: {
    params: DiscoveryQueryParams;
    result: DiscoveryQueryResult;
  };
  [RunnerRpcMethods.DiscoveryInspect]: {
    params: InspectResourceParams;
    result: InspectResourceResult;
  };
  [RunnerRpcMethods.DiscoveryLaunch]: {
    params: LaunchApplicationParams;
    result: LaunchApplicationResult;
  };
  [RunnerRpcMethods.DiscoveryVerify]: {
    params: VerifyResourceParams;
    result: VerifyResourceResult;
  };
  [RunnerRpcMethods.DiscoveryIndexSearch]: {
    params: ContentIndexQueryParams;
    result: ContentIndexQueryResult;
  };
  [RunnerRpcMethods.DiscoveryRefresh]: {
    params: DiscoveryRefreshParams;
    result: DiscoveryRefreshResult;
  };
}

export type RunnerRpcMethodName = keyof RunnerRpcMap;

// Schema mapping for dual-ended validation
export const RunnerRpcSchemas = {
  [RunnerRpcMethods.SystemPing]: {
    params: SystemPingParamsSchema,
    result: SystemPingResultSchema,
  },
  [RunnerRpcMethods.SystemInfo]: {
    params: SystemInfoParamsSchema,
    result: SystemInfoResultSchema,
  },
  [RunnerRpcMethods.SystemShutdown]: {
    params: SystemShutdownParamsSchema,
    result: SystemShutdownResultSchema,
  },
  [RunnerRpcMethods.ProjectList]: {
    params: ProjectListParamsSchema,
    result: ProjectListResultSchema,
  },
  [RunnerRpcMethods.ProjectInfo]: {
    params: ProjectInfoParamsSchema,
    result: ProjectInfoResultSchema,
  },
  [RunnerRpcMethods.ProjectValidate]: {
    params: ProjectValidateParamsSchema,
    result: ProjectValidateResultSchema,
  },
  [RunnerRpcMethods.DirectoryList]: {
    params: DirectoryListParamsSchema,
    result: DirectoryListResultSchema,
  },
  [RunnerRpcMethods.FileStat]: {
    params: FileStatParamsSchema,
    result: FileStatResultSchema,
  },
  [RunnerRpcMethods.FileRead]: {
    params: FileReadParamsSchema,
    result: FileReadResultSchema,
  },
  [RunnerRpcMethods.FileCreate]: {
    params: FileCreateParamsSchema,
    result: FileCreateResultSchema,
  },
  [RunnerRpcMethods.FileWrite]: {
    params: FileWriteParamsSchema,
    result: FileWriteResultSchema,
  },
  [RunnerRpcMethods.FilePatch]: {
    params: FilePatchParamsSchema,
    result: FilePatchResultSchema,
  },
  [RunnerRpcMethods.FileDelete]: {
    params: FileDeleteParamsSchema,
    result: FileDeleteResultSchema,
  },
  [RunnerRpcMethods.FileRestore]: {
    params: FileRestoreParamsSchema,
    result: FileRestoreResultSchema,
  },
  [RunnerRpcMethods.GitInfo]: {
    params: GitInfoParamsSchema,
    result: GitInfoResultSchema,
  },
  [RunnerRpcMethods.GitStatus]: {
    params: GitStatusParamsSchema,
    result: GitStatusResultSchema,
  },
  [RunnerRpcMethods.GitDiff]: {
    params: GitDiffParamsSchema,
    result: GitDiffResultSchema,
  },
  [RunnerRpcMethods.GitLog]: {
    params: GitLogParamsSchema,
    result: GitLogResultSchema,
  },
  [RunnerRpcMethods.CommandClassify]: {
    params: CommandClassifyParamsSchema,
    result: CommandClassifyResultSchema,
  },
  [RunnerRpcMethods.CommandRun]: {
    params: CommandRunParamsSchema,
    result: CommandRunResultSchema,
  },
  [RunnerRpcMethods.JobStart]: {
    params: JobStartParamsSchema,
    result: JobStartResultSchema,
  },
  [RunnerRpcMethods.JobStatus]: {
    params: JobStatusParamsSchema,
    result: JobStatusResultSchema,
  },
  [RunnerRpcMethods.JobLogs]: {
    params: JobLogsParamsSchema,
    result: JobLogsResultSchema,
  },
  [RunnerRpcMethods.JobCancel]: {
    params: JobCancelParamsSchema,
    result: JobCancelResultSchema,
  },
  [RunnerRpcMethods.JobList]: {
    params: JobListParamsSchema,
    result: JobListResultSchema,
  },
  [RunnerRpcMethods.BuildStart]: {
    params: BuildStartParamsSchema,
    result: BuildStartResultSchema,
  },
  [RunnerRpcMethods.TestStart]: {
    params: TestStartParamsSchema,
    result: TestStartResultSchema,
  },
  [RunnerRpcMethods.ProjectAuthorize]: {
    params: ProjectAuthorizeParamsSchema,
    result: ProjectAuthorizeResultSchema,
  },
  [RunnerRpcMethods.ProjectSetAccess]: {
    params: ProjectSetAccessParamsSchema,
    result: ProjectSetAccessResultSchema,
  },
  [RunnerRpcMethods.ProjectSetExecution]: {
    params: ProjectSetExecutionParamsSchema,
    result: ProjectSetExecutionResultSchema,
  },
  [RunnerRpcMethods.ProjectRemove]: {
    params: ProjectRemoveParamsSchema,
    result: ProjectRemoveResultSchema,
  },
  [RunnerRpcMethods.ProjectEnable]: {
    params: ProjectEnableParamsSchema,
    result: ProjectEnableResultSchema,
  },
  [RunnerRpcMethods.ProjectDisable]: {
    params: ProjectDisableParamsSchema,
    result: ProjectDisableResultSchema,
  },
  [RunnerRpcMethods.ApprovalCreate]: {
    params: ApprovalCreateParamsSchema,
    result: ApprovalCreateResultSchema,
  },
  [RunnerRpcMethods.ApprovalResolve]: {
    params: ApprovalResolveParamsSchema,
    result: ApprovalResolveResultSchema,
  },
  [RunnerRpcMethods.ApprovalList]: {
    params: ApprovalListParamsSchema,
    result: ApprovalListResultSchema,
  },
  [RunnerRpcMethods.ApprovalGet]: {
    params: ApprovalGetParamsSchema,
    result: ApprovalGetResultSchema,
  },
  [RunnerRpcMethods.JobCancelAll]: {
    params: JobCancelAllParamsSchema,
    result: JobCancelAllResultSchema,
  },
  [RunnerRpcMethods.ProjectSetTrustPolicy]: {
    params: ProjectSetTrustPolicyParamsSchema,
    result: ProjectSetTrustPolicyResultSchema,
  },
  [RunnerRpcMethods.ProjectSessionTrust]: {
    params: ProjectSessionTrustParamsSchema,
    result: ProjectSessionTrustResultSchema,
  },
  [RunnerRpcMethods.ApprovalBulkResolve]: {
    params: ApprovalBulkResolveParamsSchema,
    result: ApprovalBulkResolveResultSchema,
  },
  [RunnerRpcMethods.ApprovalSetMode]: {
    params: ApprovalSetModeParamsSchema,
    result: ApprovalSetModeResultSchema,
  },
  [RunnerRpcMethods.SafetyLayerSetStatus]: {
    params: SafetyLayerSetStatusParamsSchema,
    result: SafetyLayerSetStatusResultSchema,
  },
  [RunnerRpcMethods.SafetyLayerGetStatus]: {
    params: SafetyLayerGetStatusParamsSchema,
    result: SafetyLayerGetStatusResultSchema,
  },
  [RunnerRpcMethods.GitStage]: {
    params: GitStageParamsSchema,
    result: GitStageResultSchema,
  },
  [RunnerRpcMethods.GitUnstage]: {
    params: GitUnstageParamsSchema,
    result: GitUnstageResultSchema,
  },
  [RunnerRpcMethods.GitBranchCreate]: {
    params: GitBranchCreateParamsSchema,
    result: GitBranchCreateResultSchema,
  },
  [RunnerRpcMethods.GitBranchSwitch]: {
    params: GitBranchSwitchParamsSchema,
    result: GitBranchSwitchResultSchema,
  },
  [RunnerRpcMethods.GitCommit]: {
    params: GitCommitParamsSchema,
    result: GitCommitResultSchema,
  },
  [RunnerRpcMethods.CodeDocumentSymbols]: {
    params: CodeDocumentSymbolsParamsSchema,
    result: DocumentSymbolsResultSchema,
  },
  [RunnerRpcMethods.CodeWorkspaceSymbols]: {
    params: CodeWorkspaceSymbolsParamsSchema,
    result: WorkspaceSymbolsResultSchema,
  },
  [RunnerRpcMethods.CodeDefinition]: {
    params: CodeDefinitionParamsSchema,
    result: DefinitionResultSchema,
  },
  [RunnerRpcMethods.CodeReferences]: {
    params: CodeReferencesParamsSchema,
    result: ReferencesResultSchema,
  },
  [RunnerRpcMethods.CodeHover]: {
    params: CodeHoverParamsSchema,
    result: HoverResultSchema,
  },
  [RunnerRpcMethods.CodeDiagnostics]: {
    params: CodeDiagnosticsParamsSchema,
    result: DiagnosticsResultSchema,
  },
  [RunnerRpcMethods.CodeCallHierarchy]: {
    params: CodeCallHierarchyParamsSchema,
    result: CallHierarchyResultSchema,
  },
  [RunnerRpcMethods.CodeImpact]: {
    params: CodeImpactParamsSchema,
    result: CodeImpactResultSchema,
  },
  [RunnerRpcMethods.LspStatus]: {
    params: LspStatusParamsSchema,
    result: LspStatusResultSchema,
  },
  [RunnerRpcMethods.LspRestart]: {
    params: LspRestartParamsSchema,
    result: LspRestartResultSchema,
  },
  [RunnerRpcMethods.LspStop]: {
    params: LspStopParamsSchema,
    result: LspStopResultSchema,
  },
  [RunnerRpcMethods.WorktreeCreate]: {
    params: WorktreeCreateParamsSchema,
    result: WorktreeCreateResultSchema,
  },
  [RunnerRpcMethods.WorktreeList]: {
    params: WorktreeListParamsSchema,
    result: WorktreeListResultSchema,
  },
  [RunnerRpcMethods.WorktreeStatus]: {
    params: WorktreeStatusParamsSchema,
    result: WorktreeStatusResultSchema,
  },
  [RunnerRpcMethods.WorktreeDiff]: {
    params: WorktreeDiffParamsSchema,
    result: WorktreeDiffResultSchema,
  },
  [RunnerRpcMethods.WorktreeRemove]: {
    params: WorktreeRemoveParamsSchema,
    result: WorktreeRemoveResultSchema,
  },
  [RunnerRpcMethods.RuntimeStart]: {
    params: RuntimeStartParamsSchema,
    result: RuntimeStartResultSchema,
  },
  [RunnerRpcMethods.RuntimeList]: {
    params: RuntimeListParamsSchema,
    result: RuntimeListResultSchema,
  },
  [RunnerRpcMethods.RuntimeStatus]: {
    params: RuntimeStatusParamsSchema,
    result: RuntimeStatusResultSchema,
  },
  [RunnerRpcMethods.RuntimeLogs]: {
    params: RuntimeLogsParamsSchema,
    result: RuntimeLogsResultSchema,
  },
  [RunnerRpcMethods.RuntimeRestart]: {
    params: RuntimeRestartParamsSchema,
    result: RuntimeRestartResultSchema,
  },
  [RunnerRpcMethods.RuntimeStop]: {
    params: RuntimeStopParamsSchema,
    result: RuntimeStopResultSchema,
  },
  [RunnerRpcMethods.FsDelete]: {
    params: FsDeleteParamsSchema,
    result: FsDeleteResultSchema,
  },
  [RunnerRpcMethods.FsMove]: {
    params: FsMoveParamsSchema,
    result: FsMoveResultSchema,
  },
  [RunnerRpcMethods.FsCopy]: {
    params: FsCopyParamsSchema,
    result: FsCopyResultSchema,
  },
  [RunnerRpcMethods.FsMkdir]: {
    params: FsMkdirParamsSchema,
    result: FsMkdirResultSchema,
  },
  [RunnerRpcMethods.EnvironmentDetect]: {
    params: EnvironmentDetectParamsSchema,
    result: EnvironmentDetectResultSchema,
  },
  [RunnerRpcMethods.ProjectDetect]: {
    params: ProjectDetectParamsSchema,
    result: ProjectDetectResultSchema,
  },
  [RunnerRpcMethods.TerminalStart]: {
    params: TerminalStartParamsSchema,
    result: TerminalStartResultSchema,
  },
  [RunnerRpcMethods.TerminalWrite]: {
    params: TerminalWriteParamsSchema,
    result: TerminalWriteResultSchema,
  },
  [RunnerRpcMethods.TerminalRead]: {
    params: TerminalReadParamsSchema,
    result: TerminalReadResultSchema,
  },
  [RunnerRpcMethods.TerminalResize]: {
    params: TerminalResizeParamsSchema,
    result: TerminalResizeResultSchema,
  },
  [RunnerRpcMethods.TerminalStatus]: {
    params: TerminalStatusParamsSchema,
    result: TerminalStatusResultSchema,
  },
  [RunnerRpcMethods.TerminalStop]: {
    params: TerminalStopParamsSchema,
    result: TerminalStopResultSchema,
  },
  [RunnerRpcMethods.TerminalList]: {
    params: TerminalListParamsSchema,
    result: TerminalListResultSchema,
  },
  [RunnerRpcMethods.ProcessList]: {
    params: ProcessListParamsSchema,
    result: ProcessListResultSchema,
  },
  [RunnerRpcMethods.ProcessStatus]: {
    params: ProcessStatusParamsSchema,
    result: ProcessStatusResultSchema,
  },
  [RunnerRpcMethods.ProcessKill]: {
    params: ProcessKillParamsSchema,
    result: ProcessKillResultSchema,
  },
  [RunnerRpcMethods.ProcessTree]: {
    params: ProcessTreeParamsSchema,
    result: ProcessTreeResultSchema,
  },
  [RunnerRpcMethods.PortList]: {
    params: PortListParamsSchema,
    result: PortListResultSchema,
  },
  [RunnerRpcMethods.PortKill]: {
    params: PortKillParamsSchema,
    result: PortKillResultSchema,
  },
  [RunnerRpcMethods.AgentTaskCreate]: {
    params: AgentTaskCreateParamsSchema,
    result: AgentTaskCreateResultSchema,
  },
  [RunnerRpcMethods.AgentTaskStatus]: {
    params: AgentTaskStatusParamsSchema,
    result: AgentTaskStatusResultSchema,
  },
  [RunnerRpcMethods.AgentTaskLogs]: {
    params: AgentTaskLogsParamsSchema,
    result: AgentTaskLogsResultSchema,
  },
  [RunnerRpcMethods.AgentTaskCancel]: {
    params: AgentTaskCancelParamsSchema,
    result: AgentTaskCancelResultSchema,
  },
  [RunnerRpcMethods.AgentTaskPause]: {
    params: AgentTaskPauseParamsSchema,
    result: AgentTaskPauseResultSchema,
  },
  [RunnerRpcMethods.AgentTaskResume]: {
    params: AgentTaskResumeParamsSchema,
    result: AgentTaskResumeResultSchema,
  },
  [RunnerRpcMethods.AgentTaskList]: {
    params: AgentTaskListParamsSchema,
    result: AgentTaskListResultSchema,
  },
  [RunnerRpcMethods.AgentTaskApprove]: {
    params: AgentTaskApproveParamsSchema,
    result: AgentTaskApproveResultSchema,
  },
  [RunnerRpcMethods.DiscoveryQuery]: {
    params: DiscoveryQueryParamsSchema,
    result: DiscoveryQueryResultSchema,
  },
  [RunnerRpcMethods.DiscoveryInspect]: {
    params: InspectResourceParamsSchema,
    result: InspectResourceResultSchema,
  },
  [RunnerRpcMethods.DiscoveryLaunch]: {
    params: LaunchApplicationParamsSchema,
    result: LaunchApplicationResultSchema,
  },
  [RunnerRpcMethods.DiscoveryVerify]: {
    params: VerifyResourceParamsSchema,
    result: VerifyResourceResultSchema,
  },
  [RunnerRpcMethods.DiscoveryIndexSearch]: {
    params: ContentIndexQueryParamsSchema,
    result: ContentIndexQueryResultSchema,
  },
  [RunnerRpcMethods.DiscoveryRefresh]: {
    params: DiscoveryRefreshParamsSchema,
    result: DiscoveryRefreshResultSchema,
  },
} as const;

