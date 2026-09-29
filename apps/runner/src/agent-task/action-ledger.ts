import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Logger } from "@localbridge/shared";
import type {
  DurableAction,
  DurableActionLedgerEntry,
  DurableActionStatus,
} from "@localbridge/protocol";
import type { LocalBridgeEventBus } from "../events/event-bus-service.js";
import type { ProjectRegistry } from "../projects/registry.js";
import type { InternalAgentTaskRecord } from "./agent-task-manager.js";
import { resolveProjectPath } from "@localbridge/security";
import type { FilesystemService } from "../filesystem/service.js";
import type { WindowsComputerUseService } from "../computer-use/computer-use-service.js";
import { ActionLedgerWal, type WalEventType } from "./action-ledger-wal.js";

export function toDurableAction(entry: DurableActionLedgerEntry): DurableAction {
  return {
    actionId: entry.actionId,
    idempotencyKey: entry.idempotencyKey,
    taskId: entry.taskId,
    executionId: entry.executionId,
    parentActionId: entry.parentActionId,
    attemptId: entry.attemptId ?? 1,
    actionName: entry.actionName || entry.toolName || entry.method,
    toolName: entry.toolName,
    method: entry.method,
    capability: entry.capability,
    resourceId: entry.resourceId,
    inputHash: entry.inputHash,
    argumentsHash: entry.argumentsHash,
    category: entry.category,
    precondition: entry.precondition,
    executionState: entry.executionState,
    params: entry.params || {},
    status: entry.status,
    preparedAt: entry.preparedAt,
    startedAt: entry.startedAt,
    executedAt: entry.executedAt,
    verifiedAt: entry.verifiedAt,
    committedAt: entry.committedAt,
    completedAt: entry.completedAt,
    finishedAt: entry.finishedAt || entry.completedAt,
    isIdempotent: entry.isIdempotent ?? false,
    alreadyExecuted: entry.alreadyExecuted ?? false,
    alreadyVerified: entry.alreadyVerified ?? false,
    needsRetry: entry.needsRetry ?? false,
    safeToRetry: entry.safeToRetry ?? true,
    retryCount: entry.retryCount ?? 0,
    checkpointId: entry.checkpointId,
    preStateHash: entry.preStateHash,
    postStateHash: entry.postStateHash,
    worldStateHash: entry.worldStateHash,
    observation: entry.observation,
    verification: entry.verification,
    verificationStatus: entry.verificationStatus,
    verificationResult: entry.verificationResult,
    result: entry.result,
    sideEffects: entry.sideEffects,
    durationMs: entry.durationMs,
    error: entry.error,
    summary: entry.summary,
  };
}

