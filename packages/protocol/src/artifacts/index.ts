import { z } from "zod";

export const ArtifactMetadataSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  name: z.string(),
  mimeType: z.string().default("application/octet-stream"),
  sizeBytes: z.number().int().nonnegative().default(0),
  sha256: z.string().default(""),
  chunkCount: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
  status: z.enum(["uploading", "ready", "error", "deleted"]).default("ready"),
  createdAt: z.number(),
  updatedAt: z.number(),
  extra: z.record(z.any()).optional(),
});
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

export const ArtifactCreateParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  extra: z.record(z.any()).optional(),
});
export type ArtifactCreateParams = z.infer<typeof ArtifactCreateParamsSchema>;

export const ArtifactCreateResultSchema = z.object({
  artifact: ArtifactMetadataSchema,
});
export type ArtifactCreateResult = z.infer<typeof ArtifactCreateResultSchema>;

export const ArtifactWriteChunkParamsSchema = z.object({
  artifactId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  chunkBase64: z.string(),
  isLastChunk: z.boolean().default(false),
  expectedSha256: z.string().optional(),
});
export type ArtifactWriteChunkParams = z.infer<typeof ArtifactWriteChunkParamsSchema>;

export const ArtifactWriteChunkResultSchema = z.object({
  artifactId: z.string(),
  bytesWritten: z.number().int().nonnegative(),
  totalBytesSoFar: z.number().int().nonnegative(),
  isReady: z.boolean(),
  sha256: z.string().optional(),
});
export type ArtifactWriteChunkResult = z.infer<typeof ArtifactWriteChunkResultSchema>;

export const ArtifactReadChunkParamsSchema = z.object({
  artifactId: z.string(),
  offset: z.number().int().nonnegative().default(0),
  length: z.number().int().positive().max(10485760).default(1048576), // 1MB default, 10MB max
});
export type ArtifactReadChunkParams = z.infer<typeof ArtifactReadChunkParamsSchema>;

export const ArtifactReadChunkResultSchema = z.object({
  artifactId: z.string(),
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
  totalSize: z.number().int().nonnegative(),
  chunkBase64: z.string(),
  isLast: z.boolean(),
  sha256: z.string(),
});
export type ArtifactReadChunkResult = z.infer<typeof ArtifactReadChunkResultSchema>;

export const ArtifactGetParamsSchema = z.object({
  artifactId: z.string(),
});
export type ArtifactGetParams = z.infer<typeof ArtifactGetParamsSchema>;

export const ArtifactGetResultSchema = z.object({
  artifact: ArtifactMetadataSchema,
});
export type ArtifactGetResult = z.infer<typeof ArtifactGetResultSchema>;

export const ArtifactListParamsSchema = z.object({
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  tag: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type ArtifactListParams = z.infer<typeof ArtifactListParamsSchema>;

export const ArtifactListResultSchema = z.object({
  artifacts: z.array(ArtifactMetadataSchema),
  total: z.number().int().nonnegative(),
});
export type ArtifactListResult = z.infer<typeof ArtifactListResultSchema>;

export const ArtifactImportParamsSchema = z.object({
  projectId: z.string(),
  filePath: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type ArtifactImportParams = z.infer<typeof ArtifactImportParamsSchema>;

export const ArtifactImportResultSchema = z.object({
  artifact: ArtifactMetadataSchema,
});
export type ArtifactImportResult = z.infer<typeof ArtifactImportResultSchema>;

export const ArtifactExportParamsSchema = z.object({
  artifactId: z.string(),
  targetPath: z.string(),
  overwrite: z.boolean().default(false),
});
export type ArtifactExportParams = z.infer<typeof ArtifactExportParamsSchema>;

export const ArtifactExportResultSchema = z.object({
  artifactId: z.string(),
  targetPath: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
});
export type ArtifactExportResult = z.infer<typeof ArtifactExportResultSchema>;

export const ArtifactDeleteParamsSchema = z.object({
  artifactId: z.string(),
});
export type ArtifactDeleteParams = z.infer<typeof ArtifactDeleteParamsSchema>;

export const ArtifactDeleteResultSchema = z.object({
  artifactId: z.string(),
  deleted: z.boolean(),
});
export type ArtifactDeleteResult = z.infer<typeof ArtifactDeleteResultSchema>;

export const ArtifactAbortParamsSchema = z.object({
  artifactId: z.string(),
});
export type ArtifactAbortParams = z.infer<typeof ArtifactAbortParamsSchema>;

export const ArtifactAbortResultSchema = z.object({
  artifactId: z.string(),
  aborted: z.boolean(),
});
export type ArtifactAbortResult = z.infer<typeof ArtifactAbortResultSchema>;
