import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AgentTaskManager } from "../apps/runner/src/agent-task/agent-task-manager.js";
import { computeFailureFingerprint } from "../packages/security/src/agent/fingerprint.js";

describe("Nexus 2.0 Long-term Agent Task Pillar", () => {
  let tmpStateDir: string;
  let manager: AgentTaskManager;

  beforeEach(() => {
    tmpStateDir = path.join(os.tmpdir(), `agent-task-test-${Date.now()}`);
    fs.mkdirSync(tmpStateDir, { recursive: true });
    manager = new AgentTaskManager(tmpStateDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpStateDir, { recursive: true, force: true });
    } catch {}
  });

  it("creates, queries status, pauses, resumes, and cancels an Agent Task", async () => {
    const createRes = await manager.create({
      projectId: "proj_long_task",
      title: "Build and Deploy Pipeline",
      goal: "Compile TypeScript and run automated test suites",
      resourcePolicy: {
        maxWallTimeMs: 3600000,
        maxActions: 100,
      },
    });

    expect(createRes.agentTaskId).toBeDefined();
    expect(createRes.state).toBe("queued");
    expect(createRes.deadlineAt).toBeGreaterThan(Date.now());

    // Status query
    const statusRes = await manager.status({ agentTaskId: createRes.agentTaskId });
    expect(statusRes.title).toBe("Build and Deploy Pipeline");
    expect(statusRes.actionCount).toBe(0);

    // Pause
    const pauseRes = await manager.pause({
      agentTaskId: createRes.agentTaskId,
      reason: "Waiting for code review",
    });
    expect(pauseRes.state).toBe("paused");

    // Resume
    const resumeRes = await manager.resume({ agentTaskId: createRes.agentTaskId });
    expect(resumeRes.state).toBe("running");

    // Cancel
    const cancelRes = await manager.cancel({ agentTaskId: createRes.agentTaskId });
    expect(cancelRes.state).toBe("cancelled");
  });

  it("detects failure loops and stops execution when same failure repeats 3 times", async () => {
    const task = await manager.create({
      projectId: "proj_loop_test",
      title: "Dependency Installation",
      goal: "Install broken dependencies",
      resourcePolicy: {
        maxSameActionRepeats: 3,
      },
    });

    // 1st failure
    manager.recordAction(task.agentTaskId, "npm install", "npm install", 1, "ERESOLVE unable to resolve dependency tree");
    let status = await manager.status({ agentTaskId: task.agentTaskId });
    expect(status.sameActionRepeats).toBe(1);
    expect(status.state).toBe("queued");

    // 2nd failure
    manager.recordAction(task.agentTaskId, "npm install", "npm install", 1, "ERESOLVE unable to resolve dependency tree");
    status = await manager.status({ agentTaskId: task.agentTaskId });
    expect(status.sameActionRepeats).toBe(2);

    // 3rd failure: triggers FAILURE_LOOP_DETECTED -> enters 'waiting'
    manager.recordAction(task.agentTaskId, "npm install", "npm install", 1, "ERESOLVE unable to resolve dependency tree");
    status = await manager.status({ agentTaskId: task.agentTaskId });
    expect(status.sameActionRepeats).toBe(3);
    expect(status.state).toBe("waiting");

    // Check logs for FAILURE_LOOP_DETECTED
    const logs = await manager.logs({ agentTaskId: task.agentTaskId });
    const loopLog = logs.logs.find((l) => l.message.includes("FAILURE_LOOP_DETECTED"));
    expect(loopLog).toBeDefined();
  });

  it("creates, saves versioned checkpoints atomically and handles approvals", async () => {
    const task = await manager.create({
      projectId: "proj_cp_test",
      title: "Refactor Architecture",
      goal: "Implement Microservices",
    });

    // Save checkpoint
    const cp = manager.saveCheckpoint(task.agentTaskId, {
      phase: "execute",
      modifiedFiles: ["src/index.ts", "package.json"],
      activeRuntimeIds: ["rt_1"],
    });

    expect(cp.schemaVersion).toBe(2);
    expect(cp.modifiedFiles).toContain("src/index.ts");

    // Approve
    const approveRes = await manager.approve({
      agentTaskId: task.agentTaskId,
      approvalId: "appr_123",
      action: "approve",
    });
    expect(approveRes.state).toBe("running");

    // Check logs
    const logsRes = await manager.logs({ agentTaskId: task.agentTaskId });
    expect(logsRes.logs.length).toBeGreaterThan(0);
    expect(logsRes.logs.some((l) => l.logType === "checkpoint")).toBe(true);
    expect(logsRes.logs.some((l) => l.logType === "approval")).toBe(true);
  });

  it("plans and decomposes compound multi-action instructions into distinct iterations", async () => {
    const task = await manager.create({
      projectId: "proj_multi_action",
      title: "Multi Action Audit",
      goal: "1. 读取 Myweb 根目录 _config.yml\n2. 再次读取 _config.yml 并比较结果",
    });

    const record = manager.getTaskRecord(task.agentTaskId)!;
    const steps = manager.executor.planExecutionSteps(record, record.goal);

    expect(steps.length).toBe(3);
    expect(steps[0]?.actionPlan.actionName).toBe("filesystem.read");
    expect(steps[1]?.actionPlan.actionName).toBe("filesystem.read");
    expect(steps[2]?.actionPlan.actionName).toBe("filesystem.stat");

    expect(manager.executor.hasPendingGoalSteps(record)).toBe(true);
  });
});
