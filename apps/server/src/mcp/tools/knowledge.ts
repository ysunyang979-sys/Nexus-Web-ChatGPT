import fs from "node:fs";
import {
  KnowledgeImportParamsSchema,
  KnowledgeListParamsSchema,
  KnowledgeGetParamsSchema,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerKnowledgeTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_knowledge_import
  server.registerTool(
    "localbridge_knowledge_import",
    {
      description: "Import knowledge file (Markdown, JSON, YAML, TXT, or Skill archive) with automatic classification, SHA-256 deduplication, and persistence.",
      inputSchema: toMcpSchema(KnowledgeImportParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_knowledge_import,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        let content = args.content;
        if (!content && args.filePath) {
          if (!fs.existsSync(args.filePath)) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.FILE_NOT_FOUND,
              `Knowledge file '${args.filePath}' does not exist`
            );
          }
          content = fs.readFileSync(args.filePath, "utf-8");
        }

        if (!content) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INVALID_REQUEST,
            "Either 'content' or valid 'filePath' must be provided for knowledge import"
          );
        }

        const result = await context.intelligenceRuntime.knowledgeImporter.importFile({
          filename: args.filename,
          content,
          explicitType: args.explicitType,
          source: args.source || "upload",
          projectId: args.projectId,
        });

        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 2. localbridge_knowledge_list
  server.registerTool(
    "localbridge_knowledge_list",
    {
      description: "List imported knowledge documents with metadata, summaries, and tags.",
      inputSchema: toMcpSchema(KnowledgeListParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_knowledge_list,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        const docs = context.intelligenceRuntime.store.listDocuments({
          tag: args?.tag,
          limit: args?.limit || 50,
          offset: args?.offset || 0,
        });

        return formatToolSuccess({ count: docs.length, documents: docs });
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 3. localbridge_knowledge_get
  server.registerTool(
    "localbridge_knowledge_get",
    {
      description: "Get a specific knowledge document's full metadata and content reference.",
      inputSchema: toMcpSchema(KnowledgeGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_knowledge_get,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }

        const doc = context.intelligenceRuntime.store.getDocument(args.documentId);
        if (!doc) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.NOT_FOUND,
            `Knowledge document '${args.documentId}' not found`
          );
        }

        return formatToolSuccess(doc);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );
}
