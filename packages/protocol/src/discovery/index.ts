import { z } from "zod";

export const LocalResourceTypeSchema = z.enum([
  "drive",
  "directory",
  "file",
  "application",
  "executable",
  "shortcut",
  "process",
  "window",
  "document",
  "project",
  "browser",
  "device",
  "capability",
]);
export type LocalResourceType = z.infer<typeof LocalResourceTypeSchema>;

export const LocalResourceSourceSchema = z.enum([
  "registry",
  "start_menu",
  "path",
  "filesystem",
  "process",
  "window",
  "drive",
  "custom",
]);
export type LocalResourceSource = z.infer<typeof LocalResourceSourceSchema>;

export const LocalResourceSchema = z.object({
  resourceId: z.string(),
  type: LocalResourceTypeSchema,
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  path: z.string(),
  parent: z.string().optional(),
  source: z.string(),
  exists: z.boolean(),
  accessible: z.boolean(),
  verified: z.boolean(),
  modifiedAt: z.string().optional(),
  size: z.number().optional(),
  hash: z.string().optional(),
  metadata: z.record(z.any()).optional(),

  // Application-specific fields
  executablePath: z.string().optional(),
  installPath: z.string().optional(),
  version: z.string().optional(),
  publisher: z.string().optional(),
  launchable: z.boolean().optional(),
});
export type LocalResource = z.infer<typeof LocalResourceSchema>;

export const DiscoveryQueryParamsSchema = z.object({
  query: z.string().optional().default(""),
  resourceTypes: z.array(LocalResourceTypeSchema).optional(),
  scope: z.enum(["local_machine", "workspace", "project"]).optional().default("local_machine"),
  deep: z.boolean().optional().default(false),
  fresh: z.boolean().optional().default(false),
  verify: z.boolean().optional().default(true),
  projectId: z.string().optional(),
  limit: z.number().optional().default(50),
  action: z
    .enum([
      "query",
      "find_application",
      "find_file",
      "find_directory",
      "search_content",
      "find_process",
      "find_window",
      "inspect_resource",
    ])
    .optional()
    .default("query"),
});
export type DiscoveryQueryParams = z.infer<typeof DiscoveryQueryParamsSchema>;

export const DiscoveryQueryResultSchema = z.object({
  resources: z.array(LocalResourceSchema),
  total: z.number(),
  scope: z.string(),
  securityMode: z.string(),
  executionTier: z.literal("discovery"),
  cached: z.boolean().optional(),
  fresh: z.boolean().optional(),
  cacheAge: z.number().optional(),
  lastScanAt: z.union([z.number(), z.string()]).optional(),
  scanSource: z.string().optional(),
  verificationTime: z.number().optional(),
});
export type DiscoveryQueryResult = z.infer<typeof DiscoveryQueryResultSchema>;

export const LaunchApplicationParamsSchema = z.object({
  appNameOrPath: z.string(),
  args: z.array(z.string()).optional(),
  workingDirectory: z.string().optional(),
  verifyLaunch: z.boolean().optional().default(true),
  timeoutMs: z.number().optional().default(8000),
});
export type LaunchApplicationParams = z.infer<typeof LaunchApplicationParamsSchema>;

export const LaunchApplicationResultSchema = z.object({
  launched: z.boolean(),
  executablePath: z.string(),
  pid: z.number().optional(),
  windowHandle: z.string().optional(),
  windowTitle: z.string().optional(),
  verified: z.boolean(),
  verificationDetails: z.object({
    processExists: z.boolean(),
    windowExists: z.boolean(),
    error: z.string().optional(),
  }),
  message: z.string(),
});
export type LaunchApplicationResult = z.infer<typeof LaunchApplicationResultSchema>;

export const VerifyResourceParamsSchema = z.object({
  resourceType: z.enum(["file", "process", "window", "operation", "application", "directory"]),
  target: z.string(),
  expectedState: z.record(z.any()).optional(),
  timeoutMs: z.number().optional().default(5000),
});
export type VerifyResourceParams = z.infer<typeof VerifyResourceParamsSchema>;

export const VerifyResourceResultSchema = z.object({
  verified: z.boolean(),
  resourceType: z.string(),
  target: z.string(),
  actualState: z.record(z.any()).optional(),
  message: z.string(),
});
export type VerifyResourceResult = z.infer<typeof VerifyResourceResultSchema>;

export const ContentIndexQueryParamsSchema = z.object({
  query: z.string(),
  extensions: z.array(z.string()).optional(),
  directories: z.array(z.string()).optional(),
  limit: z.number().optional().default(20),
});
export type ContentIndexQueryParams = z.infer<typeof ContentIndexQueryParamsSchema>;

export const ContentIndexRecordSchema = z.object({
  path: z.string(),
  filename: z.string(),
  extension: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  hash: z.string(),
  snippet: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type ContentIndexRecord = z.infer<typeof ContentIndexRecordSchema>;

export const ContentIndexQueryResultSchema = z.object({
  records: z.array(ContentIndexRecordSchema),
  total: z.number(),
  query: z.string(),
});
export type ContentIndexQueryResult = z.infer<typeof ContentIndexQueryResultSchema>;

export const InspectResourceParamsSchema = z.object({
  resourceIdOrPath: z.string(),
});
export type InspectResourceParams = z.infer<typeof InspectResourceParamsSchema>;

export const InspectResourceResultSchema = z.object({
  resource: LocalResourceSchema.optional(),
  found: z.boolean(),
  message: z.string().optional(),
});
export type InspectResourceResult = z.infer<typeof InspectResourceResultSchema>;

export const DiscoveryRefreshParamsSchema = z.object({
  deep: z.boolean().optional().default(false),
  scope: z.enum(["local_machine", "workspace", "project"]).optional(),
});
export type DiscoveryRefreshParams = z.infer<typeof DiscoveryRefreshParamsSchema>;

export const DiscoveryRefreshResultSchema = z.object({
  discovered: z.number(),
  success: z.boolean(),
  scope: z.string(),
  durationMs: z.number().optional(),
});
export type DiscoveryRefreshResult = z.infer<typeof DiscoveryRefreshResultSchema>;
