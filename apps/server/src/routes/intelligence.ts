import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { exec } from "node:child_process";
import type { McpContext } from "../mcp/context.js";
import type { TokenService } from "../db/token-service.js";
import { checkLoopbackAndSecurity } from "./management.js";
import { LocalStorageEngine } from "../intelligence/storage/index.js";

export interface IntelligenceRoutesOptions {
  mcpContext: McpContext;
  tokenService: TokenService;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export const intelligenceRoutes: FastifyPluginAsync<IntelligenceRoutesOptions> = async (
  fastify,
  opts
) => {
  const { mcpContext } = opts;

  // Protect all /intelligence routes with loopback and security check
  fastify.addHook("onRequest", async (request, reply) => {
    const passed = checkLoopbackAndSecurity(request, reply, {
      tokenService: opts.tokenService,
      managementSecret: opts.managementSecret,
      requireManagementAuth: opts.requireManagementAuth,
    });
    if (!passed) {
      return reply;
    }
  });

  const getRuntime = () => {
    if (!mcpContext.intelligenceRuntime) {
      throw new Error("Intelligence Runtime is not initialized");
    }
    return mcpContext.intelligenceRuntime;
  };

  // ==========================================================================
  // Skills
  // ==========================================================================

  fastify.get("/intelligence/skills", async (request: FastifyRequest<{
    Querystring: { projectId?: string; status?: string; source?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const skills = runtime.skillRegistry.listSkills({
        projectId: request.query.projectId,
        status: request.query.status as any,
        source: request.query.source as any,
      });
      return reply.send({ count: skills.length, skills });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get("/intelligence/skills/:skillId", async (request: FastifyRequest<{
    Params: { skillId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const skill = runtime.skillRegistry.getSkill(request.params.skillId);
      if (!skill) {
        return reply.status(404).send({ error: `Skill '${request.params.skillId}' not found` });
      }
      return reply.send(skill);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = runtime.skillRegistry.createSkillWithVersion(request.body as any);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/skills/:skillId", async (request: FastifyRequest<{
    Params: { skillId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.store.deleteSkill(request.params.skillId);
      try {
        await mcpContext.skillImporter.deleteSkill({ skillId: request.params.skillId });
      } catch {}
      return reply.send({ skillId: request.params.skillId, success });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/learn", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = await runtime.skillLearner.learnSkill(request.body as any);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/:skillId/activate", async (request: FastifyRequest<{
    Params: { skillId: string };
    Body: { version: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.skillRegistry.activateVersion(
        request.params.skillId,
        request.body.version
      );
      return reply.send({ success, skillId: request.params.skillId, activeVersion: request.body.version });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/:skillId/rollback", async (request: FastifyRequest<{
    Params: { skillId: string };
    Body: { targetVersion: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.skillRegistry.rollbackVersion(
        request.params.skillId,
        request.body.targetVersion
      );
      return reply.send({ success, skillId: request.params.skillId, activeVersion: request.body.targetVersion });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/validate", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const report = runtime.skillRegistry.getValidator().validate(request.body as any);
      return reply.send(report);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Candidates
  fastify.get("/intelligence/skills/candidates/list", async (request: FastifyRequest<{
    Querystring: { status?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const candidates = runtime.skillCandidateManager.listCandidates(request.query.status as any);
      return reply.send({ count: candidates.length, candidates });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/candidates", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const candidate = runtime.skillCandidateManager.proposeCandidate(request.body as any);
      return reply.status(201).send(candidate);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/skills/candidates/:candidateId/review", async (request: FastifyRequest<{
    Params: { candidateId: string };
    Body: { action: "accept" | "reject"; reviewNotes?: string; reviewedBy?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = runtime.skillCandidateManager.reviewCandidate(
        request.params.candidateId,
        request.body.action,
        request.body.reviewNotes,
        request.body.reviewedBy
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/skills/candidates/:candidateId", async (request: FastifyRequest<{
    Params: { candidateId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.skillCandidateManager.deleteCandidate(request.params.candidateId);
      return reply.send({ success, candidateId: request.params.candidateId });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ==========================================================================
  // Memory
  // ==========================================================================

  fastify.get("/intelligence/memory", async (request: FastifyRequest<{
    Querystring: {
      query?: string;
      scope?: string;
      scopeId?: string;
      type?: string;
      tag?: string;
      limit?: string;
      offset?: string;
    };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = runtime.memoryRuntime.recall({
        query: request.query.query,
        scope: request.query.scope as any,
        scopeId: request.query.scopeId,
        type: request.query.type as any,
        tag: request.query.tag,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 20,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
        includeArchived: false,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const entry = runtime.memoryRuntime.setMemory(request.body as any);
      return reply.status(201).send(entry);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get("/intelligence/memory/candidates", async (request: FastifyRequest<{
    Querystring: { status?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const candidates = runtime.memoryRuntime.listCandidates(request.query.status as any);
      return reply.send({ count: candidates.length, candidates });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory/candidates", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const candidate = runtime.memoryRuntime.createCandidate(request.body as any);
      return reply.status(201).send(candidate);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory/candidates/:candidateId/accept", async (request: FastifyRequest<{
    Params: { candidateId: string };
    Body: { reviewNotes?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const entry = runtime.memoryRuntime.acceptCandidate(
        request.params.candidateId,
        request.body?.reviewNotes
      );
      return reply.send(entry);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory/candidates/:candidateId/reject", async (request: FastifyRequest<{
    Params: { candidateId: string };
    Body: { reviewNotes?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.memoryRuntime.rejectCandidate(
        request.params.candidateId,
        request.body?.reviewNotes
      );
      return reply.send({ success, candidateId: request.params.candidateId });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/memory/candidates/:candidateId", async (request: FastifyRequest<{
    Params: { candidateId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.memoryRuntime.deleteCandidate(request.params.candidateId);
      return reply.send({ success, candidateId: request.params.candidateId });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory/:id/archive", async (request: FastifyRequest<{
    Params: { id: string };
    Body: { forget?: boolean };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = request.body?.forget
        ? runtime.memoryRuntime.forgetMemory(request.params.id)
        : runtime.memoryRuntime.archiveMemory(request.params.id);
      return reply.send({ id: request.params.id, success, forgotten: request.body?.forget });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/memory/:id", async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.store.deleteMemory(request.params.id);
      return reply.send({ id: request.params.id, success });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/memory/consolidate", async (request: FastifyRequest<{
    Body: { scope?: string; scopeId?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = runtime.memoryRuntime.consolidate({
        scope: request.body?.scope as any,
        scopeId: request.body?.scopeId,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ==========================================================================
  // Global Rules
  // ==========================================================================

  fastify.get("/intelligence/rules", async (request: FastifyRequest<{
    Querystring: { scope?: string; scopeId?: string; activeOnly?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const rules = runtime.ruleRegistry.listRules({
        scope: request.query.scope as any,
        scopeId: request.query.scopeId,
        status: request.query.activeOnly !== "false" ? "ACTIVE" : undefined,
      });
      return reply.send({ count: rules.length, rules });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get("/intelligence/rules/:ruleId", async (request: FastifyRequest<{
    Params: { ruleId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const rule = runtime.ruleRegistry.getRule(request.params.ruleId);
      if (!rule) {
        return reply.status(404).send({ error: `Rule '${request.params.ruleId}' not found` });
      }
      return reply.send(rule);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/rules", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const rule = runtime.ruleRegistry.addRule(request.body as any);
      return reply.status(201).send(rule);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.put("/intelligence/rules/:ruleId", async (request: FastifyRequest<{
    Params: { ruleId: string };
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const updated = runtime.ruleRegistry.updateRule(request.params.ruleId, request.body as any);
      return reply.send(updated);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/rules/:ruleId", async (request: FastifyRequest<{
    Params: { ruleId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.ruleRegistry.deleteRule(request.params.ruleId);
      return reply.send({ ruleId: request.params.ruleId, success });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ==========================================================================
  // Knowledge Documents
  // ==========================================================================

  fastify.get("/intelligence/knowledge", async (request: FastifyRequest<{
    Querystring: { tag?: string; limit?: string; offset?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const docs = runtime.store.listDocuments({
        tag: request.query.tag,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
        offset: request.query.offset ? parseInt(request.query.offset, 10) : 0,
      });
      return reply.send({ count: docs.length, documents: docs });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/knowledge/import", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = await runtime.knowledgeImporter.importFile(request.body as any);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get("/intelligence/knowledge/:documentId", async (request: FastifyRequest<{
    Params: { documentId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const doc = runtime.store.getDocument(request.params.documentId);
      if (!doc) {
        return reply.status(404).send({ error: `Document '${request.params.documentId}' not found` });
      }
      return reply.send(doc);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/knowledge/:documentId", async (request: FastifyRequest<{
    Params: { documentId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.store.deleteDocument(request.params.documentId);
      return reply.send({ documentId: request.params.documentId, success });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ==========================================================================
  // Context
  // ==========================================================================

  fastify.get("/intelligence/context/snapshots", async (request: FastifyRequest<{
    Querystring: { limit?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
      const snapshots = runtime.store.listContextSnapshots(limit);
      return reply.send({ count: snapshots.length, snapshots });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/context/build", async (request: FastifyRequest<{
    Body: any;
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const snapshot = await runtime.contextBuilder.buildContext(request.body as any);
      return reply.send(snapshot);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get("/intelligence/context/:contextId", async (request: FastifyRequest<{
    Params: { contextId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const snapshot = runtime.contextBuilder.getSnapshot(request.params.contextId);
      if (!snapshot) {
        return reply.status(404).send({ error: `Context snapshot '${request.params.contextId}' not found` });
      }
      return reply.send(snapshot);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete("/intelligence/context/snapshots/:contextId", async (request: FastifyRequest<{
    Params: { contextId: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const success = runtime.store.deleteContextSnapshot(request.params.contextId);
      return reply.send({ contextId: request.params.contextId, success });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/context/compact", async (request: FastifyRequest<{
    Body: { contextId?: string; snapshot?: any; targetTokenLimit?: number };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      let snapshot = request.body.snapshot;
      if (!snapshot && request.body.contextId) {
        snapshot = runtime.contextBuilder.getSnapshot(request.body.contextId);
      }
      if (!snapshot) {
        return reply.status(400).send({ error: "Either 'snapshot' or 'contextId' must be provided" });
      }
      const { compactedSnapshot, state } = runtime.contextBuilder.getCompactor().compact(
        snapshot,
        request.body.targetTokenLimit || 4000
      );
      compactedSnapshot.compactionState = state;
      runtime.store.saveContextSnapshot(compactedSnapshot);
      runtime.store.saveCompaction(state, compactedSnapshot.contextId, compactedSnapshot.taskId);
      return reply.send({ ...compactedSnapshot, compactionState: state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ==========================================================================
  // Storage Management
  // ==========================================================================

  fastify.get("/intelligence/storage", async (_request, reply) => {
    try {
      const runtime = getRuntime();
      const stats = runtime.store.getStorageEngine().getStats();
      return reply.send(stats);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/config", async (request: FastifyRequest<{
    Body: { rootDir: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const { rootDir } = request.body;
      if (!rootDir) {
        return reply.status(400).send({ error: "Missing required 'rootDir'" });
      }

      if (opts.mcpContext.db) {
        opts.mcpContext.db
          .prepare(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES ('intelligence_storage_path', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
          `)
          .run(rootDir, Date.now());
      }

      const newEngine = new LocalStorageEngine(rootDir);
      newEngine.initialize();
      runtime.store.setStorageEngine(newEngine);

      const stats = newEngine.getStats();
      return reply.send({ success: true, rootDir, stats });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/scan", async (_request, reply) => {
    try {
      const runtime = getRuntime();
      const result = runtime.store.getStorageEngine().scanStorage();
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/migrate", async (request: FastifyRequest<{
    Body: { targetDir: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const { targetDir } = request.body;
      if (!targetDir) {
        return reply.status(400).send({ error: "Missing required 'targetDir'" });
      }
      const result = await runtime.store.getStorageEngine().migrateTo(targetDir);
      if (opts.mcpContext.db) {
        opts.mcpContext.db
          .prepare(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES ('intelligence_storage_path', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
          `)
          .run(targetDir, Date.now());
      }
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/backup", async (request: FastifyRequest<{
    Body: { backupDir?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const result = await runtime.store.getStorageEngine().backupTo(request.body?.backupDir);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/restore", async (request: FastifyRequest<{
    Body: { backupArchive: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const { backupArchive } = request.body;
      if (!backupArchive) {
        return reply.status(400).send({ error: "Missing required 'backupArchive'" });
      }
      const result = await runtime.store.getStorageEngine().restoreFrom(backupArchive);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post("/intelligence/storage/open", async (request: FastifyRequest<{
    Body?: { folderPath?: string };
  }>, reply) => {
    try {
      const runtime = getRuntime();
      const targetPath = request.body?.folderPath || runtime.store.getStorageEngine().getStats().rootDir;
      if (process.platform === "win32") {
        exec(`explorer "${targetPath}"`);
      } else if (process.platform === "darwin") {
        exec(`open "${targetPath}"`);
      } else {
        exec(`xdg-open "${targetPath}"`);
      }
      return reply.send({ success: true, path: targetPath });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
};
