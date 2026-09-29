import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Local Resource / Computer Discovery Architecture E2E Tests (10 Blackbox Scenarios)", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let mcpToken: string;
  let serverPort: number;
  let projectDir: string;
  let projectId: string;
  let serverResult: any;

  async function postMcp(toolName: string, args: Record<string, any> = {}) {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });
    const data = (await res.json()) as any;
    if (data.result?.isError) {
      const errText = data.result.content?.[0]?.text || "Unknown MCP tool error";
      throw new Error(`MCP Tool ${toolName} Error: ${errText}`);
    }
    const rawText = data.result?.content?.[0]?.text;
    let parsedContent: any = rawText;
    try {
      parsedContent = JSON.parse(rawText);
    } catch {}
    return { status: res.status, raw: data, result: parsedContent };
  }

  beforeAll(async () => {
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-discovery-e2e-"));
    dbFilePath = path.join(tmpDir, "nexus-discovery.db");
    projectDir = path.join(tmpDir, "test-workspace");
    fs.mkdirSync(projectDir, { recursive: true });

    serverPort = 19379;
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: serverPort, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    serverResult = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = serverResult.app;
    await app.listen({ port: serverPort, host: "127.0.0.1" });

    // Enable UNRESTRICTED mode for full local discovery
    serverResult.projectService.setSafetyLayerDisabled(true, "UNRESTRICTED");

    // Bootstrap tokens
    const rTok = serverResult.tokenService.createToken({
      name: "nexus-discovery-runner",
      type: "runner",
    });
    runnerToken = rTok.token;

    const mTok = serverResult.tokenService.createToken({
      name: "nexus-discovery-mcp",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mTok.token;

    // Start Runner
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "nexus-discovery-runner",
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

    runner.setSafetyLayerDisabled(true, "UNRESTRICTED");

    await runner.start();
    await new Promise((r) => setTimeout(r, 800));

    // Authorize workspace project via management API
    const authRes = await app.inject({
      method: "POST",
      url: "/api/management/projects/authorize",
      payload: {
        path: projectDir,
        name: "Discovery Workspace",
        accessMode: "read-write",
      },
    });
    const projData = JSON.parse(authRes.body);
    projectId = projData.id;

    fs.writeFileSync(
      path.join(projectDir, "README.md"),
      "# Nexus Local Resource Discovery Test\nDemonstrating durable execution and local resource awareness.\n",
      "utf-8"
    );
  }, 35000);

  afterAll(async () => {
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}
    if (runner) await runner.stop();
    if (app) await app.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: Discover real install location for "Maya" even when not in C:\
  it("Test 1: should discover Maya installation location regardless of drive letter", async () => {
    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "Maya",
      resourceTypes: ["application"],
      scope: "local_machine",
      verify: true,
    });

    expect(result.resources).toBeDefined();
    expect(result.resources.length).toBeGreaterThan(0);
    const mayaApp = result.resources.find((r: any) =>
      /maya/i.test(r.name) || (r.aliases && r.aliases.some((a: string) => /maya/i.test(a)))
    );
    expect(mayaApp).toBeDefined();
    expect(mayaApp.executablePath).toBeTruthy();
    expect(path.isAbsolute(mayaApp.executablePath)).toBe(true);
  }, 30000);

  // Test 2: Maya located at E:\Tools\maya2022\Maya2022\bin\maya.exe is automatically discovered
  it("Test 2: should discover Maya at real path E:\\Tools\\maya2022\\Maya2022\\bin\\maya.exe", async () => {
    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "Maya 2022",
      resourceTypes: ["application"],
      scope: "local_machine",
      verify: true,
    });

    const expectedMayaPath = "E:\\Tools\\maya2022\\Maya2022\\bin\\maya.exe";
    const found = result.resources.find(
      (r: any) =>
        r.executablePath &&
        r.executablePath.toLowerCase().replace(/\\/g, "/") === expectedMayaPath.toLowerCase().replace(/\\/g, "/")
    );

    // If machine has E:\Tools\maya2022 installed, assert exact path match
    if (fs.existsSync(expectedMayaPath)) {
      expect(found).toBeDefined();
      expect(found.exists).toBe(true);
      expect(found.launchable).toBe(true);

      // Verify via verification layer
      const verifyRes = await postMcp("localbridge_resource_verify", {
        resourceType: "file",
        target: expectedMayaPath,
      });
      expect(verifyRes.result.verified).toBe(true);
    } else {
      // General check: application was found and verified
      expect(result.resources.length).toBeGreaterThan(0);
    }
  });

  // Test 3: Find all Blender installations on computer with real executable paths
  it("Test 3: should find all Blender installations on machine with valid executable paths", async () => {
    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "Blender",
      resourceTypes: ["application"],
      scope: "local_machine",
      verify: true,
    });

    expect(result.resources).toBeDefined();
    expect(result.resources.length).toBeGreaterThan(0);

    const blenderApps = result.resources.filter((r: any) =>
      /blender/i.test(r.name) || (r.aliases && r.aliases.some((a: string) => /blender/i.test(a)))
    );
    expect(blenderApps.length).toBeGreaterThan(0);

    for (const b of blenderApps) {
      expect(b.executablePath).toBeTruthy();
      expect(fs.existsSync(b.executablePath)).toBe(true);
      expect(b.exists).toBe(true);
    }
  });

  // Test 4: Find files containing 'durable execution' via Content Index
  it("Test 4: should find files containing 'durable execution' via Content Index", async () => {
    // Index the workspace directory
    await runner.discoveryService.getIndexer().indexDirectory(projectDir);

    const { result } = await postMcp("localbridge_content_index_search", {
      query: "durable execution",
      directories: [projectDir],
    });

    expect(result.records).toBeDefined();
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0].path).toContain("README.md");
    expect(result.records[0].snippet).toContain("durable execution");
  });

  // Test 5: Create a new file and verify Resource Index discovers it
  it("Test 5: should discover newly created file in Resource Index", async () => {
    const newFilePath = path.join(projectDir, "architecture-spec-v2.json");
    fs.writeFileSync(
      newFilePath,
      JSON.stringify({ component: "UnifiedResourceRegistry", status: "active" }, null, 2),
      "utf-8"
    );

    // Incrementally index file
    runner.discoveryService.getIndexer().indexFile(newFilePath);

    const { result } = await postMcp("localbridge_content_index_search", {
      query: "UnifiedResourceRegistry",
      directories: [projectDir],
    });

    expect(result.records).toBeDefined();
    expect(result.records.some((r: any) => r.filename === "architecture-spec-v2.json")).toBe(true);
  });

  // Test 6: Modify file and verify Index detects changes
  it("Test 6: should detect file modification and update index hash", async () => {
    const targetFile = path.join(projectDir, "architecture-spec-v2.json");
    const originalEntry = runner.discoveryService.getIndexer().getByPath(targetFile);
    const originalHash = originalEntry?.hash;

    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 100));

    // Update file content
    fs.writeFileSync(
      targetFile,
      JSON.stringify({ component: "UnifiedResourceRegistry", status: "upgraded_v3", token: "unique_token_xyz" }),
      "utf-8"
    );

    // Re-index file
    const updatedEntry = runner.discoveryService.getIndexer().indexFile(targetFile);
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.hash).not.toBe(originalHash);

    // Search for the new token
    const { result } = await postMcp("localbridge_content_index_search", {
      query: "unique_token_xyz",
      directories: [projectDir],
    });

    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0].snippet).toContain("unique_token_xyz");
  });

  // Test 7: Delete file and verify Index detects invalidation
  it("Test 7: should detect file deletion and invalidate resource in index", async () => {
    const targetFile = path.join(projectDir, "architecture-spec-v2.json");
    expect(fs.existsSync(targetFile)).toBe(true);

    // Delete file from disk
    fs.unlinkSync(targetFile);
    expect(fs.existsSync(targetFile)).toBe(false);

    // Update index
    runner.discoveryService.getIndexer().indexFile(targetFile);

    // Search should no longer return this file
    const { result } = await postMcp("localbridge_content_index_search", {
      query: "unique_token_xyz",
      directories: [projectDir],
    });

    expect(result.records.length).toBe(0);
  });

  // Test 8: Install / discover a new software into Application Registry
  it("Test 8: should dynamically register and discover new software in Application Registry", async () => {
    const dummyAppDir = path.join(tmpDir, "mock-tools", "NexusTool");
    fs.mkdirSync(dummyAppDir, { recursive: true });
    const dummyExe = path.join(dummyAppDir, "nexustool.exe");
    fs.writeFileSync(dummyExe, "MZ_MOCK_EXECUTABLE", "utf-8");

    // Register into Local Resource Registry
    runner.discoveryService.getRegistry().register({
      resourceId: "app:nexustool",
      type: "application",
      name: "Nexus Custom Tool 2026",
      aliases: ["nexustool", "nexus tool", "nexustool.exe"],
      path: dummyExe,
      executablePath: dummyExe,
      installPath: dummyAppDir,
      source: "custom",
      exists: true,
      accessible: true,
      verified: true,
      launchable: true,
      publisher: "Nexus Lab",
    });

    // Query via natural language alias "nexus tool"
    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "nexus tool",
      resourceTypes: ["application"],
      scope: "local_machine",
    });

    expect(result.resources.length).toBeGreaterThan(0);
    const found = result.resources.find((r: any) => r.name === "Nexus Custom Tool 2026");
    expect(found).toBeDefined();
    expect(found.executablePath).toBe(dummyExe);
    expect(found.launchable).toBe(true);
  });

  // Test 9: Disable safety layer (UNRESTRICTED mode) expands discovery scope to local machine
  it("Test 9: should expand discovery scope to local machine when safety layer is UNRESTRICTED", async () => {
    // Ensure UNRESTRICTED mode
    runner.setSafetyLayerDisabled(true, "UNRESTRICTED");
    serverResult.projectService.setSafetyLayerDisabled(true, "UNRESTRICTED");

    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "Maya",
      scope: "local_machine",
    });

    expect(result.securityMode.toUpperCase()).toContain("UNRESTRICTED");
    expect(result.scope).toBe("local_machine");
    expect(result.resources.length).toBeGreaterThan(0);
  });

  // Test 10: Re-enable safety layer (SAFE mode) restricts discovery to authorized workspace
  it("Test 10: should restrict discovery scope to workspace when safety layer is SAFE", async () => {
    // Switch to SAFE mode
    runner.setSafetyLayerDisabled(false, "SAFE");
    serverResult.projectService.setSafetyLayerDisabled(false, "safe");

    const { result } = await postMcp("localbridge_local_resource_query", {
      query: "Maya",
      scope: "local_machine",
      projectId,
    });

    expect(result.scope).toBe("workspace");
    // In SAFE mode, external host Maya application outside workspace is not returned
    const externalMaya = result.resources.find((r: any) =>
      r.executablePath && !r.executablePath.startsWith(projectDir)
    );
    expect(externalMaya).toBeUndefined();
  });

  // Test 11: 3-tier architecture verification (launch and real OS state verification)
  it("Test 11: should inspect real OS state on launch and report verified status honestly", async () => {
    // Enable UNRESTRICTED mode for execution
    runner.setSafetyLayerDisabled(true, "UNRESTRICTED");
    serverResult.projectService.setSafetyLayerDisabled(true, "UNRESTRICTED");

    // Launch non-existent app -> must fail verification
    const failedLaunch = await postMcp("localbridge_application_launch", {
      appNameOrPath: "NonExistentApp_12345.exe",
    });
    expect(failedLaunch.result.launched).toBe(false);
    expect(failedLaunch.result.verified).toBe(false);
    expect(failedLaunch.result.message).toContain("无法找到或验证");

    // Launch real Notepad with OS-level verification
    const notepadLaunch = await postMcp("localbridge_application_launch", {
      appNameOrPath: "notepad.exe",
      verifyLaunch: true,
      timeoutMs: 6000,
    });

    expect(notepadLaunch.result.launched).toBe(true);
    expect(notepadLaunch.result.verified).toBe(true);
    expect(notepadLaunch.result.pid).toBeGreaterThan(0);

    // Verify process via verification layer
    const procVerify = await postMcp("localbridge_resource_verify", {
      resourceType: "process",
      target: "notepad",
    });
    expect(procVerify.result.verified).toBe(true);

    // Clean up notepad
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}
  }, 25000);
});
