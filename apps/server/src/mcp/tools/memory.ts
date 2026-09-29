import {
  MemorySetParamsSchema,
  MemoryGetParamsSchema,
  MemorySearchParamsSchema,
  MemoryDeleteParamsSchema,
  MemoryPurgeParamsSchema,
  MemoryRecallParamsSchema,
  MemoryCandidateCreateParamsSchema,
  MemoryCandidateAcceptParamsSchema,
  MemoryArchiveParamsSchema,
  MemoryConsolidateParamsSchema,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { TOOL_ANNOTATIONS } from "../annotations.js";
import { toMcpSchema } from "../schema.js";

export function registerMemoryTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_memory_set
  server.registerTool(
    "localbridge_memory_set",
    {
      description: "Store scoped memory (global, project, session, agent, task) in authoritative Server IntelligenceStore with key, value, and tags.",
      inputSchema: toMcpSchema(MemorySetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_set,
    },
    async (args: any) => {
      try {
        if (context.intelligenceRuntime) {
          const entry = context.intelligenceRuntime.memoryRuntime.setMemory({
            key: args.key,
            content: typeof args.value === "string" ? args.value : JSON.stringify(args.value),
            scope: args.scope?.toUpperCase(),
            scopeId: args.scopeId,
            tags: args.tags || [],
            source: "USER",
          });
          return formatToolSuccess({ success: true, key: args.key, memoryId: entry.id, entry });
        }
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.MemorySet, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 2. localbridge_memory_get
  server.registerTool(
    "localbridge_memory_get",
    {
      description: "Retrieve a memory entry by key and scope from authoritative IntelligenceStore.",
      inputSchema: toMcpSchema(MemoryGetParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_get,
    },
    async (args: any) => {
      try {
        if (context.intelligenceRuntime) {
          const entry = context.intelligenceRuntime.memoryRuntime.getMemoryByKey(
            args.key,
            args.scope?.toUpperCase() || "PROJECT",
            args.scopeId
          );
          if (!entry) {
            return formatToolSuccess({ found: false, key: args.key, value: null });
          }
          return formatToolSuccess({ found: true, key: args.key, value: entry.content, entry });
        }
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.MemoryGet, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 3. localbridge_memory_search
  server.registerTool(
    "localbridge_memory_search",
    {
      description: "Search memory entries matching a keyword query across scopes.",
      inputSchema: toMcpSchema(MemorySearchParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_search,
    },
    async (args: any) => {
      try {
        if (context.intelligenceRuntime) {
          const res = context.intelligenceRuntime.memoryRuntime.recall({
            query: args.query,
            scope: args.scope?.toUpperCase(),
            scopeId: args.scopeId,
            limit: args.limit || 20,
            offset: 0,
            includeArchived: false,
          });
          return formatToolSuccess({
            count: res.total,
            entries: res.memories.map((m) => ({
              key: m.key,
              value: m.content,
              scope: m.scope,
              tags: m.tags,
            })),
          });
        }
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.MemorySearch, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 4. localbridge_memory_delete
  server.registerTool(
    "localbridge_memory_delete",
    {
      description: "Delete a specific memory entry.",
      inputSchema: toMcpSchema(MemoryDeleteParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_delete,
    },
    async (args: any) => {
      try {
        if (context.intelligenceRuntime) {
          const entry = context.intelligenceRuntime.memoryRuntime.getMemoryByKey(
            args.key,
            args.scope?.toUpperCase() || "PROJECT",
            args.scopeId
          );
          if (entry) {
            context.intelligenceRuntime.memoryRuntime.forgetMemory(entry.id);
          }
          return formatToolSuccess({ success: true, deleted: Boolean(entry) });
        }
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.MemoryDelete, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 5. localbridge_memory_purge
  server.registerTool(
    "localbridge_memory_purge",
    {
      description: "Purge memory entries for a given scope or scopeId.",
      inputSchema: toMcpSchema(MemoryPurgeParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_purge,
    },
    async (args: any) => {
      try {
        if (context.intelligenceRuntime) {
          const recallRes = context.intelligenceRuntime.store.recallMemories({
            scope: args.scope?.toUpperCase(),
            scopeId: args.scopeId,
            limit: 1000,
            offset: 0,
            includeArchived: false,
          });
          for (const m of recallRes.memories) {
            context.intelligenceRuntime.memoryRuntime.forgetMemory(m.id);
          }
          return formatToolSuccess({ success: true, purgedCount: recallRes.memories.length });
        }
        const runnerId = context.resolveAnyRunner();
        const result = await context.request(runnerId, RunnerRpcMethods.MemoryPurge, args);
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 6. localbridge_memory_recall
  server.registerTool(
    "localbridge_memory_recall",
    {
      description: "Recall enhanced memories by query, scope, importance, confidence, or tag with transparent reasoning.",
      inputSchema: toMcpSchema(MemoryRecallParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_recall,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const res = context.intelligenceRuntime.memoryRuntime.recall(args);
        return formatToolSuccess(res);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 7. localbridge_memory_candidate_create
  server.registerTool(
    "localbridge_memory_candidate_create",
    {
      description: "Create an uncommitted memory candidate with full provenance and execution evidence.",
      inputSchema: toMcpSchema(MemoryCandidateCreateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_candidate_create,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const candidate = context.intelligenceRuntime.memoryRuntime.createCandidate({
          key: args.key,
          content: args.content,
          type: args.type,
          scope: args.scope,
          scopeId: args.scopeId,
          importance: args.importance,
          confidence: args.confidence,
          source: args.source,
          provenance: args.provenance,
          tags: args.tags,
        });
        return formatToolSuccess(candidate);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 8. localbridge_memory_candidate_accept
  server.registerTool(
    "localbridge_memory_candidate_accept",
    {
      description: "Accept and persist a memory candidate into active memory in the IntelligenceStore.",
      inputSchema: toMcpSchema(MemoryCandidateAcceptParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_candidate_accept,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const entry = context.intelligenceRuntime.memoryRuntime.acceptCandidate(
          args.candidateId,
          args.reviewNotes
        );
        return formatToolSuccess(entry);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 9. localbridge_memory_archive
  server.registerTool(
    "localbridge_memory_archive",
    {
      description: "Archive or forget a memory entry.",
      inputSchema: toMcpSchema(MemoryArchiveParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_archive,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const success = args.forget
          ? context.intelligenceRuntime.memoryRuntime.forgetMemory(args.id)
          : context.intelligenceRuntime.memoryRuntime.archiveMemory(args.id);
        return formatToolSuccess({ id: args.id, success, forgotten: args.forget });
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );

  // 10. localbridge_memory_consolidate
  server.registerTool(
    "localbridge_memory_consolidate",
    {
      description: "Consolidate duplicate, conflicting, or superseding memories across a scope.",
      inputSchema: toMcpSchema(MemoryConsolidateParamsSchema),
      annotations: TOOL_ANNOTATIONS.localbridge_memory_consolidate,
    },
    async (args: any) => {
      try {
        if (!context.intelligenceRuntime) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.INTERNAL_ERROR,
            "Intelligence runtime is not initialized"
          );
        }
        const result = context.intelligenceRuntime.memoryRuntime.consolidate({
          scope: args?.scope,
          scopeId: args?.scopeId,
        });
        return formatToolSuccess(result);
      } catch (err) {
        return McpErrorMapper.toMcpToolError(err);
      }
    }
  );
}
