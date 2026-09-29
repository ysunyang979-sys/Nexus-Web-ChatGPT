import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type RunnerRpcMap,
  type RpcRequestOptions,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type Database from "better-sqlite3";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import type { ServerProjectService } from "../runner/project-service.js";
import { WorkflowSessionManager } from "../session/manager.js";
import { ManagedWorktreeManager } from "../worktree/manager.js";
import { ServerPersistentRuntimeManager } from "../runtime/index.js";
import {
  ManagedDecisionProvider,
  type DecisionProvider,
} from "@localbridge/security";
import type {
  DecisionContext,
  DecisionAdvice,
  DecisionProviderConfig,
  IntelligenceStatusDto,
  ModelStatusDto,
  ModelDownloadOptions,
  ModelValidationResult,
} from "@localbridge/protocol";
import type { McpPrincipal } from "./types.js";
import { FullControlService } from "../auth/full-control-service.js";
import { SkillRegistry, SkillLoader, SkillValidator, SkillImporter } from "../skills/index.js";
import { MCP_TOOL_SCOPE } from "./scope-policy.js";
import { AgentCommunicationService } from "../agent-comm/communication-service.js";
import { WorkflowOrchestrator } from "../workflow/workflow-orchestrator.js";
import { IntelligenceRuntime } from "../intelligence/runtime.js";

export interface McpContextDeps {
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  db?: Database.Database;
  logger?: Logger;
  workflowSessionManager?: WorkflowSessionManager;
  worktreeManager?: ManagedWorktreeManager;
  persistentRuntimeManager?: ServerPersistentRuntimeManager;
  decisionProvider?: DecisionProvider;
  skillRegistry?: SkillRegistry;
  intelligenceRuntime?: IntelligenceRuntime;
}

export interface SafeAuditMetadata {
  id: string;
  timestamp: string;
  event: string;
  principalId?: string;
  authType?: string;
  toolName: string;
  projectId?: string;
  runnerId?: string;
  relativePath?: string;
  durationMs?: number;
  resultStatus?: "success" | "error";
  errorCode?: string;
  decisionSource?: string;
  policyLevel?: string;
  actorDisplayName?: string;
  clientId?: string;
  clientType?: string;
  clientName?: string;
  skillId?: string;
  collectionId?: string;
  [key: string]: unknown;
}

import { AsyncLocalStorage } from "node:async_hooks";

export type AuditRecord = SafeAuditMetadata;

export interface RequestExecutionContext {
  taskId?: string;
  executionId?: string;
  sessionId?: string;
  idempotencyKey?: string;
  callerPurpose?: string;
  toolName?: string;
  runnerInvoked?: boolean;
}

export const mcpExecutionContext = new AsyncLocalStorage<RequestExecutionContext>();


export class McpContext {
  public readonly projectService: ServerProjectService;
  public readonly runnerRegistry: RunnerRegistry;
  public readonly rpcService: RunnerRpcService;
  public readonly db?: Database.Database;
  public readonly logger?: Logger;
  public readonly workflowSessionManager?: WorkflowSessionManager;
  public readonly worktreeManager?: ManagedWorktreeManager;
  public readonly persistentRuntimeManager?: ServerPersistentRuntimeManager;
  public readonly decisionProvider: DecisionProvider;
  public readonly fullControlService: FullControlService;
  public readonly skillValidator: SkillValidator;
  public readonly skillLoader: SkillLoader;
  public readonly skillRegistry: SkillRegistry;
  public readonly skillImporter: SkillImporter;
  public readonly communicationService: AgentCommunicationService;
  public readonly workflowOrchestrator: WorkflowOrchestrator;
  public readonly intelligenceRuntime?: IntelligenceRuntime;

  // In-memory mapping from jobId to runnerId for background jobs
  private readonly jobToRunnerMap = new Map<string, string>();

  // Global pause state for AI access
  private isPausedState = false;

  // In-memory sanitized audit log ring buffer (up to 5000 events)
  private readonly auditLogBuffer: AuditRecord[] = [];
  private readonly maxAuditLogSize = 5000;

