import {
  WorkflowWorkOnProjectParamsSchema,
  WorkflowFinishCodingTaskParamsSchema,
  CodingAgentStartParamsSchema,
  CodingAgentObserveParamsSchema,
  CodingAgentCancelParamsSchema,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerWorkflowTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_workflow_work_on_project
  server.registerTool(
    "localbridge_workflow_work_on_project",
    {
      description: "High-level workflow: prepare project context, verify git status, snapshot checkpoint, and establish execution environment.",
      inputSchema: toMcpSchema(WorkflowWorkOnProjectParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.workflowOrchestrator.workOnProject(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 2. localbridge_workflow_finish_coding_task
  server.registerTool(
    "localbridge_workflow_finish_coding_task",
    {
      description: "High-level workflow: run validation, hygiene check, git diff summary, and finalize task lifecycle.",
      inputSchema: toMcpSchema(WorkflowFinishCodingTaskParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.workflowOrchestrator.finishCodingTask(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 3. localbridge_coding_agent_start
  server.registerTool(
    "localbridge_coding_agent_start",
    {
      description: "Launch an autonomous Coding Agent controller that manages subtasks, terminals, and runtimes.",
      inputSchema: toMcpSchema(CodingAgentStartParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.workflowOrchestrator.startCodingAgent(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 4. localbridge_coding_agent_observe
  server.registerTool(
    "localbridge_coding_agent_observe",
    {
      description: "Observe running Coding Agent status, action logs, and runtime resource usage.",
      inputSchema: toMcpSchema(CodingAgentObserveParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.workflowOrchestrator.observeCodingAgent(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );

  // 5. localbridge_coding_agent_cancel
  server.registerTool(
    "localbridge_coding_agent_cancel",
    {
      description: "Cancel a running Coding Agent controller and tear down owned child processes.",
      inputSchema: toMcpSchema(CodingAgentCancelParamsSchema),
    },
    async (args: any) => {
      try {
        const result = await context.workflowOrchestrator.cancelCodingAgent(args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toToolError(err);
      }
    }
  );
}
