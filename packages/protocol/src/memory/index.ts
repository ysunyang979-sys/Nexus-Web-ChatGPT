import { z } from "zod";

export const MemoryScopeSchema = z.enum(["global", "project", "session", "agent", "task"]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.any(),
  scope: MemoryScopeSchema,
  scopeId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemorySetParamsSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  scope: MemoryScopeSchema.default("project"),
  scopeId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type MemorySetParams = z.infer<typeof MemorySetParamsSchema>;

export const MemorySetResultSchema = z.object({
  entry: MemoryEntrySchema,
});
export type MemorySetResult = z.infer<typeof MemorySetResultSchema>;

export const MemoryGetParamsSchema = z.object({
  key: z.string(),
  scope: MemoryScopeSchema.default("project"),
  scopeId: z.string().optional(),
});
export type MemoryGetParams = z.infer<typeof MemoryGetParamsSchema>;

export const MemoryGetResultSchema = z.object({
  entry: MemoryEntrySchema.nullable(),
});
export type MemoryGetResult = z.infer<typeof MemoryGetResultSchema>;

export const MemorySearchParamsSchema = z.object({
  query: z.string().optional(),
  scope: MemoryScopeSchema.optional(),
  scopeId: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
});
export type MemorySearchParams = z.infer<typeof MemorySearchParamsSchema>;

export const MemorySearchResultSchema = z.object({
  entries: z.array(MemoryEntrySchema),
  total: z.number().int().nonnegative(),
});
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

export const MemoryDeleteParamsSchema = z.object({
  key: z.string(),
  scope: MemoryScopeSchema.default("project"),
  scopeId: z.string().optional(),
});
export type MemoryDeleteParams = z.infer<typeof MemoryDeleteParamsSchema>;

export const MemoryDeleteResultSchema = z.object({
  deleted: z.boolean(),
});
export type MemoryDeleteResult = z.infer<typeof MemoryDeleteResultSchema>;

export const MemoryPurgeParamsSchema = z.object({
  scope: MemoryScopeSchema,
  scopeId: z.string().optional(),
});
export type MemoryPurgeParams = z.infer<typeof MemoryPurgeParamsSchema>;

export const MemoryPurgeResultSchema = z.object({
  purgedCount: z.number().int().nonnegative(),
});
export type MemoryPurgeResult = z.infer<typeof MemoryPurgeResultSchema>;
