import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  computeFailureFingerprint,
} from "@localbridge/security";
import type {
  AgentTaskCreateParams,
  AgentTaskCreateResult,
  AgentTaskStatusParams,
  AgentTaskStatusResult,
  AgentTaskLogsParams,
  AgentTaskLogsResult,
  AgentTaskCancelParams,
  AgentTaskCancelResult,
  AgentTaskPauseParams,
  AgentTaskPauseResult,
  AgentTaskResumeParams,
  AgentTaskResumeResult,
  AgentTaskListParams,
  AgentTaskListResult,
  AgentTaskApproveParams,
  AgentTaskApproveResult,
  AgentTaskAssignParams,
  AgentTaskAssignResult,
  AgentTaskAttemptParams,
  AgentTaskAttemptResult,
  AgentTaskCodingRunParams,
  AgentTaskCodingRunResult,
  AgentTaskHeartbeatParams,
  AgentTaskHeartbeatResult,
  AgentTaskReconcileParams,
  AgentTaskReconcileResult,
  AgentTaskCompleteParams,
  AgentTaskCompleteResult,
  AgentTaskHandoffParams,
  AgentTaskHandoffResult,
  AgentTaskCheckpointCreateParams,
  AgentTaskCheckpointCreateResult,
  AgentTaskCheckpointRestoreParams,
  AgentTaskCheckpointRestoreResult,
  AgentTaskCheckpointListParams,
  AgentTaskCheckpointListResult,
  AgentTaskDisconnectParams,
  AgentTaskDisconnectResult,
  AgentTaskTakeoverParams,
  AgentTaskTakeoverResult,
  AgentTaskSummary,
  AgentTaskState,
  AgentResourcePolicy,
  AgentResourceUsage,
  AgentCheckpoint,
  AgentTaskLogEntry,
  AgentTaskLogType,
  DurableAction,
  ComputerStateCheck,
  DurableComputerState,
} from "@localbridge/protocol";
import { type Logger } from "@localbridge/shared";
import type { ProcessOwnershipTracker } from "../process/ownership-tracker.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import type { PersistentRuntimeManager } from "../runtime/manager.js";
import type { WorkspaceCheckpointService } from "../checkpoints/checkpoint-service.js";
import type { UnifiedValidationService } from "../validation/validation-service.js";
import type { FilesystemService } from "../filesystem/service.js";
import type { LocalBridgeEventBus } from "../events/event-bus-service.js";
import type { LocalBridgeObservabilityService } from "../trace/trace-service.js";
import type { GitService } from "../git/service.js";
import type { CommandExecutionService } from "../process/service.js";
import type { ProjectRegistry } from "../projects/registry.js";
import type { WindowsComputerUseService } from "../computer-use/computer-use-service.js";
import type { VisionService } from "../vision/vision-service.js";
import type { DocumentService } from "../documents/document-service.js";
import type { ToolRegistryService } from "../tools/tool-registry.js";
import type { ArtifactService } from "../artifacts/artifact-service.js";
import { AgentExecutor } from "./agent-executor.js";
import { AgentTaskScheduler } from "./agent-task-scheduler.js";
import { ActionLedger } from "./action-ledger.js";


export interface InternalAgentTaskRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  executionId?: string;
  assignedAgentId?: string;
  attemptNumber?: number;
  lastHeartbeatAt?: number;
  modifiedFiles?: string[];
  artifacts?: string[];
  title: string;
  goal: string;
  state: AgentTaskState;
  resourcePolicy: AgentResourcePolicy;
  resourceUsage: AgentResourceUsage;
  iteration: number;
  actionCount: number;
  failureCount: number;
  sameActionRepeats: number;
  lastFailureFingerprint?: string | null;
  waitingForApproval: boolean;
  pendingApprovalId?: string | null;
  createdAt: number;
  startedAt?: number | null;
  deadlineAt: number;
  finishedAt?: number | null;
  latestCheckpoint?: AgentCheckpoint | null;
  checkpointHistory?: string[];
  actionHistory?: DurableAction[];
  verifiedStateSummary?: string;
  logs: AgentTaskLogEntry[];
  nextLogSequence: number;
  wallTimer?: NodeJS.Timeout;
  executionInstruction?: string;
  plan?: string;
  lastToolResult?: Record<string, any>;
  executionEvidence?: Record<string, any>;
  readResults?: Array<{
    path: string;
    lines: number;
    snippet: string;
    hash: string;
    timestamp: number;
  }>;
}