  constructor(deps: McpContextDeps) {
    this.projectService = deps.projectService;
    this.runnerRegistry = deps.runnerRegistry;
    this.rpcService = deps.rpcService;
    this.db = deps.db;
    this.logger = deps.logger;
    this.intelligenceRuntime =
      deps.intelligenceRuntime ??
      (deps.db ? new IntelligenceRuntime(deps.db, deps.logger) : undefined);
    this.fullControlService = new FullControlService(() => this.isPaused(), this.logger);
    this.workflowSessionManager =
      deps.workflowSessionManager ??
      (deps.db
        ? new WorkflowSessionManager({
            db: deps.db,
            projectService: deps.projectService,
            runnerRegistry: deps.runnerRegistry,
            rpcService: deps.rpcService,
            logger: deps.logger,
          })
        : undefined);

    this.worktreeManager =
      deps.worktreeManager ??
      (deps.db
        ? new ManagedWorktreeManager({
            db: deps.db,
            projectService: deps.projectService,
            runnerRegistry: deps.runnerRegistry,
            rpcService: deps.rpcService,
            workflowSessionManager: this.workflowSessionManager,
            logger: deps.logger,
          })
        : undefined);

    this.persistentRuntimeManager =
      deps.persistentRuntimeManager ??
      (deps.db
        ? new ServerPersistentRuntimeManager({
            db: deps.db,
            projectService: deps.projectService,
            runnerRegistry: deps.runnerRegistry,
            rpcService: deps.rpcService,
            logger: deps.logger,
          })
        : undefined);

    let initialConfig: Partial<DecisionProviderConfig> = { provider: "disabled" };
    if (deps.db) {
      try {
        const row = deps.db
          .prepare("SELECT value FROM system_settings WHERE key = 'intelligence_config'")
          .get() as { value: string } | undefined;
        if (row?.value) {
          initialConfig = JSON.parse(row.value);
        }
      } catch {
        // Table or row might not exist yet
      }
    }

    this.decisionProvider =
      deps.decisionProvider ?? new ManagedDecisionProvider(initialConfig);

    const validMcpTools = new Set(Object.keys(MCP_TOOL_SCOPE));
    this.skillValidator = new SkillValidator(validMcpTools);
    this.skillLoader = new SkillLoader(this.skillValidator);
    this.skillRegistry = deps.skillRegistry ?? new SkillRegistry(this.skillLoader);
    this.skillImporter = new SkillImporter({
      validator: this.skillValidator,
      loader: this.skillLoader,
      registry: this.skillRegistry,
      validMcpTools,
    });
    this.communicationService = new AgentCommunicationService(this.logger);
    this.workflowOrchestrator = new WorkflowOrchestrator(this, this.logger);
  }

