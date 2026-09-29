import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ActionLedger } from "../apps/runner/src/agent-task/action-ledger.js";

describe("Action Ledger WAL & Snapshot Load Test & Benchmark", () => {
  async function runBenchmark(actionCount: number) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-${actionCount}-`));
    try {
      const ledger = new ActionLedger(tmpDir);
      const taskId = `task_load_${actionCount}`;
      const executionId = `exec_${taskId}`;

      const start = Date.now();

      for (let i = 1; i <= actionCount; i++) {
        const prep = await ledger.prepareAction({
          taskId,
          executionId,
          toolName: "localbridge_file_create",
          method: "file.create",
          params: { path: `item-${i}.txt`, content: `data #${i}` },
          idempotencyKey: `idem_bench_${actionCount}_${i}`,
        });

        await ledger.startAction(prep.actionId, "sha256:pre");
        await ledger.recordExecuted(prep.actionId, { newHash: `sha256:h_${i}` });
        await ledger.startVerification(prep.actionId);
        await ledger.recordVerified(prep.actionId, `sha256:h_${i}`, { verified: true });
        await ledger.commitAction(prep.actionId);
      }

      ledger.flushTask(taskId);
      const elapsedMs = Date.now() - start;
      const metrics = ledger.getMetrics(taskId);

      const committed = ledger.getActionsForTask(taskId).filter((a) => a.status === "COMMITTED");
      expect(committed.length).toBe(actionCount);

      // Verify Crash Recovery & Replay by creating a fresh ActionLedger instance on the same directory
      const recoveryLedger = new ActionLedger(tmpDir);
      const recoveredCommitted = recoveryLedger.getActionsForTask(taskId).filter((a) => a.status === "COMMITTED");
      expect(recoveredCommitted.length).toBe(actionCount);

      // Verify Idempotency check
      const dup = await recoveryLedger.prepareAction({
        taskId,
        executionId,
        toolName: "localbridge_file_create",
        method: "file.create",
        params: { path: `item-1.txt`, content: `data #1` },
        idempotencyKey: `idem_bench_${actionCount}_1`,
      });
      expect(dup.status).toBe("COMMITTED");

      const averageActionMs = Number((elapsedMs / actionCount).toFixed(2));

      console.log(
        `\n[BENCHMARK RESULT ${actionCount} Actions]:\n` +
        `  Elapsed: ${elapsedMs} ms\n` +
        `  Average per action: ${averageActionMs} ms\n` +
        `  WAL Events: ${metrics.walEventCount}\n` +
        `  Snapshots: ${metrics.snapshotCount}\n` +
        `  Ledger Size: ${metrics.ledgerBytes} bytes (${(metrics.ledgerBytes / 1024).toFixed(1)} KB)\n` +
        `  WAL Size: ${metrics.walBytes} bytes (${(metrics.walBytes / 1024).toFixed(1)} KB)\n` +
        `  Committed: ${committed.length}/${actionCount}\n` +
        `  Crash Recovery: PASS\n` +
        `  Idempotency Skip: PASS`
      );

      return {
        actionCount,
        elapsedMs,
        averageActionMs,
        walEventCount: metrics.walEventCount,
        snapshotCount: metrics.snapshotCount,
        ledgerBytes: metrics.ledgerBytes,
        walBytes: metrics.walBytes,
        committedCount: committed.length,
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  it("Benchmark 10 actions", async () => {
    await runBenchmark(10);
  });

  it("Benchmark 50 actions", async () => {
    await runBenchmark(50);
  });

  it("Benchmark 100 actions", async () => {
    await runBenchmark(100);
  });

  it("Benchmark 500 actions", async () => {
    await runBenchmark(500);
  });
});
