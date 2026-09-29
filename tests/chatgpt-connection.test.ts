import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../apps/server/src/db/index.js";
import { TokenService } from "../apps/server/src/db/token-service.js";
import { ConnectionService } from "../apps/server/src/db/connection-service.js";
import { AdapterRegistry } from "../apps/server/src/adapters/index.js";
import { McpContext } from "../apps/server/src/mcp/context.js";
import { ServerProjectService } from "../apps/server/src/runner/project-service.js";
import { RunnerRegistry } from "../apps/server/src/runner/registry.js";
import { RunnerRpcService } from "../apps/server/src/runner/rpc-service.js";
import { createLogger } from "@localbridge/shared";

describe("ChatGPT Dedicated Connection Suite", () => {
  let tmpDir: string;
  let dbConn: any;
  let tokenService: TokenService;
  let connectionService: ConnectionService;
  let adapterRegistry: AdapterRegistry;
  let mcpContext: McpContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-chatgpt-test-"));
    const dbPath = path.join(tmpDir, "test.db");
    const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");
    dbConn = initDatabase(dbPath, migrationsDir);
    tokenService = new TokenService(dbConn.db);
    connectionService = new ConnectionService(dbConn.db, tokenService);

    const logger = createLogger({ level: "silent" });
    const runnerRegistry = new RunnerRegistry(logger);
    const rpcService = new RunnerRpcService(runnerRegistry);
    const projectService = new ServerProjectService(dbConn.db, runnerRegistry);

    mcpContext = new McpContext({
      projectService,
      runnerRegistry,
      rpcService,
      db: dbConn.db,
      logger,
    });

    adapterRegistry = new AdapterRegistry(connectionService, mcpContext);
  });

  afterEach(() => {
    try {
      dbConn?.db?.close();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("exclusively seeds conn_chatgpt as the sole AI connection in database", () => {
    const connections = connectionService.listConnections();
    expect(connections.length).toBe(1);

    const chatgpt = connections[0];
    expect(chatgpt.id).toBe("conn_chatgpt");
    expect(chatgpt.clientType).toBe("chatgpt");
    expect(chatgpt.name).toBe("ChatGPT");
    expect(chatgpt.isPrimary).toBe(true);
    expect(chatgpt.category).toBe("native-mcp");
    expect(chatgpt.transport).toBe("tunnel");
    expect(chatgpt.endpoint).toBe("https://tunnel.localbridge.dev");
  });

  it("rotates token for ChatGPT and generates valid lb_ token with requested scopes", () => {
    const rotateRes = connectionService.createOrRotateToken("conn_chatgpt", ["read", "write", "execute"]);
    expect(rotateRes.token).toBeDefined();
    expect(rotateRes.token.startsWith("lb_")).toBe(true);
    expect(rotateRes.token.startsWith("lb_kimi_")).toBe(false);
    expect(rotateRes.tokenId).toBeDefined();

    // Verify token validation in TokenService
    const validation = tokenService.validateMcpToken(rotateRes.token);
    expect(validation.valid).toBe(true);
    expect(validation.tokenRecord?.type).toBe("mcp");

    const scopes = JSON.parse(validation.tokenRecord?.scopes || "[]");
    expect(scopes).toEqual(["read", "write", "execute"]);

    // Verify connection record updated
    const conn = connectionService.getConnection("conn_chatgpt");
    expect(conn?.tokenId).toBe(rotateRes.tokenId);
    expect(conn?.scopes).toEqual(["read", "write", "execute"]);
    expect(conn?.status).toBe("configured");
  });

  it("exclusively registers ChatGPTConnectorAdapter in AdapterRegistry with 332 tools", async () => {
    const adapters = adapterRegistry.getAll();
    expect(adapters.length).toBe(1);
    expect(adapters[0].id).toBe("conn_chatgpt");
    expect(adapters[0].clientType).toBe("chatgpt");

    // Non-ChatGPT adapters must not exist
    expect(adapterRegistry.getAdapter("conn_kimi")).toBeNull();
    expect(adapterRegistry.getAdapter("conn_claude")).toBeNull();
    expect(adapterRegistry.getAdapter("conn_deepseek")).toBeNull();

    // Check adapter health & tool count
    const adapter = adapterRegistry.getAdapter("conn_chatgpt");
    expect(adapter).not.toBeNull();
    const health = await adapter!.getHealth();
    expect(health.id).toBe("conn_chatgpt");
    expect(health.toolCount).toBe(332);

    // Test connection
    const testRes = await adapter!.testConnection();
    expect(testRes.success).toBe(true);
    expect(testRes.toolCount).toBe(332);
  });

  it("tracks interaction and error states accurately", async () => {
    connectionService.recordInteraction("conn_chatgpt");
    const conn = connectionService.getConnection("conn_chatgpt");
    expect(conn?.status).toBe("connected");
    expect(conn?.lastSeenAt).toBeDefined();
    expect(conn?.lastSeenAt).toBeGreaterThan(0);

    connectionService.updateStatus("conn_chatgpt", "error", "Tunnel disconnected");
    const connErr = connectionService.getConnection("conn_chatgpt");
    expect(connErr?.status).toBe("error");
    expect(connErr?.lastError).toBe("Tunnel disconnected");
  });
});
