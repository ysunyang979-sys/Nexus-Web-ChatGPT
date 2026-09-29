import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildApp, type BuiltAppResult } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../apps/runner/src/config/schema.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Phase 10 - Official MCP Client Integration (@modelcontextprotocol/client)", () => {
  let tmpDir: string;
  let dbFilePath: string;
  let projectDir: string;
  let runnerStatePath: string;
  let runnerProjectsPath: string;

  let serverInstance: BuiltAppResult;
  let serverPort: number;
  let mcpToken: string;
  let runnerToken: string;
  let runner: LocalBridgeRunner;
  let projectId: string;

  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-mcp-client-"));
      dbFilePath = path.join(tmpDir, "mcp-client.db");
      projectDir = path.join(tmpDir, "test-repo");
      runnerStatePath = path.join(tmpDir, "runner-state.json");
      runnerProjectsPath = path.join(tmpDir, "projects.json");

      fs.mkdirSync(projectDir, { recursive: true });

      // Initialize git repository
      execFileSync("git", ["init"], { cwd: projectDir });
      execFileSync("git", ["config", "user.name", "Test User"], { cwd: projectDir });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir });

      fs.writeFileSync(path.join(projectDir, "file.txt"), "Hello LocalBridge MCP!", "utf-8");
      execFileSync("git", ["add", "file.txt"], { cwd: projectDir });
      execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: projectDir });

      // 1. Start Server
      const config = AppConfigSchema.parse({
        server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath },
        logging: { level: "silent", pretty: false },
      });

      serverInstance = await buildApp({
        config,
        migrationsDir,
        enableLogging: false,
      });

      const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
      const match = address.match(/:(\d+)$/);
      serverPort = match ? Number.parseInt(match[1]!, 10) : 18080;

      // 2. Create tokens
      const mcpTokenRecord = serverInstance.tokenService.createToken({
        type: "mcp",
        name: "mcp-integration-client",
        scopes: ["read", "write", "execute"],
      });
      mcpToken = mcpTokenRecord.token;

      const runnerTokenRecord = serverInstance.tokenService.createToken({
        type: "runner",
        name: "mcp-integration-runner",
      });
      runnerToken = runnerTokenRecord.token;

      // 3. Start Runner
      const runnerConfig = RunnerDaemonConfigSchema.parse({
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "Client-Integration-Runner",
        statePath: runnerStatePath,
        projectsPath: runnerProjectsPath,
        logging: { level: "silent", pretty: false },
        reconnect: {
          enabled: true,
          initialDelayMs: 100,
          maxDelayMs: 500,
          factor: 1.5,
          jitter: false,
        },
        heartbeatIntervalMs: 5000,
      });

      const silentLogger = createLogger({ level: "silent", pretty: false, enabled: false });
      runner = new LocalBridgeRunner(runnerConfig, silentLogger);

      const authorized = runner.projectRegistry.add(projectDir, {
        name: "mcp-test-project",
        accessMode: "read-write",
      });
      runner.projectRegistry.setExecutionMode(authorized.id, "safe-only");
      projectId = authorized.id;

      await runner.start();

      // 4. Wait for runner to establish handshake and sync projects
      const startWait = Date.now();
      while (serverInstance.runnerRegistry.count() === 0) {
        if (Date.now() - startWait > 5000) {
          throw new Error("Runner did not register within 5000ms");
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      // Give server time to sync runner projects deterministically
      const startSyncWait = Date.now();
      while (serverInstance.projectService.listProjects().length === 0) {
        if (Date.now() - startSyncWait > 5000) {
          throw new Error("Projects were not synced within 5000ms");
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      // 5. Connect official MCP Client
      transport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${serverPort}/mcp`),
        {
          protocolVersion: "2026-07-28",
          requestInit: {
            headers: {
              Authorization: `Bearer ${mcpToken}`,
              connection: "close",
            },
          },
        }
      );

      client = new Client(
        { name: "test-mcp-client", version: "1.0.0" },
        {
          capabilities: {},
          versionNegotiation: { mode: { pin: "2026-07-28" } },
        } as any
      );

      await client.connect(transport);
    } catch (e) {
      console.error("CRITICAL BEFOREALL ERROR:", e);
      throw e;
    }
  });

  afterAll(async () => {
    try {
      await client?.close();
    } catch {}
    try {
      await transport?.close();
    } catch {}
    try {
      await runner?.stop();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (serverInstance) {
      serverInstance.app.server.closeAllConnections?.();
      await serverInstance.app.close();
      serverInstance = null as any;
    }
    client = null as any;
    transport = null as any;
    runner = null as any;
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("lists all available tools via official client", async () => {
    const listResult = await client.listTools();
    expect(listResult.tools).toBeDefined();
    expect(listResult.tools.length).toBe(332);

    const toolNames = listResult.tools.map((t) => t.name);
    expect(toolNames).toContain("localbridge_project_list");
    expect(toolNames).toContain("localbridge_file_read");
    expect(toolNames).toContain("localbridge_git_status");
    expect(toolNames).toContain("localbridge_git_stage");
    expect(toolNames).toContain("localbridge_git_unstage");
    expect(toolNames).toContain("localbridge_git_branch_create");
    expect(toolNames).toContain("localbridge_git_branch_switch");
    expect(toolNames).toContain("localbridge_git_commit");
    expect(toolNames).toContain("localbridge_approval_status");
  });

  it("calls localbridge_project_list and discovers authorized project", async () => {
    const result = await client.callTool({
      name: "localbridge_project_list",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);

    const parsed = JSON.parse(content[0]?.text ?? "{}");
    expect(parsed.projects).toBeInstanceOf(Array);
    expect(parsed.projects.some((p: any) => p.id === projectId)).toBe(true);
  });

  it("calls localbridge_project_info and verifies project configuration", async () => {
    const result = await client.callTool({
      name: "localbridge_project_info",
      arguments: { projectId },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}");

    expect(parsed.id).toBe(projectId);
    expect(parsed.name).toBe("mcp-test-project");
    expect(parsed.accessMode).toBe("read-write");
    expect(parsed.executionMode).toBe("safe-only");
  });

  it("calls localbridge_file_read and retrieves file content with hash", async () => {
    const result = await client.callTool({
      name: "localbridge_file_read",
      arguments: { projectId, path: "file.txt" },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}");

    expect(parsed.lines[0]?.text).toBe("Hello LocalBridge MCP!");
    expect(parsed.contentHash).toBeDefined();
    expect(parsed.lines).toHaveLength(1);
  });

  it("calls localbridge_git_status and verifies clean git state", async () => {
    const result = await client.callTool({
      name: "localbridge_git_status",
      arguments: { projectId },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}");

    expect(parsed.clean).toBe(true);
    expect(parsed.entries).toHaveLength(0);
  });
});
