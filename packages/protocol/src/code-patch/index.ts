import { z } from "zod";

export const PatchHunkPreviewSchema = z.object({
  path: z.string(),
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  canApply: z.boolean(),
  conflictReason: z.string().optional(),
});
export type PatchHunkPreview = z.infer<typeof PatchHunkPreviewSchema>;

export const CodePatchPreviewParamsSchema = z.object({
  projectId: z.string(),
  patchContent: z.string().min(1),
  reverse: z.boolean().default(false),
});
export type CodePatchPreviewParams = z.infer<typeof CodePatchPreviewParamsSchema>;

export const CodePatchPreviewResultSchema = z.object({
  projectId: z.string(),
  canApplyAll: z.boolean(),
  filesAffected: z.array(z.string()),
  hunks: z.array(PatchHunkPreviewSchema),
  diffSummary: z.string(),
});
export type CodePatchPreviewResult = z.infer<typeof CodePatchPreviewResultSchema>;

export const CodePatchApplyParamsSchema = z.object({
  projectId: z.string(),
  patchContent: z.string().min(1),
  createBackup: z.boolean().default(true),
  atomic: z.boolean().default(true),
});
export type CodePatchApplyParams = z.infer<typeof CodePatchApplyParamsSchema>;

export const CodePatchApplyResultSchema = z.object({
  projectId: z.string(),
  applied: z.boolean(),
  filesModified: z.array(z.string()),
  backupCheckpointId: z.string().optional(),
  appliedAt: z.number(),
  error: z.string().optional(),
});
export type CodePatchApplyResult = z.infer<typeof CodePatchApplyResultSchema>;

export const CodePatchRollbackParamsSchema = z.object({
  projectId: z.string(),
  backupCheckpointId: z.string(),
});
export type CodePatchRollbackParams = z.infer<typeof CodePatchRollbackParamsSchema>;

export const CodePatchRollbackResultSchema = z.object({
  projectId: z.string(),
  rolledBack: z.boolean(),
  filesRestored: z.array(z.string()),
  rolledBackAt: z.number(),
});
export type CodePatchRollbackResult = z.infer<typeof CodePatchRollbackResultSchema>;
