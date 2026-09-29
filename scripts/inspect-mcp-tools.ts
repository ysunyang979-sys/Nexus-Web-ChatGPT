import { MCP_TOOL_SCOPE, requiredScopeForTool } from "../apps/server/src/mcp/scope-policy.js";
import { registerProjectTools } from "../apps/server/src/mcp/tools/project.js";
import { registerFilesystemTools } from "../apps/server/src/mcp/tools/filesystem.js";
import { registerGitTools } from "../apps/server/src/mcp/tools/git.js";
import { registerCommandTools } from "../apps/server/src/mcp/tools/command.js";
import { registerJobTools } from "../apps/server/src/mcp/tools/jobs.js";
import { registerApprovalTools } from "../apps/server/src/mcp/tools/approvals.js";
import { registerCodeTools } from "../apps/server/src/mcp/tools/code.js";
import { registerSessionTools } from "../apps/server/src/mcp/tools/session.js";
import { registerWorktreeTools } from "../apps/server/src/mcp/tools/worktree.js";
import { registerRuntimeTools } from "../apps/server/src/mcp/tools/runtime.js";
import { registerSkillTools } from "../apps/server/src/mcp/tools/skills.js";
import { registerLayaTools } from "../apps/server/src/mcp/tools/laya.js";
import { registerEnvironmentTools } from "../apps/server/src/mcp/tools/environment.js";
import { registerTerminalTools } from "../apps/server/src/mcp/tools/terminal.js";
import { registerProcessTools } from "../apps/server/src/mcp/tools/process.js";
import { registerPortTools } from "../apps/server/src/mcp/tools/port.js";
import { registerAgentTaskTools } from "../apps/server/src/mcp/tools/agent-task.js";
import { registerArtifactTools } from "../apps/server/src/mcp/tools/artifacts.js";
import { registerCheckpointTools } from "../apps/server/src/mcp/tools/checkpoints.js";
import { registerHygieneTools } from "../apps/server/src/mcp/tools/hygiene.js";
import { registerComputerUseTools } from "../apps/server/src/mcp/tools/computer-use.js";
import { registerAgentCommTools } from "../apps/server/src/mcp/tools/agent-comm.js";
import { registerMemoryTools } from "../apps/server/src/mcp/tools/memory.js";
import { registerValidationTools } from "../apps/server/src/mcp/tools/validation.js";
import { registerWorkflowTools } from "../apps/server/src/mcp/tools/workflow.js";
import { registerBrowserTools } from "../apps/server/src/mcp/tools/browser.js";
import { registerAgentPlanTools } from "../apps/server/src/mcp/tools/agent-plan.js";
import { registerEventTools } from "../apps/server/src/mcp/tools/events.js";
import { registerTraceTools } from "../apps/server/src/mcp/tools/trace.js";
import { registerVisionTools } from "../apps/server/src/mcp/tools/vision.js";
import { registerDocumentTools } from "../apps/server/src/mcp/tools/document.js";
import { registerToolRegistryTools } from "../apps/server/src/mcp/tools/tool-registry.js";
import { registerRuleTools } from "../apps/server/src/mcp/tools/rules.js";
import { registerKnowledgeTools } from "../apps/server/src/mcp/tools/knowledge.js";
import { registerContextTools } from "../apps/server/src/mcp/tools/context.js";
import { registerDiscoveryTools } from "../apps/server/src/mcp/tools/discovery.js";

const toolNames: string[] = [];
const mockServer: any = {
  registerTool: (name: string) => {
    toolNames.push(name);
  },
};
const mockContext: any = {};

registerProjectTools(mockServer, mockContext);
registerFilesystemTools(mockServer, mockContext);
registerGitTools(mockServer, mockContext);
registerCommandTools(mockServer, mockContext);
registerJobTools(mockServer, mockContext);
registerApprovalTools(mockServer, mockContext);
registerCodeTools(mockServer, mockContext);
registerSessionTools(mockServer, mockContext);
registerWorktreeTools(mockServer, mockContext);
registerRuntimeTools(mockServer, mockContext);
registerSkillTools(mockServer, mockContext);
registerLayaTools(mockServer, mockContext);
registerEnvironmentTools(mockServer, mockContext);
registerTerminalTools(mockServer, mockContext);
registerProcessTools(mockServer, mockContext);
registerPortTools(mockServer, mockContext);
registerAgentTaskTools(mockServer, mockContext);
registerArtifactTools(mockServer, mockContext);
registerCheckpointTools(mockServer, mockContext);
registerHygieneTools(mockServer, mockContext);
registerComputerUseTools(mockServer, mockContext);
registerAgentCommTools(mockServer, mockContext);
registerMemoryTools(mockServer, mockContext);
registerValidationTools(mockServer, mockContext);
registerWorkflowTools(mockServer, mockContext);
registerBrowserTools(mockServer, mockContext);
registerAgentPlanTools(mockServer, mockContext);
registerEventTools(mockServer, mockContext);
registerTraceTools(mockServer, mockContext);
registerVisionTools(mockServer, mockContext);
registerDocumentTools(mockServer, mockContext);
registerToolRegistryTools(mockServer, mockContext);
registerRuleTools(mockServer, mockContext);
registerKnowledgeTools(mockServer, mockContext);
registerContextTools(mockServer, mockContext);
registerDiscoveryTools(mockServer, mockContext);

const totalTools = toolNames.length;
const mappedTools: string[] = [];
const unmappedTools: string[] = [];

for (const name of toolNames) {
  const scope = requiredScopeForTool(name);
  if (scope) {
    mappedTools.push(name);
  } else {
    unmappedTools.push(name);
  }
}

const scopeKeys = Object.keys(MCP_TOOL_SCOPE);
const extraInScope = scopeKeys.filter((k) => !toolNames.includes(k));

console.log(JSON.stringify({
  totalTools,
  mappedCount: mappedTools.length,
  unmappedCount: unmappedTools.length,
  unmappedTools,
  extraInScope,
}, null, 2));

process.exit(0);
