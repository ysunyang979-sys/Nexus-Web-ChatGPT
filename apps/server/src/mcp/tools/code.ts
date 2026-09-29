import {
  CodeDocumentSymbolsParamsSchema,
  CodeWorkspaceSymbolsParamsSchema,
  CodeDefinitionParamsSchema,
  CodeReferencesParamsSchema,
  CodeHoverParamsSchema,
  CodeDiagnosticsParamsSchema,
  CodeCallHierarchyParamsSchema,
  CodeImpactParamsSchema,
  CodePatchPreviewParamsSchema,
  CodePatchApplyParamsSchema,
  CodePatchRollbackParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerCodeTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_code_document_symbols
  server.registerTool(
    "localbridge_code_document_symbols",
    {
      description:
        "Extract hierarchical document symbols (functions, classes, interfaces, variables, etc.) from a source file inside an authorized project.",
      inputSchema: toMcpSchema(CodeDocumentSymbolsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_document_symbols,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_document_symbols",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeDocumentSymbols,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_document_symbols",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_document_symbols",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 2. localbridge_code_workspace_symbols
  server.registerTool(
    "localbridge_code_workspace_symbols",
    {
      description:
        "Search workspace symbols across an authorized project by query string with bounded result limits.",
      inputSchema: toMcpSchema(CodeWorkspaceSymbolsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_workspace_symbols,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_workspace_symbols",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeWorkspaceSymbols,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_workspace_symbols",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_workspace_symbols",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 3. localbridge_code_definition
  server.registerTool(
    "localbridge_code_definition",
    {
      description:
        "Locate definition targets for a symbol at a specific 0-based line and character coordinate within an authorized project.",
      inputSchema: toMcpSchema(CodeDefinitionParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_definition,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_definition",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeDefinition,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_definition",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "CODE_DEFINITION",
          source: "mcp",
          refType: "code",
          summary: {
            path: args.path,
            line: args.line,
            character: args.character,
            resultCount: result?.definitions?.length ?? 0,
          },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_definition",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 4. localbridge_code_references
  server.registerTool(
    "localbridge_code_references",
    {
      description:
        "Find references to a symbol at a specific 0-based line and character coordinate across an authorized project.",
      inputSchema: toMcpSchema(CodeReferencesParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_references,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_references",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeReferences,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_references",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "CODE_REFERENCES",
          source: "mcp",
          refType: "code",
          summary: {
            path: args.path,
            line: args.line,
            character: args.character,
            resultCount: result?.references?.length ?? 0,
          },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_references",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 5. localbridge_code_hover
  server.registerTool(
    "localbridge_code_hover",
    {
      description:
        "Inspect type signatures, symbol definitions, and documentation for code at a specific 0-based line and character coordinate.",
      inputSchema: toMcpSchema(CodeHoverParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_hover,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_hover",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeHover,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_hover",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_hover",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 6. localbridge_code_diagnostics
  server.registerTool(
    "localbridge_code_diagnostics",
    {
      description:
        "Retrieve semantic compilation errors, warnings, and type diagnostics for a specific file or the whole authorized project.",
      inputSchema: toMcpSchema(CodeDiagnosticsParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_diagnostics,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_diagnostics",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeDiagnostics,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_diagnostics",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        const errorCount = result?.diagnostics?.filter((d: any) => d.severity === 1).length ?? 0;
        const warningCount = result?.diagnostics?.filter((d: any) => d.severity === 2).length ?? 0;
        context.recordSessionEvent?.({
          projectId,
          eventType: "CODE_DIAGNOSTICS",
          source: "mcp",
          refType: "code",
          summary: {
            path: args.path,
            errorCount,
            warningCount,
            totalCount: result?.diagnostics?.length ?? 0,
          },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_diagnostics",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 7. localbridge_code_call_hierarchy
  server.registerTool(
    "localbridge_code_call_hierarchy",
    {
      description:
        "Trace incoming (callers) or outgoing (callees) call hierarchy trees for a function or method at a specific 0-based coordinate.",
      inputSchema: toMcpSchema(CodeCallHierarchyParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_call_hierarchy,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_call_hierarchy",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeCallHierarchy,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_call_hierarchy",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "CODE_CALL_HIERARCHY",
          source: "mcp",
          refType: "code",
          summary: {
            path: args.path,
            direction: args.direction,
            itemCount: result?.calls?.length ?? 0,
          },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_call_hierarchy",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // 8. localbridge_code_impact
  server.registerTool(
    "localbridge_code_impact",
    {
      description:
        "Perform composite deterministic code impact analysis (definitions, reference counts, direct callers, direct callees, affected files) for a symbol.",
      inputSchema: toMcpSchema(CodeImpactParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_code_impact,
    },
    async (args: any) => {
      const startTime = Date.now();
      const { projectId } = args;
      try {
        context.logAudit("mcp_tool_started", {
          toolName: "localbridge_code_impact",
          projectId,
        });

        const runnerId = context.resolveProjectRunner(projectId);
        const result = await context.request(
          runnerId,
          RunnerRpcMethods.CodeImpact,
          args
        );

        context.logAudit("mcp_tool_completed", {
          toolName: "localbridge_code_impact",
          projectId,
          runnerId,
          durationMs: Date.now() - startTime,
          resultStatus: "success",
        });

        context.recordSessionEvent?.({
          projectId,
          eventType: "CODE_IMPACT",
          source: "mcp",
          refType: "code",
          summary: {
            path: args.path,
            referenceCount: result?.referenceCount ?? 0,
            callerCount: result?.directCallers ?? 0,
            affectedFilesCount: result?.affectedFiles?.length ?? 0,
          },
        });

        return formatToolSuccess(result);
      } catch (error) {
        context.logAudit("mcp_tool_failed", {
          toolName: "localbridge_code_impact",
          projectId,
          durationMs: Date.now() - startTime,
          resultStatus: "error",
          errorCode: (error as any)?.code ?? "ERROR",
        });
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_code_patch_preview
  server.registerTool(
    "localbridge_code_patch_preview",
    {
      description: "Preview a unified diff patch, validate hunks, and detect potential merge conflicts before applying.",
      inputSchema: toMcpSchema(CodePatchPreviewParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CodePatchPreview, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_code_patch_apply
  server.registerTool(
    "localbridge_code_patch_apply",
    {
      description: "Atomically apply a unified diff patch to project files, automatically backing up state to a checkpoint.",
      inputSchema: toMcpSchema(CodePatchApplyParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CodePatchApply, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );

  // localbridge_code_patch_rollback
  server.registerTool(
    "localbridge_code_patch_rollback",
    {
      description: "Rollback a previously applied code patch using its checkpoint ID.",
      inputSchema: toMcpSchema(CodePatchRollbackParamsSchema),
    },
    async (args: any) => {
      try {
        const runnerId = context.resolveProjectRunner(args.projectId);
        const result = await context.request(runnerId, RunnerRpcMethods.CodePatchRollback, args);
        return formatToolSuccess(result);
      } catch (error) {
        return McpErrorMapper.toMcpToolError(error);
      }
    }
  );
}
