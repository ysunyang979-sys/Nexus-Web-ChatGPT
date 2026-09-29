import {
  RunnerRpcMethods,
  TraceStartParamsSchema,
  TraceEndParamsSchema,
  TraceRecordParamsSchema,
  TraceGetParamsSchema,
  TraceListParamsSchema,
  MetricsGetParamsSchema,
  ObservabilitySummaryParamsSchema,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

function resolveRunner(context: McpContext, projectId?: string): string {
  if (projectId) {
    try {
      return context.resolveProjectRunner(projectId);
    } catch {}
  }
  return context.resolveAnyRunner();
}

export function registerTraceTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_trace_start
  server.registerTool(
    "localbridge_trace_start",
    {
      description: "Start a distributed trace or span for an operation.",
      inputSchema: toMcpSchema(TraceStartParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.TraceStart, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_trace_end
  server.registerTool(
    "localbridge_trace_end",
    {
      description: "Complete a trace span and record its duration, status, and error details.",
      inputSchema: toMcpSchema(TraceEndParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.TraceEnd, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_trace_record
  server.registerTool(
    "localbridge_trace_record",
    {
      description: "Record an event or log entry inside an active trace span.",
      inputSchema: toMcpSchema(TraceRecordParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.TraceRecord, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_trace_get
  server.registerTool(
    "localbridge_trace_get",
    {
      description: "Retrieve complete trace span tree by traceId.",
      inputSchema: toMcpSchema(TraceGetParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.TraceGet, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_trace_list
  server.registerTool(
    "localbridge_trace_list",
    {
      description: "List recent distributed traces with span counts and latencies.",
      inputSchema: toMcpSchema(TraceListParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.TraceList, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 6. localbridge_metrics_get
  server.registerTool(
    "localbridge_metrics_get",
    {
      description: "Query system-wide runtime metrics (memory, CPU, tool call latency percentiles p50/p95/p99).",
      inputSchema: toMcpSchema(MetricsGetParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", { toolName: "localbridge_metrics_get", ...args });
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.MetricsGet, args);
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_metrics_get", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_metrics_get", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 7. localbridge_observability_summary
  server.registerTool(
    "localbridge_observability_summary",
    {
      description: "Get a comprehensive observability summary (slowest operations, error rates, active components).",
      inputSchema: toMcpSchema(ObservabilitySummaryParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.ObservabilitySummary, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
