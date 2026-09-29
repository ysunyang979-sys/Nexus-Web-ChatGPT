import { z } from "zod";

export const FsSearchMatchSchema = z.object({
  relativePath: z.string(),
  name: z.string(),
  type: z.enum(["file", "directory"]),
  sizeBytes: z.number().int().nonnegative().optional(),
  modifiedAt: z.number().optional(),
});
export type FsSearchMatch = z.infer<typeof FsSearchMatchSchema>;

export const FsSearchParamsSchema = z.object({
  projectId: z.string(),
  query: z.string().min(1),
  path: z.string().default("."),
  maxResults: z.number().int().positive().max(500).default(100),
  fileExtensions: z.array(z.string()).optional(),
  type: z.enum(["file", "directory", "all"]).default("all"),
});
export type FsSearchParams = z.infer<typeof FsSearchParamsSchema>;

export const FsSearchResultSchema = z.object({
  projectId: z.string(),
  matches: z.array(FsSearchMatchSchema),
  totalFound: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type FsSearchResult = z.infer<typeof FsSearchResultSchema>;

export const FsGrepMatchLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  lineText: z.string(),
});
export type FsGrepMatchLine = z.infer<typeof FsGrepMatchLineSchema>;

export const FsGrepFileMatchSchema = z.object({
  relativePath: z.string(),
  lines: z.array(FsGrepMatchLineSchema),
});
export type FsGrepFileMatch = z.infer<typeof FsGrepFileMatchSchema>;

export const FsGrepParamsSchema = z.object({
  projectId: z.string(),
  pattern: z.string().min(1),
  path: z.string().default("."),
  isRegex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  fileExtensions: z.array(z.string()).optional(),
  maxFiles: z.number().int().positive().max(200).default(50),
  maxMatchesPerFile: z.number().int().positive().max(50).default(20),
});
export type FsGrepParams = z.infer<typeof FsGrepParamsSchema>;

export const FsGrepResultSchema = z.object({
  projectId: z.string(),
  fileMatches: z.array(FsGrepFileMatchSchema),
  totalMatches: z.number().int().nonnegative(),
  filesSearched: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type FsGrepResult = z.infer<typeof FsGrepResultSchema>;

export const FileReadStreamParamsSchema = z.object({
  projectId: z.string(),
  path: z.string(),
  offsetBytes: z.number().int().nonnegative().default(0),
  maxBytes: z.number().int().positive().max(10485760).default(1048576), // 1MB default
});
export type FileReadStreamParams = z.infer<typeof FileReadStreamParamsSchema>;

export const FileReadStreamResultSchema = z.object({
  projectId: z.string(),
  path: z.string(),
  offsetBytes: z.number().int().nonnegative(),
  bytesRead: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  content: z.string(),
  isLastChunk: z.boolean(),
  sha256: z.string(),
});
export type FileReadStreamResult = z.infer<typeof FileReadStreamResultSchema>;

export const FsBatchOperationSchema = z.object({
  action: z.enum(["copy", "move", "delete"]),
  sourcePath: z.string(),
  targetPath: z.string().optional(),
  force: z.boolean().default(false),
});
export type FsBatchOperation = z.infer<typeof FsBatchOperationSchema>;

export const FsBatchParamsSchema = z.object({
  projectId: z.string(),
  operations: z.array(FsBatchOperationSchema).min(1).max(50),
});
export type FsBatchParams = z.infer<typeof FsBatchParamsSchema>;

export const FsBatchResultSchema = z.object({
  projectId: z.string(),
  success: z.boolean(),
  operationsCompleted: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      action: z.string(),
      path: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
});
export type FsBatchResult = z.infer<typeof FsBatchResultSchema>;
