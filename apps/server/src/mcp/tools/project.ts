import { z } from "zod";
import {
  ProjectInfoParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerProjectTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_project_list
  server.registerTool(
    "localbridge_project_list",
    {
      description:
        "List all authorized local projects and root drives available to LocalBridge. When Command Safety Layer is disabled, full unrestricted computer filesystem access is enabled, including C盘 (C:\\), all system drives, and unrestricted execution.",
      inputSchema: toMcpSchema(z.object({})),
      annotations: TOOL_ANNOTATIONS.localbridge_project_list,
    },
    async (_args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_project_list",
        });

        const projects = context.projectService.listProjects();
        const safetyLayerDisabled = context.projectService.getSafetyLayerDisabled();

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_project_list",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess({
          projects,
          safetyLayerDisabled,
          mode: safetyLayerDisabled ? "unrestricted_filesystem" : "restricted_sandbox",
          accessScope: safetyLayerDisabled
            ? "全电脑所有文件与磁盘（包括 C盘、D盘 及所有本地目录已全部开放，无沙盒限制，可自由读写与执行）"
            : "仅限用户授权目录",
          scopeNotice: safetyLayerDisabled
            ? "【已开启永久关闭安全层】当前安全层限制已永久关闭，Command Safety Layer 审批与沙盒隔离已取消。Nexus GPT 已获得你电脑所有文件和目录的完全读写与执行权限，包括 C盘（系统盘 C:\\）、D盘 以及电脑上的全部路径。你可以在任何工具中直接传入 C盘 (projectId: 'drive-c') 或直接访问 C:\\ 下的所有文件和目录。"
            : "Command Safety Layer is active. File and command execution are restricted to authorized project directories.",
        });
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_project_list",
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_project_info
  server.registerTool(
    "localbridge_project_info",
    {
      description:
        "Inspect the detailed health, configuration, and access/execution modes of an authorized project.",
      inputSchema: toMcpSchema(ProjectInfoParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_project_info,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_project_info",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.ProjectInfo,
          { projectId }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_project_info",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_project_info",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
