import { z } from "zod";

export const ValidationCheckTypeSchema = z.enum([
  "all",
  "build",
  "test",
  "lint",
  "typecheck",
  "format",
]);
export type ValidationCheckType = z.infer<typeof ValidationCheckTypeSchema>;

export const ValidationCheckResultSchema = z.object({
  checkType: z.string(),
  tool: z.string(),
  command: z.string(),
  passed: z.boolean(),
  exitCode: z.number().int().nullable().optional(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nonnegative(),
  errorSummary: z.string().optional(),
});
export type ValidationCheckResult = z.infer<typeof ValidationCheckResultSchema>;

export const UnifiedValidationParamsSchema = z.object({
  projectId: z.string(),
  checkType: ValidationCheckTypeSchema.default("all"),
  commandOverride: z.string().optional(),
  timeoutMs: z.number().int().positive().default(120000),
});
export type UnifiedValidationParams = z.infer<typeof UnifiedValidationParamsSchema>;

export const UnifiedValidationResultSchema = z.object({
  projectId: z.string(),
  projectType: z.string(),
  overallPassed: z.boolean(),
  status: z.enum(["PASSED", "FAILED", "NO_CHECKS"]).optional(),
  checks: z.array(ValidationCheckResultSchema),
  totalDurationMs: z.number().int().nonnegative(),
  timestamp: z.number(),
});
export type UnifiedValidationResult = z.infer<typeof UnifiedValidationResultSchema>;
