import { z } from "zod";

export const CheckpointFileEntrySchema = z.object({
  relativePath: z.string(),
  sha256: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  action: z.enum(["created", "modified", "deleted"]),
});
export type CheckpointFileEntry = z.infer<typeof CheckpointFileEntrySchema>;

export const WorkspaceCheckpointManifestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  gitBranch: z.string().optional(),
  gitCommit: z.string().optional(),
  files: z.array(CheckpointFileEntrySchema),
  autoTrigger: z.enum(["manual", "pre-task", "pre-edit", "test-failure", "pre-reconcile"]).default("manual"),
  createdAt: z.number(),
  snapshotDirPath: z.string().optional(),
});
export type WorkspaceCheckpointManifest = z.infer<typeof WorkspaceCheckpointManifestSchema>;

export const CheckpointCreateParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  autoTrigger: z.enum(["manual", "pre-task", "pre-edit", "test-failure", "pre-reconcile"]).optional(),
  includePaths: z.array(z.string()).optional(),
});
export type CheckpointCreateParams = z.infer<typeof CheckpointCreateParamsSchema>;

export const CheckpointCreateResultSchema = z.object({
  checkpoint: WorkspaceCheckpointManifestSchema,
});
export type CheckpointCreateResult = z.infer<typeof CheckpointCreateResultSchema>;

export const CheckpointListParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  limit: z.number().int().positive().max(100).default(30),
});
export type CheckpointListParams = z.infer<typeof CheckpointListParamsSchema>;

export const CheckpointListResultSchema = z.object({
  checkpoints: z.array(WorkspaceCheckpointManifestSchema),
  total: z.number().int().nonnegative(),
});
export type CheckpointListResult = z.infer<typeof CheckpointListResultSchema>;

export const CheckpointGetParamsSchema = z.object({
  checkpointId: z.string(),
  projectId: z.string(),
});
export type CheckpointGetParams = z.infer<typeof CheckpointGetParamsSchema>;

export const CheckpointGetResultSchema = z.object({
  checkpoint: WorkspaceCheckpointManifestSchema,
});
export type CheckpointGetResult = z.infer<typeof CheckpointGetResultSchema>;

export const CheckpointRestoreParamsSchema = z.object({
  checkpointId: z.string(),
  projectId: z.string(),
  createBackupBeforeRestore: z.boolean().default(true),
});
export type CheckpointRestoreParams = z.infer<typeof CheckpointRestoreParamsSchema>;

export const CheckpointRestoreResultSchema = z.object({
  checkpointId: z.string(),
  restoredFilesCount: z.number().int().nonnegative(),
  backupCheckpointId: z.string().optional(),
  success: z.boolean(),
  restoredAt: z.number(),
});
export type CheckpointRestoreResult = z.infer<typeof CheckpointRestoreResultSchema>;

export const CheckpointDeleteParamsSchema = z.object({
  checkpointId: z.string(),
  projectId: z.string(),
});
export type CheckpointDeleteParams = z.infer<typeof CheckpointDeleteParamsSchema>;

export const CheckpointDeleteResultSchema = z.object({
  checkpointId: z.string(),
  deleted: z.boolean(),
});
export type CheckpointDeleteResult = z.infer<typeof CheckpointDeleteResultSchema>;
