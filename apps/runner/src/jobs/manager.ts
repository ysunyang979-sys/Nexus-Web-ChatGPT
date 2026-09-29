import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandSpec,
  type JobStartParams,
  type JobStartResult,
  type JobStatusResult,
  type JobLogsParams,
  type JobLogsResult,
  type JobCancelResult,
  type JobListParams,
  type JobListResult,
  type BuildStartParams,
  type BuildStartResult,
  type TestStartParams,
  type TestStartResult,
  type JobState,
} from "@localbridge/protocol";
import {
  CommandClassifier,
  CommandPolicy,
  validateCommandArguments,
  resolveProjectPath,
  SecurityPathError,
} from "@localbridge/security";
import { canonicalPayloadHash, type Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import type { WorkspaceResolver } from "../worktree/resolver.js";
import type { ExecutableRegistry } from "../process/executable-registry.js";
import { buildSafeProcessEnv } from "../process/environment.js";
import { killProcessTree } from "../process/kill-tree.js";
import { JobLogBuffer } from "./log-buffer.js";
import type { ApprovalManager } from "../approvals/index.js";
import {
  type JobRecord,
  type JobManagerOptions,
  MAX_RUNNING_JOBS_PER_RUNNER,
  MAX_RUNNING_JOBS_PER_PROJECT,
  MAX_QUEUED_JOBS_PER_RUNNER,
  MAX_QUEUED_JOBS_PER_PROJECT,
  MAX_JOB_STARTS_PER_MINUTE,
  DEFAULT_JOB_TIMEOUT_MS,
  MIN_JOB_TIMEOUT_MS,
  MAX_JOB_TIMEOUT_MS,
  MAX_JOB_LOG_BYTES,
  MAX_JOB_HISTORY,
  JOB_HISTORY_MAX_AGE_MS,
} from "./types.js";

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly queuedJobIds: string[] = [];
  private readonly startTimestamps: number[] = [];
  private readonly persistencePath: string;
  private workspaceResolver?: WorkspaceResolver;
  private safetyLayerDisabled: boolean = false;

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly executableRegistry: ExecutableRegistry,
    private readonly runnerStateDir: string,
    private readonly logger?: Logger,
    private readonly approvalManager?: ApprovalManager,
    private readonly options?: JobManagerOptions
  ) {
    this.persistencePath = path.join(this.runnerStateDir, "jobs-state.json");
    this.wireProjectRegistryEvents();
    this.recoverPersistedJobs();
  }

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  /**
   * Recover persisted jobs from previous runs upon startup.
   * Any job that was saved as "running" or "queued" is transitioned to "interrupted".
   */
  private recoverPersistedJobs(): void {
    if (!this.options?.persistState) return;
    try {
      if (!fs.existsSync(this.persistencePath)) return;
      const raw = fs.readFileSync(this.persistencePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      for (const item of parsed) {
        if (!item || typeof item.id !== "string") continue;
        let state: JobState = item.state;
        let finishedAt = item.finishedAt;
        let errorCode = item.errorCode;
        let errorMessage = item.errorMessage;

        if (state === "running" || state === "queued") {
          state = "interrupted";
          finishedAt = finishedAt ?? Date.now();
          errorCode = "JOB_RUNNER_INTERRUPTED";
          errorMessage = "Job was interrupted due to runner restart or crash";
        }

        const logs = new JobLogBuffer(MAX_JOB_LOG_BYTES);
        if (Array.isArray(item.recentLogs)) {
          for (const chunk of item.recentLogs) {
            logs.append(chunk.stream ?? "stdout", chunk.text ?? "");
          }
        }

        const rec: JobRecord = {
          id: item.id,
          projectId: item.projectId,
          commandKind: item.commandKind ?? "unknown",
          risk: item.risk ?? "SAFE",
          state,
          createdAt: item.createdAt ?? Date.now(),
          queuedAt: item.queuedAt ?? null,
          startedAt: item.startedAt ?? null,
          finishedAt,
          cancelRequestedAt: item.cancelRequestedAt ?? null,
          exitCode: item.exitCode ?? null,
          signal: item.signal ?? null,
          logs,
          canonicalProjectRoot: item.canonicalProjectRoot ?? "",
          approvalId: item.approvalId,
          outputTruncated: item.outputTruncated ?? false,
          errorCode,
          errorMessage,
        };

        this.jobs.set(rec.id, rec);
      }
      this.persistJobs();
    } catch (err) {
      this.logger?.warn({ err }, "Failed to recover persisted jobs from disk");
    }
  }

  /**
   * Atomically persist job records to disk.
   */
  private persistJobs(): void {
    if (!this.options?.persistState) return;
    try {
      const list = Array.from(this.jobs.values()).map((j) => {
        const logRes = j.logs.getLogs({ limit: 50 });
        return {
          id: j.id,
          projectId: j.projectId,
          commandKind: j.commandKind,
          risk: j.risk,
          state: j.state,
          createdAt: j.createdAt,
          queuedAt: j.queuedAt,
          startedAt: j.startedAt,
          finishedAt: j.finishedAt,
          cancelRequestedAt: j.cancelRequestedAt,
          exitCode: j.exitCode,
          signal: j.signal,
          canonicalProjectRoot: j.canonicalProjectRoot,
          approvalId: j.approvalId,
          outputTruncated: j.logs.isTruncated,
          errorCode: j.errorCode,
          errorMessage: j.errorMessage,
          recentLogs: logRes.chunks,
        };
      });

      const tmpPath = `${this.persistencePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.persistencePath);
    } catch (err) {
      this.logger?.warn({ err }, "Failed to persist jobs state to disk");
    }
  }

  /**
   * Listen to ProjectRegistry mutations and automatically cancel active/queued jobs
   * when project permissions are removed, disabled, or downgraded.
   */
  private wireProjectRegistryEvents(): void {
    this.projectRegistry.on("project:removed", (projectId: string) => {
      this.logger?.info({ event: "project_removed_cancelling_jobs", projectId }, "Project removed; cancelling running/queued jobs");
      this.cancelProjectJobs(projectId, "Project was removed from local registry");
    });

    this.projectRegistry.on("project:disabled", (projectId: string) => {
      this.logger?.info({ event: "project_disabled_cancelling_jobs", projectId }, "Project disabled; cancelling running/queued jobs");
      this.cancelProjectJobs(projectId, "Project authorization was disabled");
    });

    this.projectRegistry.on("project:execution_mode_changed", (projectId: string, mode: string) => {
      if (mode === "disabled" || mode === "safe-only") {
        this.logger?.info({ event: "project_execution_mode_changed_cancelling_jobs", projectId, mode }, "Project executionMode downgraded; cancelling active script jobs");
        this.cancelProjectJobs(projectId, `Project executionMode changed to "${mode}"`);
      }
    });
  }

  /**
   * Cancel all active and queued jobs for a given project.
   */
  cancelProjectJobs(projectId: string, reason?: string): void {
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && (job.state === "running" || job.state === "queued")) {
        this.logger?.warn({ jobId: job.id, projectId, reason }, "Aborting active/queued project job");
        this.cancelJob(job.id).catch(() => {});
      }
    }
  }

  /**
   * Cancel all currently active or queued jobs across all projects (e.g. for Emergency Stop).
   */
  async cancelAllJobs(reason?: string): Promise<{ cancelledCount: number; jobIds: string[] }> {
    const jobIds: string[] = [];
    for (const job of this.jobs.values()) {
      if (job.state === "running" || job.state === "queued") {
        this.logger?.warn({ jobId: job.id, reason }, "Emergency stop: aborting job");
        await this.cancelJob(job.id).catch(() => {});
        jobIds.push(job.id);
      }
    }
    return {
      cancelledCount: jobIds.length,
      jobIds,
    };
  }

  /**
   * Check rate limit: max 20 starts per minute per runner.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    const cutoff = now - 60000;

    while (this.startTimestamps.length > 0 && this.startTimestamps[0]! <= cutoff) {
      this.startTimestamps.shift();
    }

    if (this.startTimestamps.length >= MAX_JOB_STARTS_PER_MINUTE) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_RATE_LIMITED,
        `Job start rate limit (${MAX_JOB_STARTS_PER_MINUTE} starts per minute) exceeded`
      );
    }

    this.startTimestamps.push(now);
  }

  /**
   * Prune oldest completed jobs when history limit is exceeded or completed jobs are older than 24h.
   */
  private pruneOldJobs(): void {
    const now = Date.now();

    for (const [id, job] of this.jobs.entries()) {
      if (job.state !== "running" && job.state !== "queued" && job.finishedAt && now - job.finishedAt > JOB_HISTORY_MAX_AGE_MS) {
        this.jobs.delete(id);
      }
    }

    if (this.jobs.size > MAX_JOB_HISTORY) {
      const finishedJobs = Array.from(this.jobs.values())
        .filter((j) => j.state !== "running" && j.state !== "queued")
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));

      while (this.jobs.size > MAX_JOB_HISTORY && finishedJobs.length > 0) {
        const oldest = finishedJobs.shift()!;
        this.jobs.delete(oldest.id);
      }
    }
  }

  /**
   * Start a background job executing a validated CommandSpec.
   * If capacity is available, spawns process immediately.
   * If queueing is enabled and capacity is reached, enters "queued" state.
   */
  async startJob(params: JobStartParams): Promise<JobStartResult> {
    const command = params.command;

    // 1. Verify project exists and is enabled
    const project = this.projectRegistry.get(command.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${command.projectId}' not found in Runner project registry`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${project.name}' (${project.id}) is disabled`
      );
    }

    // 2. Rate limit check
    this.checkRateLimit();

    // 3. Queue capacity check if queuing is active
    const maxQueuedRunner = this.options?.maxQueuedPerRunner ?? MAX_QUEUED_JOBS_PER_RUNNER;
    const maxQueuedProject = this.options?.maxQueuedPerProject ?? MAX_QUEUED_JOBS_PER_PROJECT;
    const currentQueued = Array.from(this.jobs.values()).filter((j) => j.state === "queued");
    const projectQueued = currentQueued.filter((j) => j.projectId === project.id);

    if (currentQueued.length >= maxQueuedRunner) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_QUEUE_FULL,
        `Runner job queue limit of ${maxQueuedRunner} has been reached`
      );
    }

    if (projectQueued.length >= maxQueuedProject) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_QUEUE_FULL,
        `Project job queue limit of ${maxQueuedProject} has been reached for project '${project.id}'`
      );
    }

    // 4. Validate command arguments if present
    if ("args" in command && Array.isArray(command.args)) {
      const validation = validateCommandArguments(command.args);
      if (!validation.valid) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE,
          validation.reason || "Command arguments exceed allowed limits"
        );
      }
    }

    // 5. Classify risk and evaluate execution policy
    const assessment = CommandClassifier.classify(command);
    const isSessionTrusted = this.projectRegistry.isSessionTrusted(command.projectId);
    const decision = CommandPolicy.evaluateUnified({
      projectId: command.projectId,
      spec: command,
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode,
      executionMode: project.executionMode,
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (decision.decision === "deny" && !this.safetyLayerDisabled) {
      if (
        decision.requiredAccessMode === "read-write" &&
        project.accessMode !== "read-write"
      ) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS,
          decision.reason || "Project execution requires write access"
        );
      }

      if (project.executionMode === "disabled") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_EXECUTION_DISABLED,
          decision.reason || "Command execution is disabled for this project"
        );
      }

      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_BLOCKED,
        decision.reason || "Command execution blocked by policy"
      );
    }

    // 6. Preflight checks: resolve working directory and validate scripts BEFORE consuming approval
    const workspace = this.workspaceResolver?.resolve(command.projectId, (command as any).sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    let workingDir = effectiveRoot;
    const specifiedCwd = "cwd" in command ? command.cwd : undefined;
    if (specifiedCwd && specifiedCwd.trim() !== "" && specifiedCwd !== ".") {
      try {
        const resolved = resolveProjectPath(effectiveRoot, specifiedCwd, {
          mustExist: true,
          allowSensitive: false,
          unrestricted: this.safetyLayerDisabled,
        });

        const stat = fs.statSync(resolved.canonicalPath);
        if (!stat.isDirectory()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
            `Working directory '${specifiedCwd}' is not a directory`
          );
        }
        workingDir = resolved.canonicalPath;
      } catch (err) {
        if (err instanceof LocalBridgeError) {
          if (err.code === LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY) {
            throw err;
          }
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
            `Invalid working directory '${specifiedCwd}': ${err.message}`
          );
        }
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
          `Failed to inspect working directory '${specifiedCwd}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    let targetTool: string = "node";
    let commandArgs: string[] = [];

    switch (command.kind) {
      case "tool-version": {
        targetTool = command.tool;
        commandArgs = ["--version"];
        break;
      }

      case "node-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(effectiveRoot, command.path, {
            mustExist: true,
            allowSensitive: false,
            unrestricted: this.safetyLayerDisabled,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Node script '${command.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${command.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || lstat.isSymbolicLink()) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Node script '${command.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect node script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetTool = "node";
        commandArgs = [scriptCanonicalPath, ...(command.args ?? [])];
        break;
      }

      case "python-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(effectiveRoot, command.path, {
            mustExist: true,
            allowSensitive: false,
            unrestricted: this.safetyLayerDisabled,
          });
          scriptCanonicalPath = resolved.canonicalPath;
        } catch (err) {
          if (err instanceof SecurityPathError) {
            if (err.code === LocalBridgeErrorCode.FILE_NOT_FOUND) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
                `Python script '${command.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${command.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || lstat.isSymbolicLink()) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Python script '${command.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect python script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetTool = "python";
        commandArgs = [scriptCanonicalPath, ...(command.args ?? [])];
        break;
      }

      case "package-script": {
        const packageJsonPath = path.join(workingDir, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `package.json not found in working directory '${workingDir}'`
          );
        }

        let packageJsonContent: unknown;
        try {
          packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        } catch {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to parse package.json in '${workingDir}'`
          );
        }

        const scripts = (packageJsonContent as { scripts?: Record<string, unknown> })?.scripts;
        if (!scripts || typeof scripts[command.script] !== "string") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Script '${command.script}' is not defined in package.json scripts`
          );
        }

        const scriptValue = typeof scripts[command.script] === "string" ? (scripts[command.script] as string).trim() : "";
        let useDirectNode = false;

        const managerAvailable = await this.executableRegistry.hasExecutable(command.manager);
        if (!managerAvailable && scriptValue.startsWith("node ")) {
          const parts = scriptValue.slice(5).trim().split(/\s+/);
          const entryFile = parts[0];
          if (entryFile) {
            const resolvedPath = resolveProjectPath(effectiveRoot, entryFile, {
              mustExist: true,
              allowSensitive: false,
              unrestricted: this.safetyLayerDisabled,
            });
            targetTool = "node";
            commandArgs = [resolvedPath.canonicalPath, ...parts.slice(1), ...(command.args ?? [])];
            useDirectNode = true;
          }
        }

        if (!useDirectNode) {
          targetTool = command.manager;
          commandArgs = [
            "run",
            command.script,
            ...(command.args && command.args.length > 0 ? ["--", ...command.args] : []),
          ];
        }
        break;
      }

      default: {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_UNSUPPORTED,
          `Unsupported command kind`
        );
      }
    }

    // 7. Handle Approval if required (preflight checks above passed)
    if (decision.decision === "ask") {
      const { approvalId, ...jobPayload } = params;
      const pHash = canonicalPayloadHash(jobPayload);

      if (!this.approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "job.start" requires human approval.`
        );
      }

      let summaryText: string = command.kind;
      if (command.kind === "node-script" || command.kind === "python-script") {
        summaryText = `run ${command.kind} "${command.path}"`;
      } else if (command.kind === "package-script") {
        summaryText = `run package script "${command.script}" via ${command.manager}`;
      } else if (command.kind === "tool-version") {
        summaryText = `check ${command.tool} version`;
      }

      this.approvalManager.handleOperationApproval({
        projectId: project.id,
        operation: "job.start",
        risk: assessment.risk === "DANGEROUS" ? "DANGEROUS" : "CAUTION",
        summary: `Start background job: ${summaryText} in project "${project.id}"`,
        payloadHash: pHash,
        approvalId,
        timeoutMs: 300000,
        decisionSource: decision.decisionSource,
        isProtectedFile: false,
        commandCategory: decision.category,
        isPackageInstall: decision.category === "package-install",
        callerPurpose: (params as any).callerPurpose,
      });
    }

    // 8. Timeout bound
    const timeoutMs = Math.min(
      Math.max(params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS, MIN_JOB_TIMEOUT_MS),
      MAX_JOB_TIMEOUT_MS
    );

    const safeEnv = buildSafeProcessEnv(this.runnerStateDir);
    const maxRunningRunner = this.options?.maxRunningPerRunner ?? MAX_RUNNING_JOBS_PER_RUNNER;
    const maxRunningProject = this.options?.maxRunningPerProject ?? MAX_RUNNING_JOBS_PER_PROJECT;
    const runningJobs = Array.from(this.jobs.values()).filter((j) => j.state === "running");
    const projectRunningJobs = runningJobs.filter((j) => j.projectId === project.id);

    const canRunImmediately =
      runningJobs.length < maxRunningRunner && projectRunningJobs.length < maxRunningProject;

    const jobId = `job_${crypto.randomUUID()}`;
    const createdAt = Date.now();
    const logs = new JobLogBuffer(MAX_JOB_LOG_BYTES);

    if (!canRunImmediately) {
      if (!this.options?.enableQueue) {
        if (runningJobs.length >= maxRunningRunner) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED,
            `Runner running job limit of ${maxRunningRunner} has been reached`
          );
        }
        throw new LocalBridgeError(
          LocalBridgeErrorCode.JOB_CAPACITY_EXCEEDED,
          `Project running job limit of ${maxRunningProject} has been reached for project '${project.id}'`
        );
      }

      // Enqueue job (FIFO)
      const queuedRecord: JobRecord = {
        id: jobId,
        projectId: project.id,
        commandKind: command.kind,
        risk: assessment.risk,
        state: "queued",
        createdAt,
        queuedAt: createdAt,
        startedAt: null,
        finishedAt: null,
        exitCode: null,
        signal: null,
        logs,
        canonicalProjectRoot: effectiveRoot,
        approvalId: params.approvalId,
        commandSpec: command,
        targetTool,
        commandArgs,
        workingDir,
        safeEnv,
        timeoutMs,
        workspaceMode: workspace?.workspaceMode ?? "direct",
        worktreeId: workspace?.worktreeId,
      };

      this.jobs.set(jobId, queuedRecord);
      this.queuedJobIds.push(jobId);
      this.persistJobs();

      this.logger?.info(
        { jobId, projectId: project.id, commandKind: command.kind },
        "Enqueued background job"
      );

      return {
        jobId,
        state: "queued",
        createdAt,
      };
    }

    // Execute immediately
    const jobRecord: JobRecord = {
      id: jobId,
      projectId: project.id,
      commandKind: command.kind,
      risk: assessment.risk,
      state: "running",
      createdAt,
      startedAt: createdAt,
      finishedAt: null,
      exitCode: null,
      signal: null,
      logs,
      canonicalProjectRoot: effectiveRoot,
      approvalId: params.approvalId,
      commandSpec: command,
      targetTool,
      commandArgs,
      workingDir,
      safeEnv,
      timeoutMs,
      workspaceMode: workspace?.workspaceMode ?? "direct",
      worktreeId: workspace?.worktreeId,
    };

    this.jobs.set(jobId, jobRecord);
    await this.executeJobProcess(jobRecord);
    this.persistJobs();

    this.logger?.info(
      { jobId, projectId: project.id, commandKind: command.kind, timeoutMs },
      "Started background job"
    );

    return {
      jobId,
      state: "running",
      createdAt,
    };
  }

  /**
   * Spawn child process for an active JobRecord.
   */
  private async executeJobProcess(jobRecord: JobRecord): Promise<void> {
    try {
      const resolvedTool = await this.executableRegistry.getExecutable(jobRecord.targetTool!);
      const finalArgs = [...(resolvedTool.prependArgs ?? []), ...(jobRecord.commandArgs ?? [])];

      const child = child_process.spawn(resolvedTool.executablePath, finalArgs, {
        cwd: jobRecord.workingDir,
        env: jobRecord.safeEnv,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
      jobRecord.process = child;

      child.stdout?.on("data", (chunk: Buffer) => {
        jobRecord.logs.append("stdout", chunk, jobRecord.canonicalProjectRoot, this.runnerStateDir);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        jobRecord.logs.append("stderr", chunk, jobRecord.canonicalProjectRoot, this.runnerStateDir);
      });

      jobRecord.timeoutTimer = setTimeout(async () => {
        await this.handleTimeout(jobRecord.id);
      }, jobRecord.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);

      child.on("close", (code, signal) => {
        this.finalizeJob(jobRecord.id, { exitCode: code, signal });
      });

      child.on("error", (err) => {
        this.logger?.error({ jobId: jobRecord.id, err }, "Job child process emitted error");
        jobRecord.errorCode = LocalBridgeErrorCode.JOB_SPAWN_FAILED;
        jobRecord.errorMessage = err.message;
        this.finalizeJob(jobRecord.id, { exitCode: 1, signal: null });
      });
    } catch (err) {
      this.logger?.error({ jobId: jobRecord.id, err }, "Failed to spawn job process");
      jobRecord.state = "failed";
      jobRecord.errorCode = LocalBridgeErrorCode.JOB_SPAWN_FAILED;
      jobRecord.errorMessage = err instanceof Error ? err.message : String(err);
      jobRecord.finishedAt = Date.now();
      jobRecord.process = undefined;
      this.persistJobs();
      this.pumpQueue();
    }
  }

  /**
   * FIFO Queue dispatcher. Dequeues next eligible job and starts execution.
   */
  private pumpQueue(): void {
    if (!this.options?.enableQueue || this.queuedJobIds.length === 0) return;

    const maxRunningRunner = this.options?.maxRunningPerRunner ?? MAX_RUNNING_JOBS_PER_RUNNER;
    const maxRunningProject = this.options?.maxRunningPerProject ?? MAX_RUNNING_JOBS_PER_PROJECT;

    const runningJobs = Array.from(this.jobs.values()).filter((j) => j.state === "running");
    if (runningJobs.length >= maxRunningRunner) return;

    for (let i = 0; i < this.queuedJobIds.length; i++) {
      const candidateId = this.queuedJobIds[i]!;
      const candidate = this.jobs.get(candidateId);
      if (!candidate || candidate.state !== "queued") {
        this.queuedJobIds.splice(i, 1);
        i--;
        continue;
      }

      const projectRunning = Array.from(this.jobs.values()).filter(
        (j) => j.state === "running" && j.projectId === candidate.projectId
      );

      if (projectRunning.length < maxRunningProject) {
        this.queuedJobIds.splice(i, 1);
        candidate.state = "running";
        candidate.startedAt = Date.now();
        void this.executeJobProcess(candidate);
        this.persistJobs();

        const updatedRunning = Array.from(this.jobs.values()).filter((j) => j.state === "running");
        if (updatedRunning.length >= maxRunningRunner) {
          break;
        }
        i--;
      }
    }
  }

  /**
   * Handle job execution timeout.
   */
  private async handleTimeout(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "running") return;

    this.logger?.warn({ jobId }, "Job execution timed out; terminating process tree");
    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    if (job.process?.pid) {
      try {
        await killProcessTree(job.process.pid);
      } catch {
        // ignore kill error
      }
    }

    job.logs.append("stderr", "\n[LocalBridge] Job execution timed out; terminated process tree.\n");
    job.state = "timed_out";
    job.finishedAt = Date.now();
    job.errorCode = "JOB_TIMED_OUT";
    job.errorMessage = "Job execution timed out";
    job.process = undefined;

    this.persistJobs();
    this.pumpQueue();
    this.pruneOldJobs();
  }

  /**
   * Finalize job execution idempotently upon process close or error.
   */
  private finalizeJob(
    jobId: string,
    result: { exitCode: number | null; signal: string | null }
  ): void {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== "running") return;

    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    job.finishedAt = Date.now();
    job.exitCode = result.exitCode;
    job.signal = result.signal;
    if (job.cancelRequestedAt) {
      job.state = "cancelled";
    } else {
      job.state = result.exitCode === 0 ? "succeeded" : "failed";
    }
    job.process = undefined;

    this.logger?.info(
      {
        jobId,
        state: job.state,
        exitCode: job.exitCode,
        durationMs: job.finishedAt - (job.startedAt ?? job.createdAt),
      },
      "Background job completed"
    );

    this.persistJobs();
    this.pumpQueue();
    this.pruneOldJobs();
  }

  /**
   * Cancel a running or queued job by terminating its entire process tree.
   * If already terminal, returns alreadyTerminal: true.
   */
  async cancelJob(jobId: string, projectId?: string): Promise<JobCancelResult> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${jobId}' not found`
      );
    }

    if (projectId && job.projectId !== projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.POLICY_DENIED,
        `Job '${jobId}' belongs to project '${job.projectId}', not '${projectId}'`
      );
    }

    if (job.state === "queued") {
      const qIdx = this.queuedJobIds.indexOf(jobId);
      if (qIdx !== -1) {
        this.queuedJobIds.splice(qIdx, 1);
      }
      job.state = "cancelled";
      job.finishedAt = Date.now();
      this.persistJobs();
      this.pumpQueue();
      return {
        jobId: job.id,
        state: "cancelled",
        alreadyTerminal: false,
      };
    }

    if (
      job.state === "succeeded" ||
      job.state === "failed" ||
      job.state === "cancelled" ||
      job.state === "timed_out" ||
      job.state === "timed-out" ||
      job.state === "interrupted"
    ) {
      return {
        jobId: job.id,
        state: job.state,
        alreadyTerminal: true,
      };
    }

    if (job.timeoutTimer) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = undefined;
    }

    job.cancelRequestedAt = Date.now();
    job.state = "cancelled";
    job.finishedAt = Date.now();
    const pid = job.process?.pid;

    if (job.process && pid) {
      try {
        job.process.kill("SIGTERM");
      } catch {
        // ignore
      }

      // Grace period before hard process tree kill
      await new Promise((r) => setTimeout(r, 300));

      try {
        await killProcessTree(pid);
      } catch {
        // ignore kill error
      }
    }

    job.state = "cancelled";
    job.finishedAt = Date.now();
    job.process = undefined;

    this.logger?.info({ jobId }, "Cancelled background job and terminated process tree");
    this.persistJobs();
    this.pumpQueue();
    this.pruneOldJobs();

    return {
      jobId: job.id,
      state: "cancelled",
      alreadyTerminal: false,
    };
  }

  /**
   * Query status of a job.
   */
  getJobStatus(jobId: string): JobStatusResult {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${jobId}' not found`
      );
    }

    const durationMs =
      (job.finishedAt ?? Date.now()) - (job.startedAt ?? job.createdAt);

    return {
      jobId: job.id,
      projectId: job.projectId,
      state: job.state,
      risk: job.risk,
      createdAt: job.createdAt,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      signal: job.signal,
      durationMs: Math.max(durationMs, 0),
      outputTruncated: job.logs.isTruncated,
      lastOutput: job.logs.getLastOutput(1000) || undefined,
      errorCode: job.errorCode,
      error: job.errorMessage,
    };
  }

  /**
   * Query paginated sanitized logs of a job.
   */
  getJobLogs(params: JobLogsParams): JobLogsResult {
    const job = this.jobs.get(params.jobId);
    if (!job) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.JOB_NOT_FOUND,
        `Job with ID '${params.jobId}' not found`
      );
    }

    const logData = job.logs.getLogs({
      cursor: params.cursor,
      limit: params.limit,
    });

    return {
      jobId: job.id,
      chunks: logData.chunks,
      nextCursor: logData.nextCursor,
      truncated: logData.truncated,
      droppedBytes: logData.droppedBytes,
    };
  }

  /**
   * List jobs currently stored in Runner memory.
   */
  listJobs(params?: JobListParams): JobListResult {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
    let matched = Array.from(this.jobs.values());

    if (params?.projectId) {
      matched = matched.filter((j) => j.projectId === params.projectId);
    }
    if (params?.state) {
      const targetState = params.state === "timed-out" ? "timed_out" : params.state;
      matched = matched.filter((j) => {
        const s = j.state === "timed-out" ? "timed_out" : j.state;
        return s === targetState;
      });
    }

    // Sort by createdAt descending
    matched.sort((a, b) => b.createdAt - a.createdAt);

    const summaries = matched.slice(0, limit).map((j) => ({
      jobId: j.id,
      projectId: j.projectId,
      state: j.state,
      commandKind: j.commandKind,
      risk: j.risk,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      exitCode: j.exitCode,
      outputTruncated: j.logs.isTruncated,
      error: j.errorMessage,
    }));

    return { jobs: summaries };
  }

  /**
   * High-level wrapper for package build script.
   */
  async startBuild(params: BuildStartParams): Promise<BuildStartResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    const workspace = this.workspaceResolver?.resolve(params.projectId, (params as any).sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    const scriptName = params.script || "build";
    const workingDir = params.cwd && params.cwd !== "."
      ? resolveProjectPath(effectiveRoot, params.cwd, { mustExist: true, allowSensitive: false }).canonicalPath
      : effectiveRoot;

    const pkgJsonPath = path.join(workingDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `package.json not found in working directory '${workingDir}'`
      );
    }

    let parsed: { scripts?: Record<string, unknown> };
    try {
      parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `Failed to parse package.json in '${workingDir}'`
      );
    }

    if (!parsed.scripts || typeof parsed.scripts[scriptName] !== "string") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.BUILD_SCRIPT_NOT_FOUND,
        `Build script '${scriptName}' not defined in package.json scripts`
      );
    }

    const command: CommandSpec = {
      kind: "package-script",
      projectId: params.projectId,
      manager: params.manager || "pnpm",
      script: scriptName,
      args: params.args ?? [],
      cwd: params.cwd ?? ".",
      timeoutMs: params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    };

    const startResult = await this.startJob({
      command,
      timeoutMs: params.timeoutMs,
      approvalId: params.approvalId,
    });

    return {
      jobId: startResult.jobId,
      state: startResult.state,
      createdAt: startResult.createdAt,
    };
  }

  /**
   * High-level wrapper for package test script.
   */
  async startTest(params: TestStartParams): Promise<TestStartResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    const workspace = this.workspaceResolver?.resolve(params.projectId, (params as any).sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    const scriptName = params.script || "test";
    const workingDir = params.cwd && params.cwd !== "."
      ? resolveProjectPath(effectiveRoot, params.cwd, { mustExist: true, allowSensitive: false }).canonicalPath
      : effectiveRoot;

    const pkgJsonPath = path.join(workingDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `package.json not found in working directory '${workingDir}'`
      );
    }

    let parsed: { scripts?: Record<string, unknown> };
    try {
      parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `Failed to parse package.json in '${workingDir}'`
      );
    }

    if (!parsed.scripts || typeof parsed.scripts[scriptName] !== "string") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.TEST_SCRIPT_NOT_FOUND,
        `Test script '${scriptName}' not defined in package.json scripts`
      );
    }

    const command: CommandSpec = {
      kind: "package-script",
      projectId: params.projectId,
      manager: params.manager || "pnpm",
      script: scriptName,
      args: params.args ?? [],
      cwd: params.cwd ?? ".",
      timeoutMs: params.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS,
    };

    const startResult = await this.startJob({
      command,
      timeoutMs: params.timeoutMs,
      approvalId: params.approvalId,
    });

    return {
      jobId: startResult.jobId,
      state: startResult.state,
      createdAt: startResult.createdAt,
    };
  }

  /**
   * Stop manager and cancel all active jobs (used during Runner shutdown).
   */
  async stop(): Promise<void> {
    this.logger?.info("Stopping JobManager; cancelling all active jobs");
    const activeJobs = Array.from(this.jobs.values()).filter((j) => j.state === "running");
    for (const job of activeJobs) {
      try {
        await this.cancelJob(job.id);
      } catch {
        // ignore
      }
    }
    this.persistJobs();
  }
}
