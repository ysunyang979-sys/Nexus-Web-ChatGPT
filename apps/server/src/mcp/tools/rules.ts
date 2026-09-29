import {
  RuleListParamsSchema,
  RuleGetParamsSchema,
  RuleCreateParamsSchema,
  RuleUpdateParamsSchema,
  RuleDeleteParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerRuleTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_rule_list
  server.registerTool(
    "localbridge_rule_list",
    {
      description: "List global and scoped rules with priority hierarchy (SYSTEM > CORE > USER > PROJECT > TASK > SKILL).",
      inputSchema: toMcpSchema(RuleListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_rule_list,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const rules = context.intelligenceRuntime.ruleRegistry.listRules({
          scope: args?.scope,
          scopeId: args?.scopeId,
          status: args?.activeOnly ? "ACTIVE" : undefined,
        });
        return formatToolSuccess({ count: rules.length, rules });
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 2. localbridge_rule_get
  server.registerTool(
    "localbridge_rule_get",
    {
      description: "Get a specific global rule by its ID.",
      inputSchema: toMcpSchema(RuleGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_rule_get,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const rule = context.intelligenceRuntime.ruleRegistry.getRule(args.ruleId);
        if (!rule) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.NOT_FOUND,
            `Rule '${args.ruleId}' not found`
          );
        }
        return formatToolSuccess(rule);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 3. localbridge_rule_create
  server.registerTool(
    "localbridge_rule_create",
    {
      description: "Create or register a new rule in the Global Rule Registry with strict priority ranking.",
      inputSchema: toMcpSchema(RuleCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_rule_create,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const rule = context.intelligenceRuntime.ruleRegistry.addRule({
          ruleId: args?.ruleId,
          name: args.name,
          content: args.content,
          scope: args?.scope,
          scopeId: args?.scopeId,
          priority: args?.priority,
          tags: args?.tags,
          provenance: args?.provenance,
        });
        return formatToolSuccess(rule);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 4. localbridge_rule_update
  server.registerTool(
    "localbridge_rule_update",
    {
      description: "Update an existing rule's content, priority, tags, or status.",
      inputSchema: toMcpSchema(RuleUpdateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_rule_update,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const updated = context.intelligenceRuntime.ruleRegistry.updateRule(args.ruleId, {
          name: args.name,
          content: args.content,
          priority: args.priority,
          status: args.status,
          tags: args.tags,
        });
        return formatToolSuccess(updated);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 5. localbridge_rule_delete
  server.registerTool(
    "localbridge_rule_delete",
    {
      description: "Delete a user or project rule (SYSTEM and CORE rules cannot be deleted).",
      inputSchema: toMcpSchema(RuleDeleteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_rule_delete,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const success = context.intelligenceRuntime.ruleRegistry.deleteRule(args.ruleId);
        return formatToolSuccess({ ruleId: args.ruleId, success });
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );
}
