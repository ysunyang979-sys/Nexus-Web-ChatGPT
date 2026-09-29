import { z } from "zod";

export const HygieneIssueSchema = z.object({
  category: z.enum([
    "untracked_file",
    "dirty_git_file",
    "temp_file",
    "zombie_process",
    "orphaned_runtime",
    "stale_terminal",
    "lock_file",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  pathOrIdentifier: z.string(),
  description: z.string(),
  sizeBytes: z.number().int().nonnegative().optional(),
  extra: z.record(z.any()).optional(),
});
export type HygieneIssue = z.infer<typeof HygieneIssueSchema>;

export const WorkspaceHygieneCheckParamsSchema = z.object({
  projectId: z.string(),
  checkZombies: z.boolean().default(true),
  checkGit: z.boolean().default(true),
  checkTempFiles: z.boolean().default(true),
});
export type WorkspaceHygieneCheckParams = z.infer<typeof WorkspaceHygieneCheckParamsSchema>;

export const WorkspaceHygieneCheckResultSchema = z.object({
  projectId: z.string(),
  isClean: z.boolean(),
  issues: z.array(HygieneIssueSchema),
  uncommittedFilesCount: z.number().int().nonnegative(),
  untrackedFilesCount: z.number().int().nonnegative(),
  zombieProcessesCount: z.number().int().nonnegative(),
  orphanedRuntimesCount: z.number().int().nonnegative(),
  tempFilesBytes: z.number().int().nonnegative(),
  checkedAt: z.number(),
});
export type WorkspaceHygieneCheckResult = z.infer<typeof WorkspaceHygieneCheckResultSchema>;

export const WorkspaceCleanParamsSchema = z.object({
  projectId: z.string(),
  cleanTempFiles: z.boolean().default(true),
  cleanFailedTaskArtifacts: z.boolean().default(true),
  killZombies: z.boolean().default(true),
  discardUntracked: z.boolean().default(false),
});
export type WorkspaceCleanParams = z.infer<typeof WorkspaceCleanParamsSchema>;

export const WorkspaceCleanResultSchema = z.object({
  projectId: z.string(),
  tempFilesRemoved: z.number().int().nonnegative(),
  bytesFreed: z.number().int().nonnegative(),
  zombiesKilled: z.number().int().nonnegative(),
  untrackedRemoved: z.number().int().nonnegative(),
  success: z.boolean(),
  cleanedAt: z.number(),
});
export type WorkspaceCleanResult = z.infer<typeof WorkspaceCleanResultSchema>;

export const WorkspaceResetFileParamsSchema = z.object({
  projectId: z.string(),
  relativePath: z.string(),
});
export type WorkspaceResetFileParams = z.infer<typeof WorkspaceResetFileParamsSchema>;

export const WorkspaceResetFileResultSchema = z.object({
  projectId: z.string(),
  relativePath: z.string(),
  reset: z.boolean(),
  message: z.string(),
});
export type WorkspaceResetFileResult = z.infer<typeof WorkspaceResetFileResultSchema>;

export const WorkspaceCleanUntrackedParamsSchema = z.object({
  projectId: z.string(),
  dryRun: z.boolean().default(false),
});
export type WorkspaceCleanUntrackedParams = z.infer<typeof WorkspaceCleanUntrackedParamsSchema>;

export const WorkspaceCleanUntrackedResultSchema = z.object({
  projectId: z.string(),
  removedFiles: z.array(z.string()),
  totalCount: z.number().int().nonnegative(),
  dryRun: z.boolean(),
});
export type WorkspaceCleanUntrackedResult = z.infer<typeof WorkspaceCleanUntrackedResultSchema>;

export const WorkspaceKillZombiesParamsSchema = z.object({
  projectId: z.string().optional(),
});
export type WorkspaceKillZombiesParams = z.infer<typeof WorkspaceKillZombiesParamsSchema>;

export const WorkspaceKillZombiesResultSchema = z.object({
  killedProcessPids: z.array(z.number().int()),
  killedRuntimes: z.array(z.string()),
  killedTerminals: z.array(z.string()),
  totalKilled: z.number().int().nonnegative(),
});
export type WorkspaceKillZombiesResult = z.infer<typeof WorkspaceKillZombiesResultSchema>;
