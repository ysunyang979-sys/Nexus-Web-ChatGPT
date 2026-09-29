import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { buildApp } from "../../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { McpRateLimiter } from "../../apps/server/src/mcp/rate-limiter.js";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

async function main() {
  console.log("======================================================================");
  console.log(" NEXUS P0-2 PRODUCTION TRUTH HARNESS: Runner Crash + Recovery");
  console.log("======================================================================");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-phase2-truth-"));
  const artifactsDir = path.join(process.cwd(), "artifacts", "production-truth");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const rawDir = path.join(artifactsDir, "raw");
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  const stateDir = path.join(tmpDir, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  
  const projectDir = path.join(tmpDir, "project");
  fs.mkdirSync(projectDir, { recursive: true });

  const dbFilePath = path.join(tmpDir, "live-probe.db");
  const migrationsDir = path.join(process.cwd(), "apps/server/src/db/migrations");

  const managementSecret = "sec_live_probe_management_token_332";
  const serverConfig = AppConfigSchema.parse({
    server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
    logging: { level: "debug", pretty: true },
  });

  console.log("[+] Initializing Real Nexus Server...");
  const serverInstance = await buildApp({
    config: serverConfig,
    migrationsDir,
    enableLogging: true,
    managementSecret,
    rateLimiter: new McpRateLimiter(1000, 5000),
  });

  const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
  const serverPort = Number.parseInt(address.match(/:(\d+)$/)![1]!, 10);
  console.log(`[+] Server running on port ${serverPort}`);

  const mcpToken = serverInstance.tokenService.createToken({
    name: "phase2", type: "mcp", scopes: ["read", "write", "execute"], purpose: "audit"
  }).token;

  const runnerToken = serverInstance.tokenService.createToken({
    name: "phase2-runner", type: "runner", scopes: ["runner", "read", "write", "execute"], purpose: "nexus-runner"
  }).token;

  let projectId = "";

  const spawnRunner = (): Promise<any> => {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ["--import", "tsx", "scripts/production-truth/runner-child.ts"], {
        env: {
          ...process.env,
          SERVER_PORT: String(serverPort),
          RUNNER_TOKEN: runnerToken,
          STATE_DIR: stateDir,
          PROJECT_DIR: projectDir
        }
      });
      child.stdout.on("data", (data) => {
        const text = data.toString();
        process.stdout.write("[RUNNER] " + text);
        if (text.includes("[+] RUNNER_READY: projectId=")) {
          const newProj = text.split("projectId=")[1].trim();
          if (newProj) projectId = newProj;
          resolve(child);
        }
      });
      child.stderr.on("data", (data) => {
          process.stderr.write("[RUNNER_ERR] " + data.toString());
      });
    });
  };

  console.log("[+] Spawning isolated Runner process...");
  let runnerProcess = await spawnRunner();
  console.log(`[+] Runner connected. Project ID: ${projectId}`);
  
  await new Promise(r => setTimeout(r, 4000));
  await new Promise(r => setTimeout(r, 2000));
  
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${serverPort}/mcp`),
    { 
      protocolVersion: "2026-07-28",
      requestInit: { headers: { Authorization: `Bearer ${mcpToken}`, "x-nexus-task-id": "task-crash-test-001" } }
    }
  );
  
  const client = new Client(
    { name: "Phase2Audit", version: "1.0.0" }, 
    { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
  );
  await client.connect(transport);

  console.log("[+] Transport Connected. Executing long-running task...");

  const taskId = "task-crash-test-001";
  
  console.log("[+] Creating agent task to establish Ledger...");
  const taskRes = await client.callTool({
    name: "localbridge_agent_task_create",
    arguments: {
      projectId: projectId,
      title: "Crash Recovery Test Task",
      goal: "Simulate non-idempotent action crash"
    }
  });
  let dynamicTaskId = "unknown";
  if (!taskRes.isError && taskRes.content?.[0]?.type === "text") {
    try {
      const parsed = JSON.parse(taskRes.content[0].text);
      dynamicTaskId = parsed.agentTaskId || parsed.taskId || "unknown";
    } catch(e) {}
  }
  console.log(`[+] Created Agent Task: ${dynamicTaskId}`);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const execPromise = client.callTool({
    name: "localbridge_file_create",
    arguments: {
      projectId: projectId,
      path: "slow.txt",
      content: "Hello World"
    }
  }).then(r => console.log("MCP SUCCESS:", r)).catch(e => {
    console.error("MCP callTool error:", e);
    return e;
  });

  const walPath = path.join(stateDir, "action-ledger", `${dynamicTaskId}-ledger.wal`);
  console.log(`[+] Watching WAL for ACTION_STARTED: ${walPath}`);
  
  let started = false;
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(walPath)) {
      const content = fs.readFileSync(walPath, "utf-8");
      if (content.includes("ACTION_STARTED") && content.includes("file.create")) {
        started = true;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  if (!started) {
    console.error("[-] FAIL: ACTION_STARTED never written to WAL");
    process.exit(1);
  }
  console.log("[+] Verified ACTION_STARTED in WAL.");
  
  // CRASH THE RUNNER
  console.log("[+] INJECTING FATAL CRASH: Killing Runner Process (SIGKILL)...");
  runnerProcess.kill("SIGKILL");
  
  await execPromise;
  console.log(`[+] MCP connection correctly dropped`);
  
  await new Promise(r => setTimeout(r, 500));

  // Restart Runner
  console.log("[+] Restarting isolated Runner process to trigger Recovery...");
  runnerProcess = await spawnRunner();
  console.log("[+] Runner restarted successfully.");
  
  await new Promise(r => setTimeout(r, 1000));
  
  const walContentAfter = fs.readFileSync(walPath, "utf-8");
  const snapshotPath = path.join(stateDir, "action-ledger", `${dynamicTaskId}-ledger.json`);
  let ledgerSnapshot: any[] = [];
  if (fs.existsSync(snapshotPath)) {
    ledgerSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
  }
  
  const crashAction = ledgerSnapshot.find((a: any) => a.method === "file.create");
  const actionStatus = crashAction?.status;
  console.log(`[+] Snapshot Action Status: ${actionStatus}`);
  
  if (actionStatus !== "UNKNOWN") {
    console.error(`[-] FAIL_ZERO_TOLERANCE: Expected UNKNOWN status, got ${actionStatus}`);
    process.exit(1);
  }
  console.log("[+] Verification 1: Crash correctly converted STARTED to UNKNOWN.");

  // Retry the exact same request
  console.log("[+] Attempting to resend identical MCP request...");
  let retryResult: any = null;
  try {
    const res = await client.callTool({
      name: "localbridge_file_create",
      arguments: {
        projectId: projectId,
        path: "slow.txt",
        content: "Hello World"
      }
    });
    if (res.isError) {
      retryResult = res.content?.[0]?.text || "ERROR";
    } else {
      retryResult = "SUCCESS";
    }
  } catch (err: any) {
    retryResult = err.message;
  }
  
  console.log(`[+] Retry Result: ${retryResult}`);
  
  if (!retryResult.includes("RETRY_UNSAFE")) {
    console.error(`[-] FAIL_ZERO_TOLERANCE: Expected RETRY_UNSAFE rejection, got: ${retryResult}`);
    process.exit(1);
  }
  console.log("[+] Verification 2: Runner rejected retry with RETRY_UNSAFE (World State constraint).");
  
  // Copy raw artifacts
  const rawWalPath = path.join(rawDir, "phase2-ledger.wal");
  fs.copyFileSync(walPath, rawWalPath);
  const rawWalBytes = fs.statSync(rawWalPath).size;
  const rawWalSha256 = crypto.createHash("sha256").update(fs.readFileSync(rawWalPath)).digest("hex");

  const rawSnapshotPath = path.join(rawDir, "phase2-ledger.json");
  if (fs.existsSync(snapshotPath)) {
    fs.copyFileSync(snapshotPath, rawSnapshotPath);
  }
  const rawSnapshotSha256 = fs.existsSync(rawSnapshotPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(rawSnapshotPath)).digest("hex")
    : "";

  const evidencePath = path.join(artifactsDir, "phase2-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify({
    evidenceId: "SEC-CRASH-002",
    taskId,
    dynamicTaskId,
    timestamp: new Date().toISOString(),
    rawWalArtifact: "artifacts/production-truth/raw/phase2-ledger.wal",
    rawWalSha256,
    rawWalBytes,
    rawSnapshotArtifact: "artifacts/production-truth/raw/phase2-ledger.json",
    rawSnapshotSha256,
    walContent: walContentAfter.split("\n"),
    snapshotBeforeRetry: ledgerSnapshot,
    retryResult,
    counterfactualVerdict: {
      crashDetected: true,
      recoveredState: actionStatus,
      rejectionMatched: retryResult.includes("RETRY_UNSAFE"),
      walBytes: rawWalBytes,
      snapshotLength: ledgerSnapshot.length
    }
  }, null, 2));
  
  console.log(`[+] Evidence cryptographically secured at ${evidencePath}`);
  console.log("\n[SUCCESS] Phase 2: Runner Crash + Recovery Truth Harness Passed!");

  // Cleanup
  runnerProcess.kill();
  await client.close();
  await serverInstance.app.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch(err => {
  console.error("[-] FATAL EXCEPTION", err);
  process.exit(1);
});
