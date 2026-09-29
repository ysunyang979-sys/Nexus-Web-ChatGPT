import {
  AgentRegisterParamsSchema,
  AgentUnregisterParamsSchema,
  AgentListParamsSchema,
  AgentEndpointBindParamsSchema,
  AgentMessageSendParamsSchema,
  AgentMessageReadParamsSchema,
  AgentMessageAckParamsSchema,
  AgentConversationCreateParamsSchema,
  AgentConversationListParamsSchema,
  AgentHandoffParamsSchema,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerAgentCommTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_agent_register
  server.registerTool(
    "localbridge_agent_register",
    {
      description: "Register an AI Agent identity and advertise its role, capabilities, and endpoint.",
      inputSchema: toMcpSchema(AgentRegisterParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.register(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_agent_unregister
  server.registerTool(
    "localbridge_agent_unregister",
    {
      description: "Unregister an AI agent identity.",
      inputSchema: toMcpSchema(AgentUnregisterParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.unregister(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_agent_list
  server.registerTool(
    "localbridge_agent_list",
    {
      description: "List currently registered agents, filtered by role or status.",
      inputSchema: toMcpSchema(AgentListParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.list(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_agent_endpoint_bind
  server.registerTool(
    "localbridge_agent_endpoint_bind",
    {
      description: "Bind or update the communication endpoint for an agent.",
      inputSchema: toMcpSchema(AgentEndpointBindParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.bindEndpoint(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_message_send
  server.registerTool(
    "localbridge_message_send",
    {
      description: "Send a message to another agent or broadcast across a conversation thread.",
      inputSchema: toMcpSchema(AgentMessageSendParamsSchema),
    },
    async (args: any) => {
      const startTime = Date.now();
      try {
        context.logAudit("mcp_tool_started", { toolName: "localbridge_message_send", ...args });

        // Validate sender and recipient via communicationService registry
        const listRes = await context.communicationService.list({});
        if (!listRes.agents.find(a => a.agentId === args.senderId)) {
          throw Object.assign(new Error(`Sender agent not found: ${args.senderId}`), { code: "NOT_FOUND" });
        }
        if (args.recipientId && !listRes.agents.find(a => a.agentId === args.recipientId)) {
          throw Object.assign(new Error(`Recipient agent not found: ${args.recipientId}`), { code: "NOT_FOUND" });
        }

        const result = await context.communicationService.sendMessage(args);
        
        context.logAudit("mcp_tool_completed", { toolName: "localbridge_message_send", durationMs: Date.now() - startTime, resultStatus: "success" });
        return formatToolSuccess(result);
      } catch (err) {
        context.logAudit("mcp_tool_failed", { toolName: "localbridge_message_send", durationMs: Date.now() - startTime, resultStatus: "error", errorCode: (err as any)?.code || "ERROR" });
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 6. localbridge_message_read
  server.registerTool(
    "localbridge_message_read",
    {
      description: "Read incoming unread or queued messages for an agent.",
      inputSchema: toMcpSchema(AgentMessageReadParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.readMessages(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 7. localbridge_message_ack
  server.registerTool(
    "localbridge_message_ack",
    {
      description: "Acknowledge receipt and processing of messages.",
      inputSchema: toMcpSchema(AgentMessageAckParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.ackMessage(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 8. localbridge_conversation_create
  server.registerTool(
    "localbridge_conversation_create",
    {
      description: "Start a multi-agent collaborative conversation thread.",
      inputSchema: toMcpSchema(AgentConversationCreateParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.createConversation(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 9. localbridge_conversation_list
  server.registerTool(
    "localbridge_conversation_list",
    {
      description: "List active conversations and participant agent threads.",
      inputSchema: toMcpSchema(AgentConversationListParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.listConversations(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 10. localbridge_agent_handoff
  server.registerTool(
    "localbridge_agent_handoff",
    {
      description: "Perform structured task and context handoff to a peer agent.",
      inputSchema: toMcpSchema(AgentHandoffParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.communicationService.handoff(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
