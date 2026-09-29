import { z } from "zod";

export const AgentStatusSchema = z.enum(["online", "busy", "idle", "offline"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentIdentitySchema = z.object({
  agentId: z.string(),
  name: z.string(),
  role: z.string(),
  capabilities: z.array(z.string()).default([]),
  endpoint: z.string().optional(),
  status: AgentStatusSchema.default("online"),
  registeredAt: z.number(),
  lastHeartbeatAt: z.number(),
  metadata: z.record(z.any()).optional(),
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

export const AgentRegisterParamsSchema = z.object({
  agentId: z.string().optional(),
  name: z.string().min(1),
  role: z.string().min(1),
  capabilities: z.array(z.string()).optional(),
  endpoint: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type AgentRegisterParams = z.infer<typeof AgentRegisterParamsSchema>;

export const AgentRegisterResultSchema = z.object({
  agent: AgentIdentitySchema,
});
export type AgentRegisterResult = z.infer<typeof AgentRegisterResultSchema>;

export const AgentUnregisterParamsSchema = z.object({
  agentId: z.string(),
});
export type AgentUnregisterParams = z.infer<typeof AgentUnregisterParamsSchema>;

export const AgentUnregisterResultSchema = z.object({
  agentId: z.string(),
  unregistered: z.boolean(),
});
export type AgentUnregisterResult = z.infer<typeof AgentUnregisterResultSchema>;

export const AgentListParamsSchema = z.object({
  status: AgentStatusSchema.optional(),
  role: z.string().optional(),
});
export type AgentListParams = z.infer<typeof AgentListParamsSchema>;

export const AgentListResultSchema = z.object({
  agents: z.array(AgentIdentitySchema),
  total: z.number().int().nonnegative(),
});
export type AgentListResult = z.infer<typeof AgentListResultSchema>;

export const AgentEndpointBindParamsSchema = z.object({
  agentId: z.string(),
  endpoint: z.string(),
});
export type AgentEndpointBindParams = z.infer<typeof AgentEndpointBindParamsSchema>;

export const AgentEndpointBindResultSchema = z.object({
  agentId: z.string(),
  endpoint: z.string(),
  bound: z.boolean(),
});
export type AgentEndpointBindResult = z.infer<typeof AgentEndpointBindResultSchema>;

export const AgentMessageTypeSchema = z.enum([
  "request",
  "response",
  "notification",
  "handoff",
  "error",
]);
export type AgentMessageType = z.infer<typeof AgentMessageTypeSchema>;

export const AgentMessageStatusSchema = z.enum([
  "sent",
  "delivered",
  "read",
  "acknowledged",
]);
export type AgentMessageStatus = z.infer<typeof AgentMessageStatusSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  messageType: AgentMessageTypeSchema.default("notification"),
  subject: z.string().optional(),
  payload: z.any(),
  status: AgentMessageStatusSchema.default("sent"),
  sentAt: z.number(),
  deliveredAt: z.number().optional(),
  readAt: z.number().optional(),
  acknowledgedAt: z.number().optional(),
  replyToId: z.string().optional(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentMessageSendParamsSchema = z.object({
  conversationId: z.string().optional(),
  senderId: z.string(),
  recipientId: z.string(),
  messageType: AgentMessageTypeSchema.optional(),
  subject: z.string().optional(),
  payload: z.any(),
  replyToId: z.string().optional(),
});
export type AgentMessageSendParams = z.infer<typeof AgentMessageSendParamsSchema>;

export const AgentMessageSendResultSchema = z.object({
  message: AgentMessageSchema,
});
export type AgentMessageSendResult = z.infer<typeof AgentMessageSendResultSchema>;

export const AgentMessageReadParamsSchema = z.object({
  agentId: z.string(),
  conversationId: z.string().optional(),
  status: AgentMessageStatusSchema.optional(),
  limit: z.number().int().positive().max(100).default(50),
});
export type AgentMessageReadParams = z.infer<typeof AgentMessageReadParamsSchema>;

export const AgentMessageReadResultSchema = z.object({
  messages: z.array(AgentMessageSchema),
  total: z.number().int().nonnegative(),
});
export type AgentMessageReadResult = z.infer<typeof AgentMessageReadResultSchema>;

export const AgentMessageAckParamsSchema = z.object({
  messageId: z.string(),
  agentId: z.string(),
  responsePayload: z.any().optional(),
});
export type AgentMessageAckParams = z.infer<typeof AgentMessageAckParamsSchema>;

export const AgentMessageAckResultSchema = z.object({
  messageId: z.string(),
  status: AgentMessageStatusSchema,
  acknowledgedAt: z.number(),
});
export type AgentMessageAckResult = z.infer<typeof AgentMessageAckResultSchema>;

export const AgentConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  participants: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.any()).optional(),
});
export type AgentConversation = z.infer<typeof AgentConversationSchema>;

export const AgentConversationCreateParamsSchema = z.object({
  title: z.string().min(1),
  participants: z.array(z.string()).min(1),
  metadata: z.record(z.any()).optional(),
});
export type AgentConversationCreateParams = z.infer<typeof AgentConversationCreateParamsSchema>;

export const AgentConversationCreateResultSchema = z.object({
  conversation: AgentConversationSchema,
});
export type AgentConversationCreateResult = z.infer<typeof AgentConversationCreateResultSchema>;

export const AgentConversationListParamsSchema = z.object({
  agentId: z.string().optional(),
  limit: z.number().int().positive().max(100).default(30),
});
export type AgentConversationListParams = z.infer<typeof AgentConversationListParamsSchema>;

export const AgentConversationListResultSchema = z.object({
  conversations: z.array(AgentConversationSchema),
  total: z.number().int().nonnegative(),
});
export type AgentConversationListResult = z.infer<typeof AgentConversationListResultSchema>;

export const AgentHandoffParamsSchema = z.object({
  fromAgentId: z.string(),
  toAgentId: z.string(),
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  contextSummary: z.string(),
  checkpoints: z.array(z.string()).optional(),
  artifacts: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});
export type AgentHandoffParams = z.infer<typeof AgentHandoffParamsSchema>;

export const AgentHandoffResultSchema = z.object({
  handoffId: z.string(),
  conversationId: z.string(),
  status: z.enum(["transferred", "accepted", "failed"]),
  transferredAt: z.number(),
});
export type AgentHandoffResult = z.infer<typeof AgentHandoffResultSchema>;
