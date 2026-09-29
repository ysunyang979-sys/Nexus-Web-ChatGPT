import {
  RunnerRpcMethods,
  EventPublishParamsSchema,
  EventSubscribeParamsSchema,
  EventUnsubscribeParamsSchema,
  EventPollParamsSchema,
  EventHistoryParamsSchema,
  EventReplayParamsSchema,
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

export function registerEventTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_event_publish
  server.registerTool(
    "localbridge_event_publish",
    {
      description: "Publish a structured event to the system-wide Event Bus.",
      inputSchema: toMcpSchema(EventPublishParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventPublish, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_event_subscribe
  server.registerTool(
    "localbridge_event_subscribe",
    {
      description: "Create an event subscription matching a topic pattern.",
      inputSchema: toMcpSchema(EventSubscribeParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventSubscribe, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_event_unsubscribe
  server.registerTool(
    "localbridge_event_unsubscribe",
    {
      description: "Cancel an active event subscription.",
      inputSchema: toMcpSchema(EventUnsubscribeParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventUnsubscribe, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_event_poll
  server.registerTool(
    "localbridge_event_poll",
    {
      description: "Poll queued events from a subscription buffer.",
      inputSchema: toMcpSchema(EventPollParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventPoll, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_event_history
  server.registerTool(
    "localbridge_event_history",
    {
      description: "Query durable event history by topic, time, or correlation ID.",
      inputSchema: toMcpSchema(EventHistoryParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventHistory, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 6. localbridge_event_replay
  server.registerTool(
    "localbridge_event_replay",
    {
      description: "Replay past events within a time window for audit or recovery.",
      inputSchema: toMcpSchema(EventReplayParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = resolveRunner(context);
        const result = await context.request(runnerId, RunnerRpcMethods.EventReplay, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