export class AgentTaskManager {
  private readonly tasks = new Map<string, InternalAgentTaskRecord>();
  private readonly tasksDir?: string;
  private readonly checkpointsDir?: string;
  private artifactService?: ArtifactService;
  private actionLedger?: ActionLedger;
  public executor: AgentExecutor;
  public scheduler: AgentTaskScheduler;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly ownershipTracker?: ProcessOwnershipTracker,
    private readonly terminalManager?: TerminalManager,
    public readonly runtimeManager?: PersistentRuntimeManager,
    private readonly logger?: Logger,
    private readonly filesystemService?: FilesystemService,
    private readonly eventBus?: LocalBridgeEventBus,
    private readonly observabilityService?: LocalBridgeObservabilityService,
    private readonly projectRegistry?: ProjectRegistry,
    private readonly gitService?: GitService,
    private readonly validationService?: UnifiedValidationService,
    private readonly commandExecutionService?: CommandExecutionService,
    private computerUseService?: WindowsComputerUseService
  ) {
    if (this.runnerStateDir) {
      this.tasksDir = path.join(this.runnerStateDir, "agent-tasks");
      this.checkpointsDir = path.join(this.runnerStateDir, "agent-task-checkpoints");
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true });
      }
      if (!fs.existsSync(this.checkpointsDir)) {
        fs.mkdirSync(this.checkpointsDir, { recursive: true });
      }
      this.reconcileAndRecover();
    }

    this.executor = new AgentExecutor(
      this,
      this.filesystemService,
      this.gitService,
      this.runtimeManager,
      this.terminalManager,
      this.validationService,
      this.commandExecutionService,
      this.projectRegistry,
      this.eventBus,
      this.observabilityService,
      this.logger,
      this.computerUseService
    );

    this.scheduler = new AgentTaskScheduler(this, this.executor, this.logger);
    this.scheduler.start();
  }

  stop(): void {
    this.scheduler.stop();
  }

  setArtifactService(service: ArtifactService): void {
    this.artifactService = service;
  }

  setComputerUseService(service: WindowsComputerUseService): void {
    this.computerUseService = service;
    this.executor.setComputerUseService(service);
  }

  setVisionService(service: VisionService): void {
    this.executor.setVisionService(service);
  }

  setDocumentService(service: DocumentService): void {
    this.executor.setDocumentService(service);
  }

  setToolRegistryService(service: ToolRegistryService): void {
    this.executor.setToolRegistryService(service);
  }


  getTaskRecord(taskId: string): InternalAgentTaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  getActiveTasks(): InternalAgentTaskRecord[] {
    return Array.from(this.tasks.values()).filter(
      (t) =>
        t.state === "running" ||
        t.state === "attempting" ||
        t.state === "queued" ||
        t.state === "paused" ||
        t.state === "waiting"
    );
  }

  setActionLedger(ledger: ActionLedger): void {
    this.actionLedger = ledger;
    for (const task of this.tasks.values()) {
      this.actionLedger.reduceTaskState(task);
      this.saveTask(task);
    }
  }

  getActionLedger(): ActionLedger | undefined {
    return this.actionLedger;
  }

  resolveActiveTask(criteria: {
    taskId?: string;
    sessionId?: string;
    projectId?: string;
  }): InternalAgentTaskRecord | undefined {
    if (criteria.taskId) {
      const found = this.tasks.get(criteria.taskId);
      if (found) return found;
    }
    if (criteria.sessionId) {
      const found = Array.from(this.tasks.values()).find(
        (t) =>
          t.sessionId === criteria.sessionId &&
          (t.state === "running" ||
            t.state === "attempting" ||
            t.state === "queued" ||
            t.state === "paused" ||
            t.state === "waiting")
      );
      if (found) return found;
    }
    if (criteria.projectId) {
      const matching = Array.from(this.tasks.values()).filter(
        (t) =>
          t.projectId === criteria.projectId &&
          (t.state === "running" ||
            t.state === "attempting" ||
            t.state === "queued" ||
            t.state === "paused" ||
            t.state === "waiting")
      );
      if (matching.length > 0) {
        return matching.sort((a, b) => b.createdAt - a.createdAt)[0];
      }
    }
    const active = this.getActiveTasks();
    if (active.length === 1) {
      return active[0];
    }
    return undefined;
  }

  public async getOrCreateAmbientTask(criteria: {
    sessionId?: string;
    projectId?: string;
  }): Promise<InternalAgentTaskRecord> {
    const existing = this.resolveActiveTask(criteria);
    if (existing) return existing;

    const sessionId = criteria.sessionId || "default-ambient-session";
    for (const t of this.tasks.values()) {
      if (
        (t.sessionId === sessionId || t.id === `task_ambient_${sessionId}`) &&
        t.state !== "cancelled" &&
        t.state !== "timed_out"
      ) {
        return t;
      }
    }

    const taskId = `task_ambient_${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const now = Date.now();
    const policy: AgentResourcePolicy = {
      maxWallTimeMs: 86400000,
      maxIterations: 10000,
      maxCpuTimeMs: undefined,
      maxMemoryBytes: 8589934592,
      maxDiskWriteBytes: 10737418240,
      maxOutputBytes: 104857600,
      maxTerminalSessions: 16,
      maxRuntimes: 16,
      maxProcesses: 128,
      maxConcurrentActions: 10,
      maxSameActionRepeats: 10,
      maxFailures: 50,
      maxActions: 10000,
    };

    const record: InternalAgentTaskRecord = {
      id: taskId,
      projectId: criteria.projectId,
      sessionId,
      title: `Ambient Execution (${sessionId})`,
      goal: "Track and verify all direct MCP and ambient runtime actions",
      state: "running",
      resourcePolicy: policy,
      resourceUsage: {
        wallTimeMs: 0,
        cpuTimeMs: 0,
        memoryBytes: 0,
        diskWriteBytes: 0,
        outputBytes: 0,
        activeTerminalSessions: 0,
        activeRuntimes: 0,
        activeProcesses: 0,
        actionsExecuted: 0,
        iterations: 0,
        failures: 0,
      },
      iteration: 0,
      actionCount: 0,
      failureCount: 0,
      sameActionRepeats: 0,
      waitingForApproval: false,
      createdAt: now,
      startedAt: now,
      deadlineAt: now + policy.maxWallTimeMs,
      finishedAt: null,
      logs: [],
      nextLogSequence: 1,
      actionHistory: [],
    };

    this.tasks.set(taskId, record);
    this.saveTask(record);
    return record;
  }

  setServices(services: {
    projectRegistry?: ProjectRegistry;
    gitService?: GitService;
    validationService?: UnifiedValidationService;
    commandExecutionService?: CommandExecutionService;
  }): void {
    this.executor = new AgentExecutor(
      this,
      this.filesystemService,
      services.gitService ?? this.gitService,
      this.runtimeManager,
      this.terminalManager,
      services.validationService ?? this.validationService,
      services.commandExecutionService ?? this.commandExecutionService,
      services.projectRegistry ?? this.projectRegistry,
      this.eventBus,
      this.observabilityService,
      this.logger,
      this.computerUseService
    );
  }

  /**
   * Recover persisted agent tasks on startup and reconcile with live actual state.
   */
  private reconcileAndRecover(): void {
    if (!this.tasksDir || !fs.existsSync(this.tasksDir)) return;
    try {
      const files = fs.readdirSync(this.tasksDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const fullPath = path.join(this.tasksDir, file);
        try {
          const data = fs.readFileSync(fullPath, "utf-8");
          const task = JSON.parse(data) as InternalAgentTaskRecord;

          // Verify checkpoint versioning and migration
          if (task.latestCheckpoint && task.latestCheckpoint.schemaVersion !== 2) {
            this.logger?.info({ taskId: task.id }, "Migrating checkpoint schema to version 2");
            task.latestCheckpoint = this.migrateCheckpoint(task.latestCheckpoint, 2);
          }

          // State reconciliation: If task was running or planning or recovering, reconcile upon runner restart
          if (task.state === "running" || task.state === "planning" || task.state === "recovering") {
            if (Date.now() > task.deadlineAt) {
              task.state = "timed_out";
              task.finishedAt = Date.now();
            } else {
              // Keep task paused upon runner restart until explicit resume/reconciliation
              task.state = "paused";
            }
          }

          this.tasks.set(task.id, task);
        } catch (fileErr) {
          this.logger?.warn({ fileErr, file }, "Corrupted task file detected during recovery, safely skipping");
        }
      }
      if (this.actionLedger) {
        this.actionLedger.loadAllLedgers();
        for (const task of this.tasks.values()) {
          this.actionLedger.reduceTaskState(task);
          this.saveTask(task);
        }
      }
      this.logger?.info({ count: this.tasks.size }, "Recovered and reconciled Agent tasks");
    } catch (err) {
      this.logger?.warn({ err }, "Error recovering agent tasks from disk");
    }
  }

  /**
   * Schema migration hook for checkpoints.
   */
  private migrateCheckpoint(checkpoint: any, targetVersion: number): AgentCheckpoint {
    return {
      schemaVersion: targetVersion,
      checkpointId: checkpoint.checkpointId || `cp_${crypto.randomUUID()}`,
      agentTaskId: checkpoint.agentTaskId || checkpoint.taskId,
      taskId: checkpoint.taskId || checkpoint.agentTaskId,
      executionId: checkpoint.executionId || `exec_${checkpoint.agentTaskId || checkpoint.taskId || "default"}`,
      timestamp: checkpoint.timestamp || new Date().toISOString(),
      createdAtMs: checkpoint.createdAtMs || Date.now(),
      taskState: checkpoint.taskState,
      executionState: checkpoint.executionState,
      currentStep: checkpoint.currentStep ?? checkpoint.iteration ?? 0,
      completedSteps: checkpoint.completedSteps ?? checkpoint.iteration ?? 0,
      failedSteps: checkpoint.failedSteps ?? 0,
      actionHistory: checkpoint.actionHistory || [],
      computerState: checkpoint.computerState,
      context: checkpoint.context,
      artifacts: checkpoint.artifacts || [],
      verificationResults: checkpoint.verificationResults || [],
      pendingAction: checkpoint.pendingAction,
      recoveryMetadata: checkpoint.recoveryMetadata || {
        retryCount: 0,
        isSafeToResume: true,
        checkpointTrigger: "periodic",
      },
      iteration: checkpoint.iteration || 0,
      phase: checkpoint.phase || "observe",
      goal: checkpoint.goal || "",
      observations: checkpoint.observations || [],
      actions: checkpoint.actions || [],
      activeRuntimeIds: checkpoint.activeRuntimeIds || [],
      activeTerminalSessionIds: checkpoint.activeTerminalSessionIds || [],
      activeProcessIds: checkpoint.activeProcessIds || [],
      modifiedFiles: checkpoint.modifiedFiles || [],
      lastCommand: checkpoint.lastCommand,
      lastOutputSequence: checkpoint.lastOutputSequence,
      nextAction: checkpoint.nextAction,
    };
  }

  /**
   * Atomically save task record and checkpoints to disk.
   */
  public saveTask(task: InternalAgentTaskRecord): void {
    if (!this.tasksDir) return;
    try {
      const filePath = path.join(this.tasksDir, `${task.id}.json`);
      const tmpPath = path.join(this.tasksDir, `${task.id}.tmp.${Date.now()}`);

      const exportable = { ...task };
      delete exportable.wallTimer;

      fs.writeFileSync(tmpPath, JSON.stringify(exportable, null, 2), "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      this.logger?.warn({ err, taskId: task.id }, "Failed to persist agent task atomically");
    }
  }

  /**
   * Create a new Long-term Agent Task.
   */
  async create(params: AgentTaskCreateParams): Promise<AgentTaskCreateResult> {
    const taskId = `task_${crypto.randomUUID()}`;
    const now = Date.now();

    const policy: AgentResourcePolicy = {
      maxWallTimeMs: params.resourcePolicy?.maxWallTimeMs || 7200000, // 2 hours
      maxIterations: params.resourcePolicy?.maxIterations || 100,
      maxCpuTimeMs: params.resourcePolicy?.maxCpuTimeMs,
      maxMemoryBytes: params.resourcePolicy?.maxMemoryBytes || 4294967296, // 4 GB
      maxDiskWriteBytes: params.resourcePolicy?.maxDiskWriteBytes || 5368709120, // 5 GB
      maxOutputBytes: params.resourcePolicy?.maxOutputBytes || 104857600, // 100 MB
      maxTerminalSessions: params.resourcePolicy?.maxTerminalSessions || 4,
      maxRuntimes: params.resourcePolicy?.maxRuntimes || 8,
      maxProcesses: params.resourcePolicy?.maxProcesses || 64,
      maxConcurrentActions: params.resourcePolicy?.maxConcurrentActions || 5,
      maxSameActionRepeats: params.resourcePolicy?.maxSameActionRepeats || 3,
      maxFailures: params.resourcePolicy?.maxFailures || 10,
      maxActions: params.resourcePolicy?.maxActions || 500,
    };

    const deadlineAt = now + policy.maxWallTimeMs;

    const record: InternalAgentTaskRecord = {
      id: taskId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: params.title,
      goal: params.goal,
      state: "queued",
      resourcePolicy: policy,
      resourceUsage: {
        wallTimeMs: 0,
        cpuTimeMs: 0,
        memoryBytes: 0,
        diskWriteBytes: 0,
        outputBytes: 0,
        activeTerminalSessions: 0,
        activeRuntimes: 0,
        activeProcesses: 0,
        actionsExecuted: 0,
        iterations: 0,
        failures: 0,
      },
      iteration: 0,
      actionCount: 0,
      failureCount: 0,
      sameActionRepeats: 0,
      waitingForApproval: false,
      createdAt: now,
      startedAt: null,
      deadlineAt,
      finishedAt: null,
      logs: [],
      nextLogSequence: 1,
    };

    // Setup wall-clock timer
    record.wallTimer = setTimeout(() => {
      this.handleWallClockTimeout(record.id);
    }, policy.maxWallTimeMs);

    this.addLog(record, "system", "info", `Agent Task '${record.title}' created`, {
      goal: record.goal,
      deadlineAt,
    });

    this.tasks.set(taskId, record);
    this.saveTask(record);

    void this.eventBus?.publish({
      topic: "agent.task.created",
      source: "runner.agent-task",
      type: "TASK_CREATED",
      taskId: record.id,
      executionId: record.executionId || `exec_${record.id}`,
      payload: {
        runner: "windows",
        agentTaskId: record.id,
        projectId: record.projectId,
        title: record.title,
        goal: record.goal,
        state: record.state,
      },
    });

    return {
      agentTaskId: taskId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      title: record.title,
      goal: record.goal,
      state: "queued",
      deadlineAt,
      resourcePolicy: policy,
      createdAt: now,
    };
  }

  /**
   * Get Agent Task status and governance counters.
   */
  async status(params: AgentTaskStatusParams): Promise<AgentTaskStatusResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (this.actionLedger) {
      this.actionLedger.reduceTaskState(record);
      this.actionLedger.flushTask(record.id);
    }

    if (record.state === "running" && Date.now() > record.deadlineAt) {
      this.handleWallClockTimeout(record.id);
    }

    let artifactsList = record.artifacts ? [...record.artifacts] : [];
    if (this.artifactService) {
      try {
        const artRes = await this.artifactService.list({ taskId: record.id, limit: 100 });
        for (const a of artRes.artifacts) {
          if (!artifactsList.includes(a.id)) {
            artifactsList.push(a.id);
          }
        }
        record.artifacts = artifactsList;
      } catch {
        // Soft fallback
      }
    }

    let latestCheckpoint = record.latestCheckpoint;
    if (latestCheckpoint) {
      const history = latestCheckpoint.actionHistory || [];
      const vResults = latestCheckpoint.verificationResults || [];
      const actions = latestCheckpoint.actions || [];
      if (history.length > 20 || vResults.length > 20 || actions.length > 20) {
        latestCheckpoint = {
          ...latestCheckpoint,
          actionHistory: history.slice(-20),
          verificationResults: vResults.slice(-20),
          actions: actions.slice(-20),
        };
      }
    }

    return {
      agentTaskId: record.id,
      projectId: record.projectId,
      sessionId: record.sessionId,
      assignedAgentId: record.assignedAgentId,
      title: record.title,
      goal: record.goal,
      state: record.state,
      iteration: record.iteration,
      actionCount: record.actionCount,
      actionsExecuted: record.resourceUsage.actionsExecuted,
      failureCount: record.failureCount,
      waitingForApproval: record.waitingForApproval,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      deadlineAt: record.deadlineAt,
      finishedAt: record.finishedAt,
      resourcePolicy: record.resourcePolicy,
      resourceUsage: record.resourceUsage,
      pendingApprovalId: record.pendingApprovalId,
      lastFailureFingerprint: record.lastFailureFingerprint,
      sameActionRepeats: record.sameActionRepeats,
      latestCheckpoint,
      executionEvidence: record.executionEvidence,
      modifiedFiles: record.modifiedFiles || [],
      lastToolResult: record.lastToolResult,
      artifacts: artifactsList,
      checkpointCount: record.checkpointHistory?.length || (record.latestCheckpoint ? 1 : 0),
    };
  }

  /**
   * Query incremental logs.
   */
  async logs(params: AgentTaskLogsParams): Promise<AgentTaskLogsResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    const fromSeq = params.fromSequence || 0;
    const limit = params.limit || 100;

    let filtered = record.logs.filter((l) => l.sequence >= fromSeq);
    if (params.logType) {
      filtered = filtered.filter((l) => l.logType === params.logType);
    }

    const slice = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const latestSeq = record.logs.length > 0 ? (record.logs[record.logs.length - 1]?.sequence ?? 0) : 0;

    return {
      agentTaskId: record.id,
      logs: slice,
      latestSequence: latestSeq,
      hasMore,
    };
  }

  /**
   * Cancel an Agent Task and terminate all owned resources.
   */
  async cancel(params: AgentTaskCancelParams): Promise<AgentTaskCancelResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.wallTimer) {
      clearTimeout(record.wallTimer);
      record.wallTimer = undefined;
    }

    record.state = "cancelled";
    record.finishedAt = Date.now();

    this.addLog(record, "system", "warn", `Agent Task cancelled: ${params.reason || "Manual cancellation"}`);
    this.cleanupAgentResources(record.id);
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      state: "cancelled",
      cancelledAt: record.finishedAt,
      reason: params.reason,
    };
  }

  /**
   * Pause Agent Task decision loop (keeps resources alive).
   */
  async pause(params: AgentTaskPauseParams): Promise<AgentTaskPauseResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    record.state = "paused";
    this.addLog(record, "system", "info", `Agent Task paused: ${params.reason || "Manual pause"}`);
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      state: "paused",
      pausedAt: Date.now(),
      reason: params.reason,
    };
  }

  /**
   * Resume Agent Task with fresh observation and state reconciliation.
   */
  async resume(params: AgentTaskResumeParams): Promise<AgentTaskResumeResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.state === "completed" || record.state === "failed" || record.state === "timed_out") {
      throw new Error(`Cannot resume Agent task in terminal state '${record.state}'`);
    }

    // Check deadline
    if (Date.now() > record.deadlineAt) {
      this.handleWallClockTimeout(record.id);
      throw new Error("Cannot resume: Agent task wall-clock deadline has expired");
    }

    // Publish recovery started
    void this.eventBus?.publish({
      topic: "agent.recovery.started",
      source: "runner.agent-task",
      taskId: record.id,
      checkpointId: record.latestCheckpoint?.checkpointId,
      payload: { agentTaskId: record.id },
    });

    // 1. Windows Computer State Reconciliation & Check
    let compCheck: ComputerStateCheck | undefined;
    if (record.latestCheckpoint?.computerState && this.computerUseService) {
      try {
        compCheck = await this.computerUseService.getStateEngine().compareStateWithLive(record.latestCheckpoint.computerState);
        void this.eventBus?.publish({
          topic: "computer.state.captured",
          source: "runner.agent-task",
          taskId: record.id,
          payload: { agentTaskId: record.id, status: compCheck.status, match: compCheck.canResume },
        });
      } catch (err: any) {
        this.logger?.warn({ err: err?.message }, "Failed to verify live Windows state on resume");
      }
    }

    // 2. Reconcile live processes
    let liveProcsCount = 0;
    if (this.ownershipTracker) {
      const procs = await this.ownershipTracker.listProcesses(record.projectId, "ALL");
      liveProcsCount = procs.filter((p) => p.agentTaskId === record.id).length;
    }
    record.resourceUsage.activeProcesses = liveProcsCount;

    // 3. Reconcile actions executed & idempotent skip counts
    if (record.actionHistory) {
      for (const act of record.actionHistory) {
        if (!act.isIdempotent && !act.alreadyVerified && act.status !== "COMMITTED") {
          act.status = "RETRY_UNSAFE";
          act.safeToRetry = false;
        }
      }
    }

    const executedActions = (record.actionHistory || []).filter((a) => a.status === "COMMITTED" && a.alreadyVerified).length;
    const idempotentSkipCount = (record.actionHistory || []).filter((a) => a.alreadyExecuted).length;

    record.state = "running";
    if (!record.startedAt) {
      record.startedAt = Date.now();
    }

    this.addLog(record, "system", "info", "Agent Task resumed with fresh state reconciliation", {
      liveProcesses: liveProcsCount,
      checkpointId: record.latestCheckpoint?.checkpointId,
      computerStateCheck: compCheck,
      executedActions,
    });

    this.saveTask(record);

    // Publish recovery completed and task resumed
    void this.eventBus?.publish({
      topic: "agent.task.resumed",
      source: "runner.agent-task",
      taskId: record.id,
      payload: { agentTaskId: record.id, resumedAt: Date.now() },
    });
    void this.eventBus?.publish({
      topic: "agent.recovery.completed",
      source: "runner.agent-task",
      taskId: record.id,
      payload: { agentTaskId: record.id, computerStateCheck: compCheck },
    });

    return {
      agentTaskId: record.id,
      state: "running",
      canResume: true,
      resumedAt: Date.now(),
      reconciledActualState: {
        activeProcesses: liveProcsCount,
      },
      computerStateCheck: compCheck,
      resumedFromCheckpointId: record.latestCheckpoint?.checkpointId,
      executedActionsCount: executedActions,
      idempotentSkipCount,
      pendingActionsCount: Math.max(0, record.actionCount - executedActions),
    };
  }

  /**
   * List Agent Tasks.
   */
  async list(params: AgentTaskListParams): Promise<AgentTaskListResult> {
    const list: AgentTaskSummary[] = [];

    for (const record of this.tasks.values()) {
      if (params.projectId && record.projectId !== params.projectId) continue;
      if (params.state && record.state !== params.state) continue;

      list.push({
        agentTaskId: record.id,
        projectId: record.projectId,
        sessionId: record.sessionId,
        assignedAgentId: record.assignedAgentId,
        title: record.title,
        goal: record.goal,
        state: record.state,
        iteration: record.iteration,
        actionCount: record.actionCount,
        failureCount: record.failureCount,
        waitingForApproval: record.waitingForApproval,
        createdAt: record.createdAt,
        startedAt: record.startedAt,
        deadlineAt: record.deadlineAt,
        finishedAt: record.finishedAt,
      } as AgentTaskSummary);
    }

    return {
      tasks: list,
      total: list.length,
    };
  }

  /**
   * Return the live task assigned to a child agent. This is the authoritative state source for Join.
   */
  getTaskByAssignedAgentId(agentId: string): (AgentTaskSummary & { actionsExecuted?: number }) | undefined {
    for (const record of this.tasks.values()) {
      if (record.assignedAgentId === agentId) {
        return {
          agentTaskId: record.id,
          projectId: record.projectId,
          sessionId: record.sessionId,
          assignedAgentId: record.assignedAgentId,
          title: record.title,
          goal: record.goal,
          state: record.state,
          iteration: record.iteration,
          actionCount: record.actionCount,
          actionsExecuted: record.resourceUsage.actionsExecuted,
          failureCount: record.failureCount,
          waitingForApproval: record.waitingForApproval,
          createdAt: record.createdAt,
          startedAt: record.startedAt,
          deadlineAt: record.deadlineAt,
          finishedAt: record.finishedAt,
          executionEvidence: record.executionEvidence,
          lastToolResult: record.lastToolResult,
        } as AgentTaskSummary & { actionsExecuted?: number; executionEvidence?: any; lastToolResult?: any };
      }
    }
    return undefined;
  }

  /**
   * Handle user approval or rejection for an Agent Task action.
   */
  async approve(params: AgentTaskApproveParams): Promise<AgentTaskApproveResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (params.action === "approve") {
      record.waitingForApproval = false;
      record.pendingApprovalId = null;
      record.state = "running";
      this.addLog(record, "approval", "info", `Approval '${params.approvalId}' granted by user`);
    } else {
      record.waitingForApproval = false;
      record.pendingApprovalId = null;
      this.addLog(record, "approval", "warn", `Approval '${params.approvalId}' rejected by user: ${params.reason || "No reason given"}`);
    }

    this.saveTask(record);

    return {
      agentTaskId: record.id,
      approvalId: params.approvalId,
      action: params.action,
      state: record.state,
      message: params.action === "approve" ? "Action approved, agent running" : "Action rejected",
    };
  }

  /**
   * Record action execution, enforce action budget, and detect failure loops.
   */
  recordAction(
    taskId: string,
    actionName: string,
    command?: string,
    exitCode = 0,
    errorText?: string
  ): void {
    const record = this.tasks.get(taskId);
    if (!record) return;

    record.actionCount++;
    record.resourceUsage.actionsExecuted++;
    record.executionEvidence = { action: actionName, command, exitCode, at: Date.now() };

    // 1. Budget check
    if (record.actionCount > record.resourcePolicy.maxActions) {
      record.state = "resource_limited";
      this.addLog(record, "resource", "error", `AGENT_ACTION_LIMIT: Exceeded max action budget of ${record.resourcePolicy.maxActions}`);
      this.cleanupAgentResources(record.id);
      this.saveTask(record);
      return;
    }

    // 2. Failure and loop detection
    if (exitCode !== 0) {
      record.failureCount++;
      record.resourceUsage.failures++;

      const fingerprint = computeFailureFingerprint(command || actionName, exitCode, errorText);
      if (record.lastFailureFingerprint === fingerprint) {
        record.sameActionRepeats++;
        if (record.sameActionRepeats >= record.resourcePolicy.maxSameActionRepeats) {
          record.state = "waiting";
          this.addLog(
            record,
            "error",
            "error",
            `FAILURE_LOOP_DETECTED: Action '${actionName}' failed ${record.sameActionRepeats} times consecutively with fingerprint ${fingerprint}. Pausing loop.`
          );
          this.saveTask(record);
          return;
        }
      } else {
        record.lastFailureFingerprint = fingerprint;
        record.sameActionRepeats = 1;
      }
    } else {
      // Successful action resets consecutive failure repeats
      record.sameActionRepeats = 0;
      record.lastFailureFingerprint = null;
    }

    this.addLog(record, "action", exitCode === 0 ? "info" : "warn", `Executed action '${actionName}'`, {
      command,
      exitCode,
      errorText,
    });
    this.saveTask(record);
  }

  findByAgentId(agentId: string): AgentTaskSummary | undefined {
    return this.getTaskByAssignedAgentId(agentId);
  }

  /**
   * Save a versioned checkpoint atomically.
   */
  saveCheckpoint(taskId: string, checkpointData: Partial<AgentCheckpoint>): AgentCheckpoint {
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    const checkpointId = checkpointData.checkpointId || `cp_${crypto.randomUUID()}`;
    const timestamp = checkpointData.timestamp || new Date().toISOString();
    const createdAtMs = checkpointData.createdAtMs || Date.now();

    const checkpoint: AgentCheckpoint = {
      schemaVersion: 2,
      checkpointId,
      agentTaskId: taskId,
      taskId,
      executionId: checkpointData.executionId || record.executionId || `exec_${taskId}`,
      timestamp,
      createdAtMs,
      taskState: checkpointData.taskState || record.state,
      executionState: checkpointData.executionState || record.state,
      currentStep: checkpointData.currentStep ?? record.actionCount,
      completedSteps: checkpointData.completedSteps ?? record.actionCount,
      failedSteps: checkpointData.failedSteps ?? record.failureCount,
      actionHistory: checkpointData.actionHistory || (record.actionHistory ? [...record.actionHistory] : []),
      computerState: checkpointData.computerState,
      context: checkpointData.context,
      artifacts: checkpointData.artifacts || (record.artifacts ? [...record.artifacts] : []),
      verificationResults: checkpointData.verificationResults || (record.executionEvidence ? [record.executionEvidence] : []),
      pendingAction: checkpointData.pendingAction,
      recoveryMetadata: checkpointData.recoveryMetadata || {
        retryCount: 0,
        isSafeToResume: true,
        lastVerifiedAt: Date.now(),
        checkpointTrigger: "periodic",
      },
      iteration: record.iteration,
      phase: checkpointData.phase || "observe",
      goal: record.goal,
      observations: checkpointData.observations || [],
      actions: checkpointData.actions || [],
      activeRuntimeIds: checkpointData.activeRuntimeIds || [],
      activeTerminalSessionIds: checkpointData.activeTerminalSessionIds || [],
      activeProcessIds: checkpointData.activeProcessIds || [],
      modifiedFiles: checkpointData.modifiedFiles || (record.modifiedFiles ? [...record.modifiedFiles] : []),
      lastCommand: checkpointData.lastCommand,
      lastOutputSequence: record.logs.length,
      nextAction: checkpointData.nextAction,
    };

    record.latestCheckpoint = checkpoint;
    if (!record.checkpointHistory) {
      record.checkpointHistory = [];
    }
    if (!record.checkpointHistory.includes(checkpointId)) {
      record.checkpointHistory.push(checkpointId);
    }

    // Save checkpoint file to disk
    if (this.checkpointsDir) {
      try {
        const taskCpDir = path.join(this.checkpointsDir, taskId);
        if (!fs.existsSync(taskCpDir)) {
          fs.mkdirSync(taskCpDir, { recursive: true });
        }
        const cpFile = path.join(taskCpDir, `${checkpointId}.json`);
        fs.writeFileSync(cpFile, JSON.stringify(checkpoint, null, 2), "utf-8");
      } catch (err) {
        this.logger?.warn({ err, checkpointId }, "Failed to write task checkpoint file to disk");
      }
    }

    this.addLog(record, "checkpoint", "info", `Checkpoint saved [${checkpointId}] at iteration ${record.iteration}`, {
      phase: checkpoint.phase,
      checkpointId,
      step: record.actionCount,
    });
    this.saveTask(record);

    return checkpoint;
  }

  /**
   * Create an explicit or automatic task checkpoint.
   */
  async createTaskCheckpoint(
    taskIdOrParams: string | AgentTaskCheckpointCreateParams,
    params?: Partial<AgentTaskCheckpointCreateParams>
  ): Promise<AgentTaskCheckpointCreateResult> {
    const taskId = typeof taskIdOrParams === "string" ? taskIdOrParams : taskIdOrParams.agentTaskId;
    const finalParams = typeof taskIdOrParams === "object" ? taskIdOrParams : params;
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    const checkpointId = `cp_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const createdAtMs = Date.now();

    // 1. Capture live Windows computer state if available
    let compState: DurableComputerState | undefined;
    if (finalParams?.includeComputerState !== false && this.computerUseService) {
      try {
        const live = await this.computerUseService.getStateEngine().captureState({
          includeScreenshot: true,
          includeWindows: true,
        });
        compState = {
          activeWindow: live.activeWindow
            ? {
                title: live.activeWindow.title,
                handle: live.activeWindow.handle,
                processName: live.activeWindow.processName,
                processId: (live.activeWindow as any).processId ?? (live.activeWindow as any).pid,
                isForeground: live.activeWindow.isForeground,
              }
            : undefined,
          windows: (live as any).windows || [],
          processes: (live.processes || []).map((p: any) => ({
            pid: p.pid,
            name: p.name,
            commandLine: p.commandLine,
          })),
          screenHash: live.screenHash,
          resolution: live.resolution,
          stateHash: live.screenHash,
          capturedAt: live.timestamp,
        };
      } catch (err: any) {
        this.logger?.warn({ err: err?.message }, "Failed to capture computer state for task checkpoint");
      }
    }

    // 2. Capture context snapshot
    const contextSnapshot = this.executor.getContextManager()?.exportSnapshot();

    if (this.actionLedger) {
      this.actionLedger.flushTask(taskId);
    }

    const committedActions = this.actionLedger
      ? this.actionLedger.getActionsForTask(taskId).filter((a) => a.status === "COMMITTED")
      : [];
    const lastCommitted = committedActions[committedActions.length - 1];

    const intelligenceState = {
      memoryIds: (record as any).memoryIds || [],
      ruleIds: (record as any).ruleIds || [],
      skillVersions: (record as any).skillVersions || {},
      contextHash: contextSnapshot
        ? (contextSnapshot as any).hash ||
          crypto.createHash("sha256").update(JSON.stringify(contextSnapshot)).digest("hex").slice(0, 16)
        : undefined,
      compactionBoundary: (contextSnapshot as any)?.compactionBoundary,
      ledgerPosition: this.actionLedger
        ? this.actionLedger.getActionsForTask(taskId).length
        : record.actionHistory?.length || 0,
      lastCommittedActionId: lastCommitted?.actionId,
    };

    // 3. Formulate checkpoint
    const checkpoint: AgentCheckpoint = {
      schemaVersion: 2,
      checkpointId,
      agentTaskId: taskId,
      taskId,
      executionId: record.executionId || `exec_${taskId}`,
      timestamp,
      createdAtMs,
      taskState: record.state,
      executionState: record.state,
      currentStep: record.actionCount,
      completedSteps: record.actionCount,
      failedSteps: record.failureCount,
      actionHistory: record.actionHistory ? [...record.actionHistory] : [],
      computerState: compState,
      context: contextSnapshot,
      intelligenceState,
      artifacts: record.artifacts ? [...record.artifacts] : [],
      verificationResults:
        record.actionHistory && record.actionHistory.length > 0
          ? record.actionHistory.map((a) => ({
              actionId: a.actionId,
              actionName: a.actionName,
              status: a.status,
              verified: a.alreadyVerified,
              verificationResult: a.verificationResult,
              postStateHash: a.postStateHash,
            }))
          : record.executionEvidence
            ? [record.executionEvidence]
            : [],
      recoveryMetadata: {
        retryCount: 0,
        isSafeToResume: true,
        lastVerifiedAt: Date.now(),
        checkpointTrigger: finalParams?.trigger || "manual",
      },
      iteration: record.iteration,
      phase: "execute",
      goal: record.goal,
      observations: [],
      actions: [],
      activeRuntimeIds: [],
      activeTerminalSessionIds: [],
      activeProcessIds: [],
      modifiedFiles: record.modifiedFiles || [],
    };

    record.latestCheckpoint = checkpoint;
    if (!record.checkpointHistory) {
      record.checkpointHistory = [];
    }
    record.checkpointHistory.push(checkpointId);

    // Save checkpoint file to disk
    if (this.checkpointsDir) {
      const taskCpDir = path.join(this.checkpointsDir, taskId);
      if (!fs.existsSync(taskCpDir)) {
        fs.mkdirSync(taskCpDir, { recursive: true });
      }
      const cpFile = path.join(taskCpDir, `${checkpointId}.json`);
      fs.writeFileSync(cpFile, JSON.stringify(checkpoint, null, 2), "utf-8");
    }

    this.saveTask(record);

    this.addLog(record, "checkpoint", "info", `Checkpoint created [${checkpointId}] (${finalParams?.trigger || "manual"})`, {
      checkpointId,
      trigger: finalParams?.trigger || "manual",
      currentStep: record.actionCount,
      hasComputerState: Boolean(compState),
    });

    // Publish event
    void this.eventBus?.publish({
      topic: "agent.checkpoint.created",
      source: "runner.agent-task",
      type: "CHECKPOINT_CREATED",
      taskId: record.id,
      executionId: record.executionId,
      checkpointId,
      payload: {
        runner: "windows",
        agentTaskId: record.id,
        checkpointId,
        trigger: finalParams?.trigger || "manual",
        step: record.actionCount,
      },
    });

    return {
      checkpoint,
      success: true,
      checkpointId,
      agentTaskId: taskId,
      createdAt: createdAtMs,
    };
  }

  /**
   * List checkpoints for a task.
   */
  async listTaskCheckpoints(
    taskIdOrParams: string | AgentTaskCheckpointListParams,
    limit?: number
  ): Promise<AgentTaskCheckpointListResult> {
    const taskId = typeof taskIdOrParams === "string" ? taskIdOrParams : taskIdOrParams.agentTaskId;
    const finalLimit = typeof taskIdOrParams === "object" ? (taskIdOrParams.limit ?? 20) : (limit ?? 20);
    const checkpoints: AgentCheckpoint[] = [];

    // Load from disk if available
    if (this.checkpointsDir) {
      const taskCpDir = path.join(this.checkpointsDir, taskId);
      if (fs.existsSync(taskCpDir)) {
        const files = fs.readdirSync(taskCpDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          try {
            const data = fs.readFileSync(path.join(taskCpDir, file), "utf-8");
            const cp = JSON.parse(data) as AgentCheckpoint;
            checkpoints.push(cp);
          } catch {
            // Ignore corrupted individual files in listing
          }
        }
      }
    }

    const record = this.tasks.get(taskId);
    if (record?.latestCheckpoint && !checkpoints.some((c) => c.checkpointId === record.latestCheckpoint?.checkpointId)) {
      checkpoints.unshift(record.latestCheckpoint);
    }

    // Sort descending by timestamp / createdAtMs
    checkpoints.sort((a, b) => {
      const tA = a.createdAtMs || new Date(a.timestamp).getTime() || 0;
      const tB = b.createdAtMs || new Date(b.timestamp).getTime() || 0;
      return tB - tA;
    });

    const sliced = checkpoints.slice(0, finalLimit);
    return {
      agentTaskId: taskId,
      checkpoints: sliced,
      total: checkpoints.length,
    };
  }

  /**
   * Restore task from a specific checkpoint.
   */
  async restoreTaskCheckpoint(
    taskIdOrParams: string | AgentTaskCheckpointRestoreParams,
    params?: Partial<AgentTaskCheckpointRestoreParams>
  ): Promise<AgentTaskCheckpointRestoreResult> {
    const taskId = typeof taskIdOrParams === "string" ? taskIdOrParams : taskIdOrParams.agentTaskId;
    const finalParams = typeof taskIdOrParams === "object" ? taskIdOrParams : (params as AgentTaskCheckpointRestoreParams);
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    // Find the checkpoint: read disk first to reflect latest on-disk state
    let targetCheckpoint: AgentCheckpoint | null = null;
    if (this.checkpointsDir) {
      const cpFile = path.join(this.checkpointsDir, taskId, `${finalParams.checkpointId}.json`);
      if (fs.existsSync(cpFile)) {
        try {
          const data = fs.readFileSync(cpFile, "utf-8");
          targetCheckpoint = JSON.parse(data) as AgentCheckpoint;
        } catch (err: any) {
          throw new Error(`Checkpoint file corrupted: ${err?.message}`);
        }
      }
    }
    if (!targetCheckpoint && record.latestCheckpoint?.checkpointId === finalParams.checkpointId) {
      targetCheckpoint = record.latestCheckpoint;
    }

    if (!targetCheckpoint) {
      throw new Error(`Checkpoint '${finalParams.checkpointId}' not found for task '${taskId}'`);
    }

    // Prior to restore: Checkpoint Integrity Check -> Ledger Consistency Check -> World State Reconciliation
    const validation = await this.validateTaskCheckpoint(taskId, finalParams.checkpointId);
    if (!validation.integrity) {
      throw new Error(`Checkpoint pre-restore integrity check failed: ${validation.issues.join("; ")}`);
    }
    if (!validation.valid && (finalParams as any).force !== true) {
      this.logger?.warn(
        { taskId, checkpointId: finalParams.checkpointId, issues: validation.issues },
        "Checkpoint pre-restore validation warnings"
      );
      if (!validation.ledgerConsistent) {
        throw new Error(`Checkpoint pre-restore ledger consistency check failed: ${validation.issues.join("; ")}`);
      }
    }

    // Publish recovery started
    void this.eventBus?.publish({
      topic: "agent.recovery.started",
      source: "runner.agent-task",
      taskId: record.id,
      checkpointId: finalParams.checkpointId,
      payload: { agentTaskId: taskId, checkpointId: finalParams.checkpointId },
    });

    // 1. Computer State Check
    let compCheck: ComputerStateCheck | undefined;
    if (finalParams.verifyStateBeforeResume && targetCheckpoint.computerState && this.computerUseService) {
      compCheck = await this.computerUseService.getStateEngine().compareStateWithLive(targetCheckpoint.computerState);
    }

    // 2. Restore context & intelligence state
    if (targetCheckpoint.context) {
      this.executor.getContextManager()?.importSnapshot(targetCheckpoint.context);
    }
    if (targetCheckpoint.intelligenceState) {
      (record as any).memoryIds = targetCheckpoint.intelligenceState.memoryIds || [];
      (record as any).ruleIds = targetCheckpoint.intelligenceState.ruleIds || [];
      (record as any).skillVersions = targetCheckpoint.intelligenceState.skillVersions || {};
      (record as any).lastCommittedActionId = targetCheckpoint.intelligenceState.lastCommittedActionId;
    }

    // 3. Restore task state & counters
    record.latestCheckpoint = targetCheckpoint;
    record.actionCount = targetCheckpoint.completedSteps ?? targetCheckpoint.currentStep ?? targetCheckpoint.iteration ?? 0;
    record.iteration = targetCheckpoint.iteration ?? record.actionCount;
    if (targetCheckpoint.actionHistory) {
      record.actionHistory = [...targetCheckpoint.actionHistory];
    }
    if (targetCheckpoint.artifacts) {
      record.artifacts = [...targetCheckpoint.artifacts];
    }
    record.state = "paused"; // Set to paused until resume

    this.saveTask(record);

    this.addLog(record, "checkpoint", "info", `Restored task state from checkpoint [${finalParams.checkpointId}]`, {
      checkpointId: finalParams.checkpointId,
      computerStateCheck: compCheck,
    });

    // Publish recovery completed
    void this.eventBus?.publish({
      topic: "agent.recovery.completed",
      source: "runner.agent-task",
      taskId: record.id,
      checkpointId: finalParams.checkpointId,
      payload: { agentTaskId: taskId, checkpointId: finalParams.checkpointId, computerStateCheck: compCheck },
    });

    return {
      agentTaskId: taskId,
      checkpointId: finalParams.checkpointId,
      restoredAt: Date.now(),
      computerStateCheck: compCheck,
      success: true,
      message: `Task restored from checkpoint ${finalParams.checkpointId} successfully. Status: ${compCheck?.status || "STATE_MATCH"}`,
    };
  }

  /**
   * Inspect a specific checkpoint by ID.
   */
  async inspectTaskCheckpoint(taskId: string, checkpointId: string): Promise<AgentCheckpoint> {
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    if (this.checkpointsDir) {
      const cpFile = path.join(this.checkpointsDir, taskId, `${checkpointId}.json`);
      if (fs.existsSync(cpFile)) {
        try {
          const raw = fs.readFileSync(cpFile, "utf-8");
          return JSON.parse(raw) as AgentCheckpoint;
        } catch (err: any) {
          throw new Error(`Failed to parse checkpoint '${checkpointId}': ${err.message}`);
        }
      }
    }

    if (record.latestCheckpoint && record.latestCheckpoint.checkpointId === checkpointId) {
      return record.latestCheckpoint;
    }

    throw new Error(`Checkpoint '${checkpointId}' not found for task '${taskId}'`);
  }

  /**
   * Validate checkpoint integrity, ledger consistency, and world state match.
   */
  async validateTaskCheckpoint(
    taskId: string,
    checkpointId: string
  ): Promise<{
    valid: boolean;
    issues: string[];
    integrity: boolean;
    ledgerConsistent: boolean;
    worldStateMatch: boolean;
  }> {
    const issues: string[] = [];
    let integrity = true;
    let ledgerConsistent = true;
    let worldStateMatch = true;

    let cp: AgentCheckpoint;
    try {
      cp = await this.inspectTaskCheckpoint(taskId, checkpointId);
    } catch (err: any) {
      return {
        valid: false,
        issues: [`Integrity check failed: ${err.message}`],
        integrity: false,
        ledgerConsistent: false,
        worldStateMatch: false,
      };
    }

    // 1. Schema & Structure Integrity
    if (!cp.checkpointId || cp.checkpointId !== checkpointId) {
      issues.push(`Checkpoint ID mismatch: expected ${checkpointId}, got ${cp.checkpointId}`);
      integrity = false;
    }
    if (cp.schemaVersion !== 2 && (cp as any).schemaVersion !== 1) {
      issues.push(`Unsupported schemaVersion: ${cp.schemaVersion}`);
      integrity = false;
    }
    if (!cp.agentTaskId && !cp.taskId) {
      issues.push("Checkpoint missing taskId / agentTaskId");
      integrity = false;
    }

    // 2. Action Ledger Consistency
    if (this.actionLedger) {
      const ledgerActions = this.actionLedger.getActionsForTask(taskId);
      const cpActions = cp.actionHistory || [];
      for (const cpa of cpActions) {
        const found = ledgerActions.find((la) => la.actionId === cpa.actionId);
        if (!found) {
          issues.push(`Ledger inconsistency: action ${cpa.actionId} in checkpoint not found in ledger`);
          ledgerConsistent = false;
        } else if (found.status !== cpa.status) {
          issues.push(
            `Ledger status mismatch for action ${cpa.actionId}: ledger is ${found.status}, checkpoint is ${cpa.status}`
          );
          ledgerConsistent = false;
        }
      }
    }

    // 3. World State Match
    if (cp.modifiedFiles && cp.modifiedFiles.length > 0 && this.projectRegistry) {
      const taskRec = this.tasks.get(taskId);
      if (taskRec?.projectId) {
        const proj = this.projectRegistry.get(taskRec.projectId);
        if (proj) {
          for (const rel of cp.modifiedFiles) {
            const abs = path.resolve(proj.canonicalRoot, rel);
            if (!fs.existsSync(abs)) {
              issues.push(`World state divergence: modified file ${rel} does not exist at ${abs}`);
              worldStateMatch = false;
            }
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      integrity,
      ledgerConsistent,
      worldStateMatch,
    };
  }

  /**
   * Diff two checkpoints to observe state evolution.
   */
  async diffTaskCheckpoints(
    taskId: string,
    checkpointIdA: string,
    checkpointIdB: string
  ): Promise<{
    addedActions: string[];
    removedActions: string[];
    modifiedFilesDiff: string[];
    stateDelta: Record<string, any>;
  }> {
    const cpA = await this.inspectTaskCheckpoint(taskId, checkpointIdA);
    const cpB = await this.inspectTaskCheckpoint(taskId, checkpointIdB);

    const aActionIds = new Set((cpA.actionHistory || []).map((a) => a.actionId));
    const bActionIds = new Set((cpB.actionHistory || []).map((a) => a.actionId));

    const addedActions: string[] = [];
    for (const id of bActionIds) {
      if (!aActionIds.has(id)) addedActions.push(id);
    }
    const removedActions: string[] = [];
    for (const id of aActionIds) {
      if (!bActionIds.has(id)) removedActions.push(id);
    }

    const aFiles = new Set(cpA.modifiedFiles || []);
    const bFiles = new Set(cpB.modifiedFiles || []);
    const modifiedFilesDiff: string[] = [];
    for (const f of bFiles) {
      if (!aFiles.has(f)) modifiedFilesDiff.push(`+ ${f}`);
    }
    for (const f of aFiles) {
      if (!bFiles.has(f)) modifiedFilesDiff.push(`- ${f}`);
    }

    const stateDelta: Record<string, any> = {
      stepDelta: (cpB.completedSteps ?? 0) - (cpA.completedSteps ?? 0),
      taskStateFrom: cpA.taskState,
      taskStateTo: cpB.taskState,
      timestampDeltaMs: (cpB.createdAtMs || 0) - (cpA.createdAtMs || 0),
    };

    return {
      addedActions,
      removedActions,
      modifiedFilesDiff,
      stateDelta,
    };
  }

  /**
   * Prune older checkpoints keeping the most recent keepCount checkpoints.
   */
  async pruneTaskCheckpoints(
    taskId: string,
    keepCount = 10
  ): Promise<{ prunedCount: number; remainingCount: number }> {
    const listRes = await this.listTaskCheckpoints(taskId, 1000);
    const all = listRes.checkpoints;
    if (all.length <= keepCount) {
      return { prunedCount: 0, remainingCount: all.length };
    }

    const toPrune = all.slice(keepCount);
    let prunedCount = 0;
    if (this.checkpointsDir) {
      const taskCpDir = path.join(this.checkpointsDir, taskId);
      for (const cp of toPrune) {
        const cpFile = path.join(taskCpDir, `${cp.checkpointId}.json`);
        if (fs.existsSync(cpFile)) {
          try {
            fs.unlinkSync(cpFile);
            prunedCount++;
          } catch (err) {
            this.logger?.warn({ err, cpFile }, "Failed to delete pruned checkpoint file");
          }
        }
      }
    }

    const taskRec = this.tasks.get(taskId);
    if (taskRec && taskRec.checkpointHistory) {
      const retainedIds = new Set(all.slice(0, keepCount).map((c) => c.checkpointId));
      taskRec.checkpointHistory = taskRec.checkpointHistory.filter((id) => retainedIds.has(id));
      this.saveTask(taskRec);
    }

    return {
      prunedCount,
      remainingCount: all.length - prunedCount,
    };
  }

  /**
   * Disconnect agent with durable checkpoint.
   */
  async disconnectAgent(
    taskIdOrParams: string | AgentTaskDisconnectParams,
    params?: Partial<AgentTaskDisconnectParams>
  ): Promise<AgentTaskDisconnectResult> {
    const taskId = typeof taskIdOrParams === "string" ? taskIdOrParams : taskIdOrParams.agentTaskId;
    const finalParams = typeof taskIdOrParams === "object" ? taskIdOrParams : (params || {});
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    // Save pre-disconnect checkpoint
    const cpRes = await this.createTaskCheckpoint(taskId, {
      trigger: "manual",
      description: `Disconnect checkpoint: ${finalParams.reason || "Agent disconnected"}`,
    });

    record.state = "disconnected";
    this.saveTask(record);

    this.addLog(record, "system", "warn", `Agent disconnected: ${finalParams.reason || "Client disconnect detected"}`, {
      checkpointId: cpRes.checkpointId,
    });

    void this.eventBus?.publish({
      topic: "agent.disconnected",
      source: "runner.agent-task",
      taskId: record.id,
      checkpointId: cpRes.checkpointId,
      payload: { agentTaskId: taskId, reason: finalParams.reason },
    });

    return {
      agentTaskId: taskId,
      state: "disconnected",
      disconnectedAt: Date.now(),
      checkpointId: cpRes.checkpointId,
    };
  }

  /**
   * Takeover task control by human or return control to AI.
   */
  async takeoverTask(
    taskIdOrParams: string | AgentTaskTakeoverParams,
    params?: Partial<AgentTaskTakeoverParams>
  ): Promise<AgentTaskTakeoverResult> {
    const taskId = typeof taskIdOrParams === "string" ? taskIdOrParams : taskIdOrParams.agentTaskId;
    const finalParams = typeof taskIdOrParams === "object" ? taskIdOrParams : (params as AgentTaskTakeoverParams);
    const record = this.tasks.get(taskId);
    if (!record) {
      throw new Error(`Agent task '${taskId}' not found`);
    }

    if (finalParams.action === "takeover") {
      record.state = "waiting_for_human";
      this.saveTask(record);
      this.addLog(record, "system", "info", `Control taken over by ${finalParams.takeoverBy}: ${finalParams.reason || "Manual inspection"}`);
      void this.eventBus?.publish({
        topic: "computer.takeover",
        source: "runner.agent-task",
        taskId: record.id,
        payload: { agentTaskId: taskId, takeoverBy: finalParams.takeoverBy, reason: finalParams.reason },
      });
      return {
        agentTaskId: taskId,
        state: "waiting_for_human",
        takeoverAt: Date.now(),
        message: `Task control taken over by ${finalParams.takeoverBy}. Execution paused.`,
      };
    } else {
      record.state = "running";
      this.saveTask(record);
      this.addLog(record, "system", "info", `Control returned to AI executor by ${finalParams.takeoverBy}`);
      void this.eventBus?.publish({
        topic: "computer.control_returned",
        source: "runner.agent-task",
        taskId: record.id,
        payload: { agentTaskId: taskId, returnBy: finalParams.takeoverBy },
      });
      return {
        agentTaskId: taskId,
        state: "running",
        takeoverAt: Date.now(),
        message: `Control returned to AI. Task is now running.`,
      };
    }
  }

  private handleWallClockTimeout(taskId: string): void {
    const record = this.tasks.get(taskId);
    if (!record || record.state === "completed" || record.state === "cancelled") return;

    record.state = "timed_out";
    record.finishedAt = Date.now();
    this.addLog(record, "system", "error", `WALL_CLOCK_TIMEOUT: Task reached deadline of ${record.resourcePolicy.maxWallTimeMs}ms`);
    this.cleanupAgentResources(taskId);
    this.saveTask(record);
  }

  private cleanupAgentResources(taskId: string): void {
    // 1. Terminate all agent-owned processes
    if (this.ownershipTracker) {
      this.ownershipTracker.listProcesses(undefined, "ALL").then((procs) => {
        for (const p of procs) {
          if (p.agentTaskId === taskId) {
            this.ownershipTracker?.killProcess(p.pid, { force: true, hasApproval: true }).catch(() => {});
          }
        }
      });
    }

    // 2. Stop agent-owned terminals
    if (this.terminalManager) {
      this.terminalManager.list({}).then((res) => {
        for (const t of res.terminals) {
          if (t.agentTaskId === taskId) {
            this.terminalManager?.stop({ terminalSessionId: t.terminalSessionId, force: true }).catch(() => {});
          }
        }
      });
    }
  }

  public addLog(
    record: InternalAgentTaskRecord,
    logType: AgentTaskLogType,
    level: "info" | "warn" | "error" | "debug",
    message: string,
    data?: Record<string, any>
  ): void {
    const entry: AgentTaskLogEntry = {
      id: `log_${crypto.randomUUID()}`,
      agentTaskId: record.id,
      sequence: record.nextLogSequence++,
      logType,
      level,
      message,
      data,
      timestamp: Date.now(),
    };
    record.logs.push(entry);
    if (record.logs.length > 5000) {
      record.logs.splice(0, record.logs.length - 5000);
    }
  }

  /**
   * Assign an agent task to an agent identity / worker
   */
  async assign(params: AgentTaskAssignParams): Promise<AgentTaskAssignResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }
    record.assignedAgentId = params.agentId;
    record.state = "assigned";
    this.addLog(record, "system", "info", `Assigned task to agent '${params.agentId}'`, {
      role: params.role,
    });
    this.saveTask(record);
    return {
      agentTaskId: record.id,
      agentId: params.agentId,
      state: record.state,
      assignedAt: Date.now(),
    };
  }

  /**
   * Start a task attempt with optional pre-attempt checkpoint
   */
  async attempt(
    params: AgentTaskAttemptParams,
    checkpointService?: WorkspaceCheckpointService
  ): Promise<AgentTaskAttemptResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    record.attemptNumber = (record.attemptNumber || 0) + 1;
    record.state = "attempting";
    record.plan = params.plan;
    record.startedAt = record.startedAt || Date.now();

    let checkpointId: string | undefined;
    if (params.checkpointBefore && checkpointService) {
      try {
        const cp = await checkpointService.create({
          projectId: record.projectId,
          taskId: record.id,
          sessionId: record.sessionId,
          name: `Pre-attempt #${record.attemptNumber} checkpoint`,
          autoTrigger: "pre-task",
        });
        checkpointId = cp.checkpoint.id;
      } catch (err) {
        this.logger?.warn({ err }, "Could not create pre-attempt checkpoint");
      }
    }

    this.addLog(record, "plan", "info", `Starting task attempt #${record.attemptNumber}`, {
      plan: params.plan,
      checkpointId,
    });
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      attemptNumber: record.attemptNumber,
      state: record.state,
      checkpointId,
      startedAt: Date.now(),
    };
  }

  /**
   * Execute a coding run within the task attempt
   */
  async codingRun(
    params: AgentTaskCodingRunParams,
    validationService?: UnifiedValidationService
  ): Promise<AgentTaskCodingRunResult> {
    return this.executor.runCodingRun(params, validationService);
  }

  /**
   * Heartbeat to verify live connection and update remaining deadline
   */
  async heartbeat(params: AgentTaskHeartbeatParams): Promise<AgentTaskHeartbeatResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    record.lastHeartbeatAt = Date.now();
    const remaining = record.deadlineAt - Date.now();

    if (remaining <= 0 && record.state === "running") {
      this.handleWallClockTimeout(record.id);
    }

    if (params.progressNote) {
      this.addLog(record, "system", "info", `Heartbeat progress: ${params.progressNote}`);
    }
    if ((params as any).progressPercent !== undefined) {
      (record as any).progressPercent = (params as any).progressPercent;
    }

    return {
      agentTaskId: record.id,
      alive: record.state !== "timed_out" && record.state !== "cancelled",
      deadlineRemainingMs: Math.max(0, remaining),
      state: record.state,
      lastHeartbeatAt: record.lastHeartbeatAt,
      progressPercent: params.progressPercent,
    };
  }

  /**
   * Reconcile task with actual processes and checkpoints
   */
  async reconcile(
    params: AgentTaskReconcileParams,
    checkpointService?: WorkspaceCheckpointService
  ): Promise<AgentTaskReconcileResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    const previousState = record.state;
    let recoveredFromCheckpoint = false;

    // Check zombies
    let activeProcesses = 0;
    if (this.ownershipTracker) {
      const pids = this.ownershipTracker.getTrackedPids?.() || [];
      for (const pid of pids) {
        try {
          process.kill(pid, 0);
          activeProcesses++;
        } catch {
          if (params.cleanZombieProcesses) {
            try { process.kill(pid, "SIGKILL"); } catch {}
          }
        }
      }
    }

    if (
      (record.state === "failed" ||
        record.state === "paused" ||
        record.state === "running" ||
        record.state === "disconnected") &&
      params.recoverCheckpointIfFailed
    ) {
      let restoredWorkspace = false;
      if (checkpointService) {
        try {
          const list = await checkpointService.list({ projectId: record.projectId, taskId: record.id, limit: 10 });
          if (list.checkpoints.length > 0) {
            await checkpointService.restore({
              projectId: record.projectId,
              checkpointId: list.checkpoints[0].id,
              createBackupBeforeRestore: false,
            });
            restoredWorkspace = true;
          }
        } catch (err) {
          this.logger?.warn({ err }, "Failed checkpoint rollback during reconcile");
        }
      }

      if (record.latestCheckpoint) {
        recoveredFromCheckpoint = true;
        record.state = "paused";
        record.iteration = record.latestCheckpoint.iteration;
        if (record.latestCheckpoint.actions && record.latestCheckpoint.actions.length > 0) {
          record.actionCount = record.latestCheckpoint.actions.length;
          record.resourceUsage.actionsExecuted = record.actionCount;
        }
      } else if (restoredWorkspace) {
        recoveredFromCheckpoint = true;
        record.state = "paused";
      }
    }

    if (this.actionLedger) {
      this.actionLedger.reduceTaskState(record);
    }

    this.addLog(record, "system", "info", `Task reconciled from ${previousState} to ${record.state}`, {
      activeProcesses,
      recoveredFromCheckpoint,
    });
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      previousState,
      reconciledState: record.state,
      activeProcesses,
      recoveredFromCheckpoint,
      reconciledAt: Date.now(),
    };
  }

  /**
   * Complete the agent task
   */
  async complete(params: AgentTaskCompleteParams): Promise<AgentTaskCompleteResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    if (record.state === "completed") {
      if (params.artifactsProduced) {
        record.artifacts = Array.from(new Set([...(record.artifacts || []), ...params.artifactsProduced]));
      }
      this.addLog(record, "system", "info", `Agent task completion recorded: ${params.summary}`, {
        artifacts: record.artifacts,
        validationPassed: params.validationPassed,
      });
      this.saveTask(record);
      return {
        agentTaskId: record.id,
        state: "completed",
        completedAt: record.finishedAt || Date.now(),
        summary: params.summary,
        artifacts: record.artifacts || [],
      };
    }

    const ledgerActions = this.actionLedger
      ? (typeof (this.actionLedger as any).getActionsForTask === "function"
          ? (this.actionLedger as any).getActionsForTask(record.id).length
          : typeof (this.actionLedger as any).getActions === "function"
            ? (this.actionLedger as any).getActions(record.id).length
            : 0)
      : 0;
    const hasExecutionEvidence =
      record.actionCount > 0 ||
      record.resourceUsage.actionsExecuted > 0 ||
      ledgerActions > 0 ||
      Boolean(record.executionEvidence) ||
      Boolean(record.executionInstruction) ||
      (Array.isArray(record.actionHistory) && record.actionHistory.length > 0) ||
      (Array.isArray(record.logs) && record.logs.some((l) => (l as any).source === "tool" || (l as any).source === "executor" || l.logType === "system"));

    if (!hasExecutionEvidence) {
      throw new Error("Cannot complete Agent task without real tool execution evidence");
    }
    record.state = "completed";
    record.finishedAt = Date.now();
    record.artifacts = params.artifactsProduced || [];

    if (record.wallTimer) {
      clearTimeout(record.wallTimer);
      delete record.wallTimer;
    }

    this.addLog(record, "system", "info", `Agent task completed: ${params.summary}`, {
      artifacts: record.artifacts,
      validationPassed: params.validationPassed,
    });
    this.saveTask(record);
    if (this.actionLedger) {
      this.actionLedger.flushTask(record.id);
    }

    void this.eventBus?.publish({
      topic: "agent.task.completed",
      source: "runner.agent-task",
      type: "TASK_COMPLETED",
      taskId: record.id,
      executionId: record.executionId,
      payload: {
        runner: "windows",
        agentTaskId: record.id,
        state: "completed",
        completedAt: record.finishedAt,
        summary: params.summary,
        actionsExecuted: record.resourceUsage.actionsExecuted,
        actionCount: record.actionCount,
        artifacts: record.artifacts,
      },
    });

    return {
      agentTaskId: record.id,
      state: "completed",
      completedAt: record.finishedAt,
      summary: params.summary,
      artifacts: record.artifacts,
    };
  }

  /**
   * Handoff agent task to another agent
   */
  async handoff(params: AgentTaskHandoffParams): Promise<AgentTaskHandoffResult> {
    const record = this.tasks.get(params.agentTaskId);
    if (!record) {
      throw new Error(`Agent task '${params.agentTaskId}' not found`);
    }

    const fromAgentId = record.assignedAgentId;
    record.assignedAgentId = params.toAgentId;

    this.addLog(record, "system", "info", `Handoff from agent '${fromAgentId || "none"}' to '${params.toAgentId}'`, {
      note: params.note,
    });
    this.saveTask(record);

    return {
      agentTaskId: record.id,
      fromAgentId,
      toAgentId: params.toAgentId,
      state: record.state,
      handoffAt: Date.now(),
    };
  }
}

