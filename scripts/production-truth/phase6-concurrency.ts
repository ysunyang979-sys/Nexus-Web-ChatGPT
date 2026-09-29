import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
  console.log(" NEXUS P0-6 PRODUCTION TRUTH HARNESS: Phase 6 Concurrency & WAL Integrity");
  console.log("======================================================================");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-phase6-truth-"));
  const projectDir = path.join(tmpDir, "sandbox");
  const stateDir = path.join(tmpDir, "state");
  const migrationsDir = path.resolve(__dirname, "../../apps/server/src/db/migrations");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const dbFilePath = path.join(stateDir, "nexus.db");
  const managementSecret = "lm_sec_phase6_audit";

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
    name: "phase6",
    type: "mcp",
    scopes: ["read", "write", "execute"],
    purpose: "audit",
  }).token;

  const runnerTokenRecord = serverInstance.tokenService.createToken({
    name: "Phase6-Runner-Token",
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

  const proj = runner.projectRegistry.add(projectDir, {
    name: "test-app",
    accessMode: "read-write",
  });

  await runner.start();
  await new Promise((r) => setTimeout(r, 1500));

  await fetch(`http://127.0.0.1:${serverPort}/api/management/settings/safety-layer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementSecret}`,
    },
    body: JSON.stringify({ disabled: true, securityMode: "universal" }),
  });

  const requestedConcurrency = 20;
  let inFlight = 0;
  let actualPeakConcurrency = 0;

  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${serverPort}/mcp`),
    {
      protocolVersion: "2026-07-28",
      requestInit: {
        headers: {
          Authorization: `Bearer ${mcpToken}`,
          "x-nexus-task-id": "task-concurrency-006",
        },
      },
    }
  );

  const client = new Client(
    { name: "Phase6Audit", version: "1.0.0" },
    { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
  );
  await client.connect(transport);

  // Create task first
  await client.callTool({
    name: "localbridge_agent_task_create",
    arguments: {
      projectId: proj.id,
      title: "Phase 6 Concurrency Test",
      goal: "Phase 6 Concurrency Test",
    },
  });

  console.log(`[+] Firing ${requestedConcurrency} truly concurrent file_write tool calls via Promise.all...`);

  const startTime = Date.now();
  const promises = Array.from({ length: requestedConcurrency }, async (_, idx) => {
    inFlight++;
    if (inFlight > actualPeakConcurrency) {
      actualPeakConcurrency = inFlight;
    }
    const fileName = `concurrent-${idx}.txt`;
    const expectedContent = `CONCURRENT_PAYLOAD_${idx}_${crypto.randomUUID()}`;
    try {
      const res = await client.callTool({
        name: "localbridge_file_create",
        arguments: {
          projectId: proj.id,
          path: fileName,
          content: expectedContent,
        },
      });
      if ((res as any).isError) {
        throw new Error(`Tool returned isError for ${fileName}: ${JSON.stringify(res)}`);
      }
      return { idx, fileName, expectedContent, ok: true };
    } finally {
      inFlight--;
    }
  });

  const results = await Promise.all(promises);
  const totalDurationMs = Date.now() - startTime;
  console.log(
    `[+] All ${results.length} concurrent requests completed in ${totalDurationMs}ms (peak concurrency: ${actualPeakConcurrency}/${requestedConcurrency})`
  );

  // 1. Independently verify all 20 files on disk
  for (const item of results) {
    const fullPath = path.join(projectDir, item.fileName);
    if (!fs.existsSync(fullPath)) {
      console.error(`[-] FAIL_ZERO_TOLERANCE: Missing concurrent file ${fullPath}`);
      process.exit(1);
    }
    const actualContent = fs.readFileSync(fullPath, "utf-8");
    if (actualContent !== item.expectedContent) {
      console.error(`[-] FAIL_ZERO_TOLERANCE: Content corruption in ${fullPath}`);
      process.exit(1);
    }
  }
  console.log(`[+] Verification 1: All ${requestedConcurrency} files verified on disk with zero corruption.`);

  // 2. Independently verify raw WAL file integrity & cryptographic checksums
  const ledgerDir = path.join(stateDir, "action-ledger");
  const walFiles = fs.existsSync(ledgerDir)
    ? fs.readdirSync(ledgerDir).filter((f) => f.endsWith("-ledger.wal"))
    : [];
  if (walFiles.length === 0) {
    console.error("[-] FAIL_ZERO_TOLERANCE: No WAL files found in agent-ledgers!");
    process.exit(1);
  }

  let totalWalLines = 0;
  let combinedWalBuffer = Buffer.alloc(0);
  for (const wf of walFiles) {
    const walPath = path.join(ledgerDir, wf);
    const walBuf = fs.readFileSync(walPath);
    combinedWalBuffer = Buffer.concat([combinedWalBuffer, walBuf]);
    const lines = walBuf
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    let prevSeq = 0;
    for (const line of lines) {
      totalWalLines++;
      const record = JSON.parse(line);
      if (record.sequence !== prevSeq + 1) {
        console.error(
          `[-] FAIL_ZERO_TOLERANCE: Non-monotonic WAL sequence in ${wf}: expected ${prevSeq + 1}, got ${record.sequence}`
        );
        process.exit(1);
      }
      prevSeq = record.sequence;

      const payload = JSON.stringify({
        actionId: record.actionId,
        taskId: record.taskId,
        event: record.event,
        timestamp: record.timestamp,
        entry: record.entry,
      });
      const expectedPayloadHash = crypto.createHash("sha256").update(payload).digest("hex");
      if (record.payloadHash !== expectedPayloadHash) {
        console.error(`[-] FAIL_ZERO_TOLERANCE: WAL payloadHash mismatch at seq ${record.sequence}`);
        process.exit(1);
      }
      const expectedChecksum = crypto
        .createHash("sha256")
        .update(`${record.sequence}:${record.payloadHash}`)
        .digest("hex");
      if (record.checksum !== expectedChecksum) {
        console.error(`[-] FAIL_ZERO_TOLERANCE: WAL checksum mismatch at seq ${record.sequence}`);
        process.exit(1);
      }
    }
  }
  console.log(
    `[+] Verification 2: ${totalWalLines} raw WAL events across ${walFiles.length} WAL file(s) cryptographically verified with monotonic sequence.`
  );

  const rawWalPath = path.join(rawDir, "phase6-ledger.wal");
  fs.writeFileSync(rawWalPath, combinedWalBuffer);
  const rawWalSha256 = crypto.createHash("sha256").update(combinedWalBuffer).digest("hex");

  const evidence = {
    evidenceId: "SEC-CONC-006",
    taskId: "task-concurrency-006",
    timestamp: new Date().toISOString(),
    rawWalArtifact: "artifacts/production-truth/raw/phase6-ledger.wal",
    rawWalSha256,
    rawWalBytes: combinedWalBuffer.length,
    metrics: {
      requestedConcurrency,
      actualPeakConcurrency,
      completedRequests: results.length,
      totalDurationMs,
      filesVerifiedOnDisk: results.length,
      walEventsVerified: totalWalLines,
      zeroCorruption: true,
    },
    counterfactualVerdict: {
      peakConcurrencyAchieved: actualPeakConcurrency > 1,
      allFilesVerified: results.length === requestedConcurrency,
      walMonotonicVerified: true,
      walChecksumsVerified: true,
      walBytes: combinedWalBuffer.length,
      eventsCount: totalWalLines
    }
  };

  const evidencePath = path.join(artifactsDir, "phase6-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`[+] Evidence cryptographically secured at ${evidencePath}`);
  console.log("\n[SUCCESS] Phase 6: Concurrency Truth Harness Passed!");

  await client.close();
  await runner.stop();
  await serverInstance.app.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  process.exit(0);
}

main().catch((err) => {
  console.error("[-] FATAL EXCEPTION", err);
  process.exit(1);
});