  resolveAnyRunner(): string {
    const runners = this.runnerRegistry.list();
    const firstRunner = runners[0];
    if (!firstRunner) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        "No runners are currently connected or online"
      );
    }
    return firstRunner.id;
  }

  async getDecisionAdvice(context: DecisionContext): Promise<DecisionAdvice> {
    return this.decisionProvider.getAdvice(context);
  }

  getIntelligenceStatus(): IntelligenceStatusDto {
    return this.decisionProvider.getStatus();
  }

  async updateIntelligenceConfig(
    config: Partial<DecisionProviderConfig>
  ): Promise<IntelligenceStatusDto> {
    const status = await this.decisionProvider.updateConfig(config);
    if (this.db) {
      try {
        const fullConfig = {
          provider: status.provider,
          modelPath: status.modelPath,
          pythonPath: status.pythonPath,
          workerTimeoutMs: status.inferenceTimeoutMs,
          startupTimeoutMs: status.startupTimeoutMs,
          inferenceTimeoutMs: status.inferenceTimeoutMs,
          developerOverride: status.developerOverride,
        };
        this.db
          .prepare(
            "INSERT INTO system_settings (key, value, updated_at) VALUES ('intelligence_config', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
          )
          .run(JSON.stringify(fullConfig), Date.now());
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to persist intelligence_config to system_settings");
      }
    }
    return status;
  }

  public getRegisteredToolsCount(): number {
    return Object.keys(MCP_TOOL_SCOPE).length;
  }

  getModelStatus(): ModelStatusDto {
    return this.decisionProvider.getModelStatus();
  }

  startModelDownload(options?: ModelDownloadOptions): Promise<ModelStatusDto> {
    return this.decisionProvider.startModelDownload(options);
  }

  cancelModelDownload(): ModelStatusDto {
    return this.decisionProvider.cancelModelDownload();
  }

  validateModelPath(dir: string): ModelValidationResult {
    return this.decisionProvider.validateModelPath(dir);
  }

  async setModelPath(dir: string): Promise<ModelStatusDto> {
    return this.decisionProvider.setModelPath(dir);
  }

  async importExistingModel(sourceDir: string, copyToManaged?: boolean): Promise<ModelStatusDto> {
    return this.decisionProvider.importExistingModel(sourceDir, copyToManaged);
  }

  async downloadAndEnableModel(options?: ModelDownloadOptions): Promise<IntelligenceStatusDto> {
    const status = await this.decisionProvider.downloadAndEnable(options);
    if (this.db) {
      try {
        const fullConfig = {
          provider: status.provider,
          modelPath: status.modelPath,
          pythonPath: status.pythonPath,
          workerTimeoutMs: status.inferenceTimeoutMs,
          startupTimeoutMs: status.startupTimeoutMs,
          inferenceTimeoutMs: status.inferenceTimeoutMs,
          developerOverride: status.developerOverride,
        };
        this.db
          .prepare(
            "INSERT INTO system_settings (key, value, updated_at) VALUES ('intelligence_config', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
          )
          .run(JSON.stringify(fullConfig), Date.now());
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to persist intelligence_config to system_settings");
      }
    }
    return status;
  }

  recordSessionEvent(event: {
    projectId: string;
    eventType: string;
    source: string;
    refType?: string;
    refId?: string;
    summary?: Record<string, unknown>;
  }): void {
    try {
      this.workflowSessionManager?.recordProjectEvent(event);
    } catch (err) {
      this.logger?.warn({ err, event }, "Failed to record session event");
    }
  }

  isPaused(): boolean {
    return this.isPausedState;
  }

  setPaused(val: boolean): void {
    this.isPausedState = val;
    if (val) {
      this.fullControlService.stopAll();
    }
  }

  getAuditEvents(limit = 100): AuditRecord[] {
    return [...this.auditLogBuffer].reverse().slice(0, limit);
  }

  /**
   * Resolve a project ID to its owning online Runner ID.
   * Throws PROJECT_NOT_FOUND if project does not exist.
   * Throws PROJECT_DISABLED if project is marked disabled.
   * Throws RUNNER_OFFLINE if the runner is disconnected.
   */
  resolveProjectRunner(projectId: string): string {
    const project = this.projectService.getProject(projectId);
    if (!project) {
      const isDrive = this.projectService.getSafetyLayerDisabled() && (projectId === "drive-c" || /^[a-zA-Z](?::|盘|_drive|-drive)?$/i.test(projectId));
      if (isDrive) {
        const firstOnline = Array.from(this.runnerRegistry.keys())[0];
        if (firstOnline) return firstOnline;
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found or not registered`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }

    const connection = this.runnerRegistry.get(project.runnerId);
    if (!connection) {
      if (this.projectService.getSafetyLayerDisabled()) {
        const firstOnline = Array.from(this.runnerRegistry.keys())[0];
        if (firstOnline) return firstOnline;
      }
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${project.runnerId}" for project "${projectId}" is offline`
      );
    }

    return project.runnerId;
  }

  /**
   * Track which runner started a specific job and optionally persist to SQLite.
   */
  trackJob(jobId: string, runnerId: string): void {
    this.jobToRunnerMap.set(jobId, runnerId);
    // Bounded in-memory retention (keep up to 1000 jobs)
    if (this.jobToRunnerMap.size > 1000) {
      const oldestKey = this.jobToRunnerMap.keys().next().value;
      if (oldestKey) this.jobToRunnerMap.delete(oldestKey);
    }
  }

  /**
   * Record a job in memory and persistent SQLite jobs table.
   */
  recordJob(rawRow: {
    id: string;
    projectId?: string;
    project_id?: string;
    runnerId?: string;
    runner_id?: string;
    commandKind?: string;
    command_kind?: string;
    risk?: string;
    state?: string;
    createdAt?: number;
    created_at?: number;
    queuedAt?: number | null;
    queued_at?: number | null;
    startedAt?: number | null;
    started_at?: number | null;
    finishedAt?: number | null;
    finished_at?: number | null;
    exitCode?: number | null;
    exit_code?: number | null;
    signal?: string | null;
    timeoutMs?: number | null;
    timeout_ms?: number | null;
    approvalId?: string | null;
    approval_id?: string | null;
    errorMessage?: string | null;
    error_message?: string | null;
  }): void {
    const row = {
      id: rawRow.id,
      projectId: rawRow.projectId || rawRow.project_id || "",
      runnerId: rawRow.runnerId || rawRow.runner_id || "runner_default",
      commandKind: rawRow.commandKind || rawRow.command_kind || "command",
      risk: rawRow.risk || "SAFE",
      state: rawRow.state ?? "queued",
      createdAt: rawRow.createdAt ?? rawRow.created_at ?? Date.now(),
      queuedAt: rawRow.queuedAt ?? rawRow.queued_at ?? null,
      startedAt: rawRow.startedAt ?? rawRow.started_at ?? null,
      finishedAt: rawRow.finishedAt ?? rawRow.finished_at ?? null,
      exitCode: rawRow.exitCode ?? rawRow.exit_code ?? null,
      signal: rawRow.signal ?? null,
      timeoutMs: rawRow.timeoutMs ?? rawRow.timeout_ms ?? null,
      approvalId: rawRow.approvalId ?? rawRow.approval_id ?? null,
      errorMessage: rawRow.errorMessage || rawRow.error_message || null,
    };

    this.trackJob(row.id, row.runnerId);
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT INTO jobs (id, project_id, runner_id, command_kind, risk, state, created_at, queued_at, started_at, finished_at, exit_code, signal, timeout_ms, approval_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             state = excluded.state,
             queued_at = excluded.queued_at,
             started_at = excluded.started_at,
             finished_at = excluded.finished_at,
             exit_code = excluded.exit_code,
             signal = excluded.signal`
        )
        .run(
          row.id,
          row.projectId,
          row.runnerId,
          row.commandKind,
          row.risk,
          row.state,
          row.createdAt,
          row.queuedAt,
          row.startedAt,
          row.finishedAt,
          row.exitCode,
          row.signal,
          row.timeoutMs,
          row.approvalId
        );

      // Auto-attribute job event to active project session
      let targetProjectId = row.projectId;
      if (!targetProjectId && this.db) {
        try {
          const found = this.db.prepare("SELECT project_id FROM jobs WHERE id = ?").get(row.id) as { project_id: string } | undefined;
          if (found) targetProjectId = found.project_id;
        } catch {}
      }

      if (targetProjectId && row.state) {
        let eventType: string | undefined;
        if (row.state === "running" || row.state === "queued") eventType = "JOB_STARTED";
        else if (row.state === "succeeded") eventType = "JOB_SUCCEEDED";
        else if (row.state === "failed") eventType = "JOB_FAILED";
        else if (row.state === "cancelled") eventType = "JOB_CANCELLED";
        else if (row.state === "timed_out") eventType = "JOB_TIMED_OUT";
        else if (row.state === "interrupted") eventType = "JOB_INTERRUPTED";

        if (eventType) {
          const status =
            row.state === "succeeded"
              ? "success"
              : row.state === "failed" || row.state === "cancelled" || row.state === "timed_out" || row.state === "interrupted"
                ? "failure"
                : "running";

          this.recordSessionEvent({
            projectId: targetProjectId,
            eventType,
            source: "job-manager",
            refType: "job",
            refId: row.id,
            summary: {
              jobId: row.id,
              target: row.id,
              commandKind: row.commandKind,
              state: row.state,
              status,
              exitCode: row.exitCode,
            },
          });
        }
      }
    } catch (err) {
      this.logger?.warn({ err, jobId: row.id }, "Failed to record job in SQLite jobs table");
    }
  }

  /**
   * Resolve a job ID to its owning Runner ID.
   */
  resolveJobRunner(jobId: string): string {
    const runnerId = this.jobToRunnerMap.get(jobId);
    if (runnerId && this.runnerRegistry.get(runnerId)) {
      return runnerId;
    }

    if (this.db) {
      try {
        const row = this.db
          .prepare("SELECT runner_id FROM jobs WHERE id = ?")
          .get(jobId) as { runner_id: string } | undefined;
        if (row && row.runner_id && this.runnerRegistry.get(row.runner_id)) {
          return row.runner_id;
        }
      } catch {
        // ignore
      }
    }

    // If only one runner is connected, default to it
    const runners = this.runnerRegistry.list();
    if (runners.length === 1 && runners[0]) {
      return runners[0].id;
    }

    // Otherwise check if any active runner knows this job or throws
    if (runnerId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${runnerId}" for job "${jobId}" is offline`
      );
    }

    throw new LocalBridgeError(
      LocalBridgeErrorCode.JOB_NOT_FOUND,
      `Job "${jobId}" not found or unknown to connected runners`
    );
  }

  /**
   * Send a strongly typed RPC request to a runner.
   */
  async request<M extends keyof RunnerRpcMap>(
    runnerId: string,
    method: M,
    params: RunnerRpcMap[M]["params"],
    options?: RpcRequestOptions
  ): Promise<RunnerRpcMap[M]["result"]>;
  async request(
    runnerId: string,
    method: string,
    params: any,
    options?: RpcRequestOptions
  ): Promise<any>;
  async request(
    runnerId: string,
    method: any,
    params: any,
    options?: RpcRequestOptions
  ): Promise<any> {
    const ctx = mcpExecutionContext.getStore();
    if (ctx) {
      ctx.runnerInvoked = true;
    }
    if (params && typeof params === "object") {
      const raw = { ...params } as any;
      const toolName = raw._toolName ?? ctx?.toolName;
      delete raw._toolName;

      if (ctx) {
        if (ctx.taskId !== undefined) raw.taskId = raw.taskId ?? ctx.taskId;
        if (ctx.executionId !== undefined) raw.executionId = raw.executionId ?? ctx.executionId;
        if (ctx.sessionId !== undefined) raw.sessionId = raw.sessionId ?? ctx.sessionId;
        if (ctx.idempotencyKey !== undefined) raw.idempotencyKey = raw.idempotencyKey ?? ctx.idempotencyKey;
        if (ctx.callerPurpose !== undefined) raw.callerPurpose = raw.callerPurpose ?? ctx.callerPurpose;
      }

      if (!raw._executionContext && (raw.taskId || raw.sessionId || raw.idempotencyKey || toolName)) {
        raw._executionContext = {
          taskId: raw.taskId,
          executionId: raw.executionId,
          sessionId: raw.sessionId,
          idempotencyKey: raw.idempotencyKey,
          callerPurpose: raw.callerPurpose,
          toolName,
          runnerId,
        };
      }
      return (this.rpcService as any).request(runnerId, method, raw, options);
    }
    return (this.rpcService as any).request(runnerId, method, params, options);
  }

  /**
   * Log an audit event with strict metadata sanitization.
   * NEVER logs raw tokens, hashes, diffs, patches, file content, or stdout/stderr.
   */
  logAudit(
    event: "mcp_tool_started" | "mcp_tool_completed" | "mcp_tool_failed",
    data: {
      principal?: McpPrincipal;
      toolName: string;
      projectId?: string;
      runnerId?: string;
      relativePath?: string;
      durationMs?: number;
      resultStatus?: "success" | "error";
      errorCode?: string;
      decisionSource?: string;
      policyLevel?: string;
      actorDisplayName?: string;
      clientId?: string;
      clientType?: string;
      clientName?: string;
      [key: string]: unknown;
    }
  ): void {
    // Explicit whitelist construction - strictly drops any unlisted properties
    const record: SafeAuditMetadata = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      event,
      principalId: data.principal?.id,
      authType: data.principal?.authType,
      toolName: data.toolName,
      projectId: data.projectId,
      runnerId: data.runnerId,
      relativePath: data.relativePath,
      durationMs: data.durationMs,
      resultStatus: data.resultStatus,
      errorCode: data.errorCode,
      decisionSource: data.decisionSource,
      policyLevel: data.policyLevel,
      actorDisplayName: data.actorDisplayName,
      clientId: data.clientId,
      clientType: data.clientType,
      clientName: data.clientName,
    };
    this.auditLogBuffer.push(record);
    if (this.auditLogBuffer.length > this.maxAuditLogSize) {
      this.auditLogBuffer.shift();
    }

    this.logger?.info(
      {
        event,
        principalId: data.principal?.id,
        authType: data.principal?.authType,
        toolName: data.toolName,
        projectId: data.projectId,
        runnerId: data.runnerId,
        relativePath: data.relativePath,
        durationMs: data.durationMs,
        resultStatus: data.resultStatus,
        errorCode: data.errorCode,
        decisionSource: data.decisionSource,
        policyLevel: data.policyLevel,
        actorDisplayName: data.actorDisplayName,
        clientId: data.clientId,
        clientType: data.clientType,
        clientName: data.clientName,
      },
      `MCP tool [${data.toolName}]: ${event}`
    );
  }
}
