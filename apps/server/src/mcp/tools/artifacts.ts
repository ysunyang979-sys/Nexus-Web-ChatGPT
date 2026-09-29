import {
  ArtifactCreateParamsSchema,
  ArtifactWriteChunkParamsSchema,
  ArtifactReadChunkParamsSchema,
  ArtifactGetParamsSchema,
  ArtifactListParamsSchema,
  ArtifactImportParamsSchema,
  ArtifactExportParamsSchema,
  ArtifactDeleteParamsSchema,
  ArtifactAbortParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    return context.resolveProjectRunner(projectId);
  }
  return context.resolveAnyRunner();
}

export function registerArtifactTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_artifact_create
  server.registerTool(
    "localbridge_artifact_create",
    {
      description: "Initialize a new managed file artifact with metadata, content-type, tags, and lifecycle policies.",
      inputSchema: toMcpSchema(ArtifactCreateParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactCreate, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_artifact_write_chunk
  server.registerTool(
    "localbridge_artifact_write_chunk",
    {
      description: "Stream a chunk of data into an artifact with SHA-256 integrity verification.",
      inputSchema: toMcpSchema(ArtifactWriteChunkParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactWriteChunk, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_artifact_read_chunk
  server.registerTool(
    "localbridge_artifact_read_chunk",
    {
      description: "Read a chunk of data from an artifact with bounded memory buffering.",
      inputSchema: toMcpSchema(ArtifactReadChunkParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactReadChunk, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_artifact_get
  server.registerTool(
    "localbridge_artifact_get",
    {
      description: "Retrieve metadata and state of a stored artifact.",
      inputSchema: toMcpSchema(ArtifactGetParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactGet, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_artifact_list
  server.registerTool(
    "localbridge_artifact_list",
    {
      description: "List artifacts matching optional project, task, or tag filters.",
      inputSchema: toMcpSchema(ArtifactListParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactList, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 6. localbridge_artifact_import
  server.registerTool(
    "localbridge_artifact_import",
    {
      description: "Import an existing workspace file as a versioned artifact.",
      inputSchema: toMcpSchema(ArtifactImportParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactImport, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 7. localbridge_artifact_export
  server.registerTool(
    "localbridge_artifact_export",
    {
      description: "Export an artifact to a specified destination path in the workspace.",
      inputSchema: toMcpSchema(ArtifactExportParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context, args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactExport, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 8. localbridge_artifact_delete
  server.registerTool(
    "localbridge_artifact_delete",
    {
      description: "Permanently delete an artifact and its associated data blocks.",
      inputSchema: toMcpSchema(ArtifactDeleteParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactDelete, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 9. localbridge_artifact_abort
  server.registerTool(
    "localbridge_artifact_abort",
    {
      description: "Abort an ongoing chunked artifact upload and clean up temporary parts.",
      inputSchema: toMcpSchema(ArtifactAbortParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.ArtifactAbort, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
