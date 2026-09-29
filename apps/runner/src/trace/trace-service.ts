import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import type { Logger } from "@localbridge/shared";
import type {
  TraceSpan,
  TraceSummary,
  SystemMetrics,
  ObservabilitySummary,
  TraceStartParams,
  TraceStartResult,
  TraceEndParams,
  TraceEndResult,
  TraceRecordParams,
  TraceRecordResult,
  TraceGetParams,
  TraceGetResult,
  TraceListParams,
  TraceListResult,
  MetricsGetParams,
  MetricsGetResult,
  ObservabilitySummaryParams,
  ObservabilitySummaryResult,
} from "@localbridge/protocol";

export class LocalBridgeObservabilityService {
  private readonly spans = new Map<string, TraceSpan>();
  private readonly latencies: number[] = [];
  private totalToolCallsCount = 0;
  private failedToolCallsCount = 0;
  private readonly logFilePath?: string;
  private readonly startTime = Date.now();

  constructor(
    private readonly runnerStateDir?: string,
    private readonly _logger?: Logger
  ) {
    if (this.runnerStateDir) {
      this.logFilePath = path.join(this.runnerStateDir, "traces-store.jsonl");
      this.loadFromDisk();
    }
  }

  // --- Tracing ---

  async startTrace(params: TraceStartParams): Promise<TraceStartResult> {
    const traceId = params.traceId || `trc_${crypto.randomUUID().slice(0, 12)}`;
    const spanId = `spn_${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const span: TraceSpan = {
      traceId,
      spanId,
      parentSpanId: params.parentSpanId,
      name: params.name,
      service: params.service || "localbridge",
      kind: params.parentSpanId ? "internal" : "server",
      startTime: now,
      status: "unset",
      attributes: params.attributes || {},
      events: [],
    };

    this.spans.set(spanId, span);
    return {
      traceId,
      spanId,
      startTime: now,
    };
  }

  async endTrace(params: TraceEndParams): Promise<TraceEndResult> {
    const span = this.spans.get(params.spanId);
    if (!span) {
      throw new Error(`Trace span '${params.spanId}' not found`);
    }

    const now = Date.now();
    span.endTime = now;
    span.durationMs = Math.max(0, now - span.startTime);
    span.status = params.status || "ok";
    if (params.error) span.error = params.error;
    if (params.attributes) span.attributes = { ...span.attributes, ...params.attributes };

    this.latencies.push(span.durationMs);
    if (this.latencies.length > 2000) this.latencies.shift();

    this.totalToolCallsCount++;
    if (span.status === "error") this.failedToolCallsCount++;

    this.appendToFile(span);

    return {
      spanId: span.spanId,
      durationMs: span.durationMs,
      status: span.status,
      endTime: now,
    };
  }

  async recordEvent(params: TraceRecordParams): Promise<TraceRecordResult> {
    const span = this.spans.get(params.spanId);
    if (!span) {
      throw new Error(`Trace span '${params.spanId}' not found`);
    }

    const event = {
      name: params.name,
      timestamp: params.timestamp || Date.now(),
      attributes: params.attributes,
    };

    span.events.push(event);

    return {
      spanId: span.spanId,
      recorded: true,
      event,
    };
  }

  async getTrace(params: TraceGetParams): Promise<TraceGetResult> {
    const matchedSpans = Array.from(this.spans.values()).filter(
      (s) => s.traceId === params.traceId
    );

    if (matchedSpans.length === 0) {
      throw new Error(`Trace '${params.traceId}' not found`);
    }

    matchedSpans.sort((a, b) => a.startTime - b.startTime);
    const start = matchedSpans[0]!.startTime;
    const end = Math.max(...matchedSpans.map((s) => s.endTime || s.startTime));
    const durationMs = Math.max(0, end - start);

    return {
      traceId: params.traceId,
      spans: matchedSpans,
      totalSpans: matchedSpans.length,
      durationMs,
    };
  }

  async listTraces(params: TraceListParams): Promise<TraceListResult> {
    // Group spans by traceId
    const tracesMap = new Map<string, TraceSpan[]>();
    for (const span of this.spans.values()) {
      const list = tracesMap.get(span.traceId) || [];
      list.push(span);
      tracesMap.set(span.traceId, list);
    }

    const summaries: TraceSummary[] = [];
    for (const [traceId, spans] of tracesMap) {
      if (spans.length === 0) continue;
      spans.sort((a, b) => a.startTime - b.startTime);
      const rootSpan = spans.find((s) => !s.parentSpanId) || spans[0]!;
      const start = spans[0]!.startTime;
      const end = Math.max(...spans.map((s) => s.endTime || s.startTime));
      const hasErrors = spans.some((s) => s.status === "error");

      if (params.service && rootSpan.service !== params.service) continue;
      if (params.status && (hasErrors ? "error" : "ok") !== params.status) continue;

      summaries.push({
        traceId,
        rootSpanName: rootSpan.name,
        service: rootSpan.service,
        spanCount: spans.length,
        startTime: start,
        durationMs: Math.max(0, end - start),
        hasErrors,
      });
    }

    summaries.sort((a, b) => b.startTime - a.startTime);
    const paginated = summaries.slice(0, params.limit || 50);

    return {
      traces: paginated,
      total: summaries.length,
    };
  }

  private readonly executionCounters = {
    task_total: 0,
    task_success: 0,
    task_failure: 0,
    action_total: 0,
    action_success: 0,
    action_failure: 0,
    action_unknown: 0,
    verification_total: 0,
    verification_success: 0,
    verification_failure: 0,
    checkpoint_total: 0,
    checkpoint_restore_total: 0,
    recovery_total: 0,
    recovery_success: 0,
    recovery_failure: 0,
    idempotency_hit_total: 0,
    resource_discovery_total: 0,
    resource_discovery_failure: 0,
    computer_action_total: 0,
    computer_verification_failure: 0,
    tool_success_total: 0,
    action_success_total: 0,
    verification_success_total: 0,
    recovery_latency: 0,
    checkpoint_restore_latency: 0,
  };

  public recordMetric(counter: keyof typeof this.executionCounters, increment = 1): void {
    if (counter in this.executionCounters) {
      this.executionCounters[counter] += increment;
    }
  }

  public recordLatency(metricName: "recovery" | "checkpoint_restore" | "tool", latencyMs: number): void {
    if (metricName === "recovery") {
      this.executionCounters.recovery_latency = latencyMs;
    } else if (metricName === "checkpoint_restore") {
      this.executionCounters.checkpoint_restore_latency = latencyMs;
    } else {
      this.latencies.push(latencyMs);
      if (this.latencies.length > 2000) this.latencies.shift();
    }
  }

  public attachEventBus(bus: any): void {
    if (!bus) return;
    const onEvent = (topic: string, fn: (...args: any[]) => void) => {
      if (typeof bus.on === "function") {
        bus.on(topic, fn);
      } else if (typeof bus.subscribe === "function") {
        bus.subscribe(topic, fn);
      }
    };
    onEvent("agent.task.started", () => {
      this.recordMetric("task_total");
    });
    onEvent("agent.task.completed", () => {
      this.recordMetric("task_success");
    });
    onEvent("agent.action.prepared", () => {
      this.recordMetric("action_total");
    });
    onEvent("agent.action.committed", () => {
      this.recordMetric("action_success");
    });
    onEvent("agent.action.failed", () => {
      this.recordMetric("action_failure");
    });
    onEvent("agent.action.verification.completed", (evt: any) => {
      this.recordMetric("verification_total");
      if (evt?.payload?.verificationStatus === "verified" || evt?.payload?.status === "VERIFIED" || evt?.payload?.verified !== false) {
        this.recordMetric("verification_success");
      } else {
        this.recordMetric("verification_failure");
      }
    });
    onEvent("agent.checkpoint.created", () => {
      this.recordMetric("checkpoint_total");
    });
    onEvent("agent.recovery.completed", () => {
      this.recordMetric("recovery_total");
      this.recordMetric("recovery_success");
    });
  }

  // --- Metrics ---

  async getMetrics(_params: MetricsGetParams): Promise<MetricsGetResult> {
    const mem = process.memoryUsage();
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = this.getPercentile(sorted, 50);
    const p95 = this.getPercentile(sorted, 95);
    const p99 = this.getPercentile(sorted, 99);

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
      cpuUsagePercent: Math.min(100, Math.round((os.loadavg()[0] ?? 0) * 10) || 5),
      activeRuntimes: 0,
      activeTerminals: 0,
      activeBrowserSessions: 0,
      activeAgents: 1,
      totalToolCalls: this.totalToolCallsCount,
      failedToolCalls: this.failedToolCallsCount,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,

      // Production Execution Metrics
      task_total: this.executionCounters.task_total,
      task_success: this.executionCounters.task_success,
      task_failure: this.executionCounters.task_failure,
      action_total: this.executionCounters.action_total,
      action_success: this.executionCounters.action_success,
      action_failure: this.executionCounters.action_failure,
      action_unknown: this.executionCounters.action_unknown,
      verification_total: this.executionCounters.verification_total,
      verification_success: this.executionCounters.verification_success,
      verification_failure: this.executionCounters.verification_failure,
      checkpoint_total: this.executionCounters.checkpoint_total,
      checkpoint_restore_total: this.executionCounters.checkpoint_restore_total,
      recovery_total: this.executionCounters.recovery_total,
      recovery_success: this.executionCounters.recovery_success,
      recovery_failure: this.executionCounters.recovery_failure,
      idempotency_hit_total: this.executionCounters.idempotency_hit_total,
      resource_discovery_total: this.executionCounters.resource_discovery_total,
      resource_discovery_failure: this.executionCounters.resource_discovery_failure,
      computer_action_total: this.executionCounters.computer_action_total,
      computer_verification_failure: this.executionCounters.computer_verification_failure,
      tool_latency_p50: p50,
      tool_latency_p95: p95,
      tool_latency_p99: p99,
      recovery_latency: this.executionCounters.recovery_latency,
      checkpoint_restore_latency: this.executionCounters.checkpoint_restore_latency,
      tool_success_total: this.executionCounters.tool_success_total || this.totalToolCallsCount - this.failedToolCallsCount,
      action_success_total: this.executionCounters.action_success,
      verification_success_total: this.executionCounters.verification_success,
    };

    return { metrics };
  }

  // --- Observability Summary ---

  async getSummary(params: ObservabilitySummaryParams): Promise<ObservabilitySummaryResult> {
    const windowMs = (params.timeWindowMinutes || 60) * 60 * 1000;
    const cutoff = Date.now() - windowMs;

    const recentSpans = Array.from(this.spans.values()).filter((s) => s.startTime >= cutoff);
    const completed = recentSpans.filter((s) => s.durationMs !== undefined);
    const totalTraces = new Set(recentSpans.map((s) => s.traceId)).size;

    const errorSpans = recentSpans.filter((s) => s.status === "error");
    const errorRate = recentSpans.length > 0 ? errorSpans.length / recentSpans.length : 0;

    const sortedDurations = completed.map((s) => s.durationMs!).sort((a, b) => a - b);
    const avgDuration =
      completed.length > 0
        ? Math.round(sortedDurations.reduce((a, b) => a + b, 0) / completed.length)
        : 0;
    const p95Duration = this.getPercentile(sortedDurations, 95);

    const slowest = [...completed]
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        durationMs: s.durationMs || 0,
        traceId: s.traceId,
      }));

    const errorCounts = new Map<string, { op: string; err: string; count: number }>();
    for (const e of errorSpans) {
      const key = `${e.name}:${e.error || "unknown"}`;
      const existing = errorCounts.get(key) || { op: e.name, err: e.error || "unknown", count: 0 };
      existing.count++;
      errorCounts.set(key, existing);
    }

    const topErrors = Array.from(errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((x) => ({ operation: x.op, error: x.err, count: x.count }));

    const summary: ObservabilitySummary = {
      timeWindowMinutes: params.timeWindowMinutes,
      totalTraces,
      errorRate: Math.round(errorRate * 100) / 100,
      avgDurationMs: avgDuration,
      p95DurationMs: p95Duration,
      topSlowestOperations: slowest,
      topErrors,
      activeComponents: {
        server: 1,
        runner: 1,
        spansTracked: this.spans.size,
      },
    };

    return { summary };
  }

  // --- Internal Helpers ---

  private getPercentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx] ?? 0;
  }

  private loadFromDisk(): void {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) return;
    try {
      const content = fs.readFileSync(this.logFilePath, "utf-8");
      const lines = content.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const s = JSON.parse(line);
          this.spans.set(s.spanId, s);
        } catch {}
      }
    } catch {}
  }

  private appendToFile(span: TraceSpan): void {
    if (!this.logFilePath) return;
    try {
      fs.appendFileSync(this.logFilePath, JSON.stringify(span) + "\n", "utf-8");
    } catch {}
  }
}
