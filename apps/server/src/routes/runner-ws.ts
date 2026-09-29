import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "ws";
import {
  PROTOCOL_VERSION,
  RunnerMethod,
  RunnerRpcMethods,
  RunnerHelloRequestSchema,
  type RunnerHelloRequestParams,
  type JsonRpcRequest,
} from "@localbridge/protocol";
import { MCP_TOKEN_PREFIX } from "@localbridge/shared";
import type { TokenService } from "../db/token-service.js";
import { type RunnerRegistry, ActiveRunnerConnection } from "../runner/registry.js";
import type { ServerProjectService } from "../runner/project-service.js";
import type { TokenRow } from "../db/schema.js";
import type Database from "better-sqlite3";

export interface RunnerWsOptions {
  tokenService: TokenService;
  runnerRegistry: RunnerRegistry;
  db: Database.Database;
  projectService?: ServerProjectService;
  serverVersion?: string;
  heartbeatIntervalMs?: number;
}

// Augment FastifyRequest to carry verified token record
declare module "fastify" {
  interface FastifyRequest {
    runnerTokenRecord?: TokenRow;
  }
}

export const runnerWsRoute: FastifyPluginAsync<RunnerWsOptions> = async (
  fastify,
  options
) => {
  const {
    tokenService,
    runnerRegistry,
    db,
    serverVersion = "0.2.0",
    heartbeatIntervalMs = 15000,
  } = options;

  fastify.get(
    "/runner/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        // 1. Extract token strictly from Authorization: Bearer header (no URL query token allowed)
        const authHeader = request.headers.authorization;
        let token: string | undefined;

        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7).trim();
        }

        if (!token) {
          fastify.log.warn(
            { event: "runner_auth_failed", reason: "missing_token" },
            "Runner connection rejected: Missing authorization token"
          );
          return reply.status(401).send({
            code: "UNAUTHORIZED",
            message: "Missing runner authorization token",
          });
        }

        // 2. Reject MCP client tokens and Management tokens explicitly
        if (token.startsWith(MCP_TOKEN_PREFIX) || token.startsWith("lm_")) {
          fastify.log.warn(
            { event: "runner_auth_failed", reason: "invalid_token_type" },
            "Runner connection rejected: MCP or Management token cannot be used for runner authentication"
          );
          return reply.status(403).send({
            code: "INVALID_TOKEN_TYPE",
            message: "MCP or Management token cannot be used to authenticate runner daemon",
          });
        }

        // 3. Validate runner token against database
        const validation = tokenService.validateRunnerToken(token);
        if (!validation.valid || !validation.tokenRecord) {
          fastify.log.warn(
            { event: "runner_auth_failed", reason: validation.reason },
            `Runner connection rejected: ${validation.reason}`
          );
          return reply.status(401).send({
            code: "UNAUTHORIZED",
            message: `Runner authentication failed: ${validation.reason}`,
          });
        }

        fastify.log.info(
          {
            event: "runner_auth_success",
            tokenId: validation.tokenRecord.id,
          },
          "Runner token authenticated successfully"
        );

        request.runnerTokenRecord = validation.tokenRecord;
      },
    },
    (connection, request) => {
      const socket = connection as unknown as WebSocket;
      const tokenRecord = request.runnerTokenRecord!;

      fastify.log.info(
        {
          event: "runner_connected",
          tokenId: tokenRecord.id,
        },
        "Runner WebSocket connection established, awaiting handshake"
      );

      let handshaked = false;
      let activeRunnerId: string | null = null;
      let pingTimer: NodeJS.Timeout | null = null;
      let missedPings = 0;

      // 1. Handshake Timeout Guard (10 seconds)
      const handshakeTimer = setTimeout(() => {
        if (!handshaked) {
          fastify.log.warn(
            { event: "runner_handshake_timeout", tokenId: tokenRecord.id },
            "Runner failed to handshake within timeout, closing socket"
          );
          socket.close(4002, "handshake_timeout");
        }
      }, 10000);

      // Handle socket incoming messages
      socket.on("message", (data: Buffer | string) => {
        try {
          const text = typeof data === "string" ? data : data.toString("utf-8");
          const parsed = JSON.parse(text) as JsonRpcRequest<Record<string, unknown>>;

          if (!handshaked) {
            // Must be runner.hello
            if (parsed.method !== RunnerMethod.RUNNER_HELLO) {
              fastify.log.warn(
                { event: "runner_unexpected_method", method: parsed.method },
                `Expected ${RunnerMethod.RUNNER_HELLO}, received ${parsed.method}`
              );
              socket.close(4002, "handshake_required");
              return;
            }

            const validation = RunnerHelloRequestSchema.safeParse(parsed.params);
            if (!validation.success) {
              fastify.log.warn(
                {
                  event: "runner_malformed_hello",
                  errors: validation.error.flatten(),
                },
                "Malformed runner.hello payload"
              );
              socket.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: parsed.id ?? null,
                  error: {
                    code: -32602,
                    message: "Invalid runner.hello parameters",
                    data: validation.error.flatten(),
                  },
                })
              );
              socket.close(4002, "malformed_hello");
              return;
            }

            const helloParams: RunnerHelloRequestParams = validation.data;

            // Check protocol version compatibility
            if (helloParams.protocolVersion !== PROTOCOL_VERSION) {
              fastify.log.warn(
                {
                  event: "runner_protocol_mismatch",
                  clientVersion: helloParams.protocolVersion,
                  serverVersion: PROTOCOL_VERSION,
                },
                `Runner protocol version mismatch: client ${helloParams.protocolVersion} vs server ${PROTOCOL_VERSION}`
              );

              socket.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: parsed.id ?? null,
                  error: {
                    code: -32602,
                    message: `Unsupported protocol version: ${helloParams.protocolVersion}. Server expects ${PROTOCOL_VERSION}`,
                    data: { code: "PROTOCOL_VERSION_UNSUPPORTED" },
                  },
                })
              );
              socket.close(4002, "protocol_version_unsupported");
              return;
            }

            // Handshake succeeded
            clearTimeout(handshakeTimer);
            handshaked = true;
            activeRunnerId = helloParams.runnerId;

            // Update database record for this runner
            const now = Date.now();
            try {
              db.prepare(
                `INSERT INTO runners (
                   id, device_name, platform, version, allowed_roots, capabilities, system_info, status, last_seen_at, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   device_name = excluded.device_name,
                   platform = excluded.platform,
                   version = excluded.version,
                   capabilities = excluded.capabilities,
                   system_info = excluded.system_info,
                   status = 'online',
                   last_seen_at = excluded.last_seen_at`
              ).run(
                helloParams.runnerId,
                helloParams.name,
                helloParams.system.platform,
                helloParams.runnerVersion,
                JSON.stringify([]),
                JSON.stringify(helloParams.capabilities),
                JSON.stringify(helloParams.system),
                now,
                now
              );
            } catch (dbErr) {
              fastify.log.error(dbErr, "Failed to persist runner metadata to database");
            }

            // Register with in-memory RunnerRegistry
            const activeConn = new ActiveRunnerConnection({
              runnerId: helloParams.runnerId,
              name: helloParams.name,
              socket,
              tokenRecord,
              platform: helloParams.system.platform,
              arch: helloParams.system.arch,
              version: helloParams.runnerVersion,
              protocolVersion: helloParams.protocolVersion,
              capabilities: helloParams.capabilities,
              systemInfo: helloParams.system,
              connectedAt: now,
              lastSeenAt: now,
              missedPings: 0,
              logger: fastify.log,
              isTokenActive: () => tokenService.isTokenActive(tokenRecord.id, "runner"),
            });
            runnerRegistry.register(activeConn);

            // Respond with handshake confirmation
            socket.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: parsed.id,
                result: {
                  accepted: true,
                  serverVersion,
                  protocolVersion: PROTOCOL_VERSION,
                  heartbeatIntervalMs,
                },
              })
            );

            // Auto-sync runner's authorized projects if projectService is available
            if (options.projectService) {
              const projectService = options.projectService;
              activeConn
                .request(RunnerRpcMethods.ProjectList, {})
                .then((projects) => {
                  const list = Array.isArray(projects) ? projects : [];
                  projectService.syncRunnerProjects(helloParams.runnerId, list);
                  fastify.log.info(
                    {
                      event: "runner_projects_synced",
                      runnerId: helloParams.runnerId,
                      projectCount: list.length,
                    },
                    `Synced ${list.length} projects for runner "${helloParams.runnerId}"`
                  );
                })
                .catch((err) => {
                  fastify.log.warn(
                    {
                      event: "runner_projects_sync_failed",
                      runnerId: helloParams.runnerId,
                      err,
                    },
                    `Failed to sync projects for runner "${helloParams.runnerId}"`
                  );
                });

              // Sync current approval routing mode to the connected runner
              const currentRoutingMode = projectService.getApprovalRoutingMode();
              activeConn
                .request(RunnerRpcMethods.ApprovalSetMode, { mode: currentRoutingMode })
                .catch((err) => {
                  fastify.log.warn(
                    {
                      event: "runner_approval_mode_sync_failed",
                      runnerId: helloParams.runnerId,
                      err,
                    },
                    `Failed to sync approval mode to runner "${helloParams.runnerId}"`
                  );
                });

              // Sync current safety layer status to the connected runner
              const safetyLayerDisabled = projectService.getSafetyLayerDisabled();
              const securityMode = projectService.getSecurityMode();
              activeConn
                .request(RunnerRpcMethods.SafetyLayerSetStatus, {
                  disabled: safetyLayerDisabled,
                  mode: securityMode,
                })
                .catch((err) => {
                  fastify.log.warn(
                    {
                      event: "runner_safety_layer_sync_failed",
                      runnerId: helloParams.runnerId,
                      err,
                    },
                    `Failed to sync safety layer mode to runner "${helloParams.runnerId}"`
                  );
                });
            }

            // Start heartbeat ping cycle
            pingTimer = setInterval(() => {
              if (!tokenService.isTokenActive(tokenRecord.id, "runner")) {
                fastify.log.warn(
                  { event: "runner_token_inactive", runnerId: activeRunnerId, tokenId: tokenRecord.id },
                  "Closing runner connection because its token was revoked or expired"
                );
                socket.close(4003, "runner_token_inactive");
                return;
              }
              if (missedPings >= 3) {
                fastify.log.warn(
                  { event: "runner_heartbeat_timeout", runnerId: activeRunnerId },
                  `Runner "${activeRunnerId}" missed 3 pings, terminating connection`
                );
                socket.terminate();
                return;
              }

              missedPings++;
              try {
                socket.ping();
              } catch {
                socket.terminate();
              }
            }, heartbeatIntervalMs);

            return;
          }

          // Subsequent messages handling (e.g. RPC responses)
          if (activeRunnerId) {
            const runner = runnerRegistry.get(activeRunnerId);
            if (runner) {
              runner.lastSeenAt = Date.now();
              runner.handleIncomingMessage(data);
            }
          }
        } catch (err) {
          fastify.log.error(err, "Failed to process message from runner");
        }
      });

      // On Pong received from runner
      socket.on("pong", () => {
        missedPings = 0;
        if (activeRunnerId) {
          const runner = runnerRegistry.get(activeRunnerId);
          if (runner) {
            runner.lastSeenAt = Date.now();
            runner.missedPings = 0;
          }
        }
      });

      // On close
      socket.on("close", (code: number, reason: Buffer) => {
        clearTimeout(handshakeTimer);
        if (pingTimer) clearInterval(pingTimer);

        if (activeRunnerId) {
          runnerRegistry.unregister(activeRunnerId, socket);

          // Update runner status in database
          try {
            if (db.open) {
              db.prepare(
                "UPDATE runners SET status = 'offline', last_seen_at = ? WHERE id = ?"
              ).run(Date.now(), activeRunnerId);
            }
          } catch {
            // Ignore during shutdown
          }
        }

        fastify.log.info(
          {
            event: "runner_socket_closed",
            runnerId: activeRunnerId,
            code,
            reason: reason.toString("utf-8"),
          },
          `Runner connection closed (code: ${code})`
        );
      });

      // On error
      socket.on("error", (err: Error) => {
        fastify.log.error(
          { err, runnerId: activeRunnerId },
          "Runner socket encounter error"
        );
      });
    }
  );
};
