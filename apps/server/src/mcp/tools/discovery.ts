import {
  DiscoveryQueryParamsSchema,
  LaunchApplicationParamsSchema,
  VerifyResourceParamsSchema,
  ContentIndexQueryParamsSchema,
  InspectResourceParamsSchema,
  DiscoveryRefreshParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerDiscoveryTools(server: McpServer, context: McpContext): void {
  async function syncSecurityContext(runnerId: string, toolName: string, args: any): Promise<void> {
    context.logAudit("mcp_tool_started", { toolName, ...args });
    const isUniversal = context.projectService.getSafetyLayerDisabled();
    await context.request(runnerId, RunnerRpcMethods.SafetyLayerSetStatus, {
      disabled: isUniversal,
      mode: isUniversal ? "universal" : "safe",
      securityMode: isUniversal ? "universal" : "safe"
    });
    context.logAudit("mcp_tool_completed", { toolName, metadata: { status: "Security context synchronized" } });
  }
  // 1. localbridge_local_resource_query / nexus_local_resource_query
  const handleQuery = async (args: any) => {
    const startTime = Date.now();
    try {
      const runnerId = args.projectId
        ? context.resolveProjectRunner(args.projectId)
        : context.resolveAnyRunner();

      await syncSecurityContext(runnerId, "localbridge_local_resource_query", args);

      const result = await context.request(
        runnerId,
        RunnerRpcMethods.DiscoveryQuery,
        args
      );

      context.logAudit("mcp_tool_completed", {
        toolName: "localbridge_local_resource_query",
        durationMs: Date.now() - startTime,
        resultStatus: "success",
      });

      return formatToolSuccess(result);
    } catch (error) {
      context.logAudit("mcp_tool_failed", {
        toolName: "localbridge_local_resource_query",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      return McpErrorMapper.toToolError(error);
    }
  };

  server.registerTool(
    "localbridge_local_resource_query",
    {
      description:
        "Unified host and computer resource discovery. Discovers installed Windows applications (from Registry, Start Menu, PATH, Program Files, AppData, and accessible drives), files, directories, running processes, open windows, and content index records. Supports natural language semantic query and alias matching.",
      inputSchema: toMcpSchema(DiscoveryQueryParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_local_resource_query,
    },
    handleQuery
  );

  server.registerTool(
    "nexus_local_resource_query",
    {
      description:
        "Alias for localbridge_local_resource_query: Unified host and computer resource discovery.",
      inputSchema: toMcpSchema(DiscoveryQueryParamsSchema),
      annotations: TOOL_ANNOTATIONS.nexus_local_resource_query,
    },
    handleQuery
  );

  // 2. localbridge_application_launch
  server.registerTool(
    "localbridge_application_launch",
    {
      description:
        "Execution Tier: Launch an application by name, alias (e.g. 'Maya', 'Blender', 'Notepad'), or executable path. Nexus automatically locates the real executable, verifies its presence on disk, launches it, and inspects real OS state (polling process and window) to verify true launch state.",
      inputSchema: toMcpSchema(LaunchApplicationParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_application_launch,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_application_launch",
          appNameOrPath: args.appNameOrPath,
        });

        const runnerId = context.resolveAnyRunner();
        const launchTimeout = Math.max(30000, (Number(args.timeoutMs) || 8000) + 15000);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DiscoveryLaunch,
          args,
          { timeoutMs: launchTimeout }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_application_launch",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_application_launch",
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        return McpErrorMapper.toToolError(error);
      }
    }
  );

  // 3. localbridge_resource_verify
  server.registerTool(
    "localbridge_resource_verify",
    {
      description:
        "Verification Tier: Inspect real operating system state for a file, directory, running process, desktop window, or application to confirm actual existence without relying on assumed or unverified tool output.",
      inputSchema: toMcpSchema(VerifyResourceParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_resource_verify,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_resource_verify",
          resourceType: args.resourceType,
          target: args.target,
        });

        const runnerId = context.resolveAnyRunner();
        const verifyTimeout = Math.max(20000, (Number(args.timeoutMs) || 5000) + 10000);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DiscoveryVerify,
          args,
          { timeoutMs: verifyTimeout }
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_resource_verify",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_resource_verify",
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        return McpErrorMapper.toToolError(error);
      }
    }
  );

  // 4. localbridge_content_index_search
  server.registerTool(
    "localbridge_content_index_search",
    {
      description:
        "Search indexed text files (.txt, .md, .json, .ts, .py, etc.) across the machine or specified directories using the incremental content index.",
      inputSchema: toMcpSchema(ContentIndexQueryParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_content_index_search,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        const runnerId = context.resolveAnyRunner();
        await syncSecurityContext(runnerId, "localbridge_content_index_search", args);
        
        // Force refresh before search to ensure newly created files are indexed
        await context.request(runnerId, RunnerRpcMethods.DiscoveryRefresh, {
          target: "index",
          incremental: true
        });

        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DiscoveryIndexSearch,
          args
        );
        
        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_content_index_search",
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });
        
        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_content_index_search",
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        return McpErrorMapper.toToolError(error);
      }
    }
  );

  // 5. localbridge_resource_inspect
  server.registerTool(
    "localbridge_resource_inspect",
    {
      description:
        "Inspect detailed metadata, aliases, origin source, and verified status for a single local resource.",
      inputSchema: toMcpSchema(InspectResourceParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_resource_inspect,
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DiscoveryInspect,
          args
        );
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toToolError(error);
      }
    }
  );

  // 6. localbridge_discovery_refresh
  server.registerTool(
    "localbridge_discovery_refresh",
    {
      description:
        "Trigger a complete re-scan and deep discovery of host applications, drives, and resources into the Resource Registry.",
      inputSchema: toMcpSchema(DiscoveryRefreshParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_discovery_refresh,
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        const runnerId = context.resolveAnyRunner();
        await syncSecurityContext(runnerId, "localbridge_discovery_refresh", args);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.DiscoveryRefresh,
          args,
          { timeoutMs: 60000 }
        );
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_discovery_refresh", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_discovery_refresh", durationMs: Date.now() - startTime, error: error instanceof Error ? error.message : String(error) });
        return McpErrorMapper.toToolError(error);
      }
    }
  );
}
