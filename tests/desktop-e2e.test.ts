import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 11: End-to-End Desktop Management & AI Access Lifecycle", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let serverPort: number;
  let projectDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-desktop-e2e-"));
    dbFilePath = path.join(tmpDir, "e2e.db");
    projectDir = path.join(tmpDir, "workspace-project");
    fs.mkdirSync(projectDir, { recursive: true });

    serverPort = 19183;
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: serverPort, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.listen({ port: serverPort, host: "127.0.0.1" });

    // Bootstrap runner token
    const tok = result.tokenService.createToken({
      name: "e2e-runner",
      type: "runner",
    });
    runnerToken = tok.token;

    // Start local runner
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "e2e-local-runner",
        projectsPath: path.join(tmpDir, "projects.json"),
        statePath: path.join(tmpDir, "runner-state.json"),
        heartbeatIntervalMs: 5000,
        logging: { level: "silent", pretty: false },
        reconnect: {
          enabled: true,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          factor: 2,
          jitter: 0.1,
        },
      },
      silentLogger
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 600));
  });

  afterAll(async () => {
    await runner?.stop();
    await app?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("walks through complete user journey from token creation to emergency stop", async () => {
    // 1. User opens Desktop app -> Creates an MCP Bearer token
    const createTokenRes = await app.inject({
      method: "POST",
      url: "/api/tokens",
      payload: {
        name: "Claude Desktop E2E",
        type: "mcp",
        scopes: ["read", "write", "execute"],
      },
    });
    expect(createTokenRes.statusCode).toBe(201);
    const tokenRecord = JSON.parse(createTokenRes.body);
    const mcpToken = tokenRecord.token;
    expect(mcpToken).toMatch(/^lb_[0-9a-f]{64}$/);

    // 2. User authorizes a local directory
    const authorizeRes = await app.inject({
      method: "POST",
      url: "/api/management/projects/authorize",
      payload: {
        path: projectDir,
        name: "My App",
        accessMode: "read-write",
      },
    });
    expect(authorizeRes.statusCode).toBe(201);
    const project = JSON.parse(authorizeRes.body);
    const projectId = project.id;
    expect(project.enabled).toBe(true);

    async function postMcp(body: any) {
      const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${mcpToken}`,
          connection: "close",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as any;
      return { status: res.status, data };
    }

    // 3. AI Client connects to MCP endpoint using the generated token
    const toolsListRes = await postMcp({
      jsonrpc: "2.0",
      id: "req_1",
      method: "tools/list",
      params: {},
    });
    expect(toolsListRes.status).toBe(200);
    expect(toolsListRes.data.result.tools.length).toBe(332);

    // 4. AI Client lists projects via MCP tool
    const projectListRes = await postMcp({
      jsonrpc: "2.0",
      id: "req_2",
      method: "tools/call",
      params: {
        name: "localbridge_project_list",
        arguments: {},
      },
    });
    expect(projectListRes.status).toBe(200);
    const toolContent = JSON.parse(projectListRes.data.result.content[0].text);
    expect(toolContent.projects.some((p: any) => p.id === projectId)).toBe(true);

    // 5. AI Client creates a file via MCP tool
    const fileCreateRes = await postMcp({
      jsonrpc: "2.0",
      id: "req_3",
      method: "tools/call",
      params: {
        name: "localbridge_file_create",
        arguments: {
          projectId,
          path: "hello.txt",
          content: "Hello from LocalBridge MCP Phase 11!",
        },
      },
    });
    expect(fileCreateRes.status).toBe(200);
    expect(fs.existsSync(path.join(projectDir, "hello.txt"))).toBe(true);

    // 6. Approval Request generated in Approval Center
    const approvalRes = await app.inject({
      method: "POST",
      url: "/api/approvals",
      payload: {
        projectId,
        operation: "file.delete",
        payload: { path: "hello.txt" },
        risk: "DANGEROUS",
        summary: "Delete hello.txt",
      },
    });
    expect(approvalRes.statusCode).toBe(201);
    const approval = JSON.parse(approvalRes.body);

    // 7. Human resolves approval
    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${approval.id}/resolve`,
      payload: { action: "approve", resolvedBy: "desktop-admin" },
    });
    expect(resolveRes.statusCode).toBe(200);

    // 8. User triggers Emergency Stop from Desktop UI
    const emRes = await app.inject({
      method: "POST",
      url: "/api/emergency-stop",
      payload: { reason: "User requested shutdown" },
    });
    expect(emRes.statusCode).toBe(200);
    expect(JSON.parse(emRes.body).paused).toBe(true);

    // 9. Subsequent MCP tool calls MUST fail with 503 while paused
    const blockedRes = await postMcp({
      jsonrpc: "2.0",
      id: "req_4",
      method: "tools/list",
      params: {},
    });
    expect(blockedRes.status).toBe(503);

    // 10. Audit stream records tool invocations and state changes
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/audit",
    });
    expect(auditRes.statusCode).toBe(200);
    const auditEvents = JSON.parse(auditRes.body).events;
    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents.some((e: any) => e.toolName === "localbridge_file_create")).toBe(true);
  });
});
