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

describe("Phase 11: Desktop Management Channel & Tokens", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let projectDir: string;
  let serverPort: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-desktop-mgmt-test-"));
    dbFilePath = path.join(tmpDir, "mgmt-test.db");
    projectDir = path.join(tmpDir, "sample-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "README.md"), "# Test Project");

    serverPort = 19180;
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

    // Generate runner token
    const tok = result.tokenService.createToken({
      name: "test-runner-token",
      type: "runner",
    });
    runnerToken = tok.token;

    // Start runner daemon
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "desktop-mgmt-test-runner",
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
    // Allow connection to establish
    await new Promise((r) => setTimeout(r, 600));
  });

  afterAll(async () => {
    await runner?.stop();
    await app?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. Loopback Protection Tests
  it("rejects non-loopback IP for management endpoints with 403 LOOPBACK_ONLY", async () => {
    const nonLoopbackIp = "192.168.1.100";

    const resTokens = await app.inject({
      method: "GET",
      url: "/api/tokens",
      remoteAddress: nonLoopbackIp,
    });
    expect(resTokens.statusCode).toBe(403);
    expect(JSON.parse(resTokens.body).code).toBe("LOOPBACK_ONLY");

    const resPause = await app.inject({
      method: "GET",
      url: "/api/pause",
      remoteAddress: nonLoopbackIp,
    });
    expect(resPause.statusCode).toBe(403);
    expect(JSON.parse(resPause.body).code).toBe("LOOPBACK_ONLY");

    const resEmergency = await app.inject({
      method: "POST",
      url: "/api/emergency-stop",
      remoteAddress: nonLoopbackIp,
    });
    expect(resEmergency.statusCode).toBe(403);
    expect(JSON.parse(resEmergency.body).code).toBe("LOOPBACK_ONLY");

    const resApprovals = await app.inject({
      method: "GET",
      url: "/api/approvals",
      remoteAddress: nonLoopbackIp,
    });
    expect(resApprovals.statusCode).toBe(403);
    expect(JSON.parse(resApprovals.body).code).toBe("LOOPBACK_ONLY");
  });

  // 2. Token Management Tests
  it("manages tokens via loopback REST API with one-time secret reveal", async () => {
    // 2.1 List tokens
    const listRes1 = await app.inject({
      method: "GET",
      url: "/api/tokens",
    });
    expect(listRes1.statusCode).toBe(200);
    const listBody1 = JSON.parse(listRes1.body);
    expect(Array.isArray(listBody1.tokens)).toBe(true);
    expect(listBody1.tokens.length).toBeGreaterThanOrEqual(1);

    // 2.2 Create new MCP token
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tokens",
      payload: {
        name: "Claude Desktop Test",
        type: "mcp",
        scopes: ["read", "write"],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toMatch(/^tok_/);
    expect(created.name).toBe("Claude Desktop Test");
    expect(created.type).toBe("mcp");
    expect(created.token).toMatch(/^lb_[0-9a-f]{64}$/);

    // 2.3 Verify plaintext secret is NEVER returned in subsequent list calls
    const listRes2 = await app.inject({
      method: "GET",
      url: "/api/tokens",
    });
    const listBody2 = JSON.parse(listRes2.body);
    const found = listBody2.tokens.find((t: any) => t.id === created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe("Claude Desktop Test");
    expect(found.type).toBe("mcp");
    expect(found.token).toBeUndefined();
    expect(found.token_hash).toBeUndefined();

    // 2.4 Revoke token
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/tokens/${created.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body).success).toBe(true);

    // 2.5 Verify listed token is now marked revoked
    const listRes3 = await app.inject({
      method: "GET",
      url: "/api/tokens",
    });
    const listBody3 = JSON.parse(listRes3.body);
    const revokedItem = listBody3.tokens.find((t: any) => t.id === created.id);
    expect(revokedItem.revokedAt).not.toBeNull();
  });

  // 3. Project Management via Loopback Management Channel
  it("authorizes, modifies, and removes projects via management endpoints", async () => {
    // 3.1 Authorize Project
    const authRes = await app.inject({
      method: "POST",
      url: "/api/management/projects/authorize",
      payload: {
        path: projectDir,
        name: "Test Authorized Project",
        accessMode: "read-only",
      },
    });
    expect(authRes.statusCode).toBe(201);
    const project = JSON.parse(authRes.body);
    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe("Test Authorized Project");
    expect(project.accessMode).toBe("read-only");
    expect(project.executionMode).toBe("disabled");
    expect(project.enabled).toBe(true);

    const projectId = project.id;

    // 3.2 Change Access Mode to read-write
    const accessRes = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/access`,
      payload: {
        accessMode: "read-write",
      },
    });
    expect(accessRes.statusCode).toBe(200);
    const updatedAccess = JSON.parse(accessRes.body);
    expect(updatedAccess.accessMode).toBe("read-write");

    // 3.3 Change Execution Mode to safe-only
    const execRes = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/execution`,
      payload: {
        executionMode: "safe-only",
      },
    });
    expect(execRes.statusCode).toBe(200);
    const updatedExec = JSON.parse(execRes.body);
    expect(updatedExec.executionMode).toBe("safe-only");

    // Verify GET /api/projects returns executionMode "safe-only"
    const listRes1 = await app.inject({
      method: "GET",
      url: "/api/projects",
    });
    expect(listRes1.statusCode).toBe(200);
    const proj1 = JSON.parse(listRes1.body).projects.find((p: any) => p.id === projectId);
    expect(proj1.executionMode).toBe("safe-only");

    // Change Execution Mode to project-code
    const execRes2 = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/execution`,
      payload: {
        executionMode: "project-code",
      },
    });
    expect(execRes2.statusCode).toBe(200);
    expect(JSON.parse(execRes2.body).executionMode).toBe("project-code");

    // Verify GET /api/projects and GET /api/projects/:id return "project-code"
    const listRes2 = await app.inject({
      method: "GET",
      url: "/api/projects",
    });
    expect(listRes2.statusCode).toBe(200);
    const proj2 = JSON.parse(listRes2.body).projects.find((p: any) => p.id === projectId);
    expect(proj2.executionMode).toBe("project-code");

    const getRes = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).executionMode).toBe("project-code");

    // Change Execution Mode to disabled
    const execRes3 = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/execution`,
      payload: {
        executionMode: "disabled",
      },
    });
    expect(execRes3.statusCode).toBe(200);
    expect(JSON.parse(execRes3.body).executionMode).toBe("disabled");

    // Verify GET /api/projects returns "disabled"
    const listRes3 = await app.inject({
      method: "GET",
      url: "/api/projects",
    });
    expect(listRes3.statusCode).toBe(200);
    const proj3 = JSON.parse(listRes3.body).projects.find((p: any) => p.id === projectId);
    expect(proj3.executionMode).toBe("disabled");

    // 3.4 Disable Project
    const disableRes = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/disable`,
    });
    expect(disableRes.statusCode).toBe(200);
    expect(JSON.parse(disableRes.body).disabled).toBe(true);

    // 3.5 Re-enable Project
    const enableRes = await app.inject({
      method: "POST",
      url: `/api/management/projects/${projectId}/enable`,
    });
    expect(enableRes.statusCode).toBe(200);
    expect(JSON.parse(enableRes.body).enabled).toBe(true);

    // 3.6 Remove Project
    const removeRes = await app.inject({
      method: "DELETE",
      url: `/api/management/projects/${projectId}`,
    });
    expect(removeRes.statusCode).toBe(200);
    expect(JSON.parse(removeRes.body).removed).toBe(true);
  });

  // 4. Repeated Secondary Modifications & Virtual drive-c Support
  it("supports repeated toggling of accessMode and executionMode including virtual drive-c", async () => {
    runner.setSafetyLayerDisabled(true);

    // 4.1 Toggle drive-c from read-write to read-only (downgrades executionMode to disabled)
    const cAccess1 = await app.inject({
      method: "POST",
      url: "/api/management/projects/drive-c/access",
      payload: { accessMode: "read-only" },
    });
    expect(cAccess1.statusCode).toBe(200);
    const cBody1 = JSON.parse(cAccess1.body);
    expect(cBody1.accessMode).toBe("read-only");
    expect(cBody1.executionMode).toBe("disabled");
    expect(cBody1.enabled).toBe(true);

    // 4.2 Second modification: directly set executionMode back to project-code
    // Should auto-upgrade accessMode to read-write instead of throwing PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS
    const cExec1 = await app.inject({
      method: "POST",
      url: "/api/management/projects/drive-c/execution",
      payload: { executionMode: "project-code" },
    });
    expect(cExec1.statusCode).toBe(200);
    const cExecBody1 = JSON.parse(cExec1.body);
    expect(cExecBody1.executionMode).toBe("project-code");
    expect(cExecBody1.accessMode).toBe("read-write");
    expect(cExecBody1.enabled).toBe(true);

    // 4.3 Third modification: switch executionMode to safe-only, then disabled, then project-code again
    const cExec2 = await app.inject({
      method: "POST",
      url: "/api/management/projects/drive-c/execution",
      payload: { executionMode: "safe-only" },
    });
    expect(cExec2.statusCode).toBe(200);
    expect(JSON.parse(cExec2.body).executionMode).toBe("safe-only");

    const cAccess2 = await app.inject({
      method: "POST",
      url: "/api/management/projects/drive-c/access",
      payload: { accessMode: "read-only" },
    });
    expect(cAccess2.statusCode).toBe(200);
    expect(JSON.parse(cAccess2.body).accessMode).toBe("read-only");

    const cAccess3 = await app.inject({
      method: "POST",
      url: "/api/management/projects/drive-c/access",
      payload: { accessMode: "read-write" },
    });
    expect(cAccess3.statusCode).toBe(200);
    expect(JSON.parse(cAccess3.body).accessMode).toBe("read-write");
  });
});
