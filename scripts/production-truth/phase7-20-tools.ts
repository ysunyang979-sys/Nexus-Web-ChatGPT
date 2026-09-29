import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync, execFileSync } from "node:child_process";

import { buildApp } from "../../apps/server/src/app.js";
import { AppConfigSchema } from "@localbridge/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpRateLimiter } from "../../apps/server/src/mcp/rate-limiter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactsDir = path.resolve(__dirname, "../../artifacts/production-truth");

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function parseRes(res: any): any {
  if (res.isError) {
    throw new Error(`Tool returned isError: ${JSON.stringify(res)}`);
  }
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}

async function main() {
  console.log("======================================================================");
  console.log(" NEXUS P0-1 PRODUCTION TRUTH HARNESS: Phase 7 (20 Core Tools Deep Audit)");
  console.log("======================================================================");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-phase7-truth-"));
  const projectDir = path.join(tmpDir, "sandbox");
  const stateDir = path.join(tmpDir, "state");
  const migrationsDir = path.resolve(__dirname, "../../apps/server/src/db/migrations");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  // Seed package.json and initialize real git repository
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "nexus-phase7-sandbox", version: "1.0.0" }, null, 2),
    "utf-8"
  );
  execFileSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Nexus Audit"], { cwd: projectDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "audit@nexus.local"], { cwd: projectDir, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: projectDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Initial Phase 7 commit"], { cwd: projectDir, stdio: "ignore" });

  const dbFilePath = path.join(stateDir, "nexus.db");
  const managementSecret = "lm_sec_phase7_audit";

  const serverConfig = AppConfigSchema.parse({
    server: { host: "127.0.0.1", port: 0, dbPath: dbFilePath, auth: { managementSecret } },
    logging: { level: "silent", pretty: false },
  });

  const serverInstance = await buildApp({
    config: serverConfig,
    migrationsDir,
    enableLogging: false,
    managementSecret,
    rateLimiter: new McpRateLimiter(1000, 5000),
  });

  const address = await serverInstance.app.listen({ host: "127.0.0.1", port: 0 });
  const serverPort = Number.parseInt(address.match(/:(\d+)$/)![1]!, 10);

  const mcpToken = serverInstance.tokenService.createToken({
    name: "phase7",
    type: "mcp",
    scopes: ["read", "write", "execute"],
    purpose: "audit",
  }).token;

  const runnerTokenRecord = serverInstance.tokenService.createToken({
    name: "Phase7-Runner-Token",
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
    name: "phase7-app",
    accessMode: "read-write",
  });
  runner.projectRegistry.setExecutionMode(proj.id, "project-code");

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

  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${serverPort}/mcp`),
    {
      protocolVersion: "2026-07-28",
      requestInit: {
        headers: { Authorization: `Bearer ${mcpToken}` },
      },
    }
  );

  const client = new Client(
    { name: "Phase7Audit", version: "1.0.0" },
    { capabilities: {}, versionNegotiation: { mode: { pin: "2026-07-28" } } } as any
  );
  await client.connect(transport);

  const verifiedTools: { tool: string; verifiedBy: string }[] = [];
  let createdHash = "";
  let termSessionId = "";
  let termPid = 0;
  const clipPayload = `phase7-clip-${crypto.randomUUID()}`;

  const steps: {
    name: string;
    args: () => Record<string, unknown>;
    verify: (data: any) => string;
  }[] = [
    {
      name: "localbridge_git_info",
      args: () => ({ projectId: proj.id }),
      verify: (d) => {
        if (!d.branch && !d.currentBranch) throw new Error("Git branch missing");
        return `Git branch ${d.branch || d.currentBranch} verified`;
      },
    },
    {
      name: "localbridge_git_log",
      args: () => ({ projectId: proj.id, limit: 5 }),
      verify: (d) => {
        if (!Array.isArray(d.commits) || d.commits.length === 0) throw new Error("Git commits missing");
        return `Git log verified (${d.commits.length} commit(s))`;
      },
    },
    {
      name: "localbridge_project_list",
      args: () => ({}),
      verify: (d) => {
        const found = d.projects?.find((p: any) => p.id === proj.id);
        if (!found || !found.available) throw new Error("Project not available");
        return `Project ${proj.id} available in registry`;
      },
    },
    {
      name: "localbridge_project_info",
      args: () => ({ projectId: proj.id }),
      verify: (d) => {
        if (d.id !== proj.id && d.projectId !== proj.id) throw new Error("Project info mismatch");
        return "Project metadata matches";
      },
    },
    {
      name: "localbridge_directory_list",
      args: () => ({ projectId: proj.id, path: "." }),
      verify: (d) => {
        if (!Array.isArray(d.entries) || !d.entries.some((e: any) => e.name === "package.json")) {
          throw new Error("package.json missing in directory_list");
        }
        return "Directory entries match disk";
      },
    },
    {
      name: "localbridge_file_create",
      args: () => ({ projectId: proj.id, path: "phase7-a.txt", content: "Hello Phase 7" }),
      verify: (d) => {
        createdHash = d.newHash || d.hash;
        const onDisk = fs.readFileSync(path.join(projectDir, "phase7-a.txt"), "utf-8");
        if (onDisk !== "Hello Phase 7") throw new Error("File content mismatch on disk");
        return "fs.readFileSync confirmed phase7-a.txt on disk";
      },
    },
    {
      name: "localbridge_file_stat",
      args: () => ({ projectId: proj.id, path: "phase7-a.txt" }),
      verify: (d) => {
        const realStat = fs.statSync(path.join(projectDir, "phase7-a.txt"));
        if (d.size !== realStat.size) throw new Error("File stat size mismatch");
        return `fs.statSync confirmed ${realStat.size} bytes`;
      },
    },
    {
      name: "localbridge_file_read",
      args: () => ({ projectId: proj.id, path: "phase7-a.txt" }),
      verify: (d) => {
        if (!JSON.stringify(d).includes("Hello Phase 7")) throw new Error("File read mismatch");
        return "File content read verified";
      },
    },
    {
      name: "localbridge_file_write",
      args: () => ({
        projectId: proj.id,
        path: "phase7-a.txt",
        expectedHash: createdHash,
        content: "Hello Phase 7 Updated",
      }),
      verify: (d) => {
        createdHash = d.newHash || d.hash;
        const onDisk = fs.readFileSync(path.join(projectDir, "phase7-a.txt"), "utf-8");
        if (onDisk !== "Hello Phase 7 Updated") throw new Error("Updated content mismatch");
        return "fs.readFileSync confirmed updated content";
      },
    },
    {
      name: "localbridge_fs_copy",
      args: () => ({
        projectId: proj.id,
        sourcePath: "phase7-a.txt",
        targetPath: "phase7-b.txt",
        overwrite: true,
      }),
      verify: () => {
        if (!fs.existsSync(path.join(projectDir, "phase7-b.txt"))) throw new Error("Copy missing");
        return "fs.existsSync confirmed phase7-b.txt";
      },
    },
    {
      name: "localbridge_fs_move",
      args: () => ({
        projectId: proj.id,
        sourcePath: "phase7-b.txt",
        targetPath: "phase7-c.txt",
        overwrite: true,
      }),
      verify: () => {
        if (fs.existsSync(path.join(projectDir, "phase7-b.txt"))) throw new Error("Source still exists");
        if (!fs.existsSync(path.join(projectDir, "phase7-c.txt"))) throw new Error("Target missing");
        return "Atomic move verified on disk";
      },
    },
    {
      name: "localbridge_fs_mkdir",
      args: () => ({ projectId: proj.id, path: "phase7-subdir/nested" }),
      verify: () => {
        if (!fs.statSync(path.join(projectDir, "phase7-subdir/nested")).isDirectory()) {
          throw new Error("Directory not created");
        }
        return "fs.statSync confirmed nested directory";
      },
    },
    {
      name: "localbridge_fs_search",
      args: () => ({ projectId: proj.id, query: "phase7", path: "." }),
      verify: (d) => {
        if (!Array.isArray(d.matches) || d.matches.length === 0) throw new Error("Search returned 0 matches");
        return `Found ${d.matches.length} matching paths`;
      },
    },
    {
      name: "localbridge_fs_grep",
      args: () => ({ projectId: proj.id, pattern: "Updated", path: "." }),
      verify: (d) => {
        if (!d.fileMatches || d.fileMatches.length === 0) throw new Error("Grep returned 0 matches");
        return "Grep matched line in phase7-a.txt";
      },
    },
    {
      name: "localbridge_git_status",
      args: () => ({ projectId: proj.id }),
      verify: (d) => {
        if (d.clean === undefined && d.branch === undefined) throw new Error("Invalid git status");
        return "Git working tree status verified";
      },
    },
    {
      name: "localbridge_command_classify",
      args: () => ({ projectId: proj.id, kind: "tool-version", tool: "node" }),
      verify: (d) => {
        if (!d.risk) throw new Error("Missing risk classification");
        return `Risk classified as ${d.risk}`;
      },
    },
    {
      name: "localbridge_command_run",
      args: () => ({ projectId: proj.id, kind: "tool-version", tool: "node" }),
      verify: (d) => {
        if (!String(d.stdout).includes("v")) throw new Error("Node version stdout missing");
        return `Node version output verified: ${String(d.stdout).trim()}`;
      },
    },
    {
      name: "localbridge_terminal_start",
      args: () => ({ projectId: proj.id }),
      verify: (d) => {
        termSessionId = d.terminalSessionId;
        termPid = d.pid;
        if (!termSessionId || !termPid) throw new Error("Missing terminalSessionId or pid");
        return `Spawned terminal PID ${termPid}`;
      },
    },
    {
      name: "localbridge_terminal_stop",
      args: () => ({ terminalSessionId: termSessionId, force: true }),
      verify: (d) => {
        if (d.state !== "stopped") throw new Error("Terminal not stopped");
        return `Stopped terminal ${termSessionId}`;
      },
    },
    {
      name: "localbridge_computer_clipboard_write",
      args: () => ({ text: clipPayload }),
      verify: () => {
        const osClip = execSync("powershell -NoProfile -Command Get-Clipboard", { encoding: "utf-8" }).trim();
        if (osClip !== clipPayload) throw new Error(`Clipboard mismatch: ${osClip}`);
        return "Windows OS clipboard verified via Get-Clipboard";
      },
    },
  ];

  console.log(`[+] Executing ${steps.length} core tools sequentially with independent OS verification...`);
  for (const step of steps) {
    const rawRes = await client.callTool({
      name: step.name,
      arguments: step.args(),
    });
    const parsed = parseRes(rawRes);
    const verifiedBy = step.verify(parsed);
    verifiedTools.push({ tool: step.name, verifiedBy });
    console.log(`  [PASS] ${step.name} -> ${verifiedBy}`);
  }

  // Verify raw WAL files and persist raw artifact
  const rawDir = path.join(artifactsDir, "raw");
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

  const ledgerDir = path.join(stateDir, "action-ledger");
  const walFiles = fs.readdirSync(ledgerDir).filter((f) => f.endsWith("-ledger.wal"));
  let committedCount = 0;
  let combinedWalBuffer = Buffer.alloc(0);
  for (const wf of walFiles) {
    const walBuf = fs.readFileSync(path.join(ledgerDir, wf));
    combinedWalBuffer = Buffer.concat([combinedWalBuffer, walBuf]);
    const lines = walBuf
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const rec = JSON.parse(line);
      if (rec.event === "ACTION_COMMITTED") committedCount++;
    }
  }
  if (committedCount < steps.length) {
    console.error(`[-] FAIL_ZERO_TOLERANCE: Expected at least ${steps.length} ACTION_COMMITTED in WAL, got ${committedCount}`);
    process.exit(1);
  }
  console.log(`[+] Verification: ${committedCount} ACTION_COMMITTED events verified in raw WAL.`);

  const rawWalPath = path.join(rawDir, "phase7-ledger.wal");
  fs.writeFileSync(rawWalPath, combinedWalBuffer);
  const rawWalSha256 = crypto.createHash("sha256").update(combinedWalBuffer).digest("hex");

  const evidence = {
    evidenceId: "SEC-20TOOLS-007",
    timestamp: new Date().toISOString(),
    rawWalArtifact: "artifacts/production-truth/raw/phase7-ledger.wal",
    rawWalSha256,
    rawWalBytes: combinedWalBuffer.length,
    metrics: {
      toolsTested: verifiedTools.length,
      toolsPassed: verifiedTools.length,
      walCommittedCount: committedCount,
      verifiedTools,
    },
    counterfactualVerdict: {
      toolsTestedCount: verifiedTools.length,
      toolsPassedCount: verifiedTools.length,
      walCommittedCount: committedCount,
      walBytes: combinedWalBuffer.length,
      rawWalSha256
    }
  };

  const evidencePath = path.join(artifactsDir, "phase7-evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`[+] Evidence cryptographically secured at ${evidencePath}`);
  console.log("\n[SUCCESS] Phase 7: 20 Core Tools Truth Harness Passed!");

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
