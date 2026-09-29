import { z } from "zod";

export const SpanStatusSchema = z.enum(["unset", "ok", "error"]);
export type SpanStatus = z.infer<typeof SpanStatusSchema>;

export const SpanEventSchema = z.object({
  name: z.string(),
  timestamp: z.number(),
  attributes: z.record(z.any()).optional(),
});
export type SpanEvent = z.infer<typeof SpanEventSchema>;

export const TraceSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  service: z.string().default("localbridge"),
  kind: z.enum(["internal", "server", "client", "producer", "consumer"]).default("internal"),
  startTime: z.number(),
  endTime: z.number().optional(),
  durationMs: z.number().optional(),
  status: SpanStatusSchema.default("unset"),
  error: z.string().optional(),
  attributes: z.record(z.any()).default({}),
  events: z.array(SpanEventSchema).default([]),
});
export type TraceSpan = z.infer<typeof TraceSpanSchema>;

export const TraceSummarySchema = z.object({
  traceId: z.string(),
  rootSpanName: z.string(),
  service: z.string(),
  spanCount: z.number(),
  startTime: z.number(),
  durationMs: z.number(),
  hasErrors: z.boolean(),
});
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

export const SystemMetricsSchema = z.object({
  timestamp: z.number(),
  uptimeSeconds: z.number(),
  memoryUsageMb: z.number(),
  cpuUsagePercent: z.number(),
  activeRuntimes: z.number(),
  activeTerminals: z.number(),
  activeBrowserSessions: z.number(),
  activeAgents: z.number(),
  totalToolCalls: z.number(),
  failedToolCalls: z.number(),
  p50LatencyMs: z.number(),
  p95LatencyMs: z.number(),
  p99LatencyMs: z.number(),

  // Production Execution Metrics
  task_total: z.number().default(0),
  task_success: z.number().default(0),
  task_failure: z.number().default(0),
  action_total: z.number().default(0),
  action_success: z.number().default(0),
  action_failure: z.number().default(0),
  action_unknown: z.number().default(0),
  verification_total: z.number().default(0),
  verification_success: z.number().default(0),
  verification_failure: z.number().default(0),
  checkpoint_total: z.number().default(0),
  checkpoint_restore_total: z.number().default(0),
  recovery_total: z.number().default(0),
  recovery_success: z.number().default(0),
  recovery_failure: z.number().default(0),
  idempotency_hit_total: z.number().default(0),
  resource_discovery_total: z.number().default(0),
  resource_discovery_failure: z.number().default(0),
  computer_action_total: z.number().default(0),
  computer_verification_failure: z.number().default(0),
  tool_latency_p50: z.number().default(0),
  tool_latency_p95: z.number().default(0),
  tool_latency_p99: z.number().default(0),
  recovery_latency: z.number().default(0),
  checkpoint_restore_latency: z.number().default(0),
  tool_success_total: z.number().default(0),
  action_success_total: z.number().default(0),
  verification_success_total: z.number().default(0),
});
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;

export const ObservabilitySummarySchema = z.object({
  timeWindowMinutes: z.number(),
  totalTraces: z.number(),
  errorRate: z.number(),
  avgDurationMs: z.number(),
  p95DurationMs: z.number(),
  topSlowestOperations: z.array(
    z.object({
      name: z.string(),
      durationMs: z.number(),
      traceId: z.string(),
    })
  ),
  topErrors: z.array(
    z.object({
      operation: z.string(),
      error: z.string(),
      count: z.number(),
    })
  ),
  activeComponents: z.record(z.number()),
});
export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;

// Tool Schemas:

// 1. Trace Start
export const TraceStartParamsSchema = z.object({
  name: z.string().min(1),
  service: z.string().optional(),
  traceId: z.string().optional(),
  parentSpanId: z.string().optional(),
  attributes: z.record(z.any()).optional(),
});
export type TraceStartParams = z.infer<typeof TraceStartParamsSchema>;

export const TraceStartResultSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  startTime: z.number(),
});
export type TraceStartResult = z.infer<typeof TraceStartResultSchema>;

// 2. Trace End
export const TraceEndParamsSchema = z.object({
  spanId: z.string(),
  status: SpanStatusSchema.default("ok"),
  error: z.string().optional(),
  attributes: z.record(z.any()).optional(),
});
export type TraceEndParams = z.infer<typeof TraceEndParamsSchema>;

export const TraceEndResultSchema = z.object({
  spanId: z.string(),
  durationMs: z.number(),
  status: SpanStatusSchema,
  endTime: z.number(),
});
export type TraceEndResult = z.infer<typeof TraceEndResultSchema>;

// 3. Trace Record Event
export const TraceRecordParamsSchema = z.object({
  spanId: z.string(),
  name: z.string(),
  attributes: z.record(z.any()).optional(),
  timestamp: z.number().optional(),
});
export type TraceRecordParams = z.infer<typeof TraceRecordParamsSchema>;

export const TraceRecordResultSchema = z.object({
  spanId: z.string(),
  recorded: z.boolean(),
  event: SpanEventSchema,
});
export type TraceRecordResult = z.infer<typeof TraceRecordResultSchema>;

// 4. Trace Get
export const TraceGetParamsSchema = z.object({
  traceId: z.string(),
});
export type TraceGetParams = z.infer<typeof TraceGetParamsSchema>;

export const TraceGetResultSchema = z.object({
  traceId: z.string(),
  spans: z.array(TraceSpanSchema),
  totalSpans: z.number(),
  durationMs: z.number(),
});
export type TraceGetResult = z.infer<typeof TraceGetResultSchema>;

// 5. Trace List
export const TraceListParamsSchema = z.object({
  service: z.string().optional(),
  status: SpanStatusSchema.optional(),
  limit: z.number().default(50),
});
export type TraceListParams = z.infer<typeof TraceListParamsSchema>;

export const TraceListResultSchema = z.object({
  traces: z.array(TraceSummarySchema),
  total: z.number(),
});
export type TraceListResult = z.infer<typeof TraceListResultSchema>;

// 6. Metrics Get
export const MetricsGetParamsSchema = z.object({
  category: z.enum(["system", "tool", "agent", "all"]).default("all"),
});
export type MetricsGetParams = z.infer<typeof MetricsGetParamsSchema>;

export const MetricsGetResultSchema = z.object({
  metrics: SystemMetricsSchema,
});
export type MetricsGetResult = z.infer<typeof MetricsGetResultSchema>;

// 7. Observability Summary
export const ObservabilitySummaryParamsSchema = z.object({
  timeWindowMinutes: z.number().default(60),
});
export type ObservabilitySummaryParams = z.infer<typeof ObservabilitySummaryParamsSchema>;

export const ObservabilitySummaryResultSchema = z.object({
  summary: ObservabilitySummarySchema,
});
export type ObservabilitySummaryResult = z.infer<typeof ObservabilitySummaryResultSchema>;
