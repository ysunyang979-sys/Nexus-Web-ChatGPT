import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { MCP_PROTOCOL_VERSION } from "../apps/server/src/mcp/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - MCP Protocol Compliance & Transport Hardening", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-proto-"));
    dbFilePath = path.join(tmpDir, "mcp-proto.db");

    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverInstance = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });

    await serverInstance.app.listen({ port: 0, host: "127.0.0.1" });
    serverPort = (serverInstance.app.server.address() as any).port;

    const createdMcp = serverInstance.tokenService.createToken({
      name: "mcp-protocol-test",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = createdMcp.token;
  });

  afterAll(async () => {
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  async function postMcp(body: any, headers: Record<string, string> = {}) {
    return fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        connection: "close",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("GET /api/mcp/status returns MCP metadata on loopback", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/mcp/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      mcpActive: true,
      paused: false,
      version: "1.1.0",
      protocolVersion: "2026-07-28",
      toolsCount: 332,
    });
  });

  it("rejects non-POST HTTP methods on /mcp with 405 Method Not Allowed", async () => {
    const getRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "GET",
      headers: { authorization: `Bearer ${mcpToken}` },
    });
    expect(getRes.status).toBe(405);
    const getBody = await getRes.json();
    expect(getBody.error.message).toContain("Method Not Allowed");

    const delRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${mcpToken}` },
    });
    expect(delRes.status).toBe(405);

    const putRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "PUT",
      headers: { authorization: `Bearer ${mcpToken}` },
    });
    expect(putRes.status).toBe(405);
  });

  it("enforces DNS rebinding protection: rejects unauthorized Host header with 403", async () => {
    const http = await import("node:http");
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const res = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: serverPort,
          path: "/mcp",
          method: "POST",
          agent: false,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            Host: "evil-rebinding-attacker.com",
            Authorization: `Bearer ${mcpToken}`,
            Connection: "close",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    expect(res.statusCode).toBe(403);
    const data = JSON.parse(res.body);
    expect(data.code).toBe("HOST_NOT_ALLOWED");
  });

  it("accepts valid MCP-Protocol-Version: 2026-07-28 header", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "p1", method: "tools/list", params: {} },
      { "mcp-protocol-version": MCP_PROTOCOL_VERSION }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("localbridge_project_list");
  });

  it("rejects unsupported MCP-Protocol-Version header with 400", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "p2", method: "tools/list", params: {} },
      { "mcp-protocol-version": "2024-11-05" }
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain("Unsupported MCP protocol version");
    expect(data.error.message).toContain("2026-07-28");
  });

  it("accepts matching Mcp-Method header", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "m1", method: "tools/list", params: {} },
      { "mcp-method": "tools/list" }
    );
    expect(res.status).toBe(200);
    await res.text();
  });

  it("rejects mismatched Mcp-Method header with 400", async () => {
    const res = await postMcp(
      { jsonrpc: "2.0", id: "m2", method: "tools/list", params: {} },
      { "mcp-method": "tools/call" }
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('Header Mcp-Method "tools/call" does not match');
  });

  it("accepts matching Mcp-Name header on tools/call", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "n1",
        method: "tools/call",
        params: { name: "localbridge_project_list", arguments: {} },
      },
      {
        "mcp-method": "tools/call",
        "mcp-name": "localbridge_project_list",
      }
    );
    expect(res.status).toBe(200);
    await res.text();
  });

  it("rejects mismatched Mcp-Name header on tools/call with 400", async () => {
    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: "n2",
        method: "tools/call",
        params: { name: "localbridge_project_list", arguments: {} },
      },
      {
        "mcp-method": "tools/call",
        "mcp-name": "localbridge_file_read",
      }
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('Header Mcp-Name "localbridge_file_read" does not match tool name');
  });

  it("enforces 1 MiB body size limit", async () => {
    // Large payload > 1 MiB
    const largePadding = "x".repeat(1024 * 1024 + 100);
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "oversized",
        method: "tools/list",
        params: { padding: largePadding },
      }),
    });

    // Fastify returns 413 on payload too large
    expect([413]).toContain(res.status);
    await res.text();
  });
});
