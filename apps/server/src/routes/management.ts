import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type ProjectAccessMode,
  type ProjectExecutionMode,
  type ApprovalRisk,
  type ProjectTrustPolicy,
  type DecisionContext,
  type ModelDownloadOptions,
  type ModelImportOptions,
  StartFullControlParamsSchema,
  type StartFullControlParams,
  type StopFullControlParams,
} from "@localbridge/protocol";
import type { TokenService } from "../db/token-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { McpContext } from "../mcp/context.js";
import { canonicalPayloadHash } from "@localbridge/shared";
import type Database from "better-sqlite3";
import type { JobRow } from "../db/schema.js";
import { ConnectionService } from "../db/connection-service.js";
import { AdapterRegistry } from "../adapters/index.js";

export interface ManagementRoutesOptions {
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  projectService: ServerProjectService;
  mcpContext: McpContext;
  connectionService?: ConnectionService;
  adapterRegistry?: AdapterRegistry;
  db?: Database.Database;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export type ManagementSecurityOptions = Pick<
  ManagementRoutesOptions,
  "tokenService" | "managementSecret" | "requireManagementAuth"
>;

export function checkLoopbackAndSecurity(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: ManagementSecurityOptions
): boolean {
  // 0. Anti-Proxy / Gateway Boundary Check
  // Management interfaces and sensitive control plane MUST ONLY be accessed from pure local callers without any proxying.
  // Any proxy forwarding headers (CF-Connecting-IP, X-Forwarded-For, X-Real-IP, Forwarded, etc.) indicate external or proxied traffic
  // and must be strictly rejected even if source IP is 127.0.0.1.
  const proxyHeaderNames = [
    "cf-connecting-ip",
    "x-forwarded-for",
    "x-real-ip",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-original-host",
    "true-client-ip",
    "fastly-client-ip",
    "cf-ray",
  ];
  for (const h of proxyHeaderNames) {
    if (request.headers[h]) {
      reply.status(403).send({
        error: "Forbidden: 管理接口禁止通过代理访问",
        code: "PROXY_ACCESS_FORBIDDEN",
      });
      return false;
    }
  }

  // 1. Loopback IP Check
  const clientIp = request.ip;
  const isLoopback =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    clientIp === "localhost";

  if (!isLoopback) {
    reply.status(403).send({
      error: "Forbidden: Management API is only accessible via loopback",
      code: "LOOPBACK_ONLY",
    });
    return false;
  }

  // 2. Host Header Validation (DNS rebinding protection)
  const host = request.headers.host;
  if (host) {
    let hostWithoutPort: string;
    try {
      hostWithoutPort = new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
      hostWithoutPort = "";
    }
    const isAllowedHost =
      hostWithoutPort === "127.0.0.1" ||
      hostWithoutPort === "localhost" ||
      hostWithoutPort === "[::1]" || hostWithoutPort === "::1";
    if (!isAllowedHost) {
      reply.status(403).send({
        error: "Forbidden: Host header validation failed",
        code: "HOST_NOT_ALLOWED",
      });
      return false;
    }
  } else {
    reply.status(403).send({ error: "Forbidden: Host header is required", code: "HOST_NOT_ALLOWED" });
    return false;
  }

  // 3. Browser-Origin / CSRF Attack Defense
  const origin = request.headers.origin;
  let isTauriOrigin = false;
  let isLocalUrlOrigin = false;

  if (origin) {
    const allowedOrigins = [
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
    ];
    isTauriOrigin = allowedOrigins.includes(origin);
    isLocalUrlOrigin =
      origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("http://localhost:") ||
      origin === "http://127.0.0.1" ||
      origin === "http://localhost";
    if (!isTauriOrigin && !isLocalUrlOrigin) {
      reply.status(403).send({
        error: "Forbidden: Browser cross-origin management access is rejected",
        code: "BROWSER_CROSS_ORIGIN_FORBIDDEN",
      });
      return false;
    }
  }

  const secFetchSite = request.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site" && !isTauriOrigin && !isLocalUrlOrigin) {
    reply.status(403).send({
      error: "Forbidden: Cross-site browser requests are blocked",
      code: "BROWSER_CROSS_ORIGIN_FORBIDDEN",
    });
    return false;
  }

  // 4. Token Domain Isolation & Local Management Authentication
  const authHeader =
    request.headers.authorization ||
    (request.headers["x-management-token"] as string | undefined);

  if (authHeader) {
    const tokenStr = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    // Cross-token domain rejection: lb_ (MCP) and lbr_ (Runner) can NEVER access management
    if (tokenStr.startsWith("lb_") || tokenStr.startsWith("lbr_")) {
      reply.status(401).send({
        error: "Unauthorized: MCP and Runner tokens cannot access management APIs",
        code: "INVALID_TOKEN_TYPE",
      });
      return false;
    }

    if (opts.managementSecret) {
      const validation = opts.tokenService.validateManagementToken(
        tokenStr,
        opts.managementSecret
      );
      if (!validation.valid) {
        reply.status(401).send({
          error: `Unauthorized: ${validation.reason ?? "Invalid management token"}`,
          code: validation.reason ?? "UNAUTHORIZED",
        });
        return false;
      }
    }
  } else if (opts.requireManagementAuth && opts.managementSecret) {
    reply.status(401).send({
      error: "Unauthorized: Missing management secret token",
      code: "MISSING_TOKEN",
    });
    return false;
  }

  return true;
}

