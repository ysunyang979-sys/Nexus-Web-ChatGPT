import type { LocalBridgeObservabilityService } from "../../trace/trace-service.js";

export function createTraceHandlers(service: LocalBridgeObservabilityService) {
  return {
    start: (params: any) => service.startTrace(params),
    end: (params: any) => service.endTrace(params),
    record: (params: any) => service.recordEvent(params),
    get: (params: any) => service.getTrace(params),
    list: (params: any) => service.listTraces(params),
    metrics: (params: any) => service.getMetrics(params),
    summary: (params: any) => service.getSummary(params),
  };
}
