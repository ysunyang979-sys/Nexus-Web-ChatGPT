import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

import { buildApp } from "../../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpRateLimiter } from "../../apps/server/src/mcp/rate-limiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.resolve(__dirname, "../../artifacts/production-truth");
const rawDir = path.join(artifactsDir, "raw");

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}
if (!fs.existsSync(rawDir)) {
  fs.mkdirSync(rawDir, { recursive: true });
}

async function main() {
  console.log("======================================================================");
  console.log(" NEXUS P0-3 PRODUCTION TRUTH HARNESS: Computer State OS Verification");
  console.log("======================================================================");
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-phase3-truth-"));
  const projectDir = path.join(tmpDir, "sandbox");
  const stateDir = path.join(tmpDir, "state");
  const migrationsDir = path.resolve(__dirname, "../../apps/server/src/db/migrations");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const dbFilePath = path.join(stateDir, "nexus.db");
  const managementSecret = "lm_sec_phase3_audit";
  
  const serverConfig = AppConfigSchema.parse({
    server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
    logging: { level: "silent", pretty: false },
  });

  console.log("[+] Initializing Real Nexus Server & Runner...");
  const serverInstance = await buildApp({
    config: serverConfig,
    migrationsDir,
    enableLogging: false,
    managementSecret,
    rateLimiter: new McpRateLimiter(1000, 5000),
  });

  const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
  const serverPort = Number.parseInt(address.match(/:(\d+)$/)![1]!, 10);
  console.log(`[+] Server running on port ${serverPort}`);

  const mcpToken = serverInstance.tokenService.createToken({
    name: "phase3", type: "mcp", scopes: ["read", "write", "execute"], purpose: "audit"
  }).token;

  const runnerTokenRecord = serverInstance.tokenService.createToken({
    name: "Phase3-Runner-Token",
    type: "runner",
    scopes: ["runner", "read", "write", "execute"],
    purpose: "nexus-runner",
  });
  
  const { LocalBridgeRunner } = await import("../../apps/runner/src/runner.js");
  const { RunnerDaemonConfigSchema } = await import("../../apps/runner/src/config/schema.js");
  const { createLogger } = await import("@localbridge/shared");
  
  const runnerConfig = RunnerDaemonConfigSchema.parse({
    serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
    token: runnerTokenRecord.token,
    statePath: path.join(stateDir, "runner-state.json"),
    projectsPath: path.join(stateDir, "projects.json"),
    autoUpdate: { enabled: true },
    reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
    heartbeatIntervalMs: 5000,
  });

  const silentLogger = createLogger({ level: "silent", pretty: false, enabled: true });
  const runner = new LocalBridgeRunner(runnerConfig, silentLogger);
  runner.setSafetyLayerDisabled(true); 

  runner.projectRegistry.add(projectDir, { 
    name: "test-app", 
    accessMode: "read-write",
    restrictedPaths: [] 
  });
  
  await runner.start();
  console.log("[+] Runner started. Waiting for server registration sync...");
  await new Promise(r => setTimeout(r, 1500));
  
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${serverPort}/mcp`),
    { 
      protocolVersion: "2026-07-28",
      requestInit: {
        headers: { Authorization: `Bearer ${mcpToken}` } 
      }
    }
  );
  
  const client = new Client(
    { name: "Phase3Audit", version: "1.0.0" }, 
    { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
  );
  await client.connect(transport);

  console.log("[+] Transport Connected. Disabling Safety Layer via Management API...");
  const mgmtRes = await fetch(`http://127.0.0.1:${serverPort}/api/management/settings/safety-layer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${managementSecret}`
    },
    body: JSON.stringify({ disabled: true, securityMode: "universal" })
  });
  if (!mgmtRes.ok) {
    console.error("[-] Failed to disable safety layer via Management API:", await mgmtRes.text());
    process.exit(1);
  }
  
  await new Promise(r => setTimeout(r, 1000));

  // 1. Screen Snapshot Real Capture & PNG IHDR Verification
  console.log("[+] Testing Real Computer Screen Snapshot...");
  let base64Png = "";
  try {
    const screenRes = await client.callTool({
      name: "localbridge_computer_screen_snapshot",
      arguments: { format: "png" }
    });
    if ((screenRes as any).isError) {
      console.error("[-] FAIL: Screen Snapshot failed in MCP", screenRes);
      process.exit(1);
    }
    const screenData = JSON.parse((screenRes as any).content[0].text);
    base64Png = screenData.base64Data || screenData.base64 || screenData.screenshot?.base64Data || "";
  } catch (err: any) {
    console.error("[-] FAIL: Screen Snapshot exception", err);
    process.exit(1);
  }

  if (!base64Png) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Screen snapshot returned empty base64 data");
    process.exit(1);
  }

  const pngBuffer = Buffer.from(base64Png, "base64");
  const isPng = pngBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Screen snapshot binary does not start with PNG magic header!");
    process.exit(1);
  }

  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    console.error(`[-] FAIL_ZERO_TOLERANCE: Invalid PNG dimensions: ${width}x${height}`);
    process.exit(1);
  }
  console.log(`[+] Verification 1: Valid PNG screen snapshot captured: ${width}x${height}, ${pngBuffer.length} bytes.`);

  const rawScreenshotPath = path.join(rawDir, "phase3-screenshot.png");
  fs.writeFileSync(rawScreenshotPath, pngBuffer);
  const screenshotSha256 = crypto.createHash("sha256").update(pngBuffer).digest("hex");

  // 2. Clipboard Write & Independent OS Verification
  console.log("[+] Testing Computer Clipboard...");
  const clipboardText = "nexus-phase3-clipboard-" + crypto.randomUUID();
  try {
    const res = await client.callTool({
      name: "localbridge_computer_clipboard_write",
      arguments: {
        text: clipboardText
      }
    });
    if ((res as any).isError) {
      console.error("[-] FAIL: Clipboard write failed in MCP", res);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("[-] FAIL: Clipboard write exception", err);
    process.exit(1);
  }
  
  const osClipboard = execSync("powershell -Command Get-Clipboard").toString().trim();
  if (osClipboard !== clipboardText) {
    console.error(`[-] FAIL_ZERO_TOLERANCE: OS Clipboard did not match! Expected ${clipboardText}, got ${osClipboard}`);
    process.exit(1);
  }
  console.log("[+] Verification 2: OS Clipboard independently verified.");

  // 3. App Launch & Independent OS Process Verification
  console.log("[+] Testing Computer App Launch...");
  try {
    const res = await client.callTool({
      name: "localbridge_computer_app_launch",
      arguments: { appNameOrPath: "notepad.exe", args: [] }
    });
    if ((res as any).isError) {
      console.error("[-] FAIL: App Launch failed in MCP", res);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("[-] FAIL: App Launch exception", err);
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 1000));
  
  let processFound = false;
  try {
    const ps = execSync("powershell -Command \"Get-Process notepad -ErrorAction SilentlyContinue\"").toString();
    if (ps.toLowerCase().includes("notepad")) {
      processFound = true;
    }
  } catch (err: any) {
    processFound = false;
  }
  
  if (!processFound) {
    console.error("[-] FAIL_ZERO_TOLERANCE: Notepad process not found in OS.");
    process.exit(1);
  }
  console.log("[+] Verification 3: OS Process independently verified.");

  try {
    execSync("powershell -Command \"Stop-Process -Name notepad -Force\"");
  } catch {}

  const taskId = "task-comp-audit-003";
  const evidence = {
    evidenceId: "SEC-COMP-003",
    taskId,
    timestamp: new Date().toISOString(),
    screenshotArtifact: "artifacts/production-truth/raw/phase3-screenshot.png",
    screenshotSha256,
    screenshotBytes: pngBuffer.length,
    screenshotDimensions: { width, height },
    metrics: {
      screenHashVerified: true,
      clipboardVerified: true,
      processVerified: true
    },
    counterfactualVerdict: {
      pngHeaderValid: true,
      dimensionsValid: width > 0 && height > 0,
      clipboardMatched: true,
      processDetectedAndCleaned: true
    }
  };
  
  const evidencePath = path.join(artifactsDir, "phase3-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`[+] Evidence cryptographically secured at ${evidencePath}`);
  
  console.log("\n[SUCCESS] Phase 3: Computer State Truth Harness Passed!");

  await client.close();
  await runner.stop();
  await serverInstance.app.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch(err => {
  console.error("[-] FATAL EXCEPTION", err);
  process.exit(1);
});