export const managementRoutes: FastifyPluginAsync<ManagementRoutesOptions> = async (
  fastify,
  opts
) => {
  const { tokenService, runnerRegistry, rpcService, projectService, mcpContext, connectionService, adapterRegistry, db } = opts;
  const connService = connectionService || (db ? new ConnectionService(db, tokenService) : null);
  const adpRegistry = adapterRegistry || (connService ? new AdapterRegistry(connService, mcpContext) : null);

  // Middleware: Enforce loopback check and security for all routes in this plugin
  fastify.addHook("onRequest", async (request, reply) => {
    if (!checkLoopbackAndSecurity(request, reply, opts)) {
      return reply;
    }
  });

  // Helper to resolve an active runner or pick the primary connected runner
  function getActiveRunnerId(preferredRunnerId?: string): string {
    if (preferredRunnerId) {
      const runner = runnerRegistry.get(preferredRunnerId);
      if (runner) return runner.runnerId;
    }
    const runners = runnerRegistry.list();
    if (runners.length === 0 || !runners[0]) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        "No local runner is connected to process management request"
      );
    }
    return runners[0].id;
  }

  // ==========================================
  // 1. Tokens Management (/tokens)
  // ==========================================
  fastify.get("/tokens", async (_request, reply) => {
    const tokens = tokenService.listTokens();
    return reply.status(200).send({ tokens });
  });

  fastify.post<{
    Body: {
      name: string;
      type: "runner" | "mcp";
      scopes?: string[];
      expiresAt?: number | null;
      purpose?: string | null;
    };
  }>("/tokens", async (request, reply) => {
    const { name, type, scopes, expiresAt, purpose } = request.body || {};
    if (!name || !type || (type !== "runner" && type !== "mcp")) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Fields 'name' and 'type' ('runner' | 'mcp') are required",
      });
    }

    const created = tokenService.createToken({
      name,
      type,
      scopes: scopes ?? [],
      expiresAt: expiresAt ?? null,
      purpose: purpose ?? undefined,
    });

    return reply.status(201).send(created);
  });

  fastify.delete<{ Params: { id: string } }>(
    "/tokens/:id",
    async (request, reply) => {
      const { id } = request.params;
      const revoked = tokenService.revokeToken(id);
      if (!revoked) {
        return reply.status(404).send({
          code: "TOKEN_NOT_FOUND",
          message: `Token "${id}" not found or already revoked`,
        });
      }
      const closedRunnerConnections = runnerRegistry.closeByTokenId(id);
      return reply.status(200).send({ success: true, id, closedRunnerConnections });
    }
  );

  // ==========================================
  // 2. Global Pause & Controls (/pause, /emergency-stop)
  // ==========================================
  fastify.get("/pause", async (_request, reply) => {
    return reply.status(200).send({ paused: mcpContext.isPaused() });
  });

  fastify.post<{ Body: { paused: boolean } }>("/pause", async (request, reply) => {
    const paused = Boolean(request.body?.paused);
    mcpContext.setPaused(paused);
    return reply.status(200).send({ paused: mcpContext.isPaused() });
  });

  fastify.post<{ Body?: { reason?: string } }>(
    "/emergency-stop",
    async (request, reply) => {
      const reason = request.body?.reason || "Emergency stop initiated by local user";
      // 1. Immediately pause AI / MCP access
      mcpContext.setPaused(true);

      // 2. Cancel all running jobs across all connected runners
      const runners = runnerRegistry.list();
      let totalCancelled = 0;
      const allCancelledJobIds: string[] = [];

      for (const runner of runners) {
        try {
          const res = await rpcService.request(
            runner.id,
            RunnerRpcMethods.JobCancelAll,
            { reason }
          );
          totalCancelled += res.cancelledCount;
          allCancelledJobIds.push(...res.jobIds);
        } catch (err) {
          fastify.log.warn(
            { runnerId: runner.id, err },
            "Failed to send JobCancelAll to runner during emergency stop"
          );
        }
      }

      // Record SECURITY_EMERGENCY_STOP into any active workflow sessions
      if (db) {
        try {
          const activeSessions = db
            .prepare("SELECT project_id FROM workflow_sessions WHERE state = 'active'")
            .all() as Array<{ project_id: string }>;
          for (const s of activeSessions) {
            mcpContext.recordSessionEvent({
              projectId: s.project_id,
              eventType: "SECURITY_EMERGENCY_STOP",
              source: "system",
              summary: { reason },
            });
          }
        } catch (err) {
          fastify.log.warn({ err }, "Failed to record emergency stop session event");
        }
      }

      // 3. Stop all persistent runtimes without requiring approval
      let stoppedRuntimesCount = 0;
      let stoppedRuntimeIds: string[] = [];
      if (mcpContext.persistentRuntimeManager) {
        try {
          const res = await mcpContext.persistentRuntimeManager.stopAllRuntimes(reason);
          stoppedRuntimesCount = res.stoppedCount;
          stoppedRuntimeIds = res.runtimeIds;
        } catch (err) {
          fastify.log.warn({ err }, "Failed to stop persistent runtimes during emergency stop");
        }
      }

      return reply.status(200).send({
        emergencyStopped: true,
        paused: true,
        runnersNotified: runners.length,
        cancelledJobsCount: totalCancelled,
        jobIds: allCancelledJobIds,
        stoppedRuntimesCount,
        runtimeIds: stoppedRuntimeIds,
        timestamp: Date.now(),
      });
    }
  );

  // ==========================================
  // Full Control Mode Routes
  // ==========================================
  const getFullControlStatusHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(mcpContext.fullControlService.getStatus());
  };

  fastify.get("/full-control/status", getFullControlStatusHandler);
  fastify.get("/management/full-control/status", getFullControlStatusHandler);

  const startFullControlHandler = async (
    request: FastifyRequest<{ Body: StartFullControlParams }>,
    reply: FastifyReply
  ) => {
    try {
      const parsed = StartFullControlParamsSchema.parse(request.body);
      const session = mcpContext.fullControlService.startSession(parsed);
      return reply.status(200).send({
        success: true,
        session,
        status: mcpContext.fullControlService.getStatus(),
      });
    } catch (err: any) {
      if (err instanceof LocalBridgeError) {
        return reply.status(400).send({
          code: err.code,
          message: err.message,
        });
      }
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: err.message || "Failed to start full control",
      });
    }
  };

  fastify.post<{ Body: StartFullControlParams }>("/full-control/start", startFullControlHandler);
  fastify.post<{ Body: StartFullControlParams }>("/management/full-control/start", startFullControlHandler);

  const stopFullControlHandler = async (
    request: FastifyRequest<{ Body?: StopFullControlParams }>,
    reply: FastifyReply
  ) => {
    const params = request.body || {};
    const stopped = mcpContext.fullControlService.stopSession(params);
    return reply.status(200).send({
      success: stopped,
      status: mcpContext.fullControlService.getStatus(),
    });
  };

  fastify.post<{ Body?: StopFullControlParams }>("/full-control/stop", stopFullControlHandler);
  fastify.post<{ Body?: StopFullControlParams }>("/management/full-control/stop", stopFullControlHandler);

  fastify.post<{ Body?: { reason?: string } }>("/shutdown", async (request, reply) => {
    mcpContext.setPaused(true);
    const reason = request.body?.reason || "Desktop shutdown";

    // Run cleanups in parallel with a bounded 500ms timeout
    const cleanupTasks: Promise<any>[] = [];
    if (mcpContext.persistentRuntimeManager) {
      cleanupTasks.push(
        mcpContext.persistentRuntimeManager.stopAllRuntimes(reason).catch((err) => {
          fastify.log.warn({ err }, "Failed to stop runtimes during shutdown");
        })
      );
    }
    for (const runner of runnerRegistry.list()) {
      cleanupTasks.push(
        Promise.all([
          rpcService.request(runner.id, RunnerRpcMethods.JobCancelAll, { reason }),
          rpcService.request(runner.id, RunnerRpcMethods.SystemShutdown, { reason }),
        ]).catch((err) => {
          fastify.log.warn({ runnerId: runner.id, err }, "Graceful Runner shutdown failed");
        })
      );
    }

    const timeoutPromise = new Promise((res) => setTimeout(res, 300));
    await Promise.race([Promise.all(cleanupTasks), timeoutPromise]);

    setTimeout(() => {
      try {
        if (typeof (fastify.server as any)?.closeAllConnections === "function") {
          (fastify.server as any).closeAllConnections();
        }
        void fastify.close();
      } catch {}
      if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
        setTimeout(() => process.exit(0), 50);
      }
    }, 30);
    return reply.header("Connection", "close").status(200).send({ shuttingDown: true });
  });

  // ==========================================
  // 3. Project Management (/management/projects/*)
  // ==========================================
  fastify.post<{
    Body: {
      path: string;
      name?: string;
      accessMode?: ProjectAccessMode;
      executionMode?: ProjectExecutionMode;
      allowedCommands?: string[];
      runnerId?: string;
    };
  }>("/management/projects/authorize", async (request, reply) => {
    const { path, name, accessMode, runnerId } = request.body || {};

    if (!path) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'path' is required for project authorization",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectAuthorize,
      {
        path,
        name,
        accessMode: accessMode || "read-only",
      }
    );

    projectService.syncRunnerProjects(targetRunnerId, [
      {
        id: result.id,
        name: result.name,
        enabled: result.enabled,
        accessMode: result.accessMode,
        executionMode: result.executionMode,
      },
    ]);

    return reply.status(201).send(result);
  });

  fastify.post<{
    Params: { id: string };
    Body: { accessMode: ProjectAccessMode; runnerId?: string };
  }>("/management/projects/:id/access", async (request, reply) => {
    const { id } = request.params;
    const { accessMode, runnerId } = request.body || {};

    if (!accessMode) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'accessMode' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetAccess,
      {
        projectId: id,
        accessMode,
      }
    );

    projectService.updateProjectAccess(id, accessMode);
    if ((result as any)?.executionMode) {
      projectService.updateProjectExecution(id, (result as any).executionMode);
    }
    const updated = projectService.getProject(id);
    return reply.status(200).send({
      ...result,
      ...(updated || {}),
    });
  });

  fastify.post<{
    Params: { id: string };
    Body: {
      executionMode: ProjectExecutionMode;
      allowedCommands?: string[];
      runnerId?: string;
    };
  }>("/management/projects/:id/execution", async (request, reply) => {
    const { id } = request.params;
    const { executionMode, runnerId } = request.body || {};

    if (!executionMode) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'executionMode' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    // Auto-upgrade accessMode to read-write when executionMode is set to project-code
    // so users can freely switch back and forth between read-only/disabled and project-code
    if (executionMode === "project-code") {
      await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectSetAccess,
        {
          projectId: id,
          accessMode: "read-write",
        }
      );
      projectService.updateProjectAccess(id, "read-write");
    }

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetExecution,
      {
        projectId: id,
        executionMode,
      }
    );

    projectService.updateProjectExecution(id, executionMode);
    if ((result as any)?.accessMode) {
      projectService.updateProjectAccess(id, (result as any).accessMode);
    }
    const updated = projectService.getProject(id);
    return reply.status(200).send({
      ...result,
      ...(updated || {}),
    });
  });

  fastify.delete<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id",
    async (request, reply) => {
      const { id } = request.params;
      if (mcpContext.persistentRuntimeManager) {
        await mcpContext.persistentRuntimeManager.stopProjectRuntimes(id, "Project removed");
      }
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectRemove,
        { projectId: id }
      );

      projectService.removeProject(id);
      return reply.status(200).send(result);
    }
  );

  fastify.post<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/enable",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectEnable,
        { projectId: id }
      );

      projectService.updateProjectEnabled(id, true);
      const updated = projectService.getProject(id);
      return reply.status(200).send({
        ...result,
        ...(updated || {}),
      });
    }
  );

  fastify.post<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/disable",
    async (request, reply) => {
      const { id } = request.params;
      if (mcpContext.persistentRuntimeManager) {
        await mcpContext.persistentRuntimeManager.stopProjectRuntimes(id, "Project disabled");
      }
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectDisable,
        { projectId: id }
      );

      projectService.updateProjectEnabled(id, false);
      const updated = projectService.getProject(id);
      return reply.status(200).send({
        ...result,
        ...(updated || {}),
      });
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/trust-policy",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      if (!project) {
        return reply.status(404).send({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          message: `Project "${id}" not found`,
        });
      }

      const targetRunnerId =
        request.query.runnerId || project.runnerId || getActiveRunnerId();

      let isSessionActive = false;
      try {
        const sessionRes = await rpcService.request(
          targetRunnerId,
          RunnerRpcMethods.ProjectSessionTrust,
          { projectId: id, action: "status" }
        );
        isSessionActive = !!sessionRes?.active;
      } catch {
        // runner might be offline
      }

      const dbPolicy = projectService.getTrustPolicy(id);
      const basePolicy = dbPolicy ?? {
        trustLevel: "standard" as const,
        filePolicy: "ask" as const,
        commandPolicy: "ask" as const,
        protectedFilesPolicy: "always-ask" as const,
        policyVersion: 1,
        canonicalRoot: "",
        updatedAt: Date.now(),
      };

      if (isSessionActive) {
        return reply.status(200).send({
          projectId: id,
          trustPolicy: {
            ...basePolicy,
            trustLevel: "session-trusted",
            filePolicy: "allow",
          },
        });
      }

      return reply.status(200).send({ projectId: id, trustPolicy: basePolicy });
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      trustPolicy: ProjectTrustPolicy;
      runnerId?: string;
    };
  }>("/management/projects/:id/trust-policy", async (request, reply) => {
    const { id } = request.params;
    const { trustPolicy, runnerId } = request.body || {};
    if (!trustPolicy) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'trustPolicy' is required",
      });
    }

    const project = projectService.getProject(id);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const normalizedFilePolicy =
      trustPolicy.filePolicy === "allow" ||
      trustPolicy.filePolicy === "ask" ||
      trustPolicy.filePolicy === "deny"
        ? trustPolicy.filePolicy
        : trustPolicy.trustLevel === "full-project-trust" ||
            trustPolicy.trustLevel === "session-trusted"
          ? "allow"
          : "ask";

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSetTrustPolicy,
      {
        projectId: id,
        trustLevel: trustPolicy.trustLevel,
        filePolicy: normalizedFilePolicy,
        commandPolicy: trustPolicy.commandPolicy ?? "ask",
        protectedFilesPolicy: trustPolicy.protectedFilesPolicy ?? "always-ask",
        customRules: trustPolicy.customRules,
      }
    );

    // Only persist non-session-trusted policies to SQLite
    if (result.policy.trustLevel !== "session-trusted") {
      projectService.setTrustPolicy(id, result.policy);
    } else {
      const currentDbPolicy = projectService.getTrustPolicy(id);
      if (currentDbPolicy && currentDbPolicy.trustLevel !== "standard") {
        projectService.setTrustPolicy(id, {
          ...currentDbPolicy,
          trustLevel: "standard",
          filePolicy: "ask",
        });
      }
    }
    return reply.status(200).send({ projectId: id, trustPolicy: result.policy });
  });

  fastify.post<{
    Params: { id: string };
    Body?: { action?: "grant" | "revoke"; runnerId?: string };
  }>("/management/projects/:id/session-trust", async (request, reply) => {
    const { id } = request.params;
    const action = request.body?.action || "grant";
    const project = projectService.getProject(id);
    const targetRunnerId =
      request.body?.runnerId || project?.runnerId || getActiveRunnerId();

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ProjectSessionTrust,
      {
        projectId: id,
        action,
      }
    );

    return reply.status(200).send(result);
  });

  fastify.delete<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/management/projects/:id/session-trust",
    async (request, reply) => {
      const { id } = request.params;
      const project = projectService.getProject(id);
      const targetRunnerId =
        request.query.runnerId || project?.runnerId || getActiveRunnerId();

      const result = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ProjectSessionTrust,
        {
          projectId: id,
          action: "revoke",
        }
      );

      return reply.status(200).send(result);
    }
  );


  // ==========================================
  // 4. Approvals Management (/approvals)
  // ==========================================
  fastify.get<{
    Querystring: {
      projectId?: string;
      status?: "pending" | "approved" | "denied" | "expired";
      runnerId?: string;
    };
  }>("/approvals", async (request, reply) => {
    const { projectId, status, runnerId } = request.query;
    const targetRunnerId = getActiveRunnerId(runnerId);

    const approvals = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalList,
      { projectId, status }
    );

    return reply.status(200).send({ approvals });
  });

  fastify.post<{
    Body: {
      projectId: string;
      operation: string;
      payload?: Record<string, unknown>;
      payloadHash?: string;
      risk?: ApprovalRisk;
      summary: string;
      ttlSeconds?: number;
      runnerId?: string;
    };
  }>("/approvals", async (request, reply) => {
    const { projectId, operation, payload, payloadHash, risk, summary, ttlSeconds, runnerId } =
      request.body || {};

    if (!projectId || !operation || (!payload && !payloadHash) || !summary) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Fields 'projectId', 'operation', ('payload' or 'payloadHash'), and 'summary' are required",
      });
    }

    const computedHash = payloadHash || canonicalPayloadHash(payload);

    const project = projectService.getProject(projectId);
    const targetRunnerId = runnerId || project?.runnerId || getActiveRunnerId();

    const approval = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalCreate,
      {
        projectId,
        operation,
        risk: risk || "CAUTION",
        summary,
        payloadHash: computedHash,
        timeoutMs: ttlSeconds ? ttlSeconds * 1000 : 300000,
      }
    );

    return reply.status(201).send(approval);
  });

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/approvals/:id",
    async (request, reply) => {
      const { id } = request.params;
      const targetRunnerId = getActiveRunnerId(request.query.runnerId);

      const approval = await rpcService.request(
        targetRunnerId,
        RunnerRpcMethods.ApprovalGet,
        { approvalId: id }
      );

      return reply.status(200).send(approval);
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: {
      action: "approve" | "deny";
      resolvedBy?: string;
      runnerId?: string;
      decisionSource?: string;
    };
  }>("/approvals/:id/resolve", async (request, reply) => {
    const { id } = request.params;
    const { action, resolvedBy, runnerId, decisionSource } = request.body || {};

    if (!action || (action !== "approve" && action !== "deny")) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'action' must be 'approve' or 'deny'",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const opDisplayName = projectService.getOperatorDisplayName();
    const resolved = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalResolve,
      {
        approvalId: id,
        action,
        resolvedBy: resolvedBy || opDisplayName || "desktop-user",
        decisionSource: decisionSource || "desktop",
      }
    );

    return reply.status(200).send(resolved);
  });

  fastify.post<{
    Body: {
      approvalIds: string[];
      action: "approve" | "deny";
      resolvedBy?: string;
      runnerId?: string;
    };
  }>("/management/approvals/bulk-resolve", async (request, reply) => {
    const { approvalIds, action, resolvedBy, runnerId } = request.body || {};
    if (
      !Array.isArray(approvalIds) ||
      approvalIds.length === 0 ||
      !action ||
      (action !== "approve" && action !== "deny")
    ) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message:
          "Fields 'approvalIds' (non-empty array) and 'action' ('approve' | 'deny') are required",
      });
    }

    const targetRunnerId = getActiveRunnerId(runnerId);
    const opDisplayName = projectService.getOperatorDisplayName();
    const actor = resolvedBy || opDisplayName || "desktop-user";

    const result = await rpcService.request(
      targetRunnerId,
      RunnerRpcMethods.ApprovalBulkResolve,
      {
        approvalIds,
        action,
        resolvedBy: actor,
      }
    );

    return reply.status(200).send(result);
  });

  // ==========================================
  // 5. Jobs Management (/jobs)
  // ==========================================
  fastify.get<{
    Querystring: {
      projectId?: string;
      runnerId?: string;
      limit?: number;
    };
  }>("/jobs", async (request, reply) => {
    const { projectId, runnerId, limit } = request.query;
    const maxLimit = limit ? Number(limit) : 50;
    const runners = runnerRegistry.list();
    const liveJobsMap = new Map<string, any>();

    if (runners.length > 0) {
      const targetRunners = runnerId
        ? runners.filter((r) => r.id === runnerId)
        : runners;

      for (const r of targetRunners) {
        try {
          const res = await rpcService.request(r.id, RunnerRpcMethods.JobList, {
            projectId,
            limit: maxLimit,
          });
          for (const j of res.jobs) {
            liveJobsMap.set(j.jobId, j);
          }
        } catch {
          // ignore
        }
      }
    }

    // Merge with persisted jobs from SQLite if available
    if (db) {
      try {
        let query = "SELECT * FROM jobs";
        const params: any[] = [];
        const conditions: string[] = [];

        if (projectId) {
          conditions.push("project_id = ?");
          params.push(projectId);
        }
        if (runnerId) {
          conditions.push("runner_id = ?");
          params.push(runnerId);
        }
        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }
        query += " ORDER BY created_at DESC LIMIT ?";
        params.push(maxLimit);

        const rows = db.prepare(query).all(...params) as JobRow[];
        for (const row of rows) {
          if (!liveJobsMap.has(row.id)) {
            liveJobsMap.set(row.id, {
              jobId: row.id,
              projectId: row.project_id,
              state: row.state,
              commandKind: row.command_kind,
              risk: row.risk,
              createdAt: row.created_at,
              startedAt: row.started_at,
              finishedAt: row.finished_at,
              exitCode: row.exit_code,
              outputTruncated: Boolean(row.output_truncated),
              error: row.error_message || undefined,
            });
          }
        }
      } catch {
        // ignore db query error
      }
    }

    const allJobs = Array.from(liveJobsMap.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    return reply.status(200).send({ jobs: allJobs.slice(0, maxLimit) });
  });

  fastify.get<{ Params: { id: string }; Querystring: { runnerId?: string } }>(
    "/jobs/:id/status",
    async (request, reply) => {
      const { id } = request.params;
      let targetRunnerId = request.query.runnerId;

      if (!targetRunnerId) {
        try {
          targetRunnerId = mcpContext.resolveJobRunner(id);
        } catch {
          targetRunnerId = getActiveRunnerId();
        }
      }

      const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobStatus, {
        jobId: id,
      });

      return reply.status(200).send(res);
    }
  );

  fastify.get<{
    Params: { id: string };
    Querystring: { runnerId?: string; cursor?: string; limit?: number };
  }>("/jobs/:id/logs", async (request, reply) => {
    const { id } = request.params;
    const { cursor, limit } = request.query;
    let targetRunnerId = request.query.runnerId;

    if (!targetRunnerId) {
      try {
        targetRunnerId = mcpContext.resolveJobRunner(id);
      } catch {
        targetRunnerId = getActiveRunnerId();
      }
    }

    const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobLogs, {
      jobId: id,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) : 100,
    });

    return reply.status(200).send(res);
  });

  fastify.post<{
    Params: { id: string };
    Querystring: { runnerId?: string };
    Body?: { projectId?: string };
  }>("/jobs/:id/cancel", async (request, reply) => {
    const { id } = request.params;
    const projectId = request.body?.projectId;
    let targetRunnerId = request.query.runnerId;

    if (!targetRunnerId) {
      try {
        targetRunnerId = mcpContext.resolveJobRunner(id);
      } catch {
        targetRunnerId = getActiveRunnerId();
      }
    }

    const res = await rpcService.request(targetRunnerId, RunnerRpcMethods.JobCancel, {
      jobId: id,
      projectId,
    });

    return reply.status(200).send(res);
  });

  // ==========================================
  // 6. Audit Events (/audit)
  // ==========================================
  fastify.get<{ Querystring: { limit?: number } }>(
    "/audit",
    async (request, reply) => {
      const limit = request.query.limit ? Number(request.query.limit) : 100;
      const events = mcpContext.getAuditEvents(limit);
      return reply.status(200).send({ events });
    }
  );

  // ==========================================
  // 7. Trust & System Settings
  // ==========================================
  fastify.post("/management/trust/reset-defaults", async (_request, reply) => {
    projectService.resetAllTrustPolicies();
    const runners = runnerRegistry.list();
    for (const runner of runners) {
      try {
        const projects = await rpcService.request(
          runner.id,
          RunnerRpcMethods.ProjectList,
          {}
        );
        for (const p of projects) {
          await rpcService.request(
            runner.id,
            RunnerRpcMethods.ProjectSetTrustPolicy,
            {
              projectId: p.id,
              trustLevel: "standard",
              filePolicy: "ask",
              commandPolicy: "ask",
              protectedFilesPolicy: "always-ask",
            }
          );
        }
      } catch (err) {
        fastify.log.warn(
          { runnerId: runner.id, err },
          "Failed to reset trust policy for runner projects"
        );
      }
    }
    return reply.status(200).send({ reset: true });
  });

  fastify.post("/management/trust/clear-sessions", async (_request, reply) => {
    const runners = runnerRegistry.list();
    for (const runner of runners) {
      try {
        const projects = await rpcService.request(
          runner.id,
          RunnerRpcMethods.ProjectList,
          {}
        );
        for (const p of projects) {
          await rpcService.request(
            runner.id,
            RunnerRpcMethods.ProjectSessionTrust,
            {
              projectId: p.id,
              action: "revoke",
            }
          );
        }
      } catch (err) {
        fastify.log.warn(
          { runnerId: runner.id, err },
          "Failed to clear session trust for runner projects"
        );
      }
    }
    return reply.status(200).send({ cleared: true });
  });

  fastify.get("/management/settings/operator", async (_request, reply) => {
    const displayName = projectService.getOperatorDisplayName();
    return reply.status(200).send({ displayName });
  });

  fastify.post<{ Body: { displayName: string } }>(
    "/management/settings/operator",
    async (request, reply) => {
      const { displayName } = request.body || {};
      if (!displayName || typeof displayName !== "string") {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'displayName' is required",
        });
      }
      projectService.setOperatorDisplayName(displayName);
      return reply
        .status(200)
        .send({ displayName: projectService.getOperatorDisplayName() });
    }
  );

  fastify.get("/management/settings/approval-routing", async (_request, reply) => {
    const mode = projectService.getApprovalRoutingMode();
    return reply.status(200).send({ mode });
  });

  fastify.post<{ Body: { mode: "chat" | "auto-trusted" | "desktop" | "hybrid" } }>(
    "/management/settings/approval-routing",
    async (request, reply) => {
      const { mode } = request.body || {};
      if (mode !== "chat" && mode !== "auto-trusted" && mode !== "desktop" && mode !== "hybrid") {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'mode' must be 'chat', 'auto-trusted', 'desktop', or 'hybrid'",
        });
      }
      projectService.setApprovalRoutingMode(mode);

      // Broadcast mode change to all connected runners
      for (const runner of runnerRegistry.list()) {
        try {
          await rpcService.request(runner.id, RunnerRpcMethods.ApprovalSetMode, { mode });
        } catch (err) {
          fastify.log.warn(
            { runnerId: runner.id, err },
            "Failed to notify runner of approval mode update"
          );
        }
      }

      return reply
        .status(200)
        .send({ mode: projectService.getApprovalRoutingMode() });
    }
  );

  fastify.get("/management/settings/safety-layer", async (_request, reply) => {
    const disabled = projectService.getSafetyLayerDisabled();
    const mode = projectService.getSecurityMode();
    return reply.status(200).send({ disabled, mode, securityMode: mode });
  });

  fastify.post<{ Body: { disabled?: boolean; mode?: "safe" | "universal"; securityMode?: "safe" | "universal" } }>(
    "/management/settings/safety-layer",
    async (request, reply) => {
      const body = request.body || {};
      const targetMode: "safe" | "universal" =
        body.mode ??
        body.securityMode ??
        (body.disabled ? "universal" : "safe");
      const isDisabled = targetMode === "universal" || Boolean(body.disabled);
      projectService.setSafetyLayerDisabled(isDisabled, targetMode);

      // Broadcast mode change to all connected runners
      for (const runner of runnerRegistry.list()) {
        try {
          await rpcService.request(runner.id, RunnerRpcMethods.SafetyLayerSetStatus, {
            disabled: isDisabled,
            mode: targetMode,
          });
        } catch (err) {
          fastify.log.warn(
            { runnerId: runner.id, err },
            "Failed to notify runner of safety layer status update"
          );
        }
      }

      return reply
        .status(200)
        .send({
          disabled: projectService.getSafetyLayerDisabled(),
          mode: projectService.getSecurityMode(),
          securityMode: projectService.getSecurityMode(),
        });
    }
  );

  // ==========================================
  // LSP Code Intelligence Management
  // ==========================================
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/management/lsp/status",
    async (request, reply) => {
      const { projectId } = request.query || {};
      const runners = runnerRegistry.list();
      const allServers: any[] = [];

      for (const runner of runners) {
        try {
          const res = await rpcService.request(
            runner.id,
            RunnerRpcMethods.LspStatus,
            { projectId }
          );
          if (res?.servers) {
            allServers.push(...res.servers);
          }
        } catch (err) {
          fastify.log.warn({ runnerId: runner.id, err }, "Failed to fetch LSP status from runner");
        }
      }

      return reply.status(200).send({ servers: allServers });
    }
  );

  fastify.post<{ Body: { projectId: string } }>(
    "/management/lsp/restart",
    async (request, reply) => {
      const { projectId } = request.body || {};
      if (!projectId) {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'projectId' is required",
        });
      }

      const p = projectService.getProject(projectId);
      if (!p) {
        return reply.status(404).send({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          message: `Project '${projectId}' not found`,
        });
      }

      const runner = runnerRegistry.get(p.runnerId);
      if (!runner) {
        return reply.status(503).send({
          code: LocalBridgeErrorCode.RUNNER_OFFLINE,
          message: `Runner '${p.runnerId}' is offline`,
        });
      }

      const res = await rpcService.request(
        p.runnerId,
        RunnerRpcMethods.LspRestart,
        { projectId }
      );
      return reply.status(200).send(res);
    }
  );

  fastify.post<{ Body: { projectId: string } }>(
    "/management/lsp/stop",
    async (request, reply) => {
      const { projectId } = request.body || {};
      if (!projectId) {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: "Field 'projectId' is required",
        });
      }

      const p = projectService.getProject(projectId);
      if (!p) {
        return reply.status(404).send({
          code: LocalBridgeErrorCode.PROJECT_NOT_FOUND,
          message: `Project '${projectId}' not found`,
        });
      }

      const runner = runnerRegistry.get(p.runnerId);
      if (!runner) {
        return reply.status(503).send({
          code: LocalBridgeErrorCode.RUNNER_OFFLINE,
          message: `Runner '${p.runnerId}' is offline`,
        });
      }

      const res = await rpcService.request(
        p.runnerId,
        RunnerRpcMethods.LspStop,
        { projectId }
      );
      return reply.status(200).send(res);
    }
  );

  // ==========================================
  // 8. Workflow Sessions Management
  // ==========================================
  fastify.get<{
    Querystring: {
      projectId?: string;
      state?: "active" | "completed" | "abandoned";
      limit?: number;
      cursor?: string;
    };
  }>("/management/sessions", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }

    const { projectId, state, limit = 20, cursor } = request.query;

    if (projectId) {
      const res = mcpContext.workflowSessionManager.listSessions({
        projectId,
        state,
        limit,
        cursor,
      });
      return reply.status(200).send(res);
    }

    // If projectId omitted, list across all projects from DB
    if (!db) {
      return reply.status(200).send({ sessions: [], hasMore: false });
    }

    let query = "SELECT * FROM workflow_sessions";
    const params: any[] = [];
    if (state) {
      query += " WHERE state = ?";
      params.push(state);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit + 1);

    const rows = db.prepare(query).all(...params) as any[];
    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const sessions = resultRows.map((r) => ({
      sessionId: r.id,
      projectId: r.project_id,
      title: r.title ?? undefined,
      goal: r.goal,
      state: r.state,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
      finishedAt: r.finished_at,
    }));

    return reply.status(200).send({
      sessions,
      hasMore,
      nextCursor:
        hasMore && resultRows.length > 0
          ? String(resultRows[resultRows.length - 1].created_at)
          : undefined,
    });
  });

  fastify.get<{ Params: { id: string } }>("/management/sessions/:id", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }
    const res = mcpContext.workflowSessionManager.getSessionStatus(request.params.id);
    return reply.status(200).send(res);
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { cursor?: string; limit?: number };
  }>("/management/sessions/:id/events", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }
    const { cursor, limit } = request.query;
    const res = mcpContext.workflowSessionManager.getSessionEvents({
      sessionId: request.params.id,
      cursor,
      limit,
    });
    return reply.status(200).send(res);
  });

  fastify.get<{ Params: { id: string } }>(
    "/management/sessions/:id/handoff",
    async (request, reply) => {
      if (!mcpContext.workflowSessionManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "WorkflowSessionManager is not initialized",
        });
      }
      const res = await mcpContext.workflowSessionManager.buildHandoffPacket(request.params.id);
      return reply.status(200).send(res);
    }
  );

  fastify.post<{
    Body: { projectId: string; goal: string; title?: string };
  }>("/management/sessions", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }
    const { projectId, goal, title } = request.body || {};
    if (!projectId || !goal) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Fields 'projectId' and 'goal' are required",
      });
    }

    const res = mcpContext.workflowSessionManager.startSession({
      projectId,
      goal,
      title,
      createdBy: "desktop",
    });
    return reply.status(201).send(res);
  });

  fastify.post<{
    Params: { id: string };
    Body: { summary: string; nextSteps?: string[]; blockers?: string[] };
  }>("/management/sessions/:id/checkpoint", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }
    const { summary, nextSteps, blockers } = request.body || {};
    if (!summary) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'summary' is required",
      });
    }

    const res = mcpContext.workflowSessionManager.addCheckpoint({
      sessionId: request.params.id,
      summary,
      nextSteps,
      blockers,
      createdBy: "desktop",
    });
    return reply.status(200).send(res);
  });

  fastify.post<{
    Params: { id: string };
    Body: { outcome?: "completed" | "abandoned"; reason?: string; finalNote?: string; notes?: string };
  }>("/management/sessions/:id/finish", async (request, reply) => {
    if (!mcpContext.workflowSessionManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "WorkflowSessionManager is not initialized",
      });
    }
    const body = request.body || {};
    const outcome: "completed" | "abandoned" =
      body.outcome === "abandoned" ? "abandoned" : "completed";
    const finalNote = body.finalNote || body.notes || body.reason;

    const res = mcpContext.workflowSessionManager.finishSession({
      sessionId: request.params.id,
      outcome,
      finalNote,
      reason: body.reason,
      notes: body.notes,
      finishedBy: "desktop",
    });
    return reply.status(200).send(res);
  });

  // ==========================================
  // Managed Worktree Management Endpoints
  // ==========================================
  fastify.get<{ Params: { id: string } }>(
    "/management/projects/:id/worktrees",
    async (request, reply) => {
      if (!mcpContext.worktreeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ManagedWorktreeManager is not initialized",
        });
      }
      const res = await mcpContext.worktreeManager.listWorktrees({
        projectId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/management/worktrees/:id",
    async (request, reply) => {
      if (!mcpContext.worktreeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ManagedWorktreeManager is not initialized",
        });
      }
      const res = await mcpContext.worktreeManager.getWorktreeStatus({
        worktreeId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/management/worktrees/:id/diff",
    async (request, reply) => {
      if (!mcpContext.worktreeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ManagedWorktreeManager is not initialized",
        });
      }
      const res = await mcpContext.worktreeManager.getWorktreeDiff({
        worktreeId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/management/worktrees/:id/remove",
    async (request, reply) => {
      if (!mcpContext.worktreeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ManagedWorktreeManager is not initialized",
        });
      }
      const res = await mcpContext.worktreeManager.removeWorktree({
        worktreeId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  // ================= Persistent Runtime Endpoints =================

  fastify.get<{ Params: { id: string } }>(
    "/management/projects/:id/runtimes",
    async (request, reply) => {
      if (!mcpContext.persistentRuntimeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ServerPersistentRuntimeManager is not initialized",
        });
      }
      const res = await mcpContext.persistentRuntimeManager.listRuntimes({
        projectId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.get<{
    Querystring: {
      projectId?: string;
      sessionId?: string;
      worktreeId?: string;
      state?: any;
      limit?: number;
      cursor?: string;
    };
  }>("/management/runtimes", async (request, reply) => {
    if (!mcpContext.persistentRuntimeManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "ServerPersistentRuntimeManager is not initialized",
      });
    }
    const res = await mcpContext.persistentRuntimeManager.listRuntimes(request.query);
    return reply.status(200).send(res);
  });

  fastify.post<{ Body: Record<string, any> }>(
    "/management/runtimes/start",
    async (request, reply) => {
      if (!mcpContext.persistentRuntimeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ServerPersistentRuntimeManager is not initialized",
        });
      }
      const res = await mcpContext.persistentRuntimeManager.startRuntime({
        ...(request.body as any),
        createdBy: "desktop",
      });
      return reply.status(200).send(res);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/management/runtimes/:id",
    async (request, reply) => {
      if (!mcpContext.persistentRuntimeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ServerPersistentRuntimeManager is not initialized",
        });
      }
      const res = await mcpContext.persistentRuntimeManager.getRuntimeStatus({
        runtimeId: request.params.id,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.get<{
    Params: { id: string };
    Querystring: { generation?: string; afterSequence?: string; limit?: string };
  }>("/management/runtimes/:id/logs", async (request, reply) => {
    if (!mcpContext.persistentRuntimeManager) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "ServerPersistentRuntimeManager is not initialized",
      });
    }
    const generation = request.query.generation
      ? Number(request.query.generation)
      : undefined;
    const afterSequence = request.query.afterSequence
      ? Number(request.query.afterSequence)
      : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;

    const res = await mcpContext.persistentRuntimeManager.getRuntimeLogs({
      runtimeId: request.params.id,
      generation,
      afterSequence,
      limit,
    });
    return reply.status(200).send(res);
  });

  fastify.post<{ Params: { id: string }; Body?: { approvalId?: string } }>(
    "/management/runtimes/:id/restart",
    async (request, reply) => {
      if (!mcpContext.persistentRuntimeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ServerPersistentRuntimeManager is not initialized",
        });
      }
      const res = await mcpContext.persistentRuntimeManager.restartRuntime({
        runtimeId: request.params.id,
        approvalId: request.body?.approvalId,
      });
      return reply.status(200).send(res);
    }
  );

  fastify.post<{ Params: { id: string }; Body?: { gracePeriodMs?: number } }>(
    "/management/runtimes/:id/stop",
    async (request, reply) => {
      if (!mcpContext.persistentRuntimeManager) {
        return reply.status(500).send({
          code: LocalBridgeErrorCode.INTERNAL_ERROR,
          message: "ServerPersistentRuntimeManager is not initialized",
        });
      }
      const res = await mcpContext.persistentRuntimeManager.stopRuntime({
        runtimeId: request.params.id,
        gracePeriodMs: request.body?.gracePeriodMs,
      });
      return reply.status(200).send(res);
    }
  );

  // ==========================================
  // 12. Intelligence & DecisionProvider
  // ==========================================
  fastify.get("/management/intelligence/status", async (_request, reply) => {
    const status = mcpContext.getIntelligenceStatus();
    return reply.status(200).send(status);
  });

  fastify.get("/management/intelligence/config", async (_request, reply) => {
    const status = mcpContext.getIntelligenceStatus();
    return reply.status(200).send({
      provider: status.provider,
      modelPath: status.modelPath,
      pythonPath: status.pythonPath,
    });
  });

  fastify.post<{
    Body: {
      provider?: "disabled" | "laya";
      modelPath?: string;
      pythonPath?: string;
      workerTimeoutMs?: number;
    };
  }>("/management/intelligence/config", async (request, reply) => {
    const nextStatus = await mcpContext.updateIntelligenceConfig(request.body || {});
    return reply.status(200).send(nextStatus);
  });

  fastify.get("/management/intelligence/model/status", async (_request, reply) => {
    const status = mcpContext.getModelStatus();
    return reply.status(200).send(status);
  });

  fastify.post<{
    Body?: ModelDownloadOptions;
  }>("/management/intelligence/model/download", async (request, reply) => {
    const status = await mcpContext.startModelDownload(request.body);
    return reply.status(200).send(status);
  });

  fastify.post("/management/intelligence/model/cancel", async (_request, reply) => {
    const status = mcpContext.cancelModelDownload();
    return reply.status(200).send(status);
  });

  fastify.post<{
    Body: { modelPath: string };
  }>("/management/intelligence/model/validate", async (request, reply) => {
    const modelPath = request.body?.modelPath;
    if (!modelPath) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'modelPath' is required",
      });
    }
    const result = mcpContext.validateModelPath(modelPath);
    return reply.status(200).send(result);
  });

  fastify.post<{
    Body: { modelPath: string };
  }>("/management/intelligence/model/set-path", async (request, reply) => {
    const modelPath = request.body?.modelPath;
    if (!modelPath) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'modelPath' is required",
      });
    }
    const status = await mcpContext.setModelPath(modelPath);
    return reply.status(200).send(status);
  });

  fastify.post<{
    Body: ModelImportOptions;
  }>("/management/intelligence/model/import", async (request, reply) => {
    const sourceDir = request.body?.sourceDir;
    if (!sourceDir) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'sourceDir' is required",
      });
    }
    try {
      const status = await mcpContext.importExistingModel(sourceDir, !!request.body?.copyToManaged);
      return reply.status(200).send(status);
    } catch (err: any) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: err.message || "Failed to import existing model",
      });
    }
  });

  fastify.post<{
    Body?: ModelDownloadOptions;
  }>("/management/intelligence/model/download-and-enable", async (request, reply) => {
    try {
      const status = await mcpContext.downloadAndEnableModel(request.body);
      return reply.status(200).send(status);
    } catch (err: any) {
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: err.message || "Failed to download and enable model",
      });
    }
  });

  fastify.post<{
    Body: DecisionContext;
  }>("/management/intelligence/evaluate", async (request, reply) => {
    const context = request.body;
    if (!context || !context.operation) {
      return reply.status(400).send({
        code: LocalBridgeErrorCode.INVALID_REQUEST,
        message: "Field 'operation' is required",
      });
    }
    const advice = await mcpContext.getDecisionAdvice(context);
    return reply.status(200).send(advice);
  });

  // ChatGPT Connection Routes
  fastify.get("/management/connections", async (_request, reply) => {
    if (!connService) {
      return reply.status(503).send({ error: "Connection service not initialized" });
    }
    const connections = connService.listConnections();
    return reply.status(200).send({ connections });
  });

  fastify.get<{ Params: { id: string } }>("/management/connections/:id", async (request, reply) => {
    if (!connService) {
      return reply.status(503).send({ error: "Connection service not initialized" });
    }
    const conn = connService.getConnection(request.params.id);
    if (!conn) {
      return reply.status(404).send({ error: "Connection not found" });
    }
    return reply.status(200).send(conn);
  });

  fastify.post<{ Params: { id: string }; Body?: { scopes?: string[] } }>(
    "/management/connections/:id/token/rotate",
    async (request, reply) => {
      if (!connService) {
        return reply.status(503).send({ error: "Connection service not initialized" });
      }
      try {
        const res = connService.createOrRotateToken(request.params.id, request.body?.scopes);
        return reply.status(200).send(res);
      } catch (err: any) {
        return reply.status(400).send({ error: err?.message || String(err) });
      }
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/management/connections/:id/token/revoke",
    async (request, reply) => {
      if (!connService) {
        return reply.status(503).send({ error: "Connection service not initialized" });
      }
      try {
        const success = connService.revokeConnectionToken(request.params.id);
        return reply.status(200).send({ success, id: request.params.id });
      } catch (err: any) {
        return reply.status(400).send({ error: err?.message || String(err) });
      }
    }
  );

  fastify.post<{ Params: { id: string } }>("/management/connections/:id/test", async (request, reply) => {
    if (!adpRegistry) {
      return reply.status(503).send({ error: "Adapter registry not initialized" });
    }
    const res = await adpRegistry.testConnection(request.params.id);
    return reply.status(200).send(res);
  });

  // ==========================================
  // Computer Use & Human Takeover Management Routes
  // ==========================================
  fastify.get("/management/computer/status", async (_request, reply) => {
    try {
      const runnerId = getActiveRunnerId();
      const status = await (rpcService as any).request(runnerId, RunnerRpcMethods.ComputerStatus, {});
      return reply.status(200).send(status);
    } catch (err: any) {
      return reply.status(200).send({
        enabled: true,
        active: false,
        error: err.message,
      });
    }
  });

  fastify.get("/management/computer/takeover/status", async (_request, reply) => {
    try {
      const runnerId = getActiveRunnerId();
      const status = await (rpcService as any).request(runnerId, RunnerRpcMethods.ComputerTakeoverStatus, {});
      return reply.status(200).send(status);
    } catch (err: any) {
      return reply.status(200).send({
        humanTakeoverActive: false,
        aiLocked: false,
        error: err.message,
      });
    }
  });

  fastify.post<{
    Body?: { takenBy?: string; reason?: string };
  }>("/management/computer/take-control", async (request, reply) => {
    try {
      const runnerId = getActiveRunnerId();
      const res = await (rpcService as any).request(runnerId, RunnerRpcMethods.ComputerTakeControl, {
        takenBy: request.body?.takenBy || "Desktop User",
        reason: request.body?.reason || "User initiated human takeover from Nexus Desktop",
      });
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to take control" });
    }
  });

  fastify.post<{
    Body?: { returnedBy?: string; returnNote?: string };
  }>("/management/computer/return-control", async (request, reply) => {
    try {
      const runnerId = getActiveRunnerId();
      const res = await (rpcService as any).request(runnerId, RunnerRpcMethods.ComputerReturnControl, {
        returnedBy: request.body?.returnedBy || "Desktop User",
        returnNote: request.body?.returnNote || "Control returned to AI agent",
      });
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to return control" });
    }
  });

  fastify.get("/management/computer/screenshot", async (_request, reply) => {
    try {
      const runnerId = getActiveRunnerId();
      const res = await (rpcService as any).request(runnerId, RunnerRpcMethods.ComputerScreenSnapshot, {});
      return reply.status(200).send(res);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to capture desktop screenshot" });
    }
  });
};

