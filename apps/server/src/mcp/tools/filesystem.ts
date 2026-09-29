import {
  DirectoryListParamsSchema,
  FileCreateParamsSchema,
  FileDeleteParamsSchema,
  FilePatchParamsSchema,
  FileReadParamsSchema,
  FileRestoreParamsSchema,
  FileStatParamsSchema,
  FileWriteParamsSchema,
  FsDeleteParamsSchema,
  FsMoveParamsSchema,
  FsCopyParamsSchema,
  FsMkdirParamsSchema,
  FsSearchParamsSchema,
  FsGrepParamsSchema,
  FileReadStreamParamsSchema,
  FsBatchParamsSchema,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerFilesystemTools(server: McpServer, context: McpContext): void {
  // 3. localbridge_directory_list
  server.registerTool(
    "localbridge_directory_list",
    {
      description:
        "List directory contents within an authorized project or host drive (such as C盘 via projectId: 'drive-c') with opaque cursor pagination and security filtering.",
      inputSchema: toMcpSchema(DirectoryListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_directory_list,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_directory_list",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DirectoryList,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_directory_list",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_directory_list",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_file_stat
  server.registerTool(
    "localbridge_file_stat",
    {
      description:
        "Retrieve metadata (type, size, modifiedAt, accessible) for a file or directory within an authorized project.",
      inputSchema: toMcpSchema(FileStatParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_stat,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_stat",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileStat,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_stat",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_stat",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_file_read
  server.registerTool(
    "localbridge_file_read",
    {
      description:
        "Read UTF-8 text file content lines with SHA-256 contentHash and pagination bounding from an authorized project or host drive (such as C盘 via projectId: 'drive-c').",
      inputSchema: toMcpSchema(FileReadParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_read,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_read",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileRead,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_read",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_read",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_file_create
  server.registerTool(
    "localbridge_file_create",
    {
      description:
        "Create a new file within an authorized project sandbox. Requires read-write access mode. Fails if file already exists.",
      inputSchema: toMcpSchema(FileCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_create,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_create",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileCreate,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_create",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "FILE_CREATED",
          source: "mcp",
          refType: "file",
          refId: args.path,
          summary: { path: args.path },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_create",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_file_write
  server.registerTool(
    "localbridge_file_write",
    {
      description:
        "Atomically overwrite an existing file within an authorized project with optimistic concurrency (expectedHash) verification and automated backup creation.",
      inputSchema: toMcpSchema(FileWriteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_write,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_write",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileWrite,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_write",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "FILE_UPDATED",
          source: "mcp",
          refType: "file",
          refId: args.path,
          summary: { path: args.path, bytesAfter: result.bytesAfter },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_write",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 8. localbridge_file_patch
  server.registerTool(
    "localbridge_file_patch",
    {
      description:
        "Apply targeted search-and-replace hunks to an existing file with expectedHash verification and automated backup creation.",
      inputSchema: toMcpSchema(FilePatchParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_patch,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_patch",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FilePatch,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_patch",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "FILE_PATCHED",
          source: "mcp",
          refType: "file",
          refId: args.path,
          summary: { path: args.path, replacementsApplied: result.replacementsApplied },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_patch",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 9. localbridge_file_delete
  server.registerTool(
    "localbridge_file_delete",
    {
      description:
        "Safely delete a file from an authorized project with expectedHash verification and snapshot backup creation.",
      inputSchema: toMcpSchema(FileDeleteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_delete,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_delete",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileDelete,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_delete",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "FILE_DELETED",
          source: "mcp",
          refType: "file",
          refId: args.path,
          summary: { path: args.path },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_delete",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 10. localbridge_file_restore
  server.registerTool(
    "localbridge_file_restore",
    {
      description:
        "Restore a file to an authorized project from a previous operationId snapshot backup.",
      inputSchema: toMcpSchema(FileRestoreParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_file_restore,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_file_restore",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FileRestore,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_file_restore",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "FILE_UPDATED",
          source: "mcp",
          refType: "file",
          refId: args.path,
          summary: { path: args.path, backupId: args.backupId },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_file_restore",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  function getTargetRunner(projectId?: string): string {
    if (projectId) {
      return context.resolveProjectRunner(projectId);
    }
    const runners = context.runnerRegistry.list();
    if (runners.length > 0 && runners[0]) {
      return runners[0].id;
    }
    throw new LocalBridgeError(
      LocalBridgeErrorCode.RUNNER_OFFLINE,
      "No connected runner available for filesystem operation"
    );
  }

  // 11. localbridge_fs_delete
  server.registerTool(
    "localbridge_fs_delete",
    {
      description:
        "Universal structured deletion for files (binary or text) and directories. Supports force deletion without expectedHash and recursive directory tree cleanup with symlink no-follow safety.",
      inputSchema: toMcpSchema(FsDeleteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_fs_delete,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, path: targetPath } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_fs_delete",
          projectId,
          relativePath: targetPath,
        });

        const runnerId = getTargetRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FsDelete,
          args
        );

        // Aggregate audit logging: 1 single summary record for directory or file delete
        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_fs_delete",
          projectId,
          runnerId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.logger?.info(
          {
            event: "fs_delete_aggregate",
            projectId,
            path: targetPath,
            filesAffected: result.filesAffected,
            directoriesAffected: result.directoriesAffected,
            bytesAffected: result.bytesAffected,
            durationMs: Date.now() - startTime,
          },
          `Deleted ${result.filesAffected} files and ${result.directoriesAffected} dirs (${result.bytesAffected} bytes)`
        );

        if (projectId) {
          context.recordSessionEvent?.({
            projectId,
            eventType: "FILE_DELETED",
            source: "mcp",
            refType: "file",
            refId: targetPath,
            summary: {
              path: targetPath,
              filesAffected: result.filesAffected,
              directoriesAffected: result.directoriesAffected,
            },
          });
        }

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_fs_delete",
          projectId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 12. localbridge_fs_move
  server.registerTool(
    "localbridge_fs_move",
    {
      description:
        "Move or rename a file or directory tree within authorized boundaries.",
      inputSchema: toMcpSchema(FsMoveParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_fs_move,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, sourcePath, targetPath } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_fs_move",
          projectId,
          relativePath: sourcePath,
        });

        const runnerId = getTargetRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FsMove,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_fs_move",
          projectId,
          runnerId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_fs_move",
          projectId,
          relativePath: sourcePath,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 13. localbridge_fs_copy
  server.registerTool(
    "localbridge_fs_copy",
    {
      description:
        "Copy a file or directory tree within authorized boundaries (supports binaries and recursive trees).",
      inputSchema: toMcpSchema(FsCopyParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_fs_copy,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, sourcePath, targetPath } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_fs_copy",
          projectId,
          relativePath: sourcePath,
        });

        const runnerId = getTargetRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FsCopy,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_fs_copy",
          projectId,
          runnerId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_fs_copy",
          projectId,
          relativePath: sourcePath,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 14. localbridge_fs_mkdir
  server.registerTool(
    "localbridge_fs_mkdir",
    {
      description:
        "Create a directory (and any necessary parent directories) within authorized boundaries.",
      inputSchema: toMcpSchema(FsMkdirParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_fs_mkdir,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId, path: targetPath } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_fs_mkdir",
          projectId,
          relativePath: targetPath,
        });

        const runnerId = getTargetRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.FsMkdir,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_fs_mkdir",
          projectId,
          runnerId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_fs_mkdir",
          projectId,
          relativePath: targetPath,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_fs_search
  server.registerTool(
    "localbridge_fs_search",
    {
      description: "Search for files and directories recursively by filename pattern, extension, or type within an authorized project.",
      inputSchema: toMcpSchema(FsSearchParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.FsSearch, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_fs_grep
  server.registerTool(
    "localbridge_fs_grep",
    {
      description: "Perform fast streaming text or regex search across project files with match lines and offsets.",
      inputSchema: toMcpSchema(FsGrepParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.FsGrep, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_file_read_stream
  server.registerTool(
    "localbridge_file_read_stream",
    {
      description: "Read large files in bounded streaming byte chunks with offset and SHA-256 verification (avoids memory overflow).",
      inputSchema: toMcpSchema(FileReadStreamParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.FileReadStream, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_fs_batch
  server.registerTool(
    "localbridge_fs_batch",
    {
      description: "Execute a batch sequence of copy, move, and delete filesystem operations atomically with per-operation error reports.",
      inputSchema: toMcpSchema(FsBatchParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.FsBatch, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
