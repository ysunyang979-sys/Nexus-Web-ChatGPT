import { z } from "zod";

export const LocalBridgeEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.number(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  executionId: z.string().optional(),
  actionId: z.string().optional(),
  checkpointId: z.string().optional(),
  stateHash: z.string().optional(),
  type: z.string().optional(),
  topic: z.string(),
  payload: z.any(),
  source: z.string().default("nexus"),
  runner: z.string().default("windows"),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type LocalBridgeEvent = z.infer<typeof LocalBridgeEventSchema>;

export const EventSubscriptionSchema = z.object({
  subscriptionId: z.string(),
  subscriberId: z.string(),
  topicPattern: z.string(),
  createdAt: z.number(),
  maxBufferSize: z.number().default(100),
  active: z.boolean().default(true),
});
export type EventSubscription = z.infer<typeof EventSubscriptionSchema>;

// Tool Schemas:

// 1. Publish
export const EventPublishParamsSchema = z.object({
  topic: z.string().min(1),
  payload: z.any(),
  source: z.string().optional(),
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  executionId: z.string().optional(),
  actionId: z.string().optional(),
  checkpointId: z.string().optional(),
  stateHash: z.string().optional(),
  type: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type EventPublishParams = z.infer<typeof EventPublishParamsSchema>;

export const EventPublishResultSchema = z.object({
  eventId: z.string(),
  topic: z.string(),
  published: z.boolean(),
  timestamp: z.number(),
  recipientCount: z.number(),
});
export type EventPublishResult = z.infer<typeof EventPublishResultSchema>;

// 2. Subscribe
export const EventSubscribeParamsSchema = z.object({
  subscriberId: z.string(),
  topicPattern: z.string().default("*"),
  maxBufferSize: z.number().default(100),
});
export type EventSubscribeParams = z.infer<typeof EventSubscribeParamsSchema>;

export const EventSubscribeResultSchema = z.object({
  subscription: EventSubscriptionSchema,
});
export type EventSubscribeResult = z.infer<typeof EventSubscribeResultSchema>;

// 3. Unsubscribe
export const EventUnsubscribeParamsSchema = z.object({
  subscriptionId: z.string(),
});
export type EventUnsubscribeParams = z.infer<typeof EventUnsubscribeParamsSchema>;

export const EventUnsubscribeResultSchema = z.object({
  subscriptionId: z.string(),
  unsubscribed: z.boolean(),
});
export type EventUnsubscribeResult = z.infer<typeof EventUnsubscribeResultSchema>;

// 4. Poll
export const EventPollParamsSchema = z.object({
  subscriptionId: z.string(),
  limit: z.number().default(20),
  timeoutMs: z.number().default(5000),
});
export type EventPollParams = z.infer<typeof EventPollParamsSchema>;

export const EventPollResultSchema = z.object({
  subscriptionId: z.string(),
  events: z.array(LocalBridgeEventSchema),
  totalRetrieved: z.number(),
  remainingCount: z.number(),
});
export type EventPollResult = z.infer<typeof EventPollResultSchema>;

// 5. History
export const EventHistoryParamsSchema = z.object({
  topicPattern: z.string().optional(),
  sinceTimestamp: z.number().optional(),
  correlationId: z.string().optional(),
  source: z.string().optional(),
  limit: z.number().default(50),
});
export type EventHistoryParams = z.infer<typeof EventHistoryParamsSchema>;

export const EventHistoryResultSchema = z.object({
  events: z.array(LocalBridgeEventSchema),
  totalFound: z.number(),
});
export type EventHistoryResult = z.infer<typeof EventHistoryResultSchema>;

// 6. Replay
export const EventReplayParamsSchema = z.object({
  topicPattern: z.string().optional(),
  fromTimestamp: z.number(),
  toTimestamp: z.number().optional(),
  targetSubscriptionId: z.string().optional(),
});
export type EventReplayParams = z.infer<typeof EventReplayParamsSchema>;

export const EventReplayResultSchema = z.object({
  replayedCount: z.number(),
  fromTimestamp: z.number(),
  toTimestamp: z.number(),
});
export type EventReplayResult = z.infer<typeof EventReplayResultSchema>;
