import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { TokenService } from "../db/token-service.js";
import { McpContext, mcpExecutionContext } from "./context.js";
import { createLocalBridgeMcpServer } from "./server.js";
import { McpRateLimiter } from "./rate-limiter.js";
import {
  MAX_MCP_BODY_BYTES,
  MCP_PROTOCOL_VERSION,
  type McpPrincipal,
} from "./types.js";
import { hasToolScope, requiredScopeForTool } from "./scope-policy.js";
import { checkLoopbackAndSecurity } from "../routes/management.js";
import { readActiveTunnelHostFromDisk } from "../auth/origin-resolver.js";

export interface McpRoutesOptions {
  tokenService: TokenService;
  mcpContext: McpContext;
  rateLimiter?: McpRateLimiter;
  allowedHosts?: string[];
  activeTunnelHost?: string;
  managementSecret?: string;
  requireManagementAuth?: boolean;
}

export const mcpRoutes: FastifyPluginAsync<McpRoutesOptions> = async (
  fastify,
  options
) => {
  const { tokenService, mcpContext } = options;
  const rateLimiter = options.rateLimiter ?? new McpRateLimiter();
  const allowedHosts = options.allowedHosts ?? [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "::1",
  ];

  const globalMcpServer = createLocalBridgeMcpServer(mcpContext);
  (fastify as any).globalMcpServer = globalMcpServer;
  const mcpServerPool = [globalMcpServer];

  function getActiveTunnelHost(): string | null {
    if (options.activeTunnelHost) {
      const clean = options.activeTunnelHost
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .replace(/:\d+$/, "")
        .toLowerCase();
      if (clean && !clean.includes("127.0.0.1") && !clean.includes("localhost")) {
        return clean;
      }
    }
    const envHost = process.env.NEXUS_PUBLIC_HOST || process.env.LOCALBRIDGE_TUNNEL_HOST;
    if (envHost) {
      const clean = envHost
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .replace(/:\d+$/, "")
        .toLowerCase();
      if (clean && !clean.includes("127.0.0.1") && !clean.includes("localhost")) {
        return clean;
      }
    }
    const diskHost = readActiveTunnelHostFromDisk();
    if (diskHost) {
      const clean = diskHost
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .replace(/:\d+$/, "")
        .toLowerCase();
      if (clean && !clean.includes("127.0.0.1") && !clean.includes("localhost")) {
        return clean;
      }
    }
    return null;
  }

  // Helper to validate Host header for DNS rebinding protection
  function isHostAllowed(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    // Strip port if present
    const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
    if (
      allowedHosts.some(
        (h) => h.toLowerCase() === hostname || hostname === `[${h.toLowerCase()}]`
      )
    ) {
      return true;
    }
    // Allow legitimate Nexus static domains
    if (
      hostname === "localbridge.dev" ||
      hostname.endsWith(".localbridge.dev")
    ) {
      return true;
    }
    // Strict Tunnel Host Check: Only allow the specific active tunnel host.
    // Wildcard *.trycloudflare.com is strictly disallowed.
    const activeHost = getActiveTunnelHost();
    if (activeHost && hostname === activeHost) {
      return true;
    }
    return false;
  }

  // 1. Loopback-only MCP Status Endpoint
  fastify.get("/api/mcp/status", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkLoopbackAndSecurity(request, reply, {
      tokenService,
      managementSecret: options.managementSecret,
      requireManagementAuth: options.requireManagementAuth,
    })) return reply;

    return reply.status(200).send({
      mcpActive: !mcpContext.isPaused(),
      paused: mcpContext.isPaused(),
      version: "1.1.0",
      protocolVersion: MCP_PROTOCOL_VERSION,
      toolsCount: mcpContext.getRegisteredToolsCount(),
    });
  });

  // 2. Handle /mcp probes and non-POST HTTP methods
  fastify.route({
    method: ["GET", "DELETE", "PUT", "PATCH"],
    url: "/mcp",
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === "GET" && !request.headers.authorization) {
        reply.header(
          "WWW-Authenticate",
          'Bearer realm="Nexus", error="invalid_token", error_description="Bearer token required"'
        );
        return reply.status(401).send({
          error: "Unauthorized: Missing Bearer token in Authorization header",
          code: "MISSING_TOKEN",
        });
      }

      return reply.status(405).send({
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: "Method Not Allowed: MCP endpoint requires HTTP POST",
        },
        id: null,
      });
    },
  });

  // 3. MCP 2026-07-28 POST Endpoint
  fastify.post(
    "/mcp",
    {
      bodyLimit: MAX_MCP_BODY_BYTES,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 3.0 Global Pause Check
      if (mcpContext.isPaused()) {
        const bodyId =
          typeof request.body === "object" &&
          request.body !== null &&
          !Array.isArray(request.body)
            ? (request.body as Record<string, any>).id ?? null
            : null;

        const requestBody =
          typeof request.body === "object" &&
          request.body !== null &&
          !Array.isArray(request.body)
            ? (request.body as Record<string, any>)
            : undefined;

        const isPauseExemptTool =
          requestBody?.method === "tools/call" &&
          typeof requestBody?.params?.name === "string" &&
          [
            "localbridge_runtime_stop",
            "localbridge_runtime_status",
            "localbridge_runtime_logs",
            "localbridge_job_cancel",
            "localbridge_job_status",
            "localbridge_job_logs",
          ].includes(requestBody.params.name);

        if (!isPauseExemptTool) {
          return reply.status(503).send({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "LocalBridge AI access is paused by local user",
            },
            id: bodyId,
          });
        }
      }

      // 3.1 DNS Rebinding Protection: Host Header Validation
      const host = request.headers.host;
      if (!isHostAllowed(host)) {
        return reply.status(403).send({
          error: "Forbidden: Host header validation failed",
          code: "HOST_NOT_ALLOWED",
        });
      }

      // 3.2 Request Body Size Check
      const contentLengthHeader = request.headers["content-length"];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (contentLength > MAX_MCP_BODY_BYTES) {
          return reply.status(413).send({
            error: `Payload Too Large: Request exceeds limit of ${MAX_MCP_BODY_BYTES} bytes`,
            code: "MCP_BODY_TOO_LARGE",
          });
        }
      }

      // 3.3 Protocol Version Header Check (if present, must match 2026-07-28)
      const protocolVersionHeader = request.headers["mcp-protocol-version"];
      if (
        protocolVersionHeader &&
        protocolVersionHeader !== MCP_PROTOCOL_VERSION
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Unsupported MCP protocol version: expected ${MCP_PROTOCOL_VERSION}, got ${protocolVersionHeader}`,
          },
          id: null,
        });
      }

      const body =
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, any>)
          : undefined;

      // Ensure modern 2026-07-28 envelope metadata exists on body params so wire codec resolves request
      if (body) {
        if (!body.params || typeof body.params !== "object") {
          body.params = {};
        }
        if (!body.params._meta) {
          body.params._meta = {
            "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
          };
        }
      }

      // 3.4 Mcp-Method Header Check (if present, must match JSON-RPC method)
      const mcpMethodHeader = request.headers["mcp-method"];
      if (
        mcpMethodHeader &&
        body?.method &&
        mcpMethodHeader !== body.method
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Header Mcp-Method "${mcpMethodHeader}" does not match request body method "${body.method}"`,
          },
          id: body?.id ?? null,
        });
      }

      // 3.5 Mcp-Name Header Check for tools/call (if present, must match params.name)
      const mcpNameHeader = request.headers["mcp-name"];
      if (
        mcpNameHeader &&
        body?.method === "tools/call" &&
        body?.params?.name &&
        mcpNameHeader !== body.params.name
      ) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: `Header Mcp-Name "${mcpNameHeader}" does not match tool name "${body.params.name}"`,
          },
          id: body?.id ?? null,
        });
      }

      // 3.6 Bearer Token Authentication & Cross-Token Isolation
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.header(
          "WWW-Authenticate",
          'Bearer realm="Nexus", error="invalid_token", error_description="Bearer token required"'
        );
        return reply.status(401).send({
          error: "Unauthorized: Missing Bearer token in Authorization header",
          code: "MISSING_TOKEN",
        });
      }

      const rawToken = authHeader.slice(7).trim();
      const validation = tokenService.validateMcpToken(rawToken);
      if (!validation.valid) {
        let code = "TOKEN_NOT_FOUND";
        if (validation.reason === "INVALID_TOKEN_TYPE") {
          code = "INVALID_TOKEN_TYPE";
        } else if (validation.reason === "TOKEN_REVOKED") {
          code = "TOKEN_REVOKED";
        } else if (validation.reason === "TOKEN_EXPIRED") {
          code = "TOKEN_EXPIRED";
        }
        reply.header(
          "WWW-Authenticate",
          `Bearer realm="Nexus", error="invalid_token", error_description="${validation.reason || "Invalid token"}"`
        );
        return reply.status(401).send({
          error: `Unauthorized: ${validation.reason ?? "Invalid token"}`,
          code,
        });
      }

      const tokenRecord = validation.tokenRecord!;
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(tokenRecord.scopes || "[]");
      } catch {
        scopes = [];
      }

      // Check Full Control active session for this client
      let fullControlSession = mcpContext.fullControlService.getActiveSession(tokenRecord.id);
      if (!fullControlSession && mcpContext.db) {
        try {
          const conn = mcpContext.db
            .prepare("SELECT id, client_type FROM ai_connections WHERE token_id = ?")
            .get(tokenRecord.id) as { id: string; client_type: string } | undefined;
          if (conn) {
            fullControlSession =
              mcpContext.fullControlService.getActiveSession(conn.id) ||
              mcpContext.fullControlService.getActiveSession(conn.client_type);
          }
        } catch {}
      }
      if (!fullControlSession) {
        const isKimi =
          tokenRecord.name?.toLowerCase().includes("kimi") ||
          tokenRecord.id.includes("kimi");
        const fallbackClientType = isKimi ? "kimi-web" : "chatgpt";
        fullControlSession = mcpContext.fullControlService.getActiveSession(fallbackClientType);
      }

      if (fullControlSession) {
        // Dynamically elevate scopes for this active session without mutating stored DB record
        scopes = Array.from(
          new Set([...scopes, "read", "write", "execute", "delete", "filesystem-full"])
        );
      }

      const principal: McpPrincipal = {
        id: tokenRecord.id,
        authType: "localbridge-token",
        scopes,
        tokenId: tokenRecord.id,
      };

      // Scope authorization is deliberately centralized before MCP dispatch so
      // no tool implementation can accidentally bypass it. Scopes are exact:
      // execute never implies write, and an empty scope set permits no tool.
      if (body?.method === "tools/call") {
        const toolName = body.params?.name;
        const requiredScope =
          typeof toolName === "string" ? requiredScopeForTool(toolName) : undefined;
        if (!requiredScope || !hasToolScope(principal.scopes, toolName)) {
          return reply.status(403).send({
            jsonrpc: "2.0",
            error: {
              code: -32003,
              message: requiredScope
                ? `Forbidden: tool "${toolName}" requires scope "${requiredScope}"`
                : "Forbidden: unknown tool has no authorized scope mapping",
              data: { code: "MCP_SCOPE_DENIED", requiredScope },
            },
            id: body.id ?? null,
          });
        }

        const isChatGPT =
          tokenRecord.purpose === "chatgpt" ||
          principal.scopes.includes("purpose:chatgpt") ||
          principal.scopes.includes("chat:direct-approve");
        const isKimi =
          tokenRecord.purpose === "kimi" ||
          principal.scopes.includes("purpose:kimi") ||
          tokenRecord.name?.toLowerCase().includes("kimi") ||
          tokenRecord.id.includes("kimi");
        const clientType = isChatGPT ? "chatgpt" : isKimi ? "kimi-web" : "unknown";
        const clientDisplayName = isChatGPT
          ? tokenRecord.name?.startsWith("AI Client: ")
            ? tokenRecord.name.slice(11)
            : tokenRecord.name || "ChatGPT"
          : isKimi
          ? "Kimi Web"
          : tokenRecord.name || "AI Client";

        if (fullControlSession && body.params) {
          if (!body.params.arguments || typeof body.params.arguments !== "object") {
            body.params.arguments = {};
          }
          body.params.arguments.sessionId = fullControlSession.id;
          body.params.arguments.isFullControl = true;
          body.params.arguments.isDeviceScope = fullControlSession.scope === "device";
        }

        // Automated Advisory Pipeline: Mutating/executing operations query Laya advisory
        // Safe read operations bypass inference to preserve peak performance
        if (
          (requiredScope === "write" || requiredScope === "execute") &&
          mcpContext.getIntelligenceStatus().status !== "disabled"
        ) {
          try {
            const rawArgs = body.params?.arguments || {};
            await mcpContext.getDecisionAdvice({
              operation: toolName,
              toolName,
              projectId: rawArgs.projectId,
              target: rawArgs.path || rawArgs.relativePath || rawArgs.target,
              command: rawArgs.command || (rawArgs.args ? rawArgs.args.join(" ") : undefined),
              source: "chatgpt",
            });
          } catch {
            // Advisory failure must never block or alter policy execution
          }
        }

        mcpContext.logAudit("mcp_tool_started", {
          principal,
          toolName,
          clientId: tokenRecord.id,
          clientType,
          clientName: clientDisplayName,
          actorDisplayName: clientDisplayName,
        });
      }

      // 3.7 Rate Limiting & Concurrency Tracking
      const rateLimitResult = rateLimiter.acquire(principal.id);
      if (!rateLimitResult.allowed) {
        return reply.status(429).send({
          error: `Too Many Requests: ${rateLimitResult.reason}`,
          code: "MCP_RATE_LIMITED",
          reason: rateLimitResult.reason,
        });
      }

      // 3.8 Ensure Accept Header accommodates both application/json and text/event-stream
      const currentAccept = request.raw.headers.accept ?? "";
      if (
        !currentAccept ||
        currentAccept === "*/*" ||
        !currentAccept.includes("application/json") ||
        !currentAccept.includes("text/event-stream")
      ) {
        request.raw.headers.accept = "application/json, text/event-stream";
      }

      // 3.9 Create fresh stateless McpServer and Transport for this request
      const callerPurpose: string | undefined =
        tokenRecord.purpose === "chatgpt" ||
        principal.scopes.includes("purpose:chatgpt") ||
        principal.scopes.includes("chat:direct-approve")
          ? "chatgpt"
          : undefined;

      const headerTaskId = (request.raw.headers["x-nexus-task-id"] || request.raw.headers["x-task-id"]) as string | undefined;
      const headerExecutionId = (request.raw.headers["x-nexus-execution-id"] || request.raw.headers["x-execution-id"]) as string | undefined;
      const headerSessionId = (request.raw.headers["x-nexus-session-id"] || request.raw.headers["x-session-id"]) as string | undefined;
      const headerIdempotencyKey = (request.raw.headers["x-nexus-idempotency-key"] || request.raw.headers["x-idempotency-key"]) as string | undefined;

      const runWithContext = async () => {
        const server = mcpServerPool.pop() ?? createLocalBridgeMcpServer(mcpContext);
        const transport = new NodeStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          supportedProtocolVersions: [MCP_PROTOCOL_VERSION],
        });

        let released = false;
        const releaseSlot = () => {
          if (!released) {
            released = true;
            rateLimiter.release(principal.id);
          }
        };

        let cleanedUp = false;
        const cleanup = () => {
          if (!cleanedUp) {
            cleanedUp = true;
            releaseSlot();
            transport
              .close()
              .catch(() => {})
              .finally(() => {
                if (mcpServerPool.length < 64) {
                  mcpServerPool.push(server);
                }
              });
          }
        };

        reply.raw.on("finish", cleanup);
        reply.raw.on("close", cleanup);

        try {
          reply.hijack();
          await server.connect(transport);
          await transport.handleRequest(request.raw, reply.raw, request.body);
        } catch (err) {
          cleanup();
          throw err;
        }
      };

      await mcpExecutionContext.run({
        taskId: headerTaskId,
        executionId: headerExecutionId,
        sessionId: headerSessionId,
        idempotencyKey: headerIdempotencyKey,
        callerPurpose: callerPurpose,
      }, runWithContext);
    }
  );
};
