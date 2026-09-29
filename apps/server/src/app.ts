import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createLogger, generateManagementToken, type AppConfig } from "@localbridge/shared";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RemoteRpcError,
} from "@localbridge/protocol";
import { initDatabase, type DatabaseConnection } from "./db/index.js";
import { TokenService } from "./db/token-service.js";
import { ConnectionService } from "./db/connection-service.js";
import { AdapterRegistry } from "./adapters/index.js";
import { RunnerRegistry } from "./runner/registry.js";
import { RunnerRpcService } from "./runner/rpc-service.js";
import { ServerProjectService } from "./runner/project-service.js";
import { healthRoutes } from "./routes/health.js";
import { statusRoutes } from "./routes/status.js";
import { runnerWsRoute } from "./routes/runner-ws.js";
import { runnersRoutes } from "./routes/runners.js";
import { projectsRoutes } from "./routes/projects.js";
import { skillsRoutes } from "./routes/skills.js";
import { intelligenceRoutes } from "./routes/intelligence.js";
import { managementRoutes } from "./routes/management.js";
import { mcpRoutes, McpContext, McpRateLimiter } from "./mcp/index.js";
import { IntelligenceRuntime } from "./intelligence/runtime.js";

export interface BuildAppOptions {
  config: AppConfig;
  db?: DatabaseConnection;
  tokenService?: TokenService;
  runnerRegistry?: RunnerRegistry;
  rpcService?: RunnerRpcService;
  projectService?: ServerProjectService;
  mcpContext?: McpContext;
  rateLimiter?: McpRateLimiter;
  intelligenceRuntime?: IntelligenceRuntime;
  migrationsDir?: string;
  enableLogging?: boolean;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export type AppInstance = ReturnType<typeof Fastify>;

export interface BuiltAppResult {
  app: AppInstance;
  db: DatabaseConnection;
  tokenService: TokenService;
  connectionService: ConnectionService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  projectService: ServerProjectService;
  mcpContext: McpContext;
  rateLimiter: McpRateLimiter;
  intelligenceRuntime: IntelligenceRuntime;
  managementSecret: string;
}

export async function buildApp(
  options: BuildAppOptions
): Promise<BuiltAppResult> {
  const { config, migrationsDir, enableLogging = true } = options;

  const logger = createLogger({
    level: enableLogging ? config.logging.level : "silent",
    pretty: config.logging.pretty,
  });

  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: !enableLogging,
    bodyLimit: 50 * 1024 * 1024,
  });

  // CORS
  await app.register(cors, {
    origin: config.server.corsOrigin,
  });

  // Strict Anti-Proxy Defense for Management and Control Plane Routes
  app.addHook("onRequest", async (request, reply) => {
    const rawUrl = request.raw.url || "";
    const pathname = rawUrl.split("?")[0] || "";
    const isProtectedManagementRoute =
      pathname.startsWith("/api/management") ||
      pathname.startsWith("/api/intelligence") ||
      pathname.startsWith("/api/tokens") ||
      pathname.startsWith("/api/approvals") ||
      pathname === "/api/emergency-stop" ||
      pathname === "/api/pause" ||
      pathname.startsWith("/api/projects") ||
      pathname.startsWith("/api/runners") ||
      pathname.startsWith("/api/skills") ||
      pathname.startsWith("/api/status");

    if (isProtectedManagementRoute) {
      const proxyHeaders = [
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
      for (const h of proxyHeaders) {
        if (request.headers[h]) {
          reply.status(403).send({
            error: "Forbidden: 管理接口禁止通过代理访问",
            code: "PROXY_ACCESS_FORBIDDEN",
          });
          return reply;
        }
      }
    }
  });

  // WebSocket support with transport-level maxPayload = 32 MiB (33554432 bytes)
  await app.register(websocket, {
    options: {
      maxPayload: 32 * 1024 * 1024,
    },
  });

  // SQLite database
  const db =
    options.db ?? initDatabase(config.server.dbPath, migrationsDir);

  // Services
  const tokenService = options.tokenService ?? new TokenService(db.db);
  const runnerRegistry =
    options.runnerRegistry ?? new RunnerRegistry(logger);
  const rpcService =
    options.rpcService ?? new RunnerRpcService(runnerRegistry);
  const projectService =
    options.projectService ?? new ServerProjectService(db.db, runnerRegistry);
  const intelligenceRuntime =
    options.intelligenceRuntime ??
    new IntelligenceRuntime(db.db, logger);
  const mcpContext =
    options.mcpContext ??
    new McpContext({
      projectService,
      runnerRegistry,
      rpcService,
      db: db.db,
      logger,
      intelligenceRuntime,
    });
  const rateLimiter = options.rateLimiter ?? new McpRateLimiter();

  // Startup Crash Recovery: mark orphaned running/queued jobs and active runtimes as interrupted in SQLite
  try {
    const now = Date.now();
    db.db
      .prepare(
        `UPDATE jobs SET state = 'interrupted', finished_at = ?, error_code = 'JOB_RUNNER_INTERRUPTED', error_message = 'Job was interrupted due to server restart or crash' WHERE state IN ('running', 'queued')`
      )
      .run(now);

    db.db
      .prepare(
        `UPDATE persistent_runtimes SET state = 'interrupted', stopped_at = ?, last_error_code = 'RUNTIME_SERVER_RESTARTED', last_error = 'Server restarted while runtime was active' WHERE state IN ('starting', 'running', 'stopping')`
      )
      .run(now);
  } catch (err) {
    logger.warn({ err }, "Failed to run startup crash recovery for jobs or persistent_runtimes table");
  }

  // Handle runner disconnect: mark running jobs & runtimes as interrupted, queued jobs as cancelled
  runnerRegistry.onDisconnect((runnerId: string) => {
    try {
      const now = Date.now();
      db.db
        .prepare(
          `UPDATE jobs SET state = 'interrupted', finished_at = ?, error_code = 'JOB_RUNNER_DISCONNECTED', error_message = 'Runner disconnected while job was running' WHERE runner_id = ? AND state = 'running'`
        )
        .run(now, runnerId);

      db.db
        .prepare(
          `UPDATE jobs SET state = 'cancelled', finished_at = ?, error_code = 'JOB_RUNNER_DISCONNECTED', error_message = 'Runner disconnected while job was queued' WHERE runner_id = ? AND state = 'queued'`
        )
        .run(now, runnerId);

      const projects = projectService.listProjects().filter((p) => p.runnerId === runnerId);
      for (const p of projects) {
        db.db
          .prepare(
            `UPDATE persistent_runtimes SET state = 'interrupted', stopped_at = ?, last_error_code = 'RUNTIME_RUNNER_DISCONNECTED', last_error = 'Runner disconnected while runtime was active' WHERE project_id = ? AND state IN ('starting', 'running', 'stopping')`
          )
          .run(now, p.id);
      }
    } catch (err) {
      logger.warn({ err, runnerId }, "Failed to update jobs/runtimes on runner disconnect");
    }
  });

  // Global error handler
  app.setErrorHandler(
    (error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof LocalBridgeError) {
        let status = 400;
        if (error.code === LocalBridgeErrorCode.RUNNER_OFFLINE) status = 404;
        else if (error.code === LocalBridgeErrorCode.RPC_TIMEOUT) status = 504;
        else if (error.code === LocalBridgeErrorCode.RUNNER_BUSY) status = 503;
        else if (error.code === LocalBridgeErrorCode.RUNNER_DISCONNECTED) status = 502;
        return reply.status(status).send(error.toJSON());
      }

      if (error instanceof RemoteRpcError) {
        return reply.status(502).send({
          code: LocalBridgeErrorCode.RPC_REMOTE_ERROR,
          message: error.message,
          details: { remoteCode: error.code, data: error.data },
        });
      }

      const fastifyErr = error as FastifyError;
      if (fastifyErr.validation) {
        return reply.status(400).send({
          code: LocalBridgeErrorCode.INVALID_REQUEST,
          message: fastifyErr.message,
          details: { validation: fastifyErr.validation },
        });
      }

      if (fastifyErr.statusCode) {
        return reply.status(fastifyErr.statusCode).send({
          code: fastifyErr.code ?? LocalBridgeErrorCode.INVALID_REQUEST,
          message: fastifyErr.message,
        });
      }

      app.log.error(error);
      return reply.status(500).send({
        code: LocalBridgeErrorCode.INTERNAL_ERROR,
        message: "An internal server error occurred",
      });
    }
  );

  const managementSecret =
    options.managementSecret ?? generateManagementToken();
  const requireManagementAuth = options.requireManagementAuth ?? false;

  // Register REST API routes
  await app.register(healthRoutes);
  await app.register(statusRoutes, {
    prefix: "/api",
    version: "1.1.0",
    getRunnersConnected: () => runnerRegistry.count(),
    isMcpActive: () => !mcpContext.isPaused(),
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(runnersRoutes, {
    prefix: "/api",
    runnerRegistry,
    rpcService,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(projectsRoutes, {
    prefix: "/api",
    projectService,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(skillsRoutes, {
    prefix: "/api",
    mcpContext,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  await app.register(intelligenceRoutes, {
    prefix: "/api",
    mcpContext,
    tokenService,
    managementSecret,
    requireManagementAuth,
  });
  const connectionService = new ConnectionService(db.db, tokenService);
  const adapterRegistry = new AdapterRegistry(connectionService, mcpContext);

  await app.register(managementRoutes, {
    prefix: "/api",
    tokenService,
    runnerRegistry,
    rpcService,
    projectService,
    mcpContext,
    connectionService,
    adapterRegistry,
    db: db.db,
    managementSecret,
    requireManagementAuth,
  });

  // Register WebSocket route for runner connections
  await app.register(runnerWsRoute, {
    tokenService,
    runnerRegistry,
    projectService,
    db: db.db,
    serverVersion: "1.1.0",
    heartbeatIntervalMs: 15000,
  });

  // Register MCP 2026-07-28 Server Routes
  await app.register(mcpRoutes, {
    tokenService,
    mcpContext,
    rateLimiter,
    managementSecret,
    requireManagementAuth,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "::1",
      config.server.host,
    ],
  });

  // On close hook
  app.addHook("onClose", async () => {
    runnerRegistry.closeAll();
    db.close();
  });

  return {
    app,
    db,
    tokenService,
    connectionService,
    runnerRegistry,
    rpcService,
    projectService,
    mcpContext,
    rateLimiter,
    intelligenceRuntime,
    managementSecret,
  };
}
