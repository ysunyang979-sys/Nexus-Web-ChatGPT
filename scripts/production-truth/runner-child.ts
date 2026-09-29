import path from "path";
import fs from "fs";
import { LocalBridgeRunner } from "../../apps/runner/src/runner.js";
import { RunnerDaemonConfigSchema } from "../../apps/runner/src/config/schema.js";
import { createLogger } from "@localbridge/shared";

async function main() {
  const serverPort = Number.parseInt(process.env.SERVER_PORT!, 10);
  const runnerToken = process.env.RUNNER_TOKEN!;
  const stateDir = process.env.STATE_DIR!;
  const projectDir = process.env.PROJECT_DIR!;

  const runnerConfig = RunnerDaemonConfigSchema.parse({
    serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
    token: runnerToken,
    statePath: path.join(stateDir, "runner-state.json"),
    projectsPath: path.join(stateDir, "projects.json"),
    autoUpdate: { enabled: false },
    reconnect: { enabled: true, initialDelayMs: 100, maxDelayMs: 500, factor: 1.5, jitter: false },
    heartbeatIntervalMs: 5000,
  });

  const silentLogger = createLogger({ level: "debug", pretty: true, enabled: true });
  const runner = new LocalBridgeRunner(runnerConfig, silentLogger);

  // Monkey patch ActionLedger to hang in EXECUTING state
  const originalRecordExecuted = runner.actionLedger.recordExecuted;
  runner.actionLedger.recordExecuted = async function(actionId: string, result: any, sideEffects: any, checkpointId?: string) {
    const entry = this.entries.get(actionId);
    if (entry && entry.method === 'file.create') {
      console.log("[+] Simulating crash window in ActionLedger execution state...");
      await new Promise(r => setTimeout(r, 10000));
    }
    return originalRecordExecuted.call(this, actionId, result, sideEffects, checkpointId);
  };

  let projId = "";
  try {
    const proj = runner.projectRegistry.add(projectDir, { 
      name: "test-app", 
      accessMode: "read-write",
      restrictedPaths: [] 
    });
    projId = proj.id;
  } catch (e: any) {
    if (!e.message?.includes('already authorized') && e.code !== 'PROJECT_ALREADY_EXISTS') {
      throw e;
    }
    const existing = Array.from(runner.projectRegistry.projects.values()).find((p: any) => p.physicalRoot === projectDir);
    if (existing) projId = existing.id;
  }
  
  await runner.start();
  
  // Keep alive
  process.on('SIGINT', async () => {
    await runner.stop();
    process.exit(0);
  });
  
  console.log(`[+] RUNNER_READY: projectId=${projId}`);
}

main().catch(err => {
  console.error("Runner child error:", err);
  process.exit(1);
});
