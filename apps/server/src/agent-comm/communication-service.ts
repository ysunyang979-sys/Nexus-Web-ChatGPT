import crypto from "node:crypto";
import type {
  AgentIdentity,
  AgentRegisterParams,
  AgentRegisterResult,
  AgentUnregisterParams,
  AgentUnregisterResult,
  AgentListParams,
  AgentListResult,
  AgentEndpointBindParams,
  AgentEndpointBindResult,
  AgentMessage,
  AgentMessageSendParams,
  AgentMessageSendResult,
  AgentMessageReadParams,
  AgentMessageReadResult,
  AgentMessageAckParams,
  AgentMessageAckResult,
  AgentConversation,
  AgentConversationCreateParams,
  AgentConversationCreateResult,
  AgentConversationListParams,
  AgentConversationListResult,
  AgentHandoffParams,
  AgentHandoffResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class AgentCommunicationService {
  private readonly agents = new Map<string, AgentIdentity>();
  private readonly messages: AgentMessage[] = [];
  private readonly conversations = new Map<string, AgentConversation>();

  constructor(private readonly logger?: Logger) {}

  async register(params: AgentRegisterParams): Promise<AgentRegisterResult> {
    const id = params.agentId || `agent_${crypto.randomUUID()}`;
    const now = Date.now();
    const identity: AgentIdentity = {
      agentId: id,
      name: params.name,
      role: params.role,
      capabilities: params.capabilities || [],
      endpoint: params.endpoint,
      status: "online",
      registeredAt: now,
      lastHeartbeatAt: now,
      metadata: params.metadata,
    };
    this.agents.set(id, identity);
    this.logger?.info({ agentId: id, name: params.name, role: params.role }, "Registered agent");
    return { agent: identity };
  }

  async unregister(params: AgentUnregisterParams): Promise<AgentUnregisterResult> {
    const existed = this.agents.delete(params.agentId);
    return { agentId: params.agentId, unregistered: existed };
  }

  async list(params: AgentListParams): Promise<AgentListResult> {
    let list = Array.from(this.agents.values());
    if (params.status) {
      list = list.filter((a) => a.status === params.status);
    }
    if (params.role) {
      list = list.filter((a) => a.role.toLowerCase().includes(params.role!.toLowerCase()));
    }
    return {
      agents: list,
      total: list.length,
    };
  }

  async bindEndpoint(params: AgentEndpointBindParams): Promise<AgentEndpointBindResult> {
    const agent = this.agents.get(params.agentId);
    if (!agent) {
      throw new Error(`Agent '${params.agentId}' not found`);
    }
    agent.endpoint = params.endpoint;
    agent.lastHeartbeatAt = Date.now();
    return {
      agentId: agent.agentId,
      endpoint: params.endpoint,
      bound: true,
    };
  }

  async createConversation(params: AgentConversationCreateParams): Promise<AgentConversationCreateResult> {
    const id = `conv_${crypto.randomUUID()}`;
    const now = Date.now();
    const conv: AgentConversation = {
      id,
      title: params.title,
      participants: params.participants,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    };
    this.conversations.set(id, conv);
    return { conversation: conv };
  }

  async listConversations(params: AgentConversationListParams): Promise<AgentConversationListResult> {
    let list = Array.from(this.conversations.values());
    if (params.agentId) {
      list = list.filter((c) => c.participants.includes(params.agentId!));
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      conversations: list.slice(0, params.limit || 30),
      total: list.length,
    };
  }

  async sendMessage(params: AgentMessageSendParams): Promise<AgentMessageSendResult> {
    const convId = params.conversationId || `conv_${crypto.randomUUID()}`;
    if (!this.conversations.has(convId)) {
      this.conversations.set(convId, {
        id: convId,
        title: params.subject || `Conversation with ${params.recipientId}`,
        participants: [params.senderId, params.recipientId],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const id = `msg_${crypto.randomUUID()}`;
    const now = Date.now();
    const msg: AgentMessage = {
      id,
      conversationId: convId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      messageType: params.messageType || "notification",
      subject: params.subject,
      payload: params.payload,
      status: "delivered",
      sentAt: now,
      deliveredAt: now,
      replyToId: params.replyToId,
    };

    this.messages.push(msg);
    if (this.messages.length > 10000) {
      this.messages.shift();
    }

    this.logger?.info(
      { messageId: id, sender: params.senderId, recipient: params.recipientId },
      "Agent message sent"
    );

    return { message: msg };
  }

  async readMessages(params: AgentMessageReadParams): Promise<AgentMessageReadResult> {
    let list = this.messages.filter((m) => m.recipientId === params.agentId || m.senderId === params.agentId);

    if (params.conversationId) {
      list = list.filter((m) => m.conversationId === params.conversationId);
    }
    if (params.status) {
      list = list.filter((m) => m.status === params.status);
    }

    // Mark delivered as read
    for (const m of list) {
      if (m.recipientId === params.agentId && m.status === "delivered") {
        m.status = "read";
        m.readAt = Date.now();
      }
    }

    const paginated = list.slice(0, params.limit || 50);
    return {
      messages: paginated,
      total: list.length,
    };
  }

  async ackMessage(params: AgentMessageAckParams): Promise<AgentMessageAckResult> {
    const msg = this.messages.find((m) => m.id === params.messageId);
    if (!msg) {
      throw new Error(`Message '${params.messageId}' not found`);
    }
    msg.status = "acknowledged";
    msg.acknowledgedAt = Date.now();

    if (params.responsePayload) {
      await this.sendMessage({
        conversationId: msg.conversationId,
        senderId: params.agentId,
        recipientId: msg.senderId,
        messageType: "response",
        replyToId: msg.id,
        payload: params.responsePayload,
      });
    }

    return {
      messageId: msg.id,
      status: "acknowledged",
      acknowledgedAt: msg.acknowledgedAt,
    };
  }

  async ackMessages(params: {
    agentId: string;
    messageIds: string[];
  }): Promise<{ ackedCount: number; messageIds: string[] }> {
    const acknowledged: string[] = [];
    for (const msgId of params.messageIds) {
      const msg = this.messages.find((m) => m.id === msgId);
      if (msg) {
        msg.status = "acknowledged";
        msg.acknowledgedAt = Date.now();
        acknowledged.push(msgId);
      }
    }
    return {
      ackedCount: acknowledged.length,
      messageIds: acknowledged,
    };
  }

  async handoff(params: AgentHandoffParams): Promise<AgentHandoffResult> {
    const conv = await this.createConversation({
      title: `Handoff from ${params.fromAgentId} to ${params.toAgentId}`,
      participants: [params.fromAgentId, params.toAgentId],
      metadata: params.metadata,
    });

    const msg = await this.sendMessage({
      conversationId: conv.conversation.id,
      senderId: params.fromAgentId,
      recipientId: params.toAgentId,
      messageType: "handoff",
      subject: `Task Handoff: ${params.taskId || "General"}`,
      payload: {
        taskId: params.taskId,
        sessionId: params.sessionId,
        contextSummary: params.contextSummary,
        checkpoints: params.checkpoints,
        artifacts: params.artifacts,
      },
    });

    return {
      handoffId: msg.message.id,
      conversationId: conv.conversation.id,
      status: "transferred",
      transferredAt: Date.now(),
    };
  }
}
