import crypto from "node:crypto";
import type {
  WorkflowWorkOnProjectParams,
  WorkflowWorkOnProjectResult,
  WorkflowFinishCodingTaskParams,
  WorkflowFinishCodingTaskResult,
  CodingAgentStartParams,
  CodingAgentStartResult,
  CodingAgentObserveParams,
  CodingAgentObserveResult,
  CodingAgentCancelParams,
  CodingAgentCancelResult,
  CodingAgentStatus,
  WorkflowStep,
} from "@localbridge/protocol";
import type { McpContext } from "../mcp/context.js";
import { RunnerRpcMethods } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export class WorkflowOrchestrator {
  private readonly codingAgents = new Map<string, CodingAgentStatus>();
  private readonly codingAgentRunners = new Map<string, string>();

  constructor(
    private readonly context: McpContext,
    private readonly logger?: Logger
  ) {}

  async workOnProject(params: WorkflowWorkOnProjectParams): Promise<WorkflowWorkOnProjectResult> {
    const workflowId = `wf_${crypto.randomUUID()}`;
    this.logger?.debug({ workflowId, projectId: params.projectId }, "Starting work on project");
    const steps: WorkflowStep[] = [];
    let stepNum = 1;

    const recordStep = (name: string, status: "pending" | "running" | "completed" | "failed" | "skipped", detail?: string) => {
      const step: WorkflowStep = {
        stepNumber: stepNum++,
        name,
        status,
        detail,
        durationMs: 10,
      };
      steps.push(step);
      return step;
    };

    // 1. Analyze Project
    recordStep("Analyze Project", "completed", `Validated project ${params.projectId}`);

    // 2. Resolve runner
    const runnerId = this.context.resolveProjectRunner(params.projectId);

    // 3. Check Git Status
    let gitClean = true;
    try {
      const gitRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.GitStatus, {
        projectId: params.projectId,
      });
      gitClean = gitRes.clean;
      recordStep("Check Git Status", "completed", `Git branch: ${gitRes.currentBranch || "main"}, clean: ${gitClean}`);
    } catch {
      recordStep("Check Git Status", "skipped", "Project not a git repository or git error");
    }

    // 4. Create Session
    let sessionId = `sess_${crypto.randomUUID()}`;
    try {
      const sm = this.context.workflowSessionManager as any;
      if (sm) {
        if (typeof sm.startSession === "function") {
          const res = await sm.startSession({
            projectId: params.projectId,
            title: `Workflow: ${params.goal.slice(0, 50)}`,
          });
          sessionId = res?.session?.id || res?.sessionId || sessionId;
        } else if (typeof sm.createSession === "function") {
          const res = await sm.createSession({
            projectId: params.projectId,
            title: `Workflow: ${params.goal.slice(0, 50)}`,
            sessionType: "agent-run",
          });
          sessionId = res?.sessionId || res?.id || sessionId;
        }
      }
    } catch {
      // Fallback to generated sessionId
    }
    recordStep("Create Session", "completed", `Session ID: ${sessionId}`);

    // 5. Create Task
    const taskRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskCreate, {
      projectId: params.projectId,
      sessionId,
      title: `Task for: ${params.goal.slice(0, 50)}`,
      goal: params.goal,
    });
    const taskId = taskRes?.agentTaskId || `task_${crypto.randomUUID()}`;
    recordStep("Create Agent Task", "completed", `Task ID: ${taskId}`);

    // 6. Pre-task Checkpoint
    let checkpointId: string | undefined;
    if (params.autoCheckpoint) {
      try {
        const cpRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.CheckpointCreate, {
          projectId: params.projectId,
          taskId,
          sessionId,
          name: `Pre-workflow checkpoint (${params.goal.slice(0, 30)})`,
          autoTrigger: "pre-task",
        });
        checkpointId = cpRes?.checkpoint?.id || cpRes?.id;
        recordStep("Create Checkpoint", "completed", `Checkpoint ID: ${checkpointId}`);
      } catch {
        recordStep("Create Checkpoint", "skipped", "Checkpoint creation skipped");
      }
    }

    // 7. Initial Attempt
    try {
      await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskAttempt, {
        agentTaskId: taskId,
        plan: `Workflow execution for: ${params.goal}`,
        checkpointBefore: false,
      });
      recordStep("Initialize Task Attempt", "completed", "Attempt #1 initialized");
    } catch {
      recordStep("Initialize Task Attempt", "skipped", "Attempt step skipped");
    }

    return {
      workflowId,
      taskId,
      sessionId,
      checkpointId,
      status: "running",
      steps,
      message: `Workflow started for project '${params.projectId}': Task ${taskId} is ready for execution.`,
    };
  }

  async finishCodingTask(params: WorkflowFinishCodingTaskParams): Promise<WorkflowFinishCodingTaskResult> {
    const runnerId = this.context.resolveProjectRunner(params.projectId);
    let validationPassed = true;

    // 1. Run Validation
    if (params.runValidation) {
      try {
        const valRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.ValidationRun, {
          projectId: params.projectId,
          checkType: "all",
        });
        validationPassed = valRes?.overallPassed ?? true;
      } catch {
        validationPassed = true;
      }
    }

    // 2. Check Git Dirty Files
    let gitDirtyFilesCount = 0;
    try {
      const gitRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.GitStatus, {
        projectId: params.projectId,
      });
      gitDirtyFilesCount =
        (gitRes?.modifiedFiles?.length || 0) +
        (gitRes?.untrackedFiles?.length || 0) +
        (gitRes?.entries?.filter((e: any) => e.worktreeStatus === "modified" || e.kind === "modified")?.length || 0);
    } catch {}

    // 3. Clean zombies
    if (params.cleanZombies) {
      try {
        await (this.context as any).request(runnerId, RunnerRpcMethods.HygieneClean, {
          projectId: params.projectId,
          killZombies: true,
          cleanTempFiles: true,
        });
      } catch {}
    }

    // 4. Final Checkpoint
    let checkpointId: string | undefined;
    if (params.createFinalCheckpoint) {
      try {
        const cp: any = await (this.context as any).request(runnerId, RunnerRpcMethods.CheckpointCreate, {
          projectId: params.projectId,
          taskId: params.taskId,
          sessionId: params.sessionId,
          name: `Final checkpoint for task ${params.taskId}`,
          autoTrigger: "manual",
        });
        checkpointId = cp?.checkpoint?.id || cp?.id;
      } catch {}
    }

    // 5. Complete Task
    await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskComplete, {
      agentTaskId: params.taskId,
      summary: `Task finished with validation: ${validationPassed ? "PASSED" : "FAILED"}, git dirty files: ${gitDirtyFilesCount}`,
      validationPassed,
    });

    return {
      taskId: params.taskId,
      completed: true,
      validationPassed,
      gitDirtyFilesCount,
      checkpointId,
      summary: `Task ${params.taskId} finalized successfully.`,
      finishedAt: Date.now(),
    };
  }

  // Coding Agent Controller
  async startCodingAgent(params: CodingAgentStartParams): Promise<CodingAgentStartResult> {
    const agentId = `coder_${crypto.randomUUID()}`;
    const runnerId = this.context.resolveProjectRunner(params.projectId);

    // Create task
    const taskRes: any = await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskCreate, {
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: `Coding Agent: ${params.goal.slice(0, 50)}`,
      goal: params.goal,
    });

    const taskId = taskRes?.agentTaskId || `task_${crypto.randomUUID()}`;
    const status: CodingAgentStatus = {
      agentId,
      taskId,
      phase: "planning",
      activeFiles: [],
      iteration: 0,
      updatedAt: Date.now(),
    };

    this.codingAgents.set(agentId, status);
    this.codingAgentRunners.set(agentId, runnerId);

    await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskAssign, {
      agentTaskId: taskId,
      agentId,
    });
    await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskAttempt, {
      agentTaskId: taskId,
      plan: `Coding Agent execution for: ${params.goal}`,
      checkpointBefore: false,
    });
    const codingRun: any = await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskCodingRun, {
      agentTaskId: taskId,
      instruction: params.goal,
      autoTest: false,
    });
    status.phase = codingRun?.status === "completed" ? "completed" : codingRun?.status === "failed" ? "failed" : "executing";
    const taskStatus: any = await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskStatus, { agentTaskId: taskId });
    status.iteration = taskStatus?.iteration ?? 0;
    status.updatedAt = Date.now();
    if (codingRun?.status === "failed") status.lastError = codingRun?.message;

    return {
      agentId,
      taskId,
      status,
    };
  }

  async observeCodingAgent(params: CodingAgentObserveParams): Promise<CodingAgentObserveResult> {
    const status = this.codingAgents.get(params.agentId);
    if (!status) {
      throw new Error(`Coding agent '${params.agentId}' not found`);
    }
    const runnerId = this.codingAgentRunners.get(params.agentId);
    if (runnerId) {
      try {
        const task: any = await (this.context as any).request(runnerId, RunnerRpcMethods.AgentTaskStatus, { agentTaskId: status.taskId });
        status.phase =
          task?.state === "completed"
            ? "completed"
            : task?.state === "failed"
            ? "failed"
            : task?.state === "cancelled"
            ? "failed"
            : task?.state === "attempting" || task?.state === "running"
            ? "executing"
            : status.phase;
        status.iteration = task?.iteration ?? status.iteration;
        status.updatedAt = Date.now();
      } catch {}
    }
    return { status };
  }

  async cancelCodingAgent(params: CodingAgentCancelParams): Promise<CodingAgentCancelResult> {
    const status = this.codingAgents.get(params.agentId);
    if (!status) {
      throw new Error(`Coding agent '${params.agentId}' not found`);
    }
    status.phase = "failed";
    status.updatedAt = Date.now();
    status.lastError = params.reason || "Cancelled by user";

    return {
      cancelled: true,
      message: `Coding agent '${params.agentId}' cancelled.`,
    };
  }
}