export class ActionLedger {
  private readonly entries = new Map<string, DurableActionLedgerEntry>();
  private readonly taskActions = new Map<string, string[]>();
  private readonly idempotencyIndex = new Map<string, string>(); // `${taskId}:${idempotencyKey}` -> actionId
  private readonly ledgerDir?: string;
  private readonly wal?: ActionLedgerWal;
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private snapshotEveryEvents: number;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly eventBus?: LocalBridgeEventBus,
    private readonly logger?: Logger,
    private readonly projectRegistry?: ProjectRegistry,
    private readonly filesystemService?: FilesystemService,
    private readonly computerUseService?: WindowsComputerUseService,
    options?: { snapshotEveryEvents?: number }
  ) {
    const envSnapshotInterval = process.env.NEXUS_LEDGER_SNAPSHOT_EVERY_EVENTS
      ? Number.parseInt(process.env.NEXUS_LEDGER_SNAPSHOT_EVERY_EVENTS, 10)
      : undefined;
    this.snapshotEveryEvents = options?.snapshotEveryEvents || envSnapshotInterval || 100;

    if (this.runnerStateDir) {
      this.ledgerDir = path.join(this.runnerStateDir, "action-ledger");
      if (!fs.existsSync(this.ledgerDir)) {
        fs.mkdirSync(this.ledgerDir, { recursive: true });
      }
      this.wal = new ActionLedgerWal(this.ledgerDir);
      this.loadAllLedgers();
    }
  }

  public setSnapshotEveryEvents(count: number): void {
    this.snapshotEveryEvents = Math.max(1, count);
  }

  public getSnapshotEveryEvents(): number {
    return this.snapshotEveryEvents;
  }

  public isMethodIdempotent(method: string): boolean {
    const idempotentPrefixes = [
      "file.read",
      "file.stat",
      "directory.list",
      "fs.search",
      "fs.grep",
      "code.diagnostics",
      "code.hover",
      "code.definition",
      "code.references",
      "code.symbols",
      "code.documentSymbols",
      "code.workspaceSymbols",
      "git.status",
      "git.log",
      "git.diff",
      "git.info",
      "project.info",
      "project.list",
      "system.info",
      "system.ping",
      "terminal.read",
      "terminal.status",
      "computer.observe",
      "computer.status",
      "computer.screenSnapshot",
      "computer.screenshot",
      "browser.status",
      "browser.tabs",
      "browser.cookies",
      "browser.storage",
    ];
    if (!method || typeof method !== "string") return false;
    return idempotentPrefixes.some((p) => method.toLowerCase().startsWith(p.toLowerCase()));
  }

  public loadAllLedgers(): void {
    if (!this.ledgerDir || !fs.existsSync(this.ledgerDir)) return;
    try {
      const files = fs.readdirSync(this.ledgerDir);
      const taskIds = new Set<string>();
      for (const file of files) {
        if (file.endsWith("-ledger.json")) {
          taskIds.add(file.slice(0, -"-ledger.json".length));
        } else if (file.endsWith("-ledger.wal")) {
          taskIds.add(file.slice(0, -"-ledger.wal".length));
        }
      }

      for (const taskId of taskIds) {
        this.loadTaskLedger(taskId);
      }
      this.logger?.info({ count: this.entries.size }, "Loaded action ledger entries into memory");
    } catch (err) {
      this.logger?.warn({ err }, "Error scanning action ledger directory");
    }
  }

  public loadTaskLedger(taskId: string): void {
    if (!this.ledgerDir) return;
    const taskMap = new Map<string, DurableActionLedgerEntry>();

    // 1. Load Snapshot if exists
    const jsonPath = this.wal ? this.wal.getSnapshotPath(taskId) : path.join(this.ledgerDir, `${taskId}-ledger.json`);
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, "utf-8");
        const items = JSON.parse(raw) as DurableActionLedgerEntry[];
        if (Array.isArray(items)) {
          for (const item of items) {
            taskMap.set(item.actionId, item);
          }
        }
      } catch (err) {
        this.logger?.warn({ err, taskId, jsonPath }, "Failed to read action ledger snapshot file");
      }
    }

    // 2. Replay WAL on top of Snapshot if WAL exists
    if (this.wal) {
      this.wal.replay(taskId, taskMap);
    }

    // 3. Crash recovery reconciliation on in-flight actions
    let mutated = false;
    for (const item of taskMap.values()) {
      if (
        item.status === "STARTED" ||
        item.status === "VERIFYING" ||
        (item.status === "EXECUTED" && !item.alreadyVerified)
      ) {
        if (item.isIdempotent) {
          item.status = "FAILED";
          item.error = "Interrupted by runner crash / restart; safe to retry";
          item.safeToRetry = true;
        } else {
          item.status = "UNKNOWN";
          item.error =
            "Interrupted by runner crash / restart during execution; requires world-state reconciliation";
          item.safeToRetry = false;
        }
        item.completedAt = Date.now();
        mutated = true;
      }

      this.entries.set(item.actionId, item);
      if (!this.taskActions.has(item.taskId)) {
        this.taskActions.set(item.taskId, []);
      }
      const list = this.taskActions.get(item.taskId)!;
      if (!list.includes(item.actionId)) {
        list.push(item.actionId);
      }
      if (item.idempotencyKey) {
        this.idempotencyIndex.set(`${item.taskId}:${item.idempotencyKey}`, item.actionId);
      }
    }

    if (mutated) {
      this.takeSnapshot(taskId);
    }
  }

  public takeSnapshot(taskId: string): void {
    if (!this.ledgerDir) return;
    const existing = this.debounceTimers.get(taskId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(taskId);
    }

    try {
      const actionIds = this.taskActions.get(taskId) || [];
      const list = actionIds.map((id) => this.entries.get(id)).filter(Boolean);
      const filePath = this.wal ? this.wal.getSnapshotPath(taskId) : path.join(this.ledgerDir, `${taskId}-ledger.json`);
      const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpPath, filePath);
      if (this.wal) {
        this.wal.recordSnapshotTaken(taskId);
      }
    } catch (err) {
      this.logger?.warn({ err, taskId }, "Failed to save action ledger snapshot atomically");
    }
  }

  public saveTaskLedger(taskId: string): void {
    this.takeSnapshot(taskId);
  }

  public flushTask(taskId: string): void {
    this.takeSnapshot(taskId);
  }

  public flushAll(): void {
    if (!this.ledgerDir) return;
    for (const taskId of this.taskActions.keys()) {
      this.takeSnapshot(taskId);
    }
  }

  public getMetrics(taskId: string): {
    actionCount: number;
    walEventCount: number;
    snapshotCount: number;
    ledgerBytes: number;
    walBytes: number;
  } {
    const actions = this.taskActions.get(taskId) || [];
    if (this.wal) {
      return this.wal.getMetrics(taskId, actions.length);
    }
    return {
      actionCount: actions.length,
      walEventCount: 0,
      snapshotCount: 0,
      ledgerBytes: 0,
      walBytes: 0,
    };
  }

  private readonly lastCheckpointIds = new Map<string, string>();

  private appendWal(
    taskId: string,
    event: WalEventType,
    entry: DurableActionLedgerEntry,
    checkpointId?: string
  ): void {
    if (!this.wal || !this.ledgerDir) return;
    try {
      this.wal.append(taskId, {
        actionId: entry.actionId,
        taskId,
        event,
        timestamp: Date.now(),
        entry: { ...entry },
      });

      const count = this.wal.getWalEventCount(taskId);
      const isTerminal = entry.status === "FAILED" || entry.status === "RETRY_UNSAFE";
      const isNewCheckpoint = Boolean(checkpointId && checkpointId !== this.lastCheckpointIds.get(taskId));
      if (checkpointId) {
        this.lastCheckpointIds.set(taskId, checkpointId);
      }

      if (count >= this.snapshotEveryEvents || isNewCheckpoint || isTerminal) {
        this.takeSnapshot(taskId);
      } else {
        this.scheduleDebouncedSnapshot(taskId);
      }
    } catch (err) {
      this.logger?.warn({ err, taskId, event }, "Failed to append WAL record");
    }
  }

  private scheduleDebouncedSnapshot(taskId: string): void {
    const existing = this.debounceTimers.get(taskId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(taskId);
      this.takeSnapshot(taskId);
    }, 5000);
    if (timer.unref) timer.unref();
    this.debounceTimers.set(taskId, timer);
  }

  public findCommitted(taskId: string, idempotencyKey: string): DurableActionLedgerEntry | undefined {
    const actionId = this.idempotencyIndex.get(`${taskId}:${idempotencyKey}`);
    if (!actionId) return undefined;
    const entry = this.entries.get(actionId);
    if (entry && entry.status === "COMMITTED") {
      return entry;
    }
    return undefined;
  }

  public findLatest(taskId: string, idempotencyKey: string): DurableActionLedgerEntry | undefined {
    const actionId = this.idempotencyIndex.get(`${taskId}:${idempotencyKey}`);
    if (!actionId) return undefined;
    return this.entries.get(actionId);
  }

  public getAction(actionId: string): DurableActionLedgerEntry | undefined {
    return this.entries.get(actionId);
  }

  public getActionsForTask(taskId: string): DurableActionLedgerEntry[] {
    const actionIds = this.taskActions.get(taskId) || [];
    return actionIds.map((id) => this.entries.get(id)).filter(Boolean) as DurableActionLedgerEntry[];
  }

  public getActions(taskId: string): DurableActionLedgerEntry[] {
    return this.getActionsForTask(taskId);
  }

  public async prepareAction(params: {
    actionId?: string;
    taskId: string;
    executionId: string;
    toolName: string;
    method: string;
    actionName?: string;
    idempotencyKey?: string;
    parentActionId?: string;
    capability?: string;
    resourceId?: string;
    inputHash?: string;
    precondition?: any;
    executionState?: string;
    params: Record<string, any>;
    checkpointId?: string;
  }): Promise<DurableActionLedgerEntry> {
    const argumentsHash =
      params.inputHash ||
      crypto
        .createHash("sha256")
        .update(JSON.stringify(params.params || {}))
        .digest("hex");

    const idempotencyKey =
      params.idempotencyKey ||
      crypto
        .createHash("sha256")
        .update(`${params.taskId}:${params.toolName}:${argumentsHash}`)
        .digest("hex");

    // Check if an entry already exists for this idempotency key
    const existingId = this.idempotencyIndex.get(`${params.taskId}:${idempotencyKey}`);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (existing && params.actionId && params.actionId !== existingId) {
        this.entries.set(params.actionId, existing);
      }
      if (existing && existing.status === "COMMITTED") {
        return existing;
      }
      if (existing && existing.status === "RETRY_UNSAFE" && !this.isMethodIdempotent(params.method)) {
        return existing;
      }
    }

    const actionId = params.actionId || `action_${crypto.randomUUID()}`;
    const now = Date.now();
    const entry: DurableActionLedgerEntry = {
      actionId,
      taskId: params.taskId,
      executionId: params.executionId,
      parentActionId: params.parentActionId,
      toolName: params.toolName,
      method: params.method,
      capability: params.capability,
      resourceId: params.resourceId,
      inputHash: argumentsHash,
      actionName: params.actionName || params.toolName,
      argumentsHash,
      category: params.capability,
      precondition: params.precondition,
      executionState: params.executionState || "PREPARED",
      params: params.params || {},
      idempotencyKey,
      status: "PREPARED",
      preparedAt: now,
      safeToRetry: true,
      alreadyExecuted: false,
      alreadyVerified: false,
      isIdempotent: this.isMethodIdempotent(params.method),
      attemptId: 1,
      needsRetry: false,
      retryCount: 0,
      checkpointId: params.checkpointId,
    };

    this.entries.set(actionId, entry);
    if (!this.taskActions.has(params.taskId)) {
      this.taskActions.set(params.taskId, []);
    }
    this.taskActions.get(params.taskId)!.push(actionId);
    this.idempotencyIndex.set(`${params.taskId}:${idempotencyKey}`, actionId);

    this.appendWal(params.taskId, "ACTION_PREPARED", entry, params.checkpointId);

    // Publish ACTION_PREPARED event
    void this.publishLifecycleEvent("ACTION_PREPARED", entry, params.checkpointId);

    return entry;
  }

  public async recordPlanned(params: {
    taskId: string;
    executionId?: string;
    actionName: string;
    toolName: string;
    params?: Record<string, any>;
    checkpointId?: string;
  }): Promise<DurableActionLedgerEntry> {
    const actionId = `action_${crypto.randomUUID()}`;
    const now = Date.now();
    const entry: DurableActionLedgerEntry = {
      actionId,
      taskId: params.taskId,
      executionId: params.executionId || `exec_${params.taskId}`,
      toolName: params.toolName,
      method: params.toolName,
      actionName: params.actionName,
      argumentsHash: crypto.createHash("sha256").update(JSON.stringify(params.params || {})).digest("hex"),
      params: params.params || {},
      idempotencyKey: `plan_${actionId}`,
      status: "PLANNED",
      preparedAt: now,
      safeToRetry: true,
      alreadyExecuted: false,
      alreadyVerified: false,
      isIdempotent: this.isMethodIdempotent(params.toolName),
      attemptId: 1,
      needsRetry: false,
      retryCount: 0,
      checkpointId: params.checkpointId,
    };
    this.entries.set(actionId, entry);
    if (!this.taskActions.has(params.taskId)) {
      this.taskActions.set(params.taskId, []);
    }
    this.taskActions.get(params.taskId)!.push(actionId);
    this.appendWal(params.taskId, "ACTION_PLANNED", entry, params.checkpointId);
    void this.publishLifecycleEvent("ACTION_PLANNED", entry, params.checkpointId);
    return entry;
  }

  public async recordObserved(
    actionId: string,
    observation: any,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);
    entry.status = "OBSERVED";
    entry.observation = observation;
    this.appendWal(entry.taskId, "ACTION_OBSERVED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_OBSERVED", entry, checkpointId);
    return entry;
  }

  public async recordUnknown(
    actionId: string,
    reason: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);
    entry.status = "UNKNOWN";
    entry.error = reason;
    entry.safeToRetry = false;
    this.appendWal(entry.taskId, "ACTION_UNKNOWN", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_UNKNOWN", entry, checkpointId);
    return entry;
  }

  public async recordRecovering(
    actionId: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);
    entry.status = "RECOVERING";
    entry.retryCount = (entry.retryCount || 0) + 1;
    this.appendWal(entry.taskId, "ACTION_RECOVERING", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_RECOVERING", entry, checkpointId);
    return entry;
  }

  public async recordRolledBack(
    actionId: string,
    reason: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);
    entry.status = "ROLLED_BACK";
    entry.error = reason;
    entry.completedAt = Date.now();
    this.appendWal(entry.taskId, "ACTION_ROLLED_BACK", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_ROLLED_BACK", entry, checkpointId);
    return entry;
  }

  public async reconcileUnknown(
    actionId: string,
    worldChecker?: (action: DurableActionLedgerEntry) => Promise<{ resolved: boolean; status: DurableActionStatus; verified: boolean; evidence?: any }>
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    let resolvedStatus: DurableActionStatus = "UNKNOWN";
    let isVerified = false;
    let evidenceDetails: any = undefined;

    if (worldChecker) {
      const check = await worldChecker(entry);
      if (check.resolved) {
        resolvedStatus = check.status;
        isVerified = check.verified;
        evidenceDetails = check.evidence;
      }
    } else {
      const method = entry.method || entry.toolName;
      const params = entry.params || {};

      if (method.includes("file") && (method.includes("write") || method.includes("create")) && params.path) {
        const fullPath = params.projectId && this.projectRegistry
          ? path.join(this.projectRegistry.get(params.projectId)?.canonicalRoot || "", params.path)
          : path.resolve(params.path);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0) {
          resolvedStatus = "COMMITTED";
          isVerified = true;
          evidenceDetails = { physicalFileVerified: true, size: fs.statSync(fullPath).size };
        } else {
          resolvedStatus = "FAILED";
          isVerified = false;
        }
      } else if (method.includes("app") && method.includes("launch")) {
        resolvedStatus = "COMMITTED";
        isVerified = true;
      } else {
        resolvedStatus = "FAILED";
      }
    }

    entry.status = resolvedStatus;
    if (resolvedStatus === "COMMITTED") {
      entry.alreadyExecuted = true;
      entry.alreadyVerified = isVerified;
      entry.safeToRetry = true;
      entry.committedAt = Date.now();
      entry.completedAt = entry.committedAt;
      this.appendWal(entry.taskId, "ACTION_COMMITTED", entry);
      void this.publishLifecycleEvent("ACTION_COMMITTED", entry);
    } else if (resolvedStatus === "FAILED") {
      entry.completedAt = Date.now();
      entry.safeToRetry = entry.isIdempotent;
      this.appendWal(entry.taskId, "ACTION_FAILED", entry);
      void this.publishLifecycleEvent("ACTION_FAILED", entry);
    }

    this.takeSnapshot(entry.taskId);
    return Object.assign(entry, {
      reconciled: resolvedStatus !== "UNKNOWN",
      outcome: resolvedStatus,
      entry,
    });
  }

  public async reconcileTaskInFlightActions(taskId: string): Promise<DurableActionLedgerEntry[]> {
    const actions = this.getActionsForTask(taskId);
    const reconciled: DurableActionLedgerEntry[] = [];
    for (const a of actions) {
      if (a.status === "UNKNOWN" || a.status === "STARTED" || a.status === "VERIFYING") {
        const res = await this.reconcileUnknown(a.actionId);
        reconciled.push(res);
      }
    }
    return reconciled;
  }

  public async startAction(
    actionId: string,
    preStateHash?: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "STARTED";
    entry.startedAt = Date.now();
    entry.preStateHash = preStateHash;

    this.appendWal(entry.taskId, "ACTION_STARTED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_STARTED", entry, checkpointId);
    return entry;
  }

  public async recordExecuted(
    actionId: string,
    result: any,
    sideEffects?: any,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "EXECUTED";
    entry.executedAt = Date.now();
    entry.alreadyExecuted = true;
    entry.result = result;
    entry.sideEffects = sideEffects;

    this.appendWal(entry.taskId, "ACTION_EXECUTED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_EXECUTED", entry, checkpointId);
    return entry;
  }

  public async startVerification(
    actionId: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "VERIFYING";
    entry.verificationStatus = "verifying";

    this.appendWal(entry.taskId, "ACTION_VERIFICATION_STARTED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_VERIFICATION_STARTED", entry, checkpointId);
    return entry;
  }

  public async recordVerified(
    actionId: string,
    postStateHash?: string,
    details?: any,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "VERIFIED";
    entry.verificationStatus = "verified";
    entry.verifiedAt = Date.now();
    entry.alreadyVerified = true;
    entry.postStateHash = postStateHash;
    entry.verificationResult = { verified: true, details };

    this.appendWal(entry.taskId, "ACTION_VERIFICATION_COMPLETED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_VERIFICATION_COMPLETED", entry, checkpointId);
    return entry;
  }

  public async commitAction(
    actionId: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    const now = Date.now();
    entry.status = "COMMITTED";
    entry.committedAt = now;
    entry.completedAt = now;
    entry.durationMs = now - (entry.startedAt || entry.preparedAt);

    this.appendWal(entry.taskId, "ACTION_COMMITTED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_COMMITTED", entry, checkpointId);
    return entry;
  }

  public async recordFailed(
    actionId: string,
    error: string,
    safeToRetry = true,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "FAILED";
    entry.error = error;
    entry.completedAt = Date.now();
    entry.safeToRetry = safeToRetry;

    this.appendWal(entry.taskId, "ACTION_FAILED", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_FAILED", entry, checkpointId);
    return entry;
  }

  public async recordRetryUnsafe(
    actionId: string,
    reason: string,
    checkpointId?: string
  ): Promise<DurableActionLedgerEntry> {
    const entry = this.entries.get(actionId);
    if (!entry) throw new Error(`Action ${actionId} not found in ledger`);

    entry.status = "RETRY_UNSAFE";
    entry.error = reason;
    entry.safeToRetry = false;
    entry.completedAt = Date.now();

    this.appendWal(entry.taskId, "ACTION_RETRY_UNSAFE", entry, checkpointId);
    void this.publishLifecycleEvent("ACTION_RETRY_UNSAFE", entry, checkpointId);
    return entry;
  }

  public reduceTaskState(task: InternalAgentTaskRecord): void {
    const actions = this.getActionsForTask(task.id);
    const committed = actions.filter((a) => a.status === "COMMITTED");
    const failed = actions.filter((a) => a.status === "FAILED" || a.status === "RETRY_UNSAFE");

    task.actionCount = Math.max(task.actionCount || 0, committed.length);
    task.resourceUsage.actionsExecuted = Math.max(task.resourceUsage.actionsExecuted || 0, committed.length);
    task.iteration = Math.max(task.iteration || 0, committed.length);
    task.failureCount = Math.max(task.failureCount || 0, failed.length);
    if (committed.length > 0 || !task.actionHistory) {
      task.actionHistory = committed.map((c) => toDurableAction(c));
    }

    // Reconstruct modified and created files
    const modFiles = new Set<string>(task.modifiedFiles || []);
    const artFiles = new Set<string>(task.artifacts || []);
    for (const c of committed) {
      if (c.sideEffects?.modifiedFiles) {
        for (const f of c.sideEffects.modifiedFiles) modFiles.add(f);
      }
      if (c.sideEffects?.createdFiles) {
        for (const f of c.sideEffects.createdFiles) {
          modFiles.add(f);
          artFiles.add(f);
        }
      }
    }
    task.modifiedFiles = Array.from(modFiles);
    task.artifacts = Array.from(artFiles);

    // Evidence
    task.executionEvidence = {
      verifiedActionCount: committed.length,
      lastActionId: committed[committed.length - 1]?.actionId,
      lastCommittedAt: committed[committed.length - 1]?.committedAt,
      verifiedFiles: task.modifiedFiles,
    };
    if (!task.executionInstruction) {
      task.executionInstruction = `Real tool execution evidence verified: ${committed.length} committed actions.`;
    }

    if (task.state === "queued" && committed.length > 0) {
      task.state = "running";
      if (!task.startedAt) {
        task.startedAt = Date.now();
      }
    }
  }

  public async computePreStateHash(method: string, params: Record<string, any>): Promise<string> {
    try {
      if (params.projectId && params.path) {
        const fullPath = this.resolveFullPath(params.projectId, params.path);
        if (fullPath && fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath);
          return "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
        }
        return "file_not_found";
      }
      if (method.startsWith("computer.")) {
        if (params.testScreenHash) {
          return params.testScreenHash;
        }
        if (this.computerUseService) {
          const status = await this.computerUseService.getStatus().catch(() => null);
          return "sha256:" + crypto.createHash("sha256").update(JSON.stringify(status || {})).digest("hex");
        }
      }
    } catch {
      // fallback
    }
    return crypto.createHash("sha256").update(`${method}:${Date.now()}`).digest("hex");
  }

  public async computePostStateHash(
    method: string,
    params: Record<string, any>,
    result: any
  ): Promise<string> {
    try {
      if (params.projectId && params.path) {
        const fullPath = this.resolveFullPath(params.projectId, params.path);
        if (fullPath && fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath);
          return "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
        }
      }
      if (method.startsWith("computer.")) {
        if (params.testPostScreenHash) {
          return params.testPostScreenHash;
        }
        if (result && typeof result === "object" && result.screenHash) {
          return result.screenHash;
        }
        if (this.computerUseService) {
          const status = await this.computerUseService.getStatus().catch(() => null);
          return "sha256:" + crypto.createHash("sha256").update(JSON.stringify(status || {})).digest("hex");
        }
      }
    } catch {
      // fallback
    }
    if (result && typeof result === "object" && result.newHash) {
      return result.newHash;
    }
    return crypto.createHash("sha256").update(JSON.stringify(result ?? {})).digest("hex");
  }

  public async verifyAction(
    method: string,
    params: Record<string, any>,
    result: any,
    preStateHash?: string,
    postStateHash?: string
  ): Promise<{ verified: boolean; details?: any }> {
    if (method === "file.create" || method === "file.write") {
      const fullPath = this.resolveFullPath(params.projectId, params.path);
      if (!fullPath || !fs.existsSync(fullPath)) {
        return { verified: false, details: { error: `File not found on disk: ${params.path}` } };
      }
      const rawHex = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
      const actualHash = `sha256:${rawHex}`;
      const expectedHash = result?.newHash || postStateHash;
      const normExpected = expectedHash ? String(expectedHash).replace(/^sha256:/, "") : undefined;
      const normActual = rawHex;

      if (normExpected && normActual !== normExpected) {
        return {
          verified: false,
          details: { error: `Hash mismatch: expected ${expectedHash}, got ${actualHash}` },
        };
      }
      return {
        verified: true,
        details: { fileExists: true, hashMatches: true, hash: actualHash },
      };
    }

    if (method === "file.delete") {
      const fullPath = this.resolveFullPath(params.projectId, params.path);
      if (fullPath && fs.existsSync(fullPath)) {
        return { verified: false, details: { error: "File still exists on disk" } };
      }
      return { verified: true, details: { fileDeleted: true } };
    }

    if (method === "command.run") {
      const ok = result && (result.exitCode === 0 || result.status === "completed");
      return {
        verified: Boolean(ok),
        details: { exitCode: result?.exitCode, status: result?.status },
      };
    }

    // Computer Use world-state verification: Tool Success != World State Success
    if (method.startsWith("computer.")) {
      if (result?.isError || result?.error) {
        return { verified: false, details: { error: result?.error || "Computer action returned error" } };
      }
      if (result?.verification && result.verification.passed === false) {
        return {
          verified: false,
          details: { error: "Computer verification engine check failed", verification: result.verification },
        };
      }
      if (result?.verified === false) {
        return { verified: false, details: { error: "Computer action state verification failed" } };
      }
      if (params.failVerification) {
        return { verified: false, details: { error: "Simulated world-state verification failure" } };
      }
      if (params.requireScreenChange && preStateHash && postStateHash && preStateHash === postStateHash) {
        return {
          verified: false,
          details: {
            error: "Screen visual state unchanged after physical input (Tool Success != World State Success)",
          },
        };
      }
      return {
        verified: true,
        details: { status: "computer_state_verified", verification: result?.verification },
      };
    }

    // Default: non-null result implies verification succeeded
    const verified = result !== undefined && result !== null && !result.isError;
    return { verified, details: { status: "result_present" } };
  }

  public detectSideEffects(
    method: string,
    params: Record<string, any>,
    result: any
  ): {
    createdFiles?: string[];
    modifiedFiles?: string[];
    deletedFiles?: string[];
    outputSummary?: string;
  } {
    const sideEffects: {
      createdFiles?: string[];
      modifiedFiles?: string[];
      deletedFiles?: string[];
      outputSummary?: string;
    } = {};

    if (method === "file.create") {
      if (params.path) {
        sideEffects.createdFiles = [params.path];
        sideEffects.modifiedFiles = [params.path];
      }
    } else if (method === "file.write" || method === "file.patch" || method === "file.restore") {
      if (params.path) {
        sideEffects.modifiedFiles = [params.path];
      }
    } else if (method === "file.delete") {
      if (params.path) {
        sideEffects.deletedFiles = [params.path];
      }
    } else if (method === "command.run") {
      if (typeof result?.stdout === "string") {
        sideEffects.outputSummary = result.stdout.slice(0, 200);
      }
    }

    return sideEffects;
  }

  private resolveFullPath(projectId?: string, relativePath?: string): string | null {
    if (!projectId || !relativePath) return null;
    if (this.projectRegistry) {
      const proj = this.projectRegistry.get(projectId);
      if (proj) {
        const root = proj.canonicalRoot || (proj as any).root;
        if (root) {
          try {
            const resolved = resolveProjectPath(root, relativePath, {
              mustExist: false,
              allowSensitive: true,
            });
            return resolved.absolutePath;
          } catch {
            return path.resolve(root, relativePath.replace(/^[/\\]+/, ""));
          }
        }
      }
    }
    return null;
  }

  private async publishLifecycleEvent(
    type: string,
    entry: DurableActionLedgerEntry,
    checkpointId?: string
  ): Promise<void> {
    if (!this.eventBus) return;
    const topicMap: Record<string, string> = {
      ACTION_PREPARED: "agent.action.prepared",
      ACTION_STARTED: "agent.action.started",
      ACTION_EXECUTED: "agent.action.executed",
      ACTION_VERIFICATION_STARTED: "agent.action.verification.started",
      ACTION_VERIFICATION_COMPLETED: "agent.action.verification.completed",
      ACTION_COMMITTED: "agent.action.committed",
      ACTION_FAILED: "agent.action.failed",
      ACTION_RETRY_UNSAFE: "agent.action.retry_unsafe",
    };

    const topic = topicMap[type] || `agent.action.${type.toLowerCase()}`;
    const stateHash = entry.postStateHash || entry.preStateHash || entry.argumentsHash;

    const eventPayload = {
      taskId: entry.taskId,
      executionId: entry.executionId,
      actionId: entry.actionId,
      idempotencyKey: entry.idempotencyKey,
      checkpointId,
      stateHash,
      timestamp: Date.now(),
      runner: "windows",
      toolName: entry.toolName,
      status: entry.status,
      argumentsHash: entry.argumentsHash,
      verificationStatus: entry.verificationStatus,
    };

    // Publish to topic
    await this.eventBus.publish({
      topic,
      source: "runner.action-ledger",
      type,
      taskId: entry.taskId,
      executionId: entry.executionId,
      actionId: entry.actionId,
      checkpointId,
      stateHash,
      payload: eventPayload,
    });
  }
}
