import { McpServer } from "@modelcontextprotocol/server";
import { mcpExecutionContext, type McpContext, type RequestExecutionContext } from "./context.js";
import { MCP_PROTOCOL_VERSION } from "./types.js";
import { registerProjectTools } from "./tools/project.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerGitTools } from "./tools/git.js";
import { registerCommandTools } from "./tools/command.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerApprovalTools } from "./tools/approvals.js";
import { registerCodeTools } from "./tools/code.js";
import { registerSessionTools } from "./tools/session.js";
import { registerWorktreeTools } from "./tools/worktree.js";
import { registerRuntimeTools } from "./tools/runtime.js";
import { registerSkillTools } from "./tools/skills.js";
import { registerLayaTools } from "./tools/laya.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerTerminalTools } from "./tools/terminal.js";
import { registerProcessTools } from "./tools/process.js";
import { registerPortTools } from "./tools/port.js";
import { registerAgentTaskTools } from "./tools/agent-task.js";
import { registerArtifactTools } from "./tools/artifacts.js";
import { registerCheckpointTools } from "./tools/checkpoints.js";
import { registerHygieneTools } from "./tools/hygiene.js";
import { registerComputerUseTools } from "./tools/computer-use.js";
import { registerAgentCommTools } from "./tools/agent-comm.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerValidationTools } from "./tools/validation.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerAgentPlanTools } from "./tools/agent-plan.js";
import { registerEventTools } from "./tools/events.js";
import { registerTraceTools } from "./tools/trace.js";
import { registerVisionTools } from "./tools/vision.js";
import { registerDocumentTools } from "./tools/document.js";
import { registerToolRegistryTools } from "./tools/tool-registry.js";
import { registerRuleTools } from "./tools/rules.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerContextTools } from "./tools/context.js";
import { registerDiscoveryTools } from "./tools/discovery.js";

import { TOOL_ANNOTATIONS } from "./annotations.js";


export interface McpServerOptions {
  name?: string;
  version?: string;
}

export function createLocalBridgeMcpServer(
  context: McpContext,
  options: McpServerOptions = {}
): McpServer {
  const server = new McpServer(
    {
      name: options.name ?? "localbridge-server",
      version: options.version ?? "0.10.0",
    },
    {
      supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
    }
  );

  // Set negotiated protocol version to 2026-07-28 so the wire codec resolves server/discover and other 2026-era methods
  (server.server as any)._negotiatedProtocolVersion = MCP_PROTOCOL_VERSION;

  // Auto-inject annotations from TOOL_ANNOTATIONS if omitted and track toolName in execution context
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: any, handler: any) => {
    const annotations = config.annotations ?? (TOOL_ANNOTATIONS as Record<string, any>)[name];
    const wrappedHandler = async (args: any, extra: any) => {
      if (args && typeof args === "object") {
        args._toolName = name;
      }
      const parentStore = mcpExecutionContext.getStore();
      const store: RequestExecutionContext = {
        ...parentStore,
        toolName: name,
        runnerInvoked: false,
      };
      return mcpExecutionContext.run(store, async () => {
        const res = await handler(args, extra);
        const isMockRpc = Boolean((context.rpcService?.request as any)?.mock);
        if (!res?.isError && !store.runnerInvoked && !isMockRpc && context.runnerRegistry?.list().length > 0) {
          try {
            const runnerId = context.resolveAnyRunner();
            const conn = context.runnerRegistry.get(runnerId);
            if (!conn || !(conn.request as any)?.mock) {
              await context.request(runnerId, "system.ping", {
                _toolName: name,
                idempotencyKey: `srv_tool_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              });
            }
          } catch {
            // Runner disconnected or unavailable
          }
        }
        return res;
      });
    };
    return originalRegisterTool(name, { ...config, annotations }, wrappedHandler);
  }) as any;

  // Register all tools
  registerProjectTools(server, context);
  registerFilesystemTools(server, context);
  registerGitTools(server, context);
  registerCommandTools(server, context);
  registerJobTools(server, context);
  registerApprovalTools(server, context);
  registerCodeTools(server, context);
  registerSessionTools(server, context);
  registerWorktreeTools(server, context);
  registerRuntimeTools(server, context);
  registerSkillTools(server, context);
  registerLayaTools(server, context);
  registerEnvironmentTools(server, context);
  registerTerminalTools(server, context);
  registerProcessTools(server, context);
  registerPortTools(server, context);
  registerAgentTaskTools(server, context);
  registerArtifactTools(server, context);
  registerCheckpointTools(server, context);
  registerHygieneTools(server, context);
  registerComputerUseTools(server, context);
  registerAgentCommTools(server, context);
  registerMemoryTools(server, context);
  registerValidationTools(server, context);
  registerWorkflowTools(server, context);
  registerBrowserTools(server, context);
  registerAgentPlanTools(server, context);
  registerEventTools(server, context);
  registerTraceTools(server, context);
  registerVisionTools(server, context);
  registerDocumentTools(server, context);
  registerToolRegistryTools(server, context);
  registerRuleTools(server, context);
  registerKnowledgeTools(server, context);
  registerContextTools(server, context);
  registerDiscoveryTools(server, context);

  return server;
}


