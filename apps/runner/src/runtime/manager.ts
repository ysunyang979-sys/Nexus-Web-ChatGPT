import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandCategory,
  type RuntimeLaunchSpec,
  type RuntimeStartParams,
  type RuntimeStartResult,
  type RuntimeListParams,
  type RuntimeListResult,
  type RuntimeStatusParams,
  type RuntimeStatusResult,
  type RuntimeLogsParams,
  type RuntimeLogsResult,
  type RuntimeRestartParams,
  type RuntimeRestartResult,
  type RuntimeStopParams,
  type RuntimeStopResult,
  type RuntimeSummary,
} from "@localbridge/protocol";
import {
  CommandClassifier,
  CommandPolicy,
  validateCommandArguments,
  resolveProjectPath,
} from "@localbridge/security";
import { canonicalPayloadHash, type Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import type { WorkspaceResolver } from "../worktree/resolver.js";
import type { ExecutableRegistry } from "../process/executable-registry.js";
import { buildSafeProcessEnv } from "../process/environment.js";
import { killProcessTree } from "../process/kill-tree.js";
import type { ApprovalManager } from "../approvals/index.js";
import { RuntimeLogBuffer } from "./log-buffer.js";
import {
  MAX_RUNTIMES_GLOBAL,
  MAX_RUNTIMES_PER_PROJECT,
  MAX_RUNTIMES_PER_SESSION,
  MAX_RUNTIME_LOG_BYTES,
  DEFAULT_GRACE_PERIOD_MS,
  type PersistentRuntimeRecord,
  type RuntimeGenerationInfo,
} from "./types.js";

export interface PersistentRuntimeManagerOptions {
  runnerStateDir?: string;
  persistState?: boolean;
}

export class PersistentRuntimeManager {
  private readonly runtimes = new Map<string, PersistentRuntimeRecord>();
  private workspaceResolver?: WorkspaceResolver;
  private readonly persistencePath?: string;
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
    private readonly approvalManager?: ApprovalManager,
    private readonly logger?: Logger,
    private readonly options?: PersistentRuntimeManagerOptions
  ) {
    if (this.options?.runnerStateDir) {
      this.persistencePath = path.join(this.options.runnerStateDir, "runtimes.json");
      this.recoverPersistedRuntimes();
    }

    this.registerProjectListeners();
  }

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  private registerProjectListeners(): void {
    this.projectRegistry.on("project:disabled", (projectId: string) => {
      this.stopProjectRuntimes(projectId, "Project disabled");
    });

    this.projectRegistry.on("project:removed", (projectId: string) => {
      this.stopProjectRuntimes(projectId, "Project removed");
    });

    this.projectRegistry.on(
      "project:execution_mode_changed",
      (projectId: string, mode: string) => {
        if (mode === "disabled") {
          this.stopProjectRuntimes(projectId, "Project execution disabled");
        }
      }
    );
  }

  private stopProjectRuntimes(projectId: string, reason: string): void {
    this.logger?.info({ projectId, reason }, "Stopping persistent runtimes for project");
    for (const runtime of this.runtimes.values()) {
      if (
        runtime.projectId === projectId &&
        (runtime.state === "starting" || runtime.state === "running" || runtime.state === "stopping")
      ) {
        this.stop({ runtimeId: runtime.id, gracePeriodMs: 1000, reason: "project_disabled" }).catch((err) => {
          this.logger?.warn({ err, runtimeId: runtime.id }, "Failed to stop runtime on project change");
        });
      }
    }
  }

  private recoverPersistedRuntimes(): void {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    try {
      const content = fs.readFileSync(this.persistencePath, "utf-8");
      const list = JSON.parse(content) as Array<Record<string, any>>;
      for (const item of list) {
        let state = item.state;
        let lastErrorCode = item.lastErrorCode ?? null;
        let lastError = item.lastError ?? null;

        if (state === "starting" || state === "running" || state === "stopping") {
          state = "interrupted";
          lastErrorCode = LocalBridgeErrorCode.RUNTIME_RUNNER_INTERRUPTED;
          lastError = "Runtime was interrupted due to runner restart or crash";
        }

        const generationLogs = new Map<number, RuntimeLogBuffer>();
        const genBuffer = new RuntimeLogBuffer(MAX_RUNTIME_LOG_BYTES);
        if (Array.isArray(item.recentLogs)) {
          for (const chunk of item.recentLogs) {
            genBuffer.append(chunk.stream ?? "stdout", chunk.text ?? "", item.generation ?? 1);
          }
        }
        generationLogs.set(item.generation ?? 1, genBuffer);

        const rec: PersistentRuntimeRecord = {
          id: item.id,
          projectId: item.projectId,
          sessionId: item.sessionId,
          worktreeId: item.worktreeId,
          name: item.name,
          kind: item.kind,
          commandCategory: item.commandCategory,
          state,
          generation: item.generation ?? 1,
          launchSpec: item.launchSpec,
          workspaceMode: item.workspaceMode ?? "direct",
          effectiveCwd: item.effectiveCwd ?? "",
          pid: undefined,
          exitCode: item.exitCode ?? null,
          signal: item.signal ?? null,
          restartCount: item.restartCount ?? 0,
          lastErrorCode,
          lastError,
          createdAt: item.createdAt ?? Date.now(),
          startedAt: item.startedAt ?? null,
          stoppedAt: item.stoppedAt ?? null,
          updatedAt: item.updatedAt ?? Date.now(),
          createdBy: item.createdBy ?? "chat",
          generationLogs,
          generations: item.generations ?? [],
        };

        this.runtimes.set(rec.id, rec);
      }
      this.persistRuntimes();
    } catch (err) {
      this.logger?.warn({ err }, "Failed to recover persisted runtimes from disk");
    }
  }

  private persistRuntimes(): void {
    if (!this.persistencePath || !this.options?.persistState) return;
    try {
      const list = Array.from(this.runtimes.values()).map((r) => {
        const currentBuffer = r.generationLogs.get(r.generation);
        const logRes = currentBuffer ? currentBuffer.getLogs(0, 50) : { entries: [] };
        return {
          id: r.id,
          projectId: r.projectId,
          sessionId: r.sessionId,
          worktreeId: r.worktreeId,
          name: r.name,
          kind: r.kind,
          commandCategory: r.commandCategory,
          state: r.state,
          generation: r.generation,
          launchSpec: r.launchSpec,
          workspaceMode: r.workspaceMode,
          effectiveCwd: r.effectiveCwd,
          exitCode: r.exitCode,
          signal: r.signal,
          restartCount: r.restartCount,
          lastErrorCode: r.lastErrorCode,
          lastError: r.lastError,
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          stoppedAt: r.stoppedAt,
          updatedAt: r.updatedAt,
          createdBy: r.createdBy,
          generations: r.generations,
          recentLogs: logRes.entries,
        };
      });

      const tmpPath = `${this.persistencePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.persistencePath);
    } catch (err) {
      this.logger?.warn({ err }, "Failed to persist runtimes state to disk");
    }
  }

  private isMatchingLaunchSpec(a: RuntimeLaunchSpec, b: RuntimeLaunchSpec): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "package-script" && b.kind === "package-script") {
      const aArgs = JSON.stringify(a.args ?? []);
      const bArgs = JSON.stringify(b.args ?? []);
      return (
        a.manager === b.manager &&
        a.script === b.script &&
        aArgs === bArgs &&
        (a.relativeCwd ?? "") === (b.relativeCwd ?? "")
      );
    }
    if (a.kind === "registered-command" && b.kind === "registered-command") {
      return (
        a.tool === b.tool &&
        JSON.stringify(a.args) === JSON.stringify(b.args) &&
        (a.relativeCwd ?? "") === (b.relativeCwd ?? "")
      );
    }
    if (a.kind === "shell-command" && b.kind === "shell-command") {
      return (
        a.command === b.command &&
        JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? []) &&
        (a.relativeCwd ?? "") === (b.relativeCwd ?? "") &&
        (a.shell ?? "") === (b.shell ?? "")
      );
    }
    return false;
  }


  private checkConcurrencyLimits(projectId: string, sessionId?: string): void {
    let globalActive = 0;
    let projectActive = 0;
    let sessionActive = 0;

    for (const r of this.runtimes.values()) {
      if (r.state === "starting" || r.state === "running" || r.state === "stopping") {
        globalActive++;
        if (r.projectId === projectId) {
          projectActive++;
        }
        if (sessionId && r.sessionId === sessionId) {
          sessionActive++;
        }
      }
    }

    if (globalActive >= MAX_RUNTIMES_GLOBAL) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_CONCURRENCY_LIMIT,
        `Global maximum active runtimes (${MAX_RUNTIMES_GLOBAL}) reached`
      );
    }

    if (projectActive >= MAX_RUNTIMES_PER_PROJECT) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_CONCURRENCY_LIMIT,
        `Project maximum active runtimes (${MAX_RUNTIMES_PER_PROJECT}) reached`
      );
    }

    if (sessionId && sessionActive >= MAX_RUNTIMES_PER_SESSION) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_CONCURRENCY_LIMIT,
        `Session maximum active runtimes (${MAX_RUNTIMES_PER_SESSION}) reached`
      );
    }
  }

  private checkForDuplicate(params: RuntimeStartParams): void {
    for (const r of this.runtimes.values()) {
      if (
        r.projectId === params.projectId &&
        (r.sessionId ?? undefined) === (params.sessionId ?? undefined) &&
        (r.state === "starting" || r.state === "running")
      ) {
        const nameMatches =
          params.name && r.name && params.name.trim() !== "" && r.name === params.name;
        const specMatches = this.isMatchingLaunchSpec(r.launchSpec, params.launch);

        if (nameMatches || specMatches) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.RUNTIME_ALREADY_RUNNING,
            `A runtime with matching configuration is already running (${r.id})`,
            { runtimeId: r.id }
          );
        }
      }
    }
  }

  async start(params: RuntimeStartParams): Promise<RuntimeStartResult> {
    this.logger?.debug({ params }, "Starting persistent runtime");

    // 1. Verify project exists and is enabled
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${params.projectId}' not found in Runner project registry`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${project.name}' (${project.id}) is disabled`
      );
    }

    // 2. Validate arguments
    if (params.launch.args && Array.isArray(params.launch.args)) {
      const validation = validateCommandArguments(params.launch.args);
      if (!validation.valid) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE,
          validation.reason || "Command arguments exceed allowed limits"
        );
      }
    }

    // 3. Check concurrency limits and duplicate
    this.checkConcurrencyLimits(params.projectId, params.sessionId);
    this.checkForDuplicate(params);

    // 4. Policy evaluation & approval
    let assessment: ReturnType<typeof CommandClassifier.classify>;
    let commandCategory: CommandCategory;

    const initialCwd = params.launch.relativeCwd || project.canonicalRoot;

    if (params.launch.kind === "package-script") {
      const spec = {
        projectId: params.projectId,
        cwd: initialCwd,
        kind: "package-script" as const,
        manager: params.launch.manager === "pnpm" ? ("pnpm" as const) : ("npm" as const),
        script: params.launch.script,
        args: params.launch.args ?? [],
        timeoutMs: 0,
      };
      assessment = CommandClassifier.classify(spec as any);
      commandCategory = CommandClassifier.classifyCategory(spec as any);
    } else if (params.launch.kind === "shell-command") {
      const spec = {
        projectId: params.projectId,
        cwd: initialCwd,
        kind: "shell-command" as const,
        command: params.launch.command,
        args: params.launch.args ?? [],
        shell: params.launch.shell,
        env: params.launch.env,
        timeoutMs: 0,
      };
      assessment = CommandClassifier.classify(spec as any);
      commandCategory = CommandClassifier.classifyCategory(spec as any);
    } else {
      const rawCheck = CommandClassifier.checkRawCommand(
        params.launch.tool,
        params.launch.args ?? []
      );
      if (rawCheck.isShell || !rawCheck.isAllowed) {
        assessment = {
          risk: "DANGEROUS",
          category: "custom-safe",
          reasons: [rawCheck.reason || `Tool '${params.launch.tool}' is prohibited`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
        commandCategory = "custom-safe";
      } else {
        assessment = {
          risk: "CAUTION",
          category: "dev-server",
          reasons: [`Registered tool "${params.launch.tool}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
        commandCategory = "dev-server";
      }
    }

    const isSessionTrusted = this.projectRegistry.isSessionTrusted(params.projectId);
    const decision = CommandPolicy.evaluateUnified({
      projectId: params.projectId,
      spec: (params.launch.kind === "package-script"
        ? {
            projectId: params.projectId,
            cwd: initialCwd,
            kind: "package-script",
            manager: params.launch.manager === "pnpm" ? "pnpm" : "npm",
            script: params.launch.script,
            args: params.launch.args ?? [],
            timeoutMs: 0,
          }
        : params.launch.kind === "shell-command"
        ? {
            projectId: params.projectId,
            cwd: initialCwd,
            kind: "shell-command",
            command: params.launch.command,
            args: params.launch.args ?? [],
            shell: params.launch.shell,
            env: params.launch.env,
            timeoutMs: 0,
          }
        : {
            projectId: params.projectId,
            cwd: initialCwd,
            kind: "node-script",
            path: params.launch.args[0] ?? "index.js",
            args: params.launch.args.slice(1),
            timeoutMs: 0,
          }) as any,
      category: commandCategory,
      assessment,
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
        decision.reason || "Runtime execution blocked by policy"
      );
    }

    if (decision.decision === "ask") {
      const approvalId = params.approvalId || params.launch.approvalId;
      const { approvalId: _, ...cleanLaunch } = params.launch;
      const payloadHash = canonicalPayloadHash({
        projectId: params.projectId,
        sessionId: params.sessionId,
        launch: cleanLaunch,
        name: params.name,
      });

      if (!this.approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "runtime.start" requires human approval.`
        );
      }

      const summaryText =
        params.launch.kind === "package-script"
          ? `run package script "${params.launch.script}" via ${params.launch.manager}`
          : params.launch.kind === "shell-command"
          ? `run shell command "${params.launch.command} ${(params.launch.args ?? []).join(" ")}"`
          : `run tool "${params.launch.tool}" with args ${params.launch.args.join(" ")}`;


      this.approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "command.run",
        risk: assessment.risk === "DANGEROUS" ? "DANGEROUS" : "CAUTION",
        summary: `Start runtime: ${params.name ? `"${params.name}" (${summaryText})` : summaryText} in project "${params.projectId}"`,
        payloadHash,
        approvalId,
        timeoutMs: 300000,
        decisionSource: decision.decisionSource,
        isProtectedFile: false,
      });
    }

    // 5. Resolve workspace root and working directory
    const workspace = this.workspaceResolver?.resolve(params.projectId, params.sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    let workingDir = effectiveRoot;

    if (params.launch.relativeCwd && params.launch.relativeCwd.trim() !== "" && params.launch.relativeCwd !== ".") {
      try {
        const resolved = resolveProjectPath(effectiveRoot, params.launch.relativeCwd, {
          mustExist: true,
          allowSensitive: false,
          unrestricted: this.safetyLayerDisabled,
        });
        const stat = fs.statSync(resolved.canonicalPath);
        if (!stat.isDirectory()) {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
            `Working directory '${params.launch.relativeCwd}' is not a directory`
          );
        }
        workingDir = resolved.canonicalPath;
      } catch (err) {
        if (err instanceof LocalBridgeError) throw err;
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_INVALID_WORKING_DIRECTORY,
          `Invalid working directory '${params.launch.relativeCwd}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // 6. Prepare target executable, arguments, and environment
    const { executablePath, finalArgs, safeEnv } = await this.resolveLaunchCommand(
      params.launch,
      effectiveRoot,
      workingDir
    );

    // 7. Create runtime record
    const runtimeId = `rt_${crypto.randomUUID()}`;
    const now = Date.now();
    const logBuffer = new RuntimeLogBuffer(MAX_RUNTIME_LOG_BYTES);
    const generationLogs = new Map<number, RuntimeLogBuffer>();
    generationLogs.set(1, logBuffer);

    const record: PersistentRuntimeRecord = {
      id: runtimeId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      worktreeId: workspace?.worktreeId,
      name: params.name,
      kind: params.launch.kind,
      commandCategory,
      state: "starting",
      generation: 1,
      launchSpec: params.launch,
      workspaceMode: workspace?.workspaceMode ?? "direct",
      effectiveCwd: workingDir,
      pid: undefined,
      exitCode: null,
      signal: null,
      restartCount: 0,
      lastErrorCode: null,
      lastError: null,
      createdAt: now,
      startedAt: null,
      stoppedAt: null,
      updatedAt: now,
      createdBy: "chat",
      generationLogs,
      generations: [],
    };

    this.runtimes.set(runtimeId, record);

    // 8. Spawn process
    try {
      this.spawnGeneration(record, 1, executablePath, finalArgs, workingDir, safeEnv);

    } catch (err) {
      record.state = "failed";
      record.lastErrorCode = LocalBridgeErrorCode.RUNTIME_START_FAILED;
      record.lastError = err instanceof Error ? err.message : String(err);
      this.persistRuntimes();
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_START_FAILED,
        `Failed to spawn runtime process: ${record.lastError}`
      );
    }

    this.persistRuntimes();

    return {
      runtimeId,
      name: record.name,
      state: record.state,
      generation: record.generation,
      createdAt: record.createdAt,
      workspaceMode: record.workspaceMode,
      worktreeId: record.worktreeId,
    };
  }

  private spawnGeneration(
    record: PersistentRuntimeRecord,
    generation: number,
    executablePath: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv
  ): void {
    const child = child_process.spawn(executablePath, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    record.process = child;
    record.pid = child.pid;
    record.state = "running";
    record.startedAt = Date.now();
    record.updatedAt = Date.now();

    const genInfo: RuntimeGenerationInfo = {
      generation,
      pid: child.pid,
      state: "running",
      exitCode: null,
      signal: null,
      startedAt: record.startedAt,
      stoppedAt: null,
    };
    record.generations.push(genInfo);

    const logBuffer = record.generationLogs.get(generation) ?? new RuntimeLogBuffer(MAX_RUNTIME_LOG_BYTES);
    record.generationLogs.set(generation, logBuffer);

    const project = this.projectRegistry.get(record.projectId);
    const canonicalRoot = project?.canonicalRoot;

    child.stdout?.on("data", (chunk: Buffer) => {
      logBuffer.append("stdout", chunk, generation, canonicalRoot, this.options?.runnerStateDir);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      logBuffer.append("stderr", chunk, generation, canonicalRoot, this.options?.runnerStateDir);
    });

    child.on("error", (err) => {
      this.logger?.warn({ runtimeId: record.id, generation, err }, "Runtime process encountered error");
      genInfo.state = "failed";
      genInfo.stoppedAt = Date.now();

      // STALE GENERATION GUARD:
      // If this child does not match the active generation or active process,
      // it is a callback from an earlier generation that must never mutate live runtime state.
      if (record.generation !== generation || record.process !== child) {
        this.logger?.info(
          { runtimeId: record.id, callbackGeneration: generation, currentGeneration: record.generation },
          "Stale generation process error ignored for live runtime state"
        );
        this.persistRuntimes();
        return;
      }

      if (record.state === "running" || record.state === "starting") {
        record.state = "failed";
        record.lastErrorCode = LocalBridgeErrorCode.RUNTIME_PROCESS_EXITED;
        record.lastError = err.message;
        record.stoppedAt = Date.now();
        record.updatedAt = Date.now();
        this.persistRuntimes();
      }
    });

    child.on("close", (exitCode, signal) => {
      this.logger?.debug(
        { runtimeId: record.id, generation, exitCode, signal },
        "Runtime process closed"
      );

      genInfo.exitCode = exitCode;
      genInfo.signal = signal;
      genInfo.stoppedAt = Date.now();

      if (genInfo.intentionalTermination) {
        genInfo.state = "stopped";
      } else if (exitCode === 0) {
        genInfo.state = "stopped";
      } else {
        genInfo.state = "failed";
      }

      // STALE GENERATION GUARD:
      // If this child does not match the active generation or active process,
      // this is a stale process callback from an earlier generation.
      // It MUST NEVER mutate the live runtime state or clear active process/pid!
      if (record.generation !== generation || record.process !== child) {
        this.logger?.info(
          {
            runtimeId: record.id,
            callbackGeneration: generation,
            currentGeneration: record.generation,
            exitCode,
            signal,
          },
          "Stale generation process closed; preserved live runtime state"
        );
        this.persistRuntimes();
        return;
      }

      record.process = undefined;
      record.pid = undefined;
      record.exitCode = exitCode;
      record.signal = signal;
      record.stoppedAt = Date.now();
      record.updatedAt = Date.now();

      if (
        genInfo.intentionalTermination ||
        record.state === "stopping" ||
        record.state === "stopped" ||
        exitCode === 0
      ) {
        record.state = "stopped";
        record.lastErrorCode = null;
        record.lastError = null;
      } else {
        record.state = "failed";
        record.lastErrorCode = LocalBridgeErrorCode.RUNTIME_PROCESS_EXITED;
        record.lastError = `Process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`;
      }

      this.persistRuntimes();
    });
  }

  async stop(
    params: RuntimeStopParams & {
      reason?: "restart" | "user_stop" | "project_disabled" | "emergency_stop";
    }
  ): Promise<RuntimeStopResult> {
    const record = this.runtimes.get(params.runtimeId);
    if (!record) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime with ID '${params.runtimeId}' not found`
      );
    }

    const reason = params.reason ?? "user_stop";

    // If already stopped and no dangling process handle exists
    if (record.state === "stopped" && !record.process && !record.pid) {
      return {
        runtimeId: record.id,
        state: "stopped",
        stopped: true,
        stoppedAt: record.stoppedAt ?? Date.now(),
      };
    }

    // Explicit stop contract: any state (starting, running, stopping, failed, interrupted)
    // transitions to 'stopped' with pid = null.
    // If it was failed or interrupted and has no live process running:
    if (
      (record.state === "failed" || record.state === "interrupted") &&
      !record.process &&
      !record.pid
    ) {
      record.state = "stopped";
      record.stoppedAt = record.stoppedAt ?? Date.now();
      record.updatedAt = Date.now();
      const curGen = record.generations.find((g) => g.generation === record.generation);
      if (curGen) {
        curGen.state = "stopped";
        curGen.stoppedAt = curGen.stoppedAt ?? record.stoppedAt;
        curGen.intentionalTermination = reason;
      }
      this.persistRuntimes();
      return {
        runtimeId: record.id,
        state: "stopped",
        stopped: true,
        stoppedAt: record.stoppedAt,
      };
    }

    if (record.state === "stopping" && record.stoppingPromise) {
      await record.stoppingPromise;
      return {
        runtimeId: record.id,
        state: record.state,
        stopped: true,
        stoppedAt: record.stoppedAt ?? Date.now(),
      };
    }

    record.state = "stopping";
    record.updatedAt = Date.now();
    const gracePeriodMs = params.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    const currentGen = record.generations.find((g) => g.generation === record.generation);
    if (currentGen) {
      currentGen.intentionalTermination = reason;
    }

    record.stoppingPromise = (async () => {
      const child = record.process;
      if (!child || !child.pid) {
        record.state = "stopped";
        record.stoppedAt = Date.now();
        record.updatedAt = Date.now();
        record.process = undefined;
        record.pid = undefined;
        if (currentGen) {
          currentGen.state = "stopped";
          currentGen.stoppedAt = record.stoppedAt;
        }
        this.persistRuntimes();
        return;
      }

      const pid = child.pid;
      this.logger?.debug({ runtimeId: record.id, pid, gracePeriodMs, reason }, "Stopping runtime process");

      if (process.platform === "win32") {
        // On Windows, child_process.kill("SIGTERM") only terminates the root wrapper (e.g. npm.cmd),
        // leaving spawned Node/child processes orphaned with active locks on working directories.
        // killProcessTree uses taskkill /PID <pid> /T /F to cleanly terminate the entire tree.
        try {
          await killProcessTree(pid);
        } catch (err) {
          this.logger?.warn({ err, pid }, "Failed to kill process tree on Windows");
        }
      } else {
        // 1. Try graceful SIGTERM on POSIX
        try {
          child.kill("SIGTERM");
        } catch {
          // Child might already be dead
        }

        // 2. Wait up to gracePeriodMs
        const exitedGracefully = await new Promise<boolean>((resolve) => {
          let timer: NodeJS.Timeout | null = null;
          const onClose = () => {
            if (timer) clearTimeout(timer);
            resolve(true);
          };
          child.once("close", onClose);
          timer = setTimeout(() => {
            child.removeListener("close", onClose);
            resolve(false);
          }, gracePeriodMs);
        });

        // 3. Fall back to hard tree kill if still alive
        if (!exitedGracefully) {
          this.logger?.warn(
            { runtimeId: record.id, pid },
            "Runtime process did not exit gracefully, killing process tree"
          );
          try {
            await killProcessTree(pid);
          } catch (err) {
            this.logger?.warn({ err, pid }, "Failed to kill process tree");
          }
        }
      }

      // Settle wait: bounded wait (up to 2000ms) for child exit/close to settle
      await new Promise<void>((resolve) => {
        if (child.killed || child.exitCode !== null) {
          resolve();
          return;
        }
        let timer: NodeJS.Timeout | null = null;
        const onDone = () => {
          if (timer) clearTimeout(timer);
          child.removeListener("close", onDone);
          child.removeListener("exit", onDone);
          resolve();
        };
        child.once("close", onDone);
        child.once("exit", onDone);
        timer = setTimeout(() => {
          child.removeListener("close", onDone);
          child.removeListener("exit", onDone);
          resolve();
        }, Math.min(gracePeriodMs, 2000));
      });

      record.state = "stopped";
      record.stoppedAt = Date.now();
      record.updatedAt = Date.now();
      record.process = undefined;
      record.pid = undefined;
      if (currentGen) {
        currentGen.state = "stopped";
        currentGen.stoppedAt = record.stoppedAt;
      }
      this.persistRuntimes();
    })();

    await record.stoppingPromise;
    record.stoppingPromise = undefined;

    return {
      runtimeId: record.id,
      state: record.state,
      stopped: true,
      stoppedAt: record.stoppedAt ?? Date.now(),
    };
  }

  async restart(params: RuntimeRestartParams): Promise<RuntimeRestartResult> {
    const record = this.runtimes.get(params.runtimeId);
    if (!record) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime with ID '${params.runtimeId}' not found`
      );
    }

    // Stop if currently active or stopping
    if (
      record.state === "starting" ||
      record.state === "running" ||
      record.state === "stopping"
    ) {
      await this.stop({ runtimeId: record.id, gracePeriodMs: 1500, reason: "restart" });
    }

    // Re-verify project exists and is enabled
    const project = this.projectRegistry.get(record.projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project with ID '${record.projectId}' not found in Runner project registry`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project '${project.name}' (${project.id}) is disabled`
      );
    }

    // Policy & approval check for restart
    let assessment: ReturnType<typeof CommandClassifier.classify>;
    let commandCategory: CommandCategory;

    if (record.launchSpec.kind === "package-script") {
      const spec = {
        projectId: record.projectId,
        cwd: record.effectiveCwd,
        kind: "package-script" as const,
        manager: record.launchSpec.manager === "pnpm" ? ("pnpm" as const) : ("npm" as const),
        script: record.launchSpec.script,
        args: record.launchSpec.args ?? [],
        timeoutMs: 0,
      };
      assessment = CommandClassifier.classify(spec as any);
      commandCategory = CommandClassifier.classifyCategory(spec as any);
    } else if (record.launchSpec.kind === "shell-command") {
      const spec = {
        projectId: record.projectId,
        cwd: record.effectiveCwd,
        kind: "shell-command" as const,
        command: record.launchSpec.command,
        args: record.launchSpec.args ?? [],
        shell: record.launchSpec.shell,
        env: record.launchSpec.env,
        timeoutMs: 0,
      };
      assessment = CommandClassifier.classify(spec as any);
      commandCategory = CommandClassifier.classifyCategory(spec as any);
    } else {
      const rawCheck = CommandClassifier.checkRawCommand(
        record.launchSpec.tool,
        record.launchSpec.args ?? []
      );
      if (rawCheck.isShell || !rawCheck.isAllowed) {
        assessment = {
          risk: "DANGEROUS",
          category: "custom-safe",
          reasons: [rawCheck.reason || `Tool '${record.launchSpec.tool}' is prohibited`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
        commandCategory = "custom-safe";
      } else {
        assessment = {
          risk: "CAUTION",
          category: "dev-server",
          reasons: [`Registered tool "${record.launchSpec.tool}" executes project code`],
          executesProjectCode: true,
          mayModifyFiles: true,
          mayAccessNetwork: true,
        };
        commandCategory = "dev-server";
      }
    }

    const isSessionTrusted = this.projectRegistry.isSessionTrusted(record.projectId);
    const decision = CommandPolicy.evaluateUnified({
      projectId: record.projectId,
      spec: (record.launchSpec.kind === "package-script"
        ? {
            projectId: record.projectId,
            cwd: record.effectiveCwd,
            kind: "package-script",
            manager: record.launchSpec.manager === "pnpm" ? "pnpm" : "npm",
            script: record.launchSpec.script,
            args: record.launchSpec.args ?? [],
            timeoutMs: 0,
          }
        : record.launchSpec.kind === "shell-command"
        ? {
            projectId: record.projectId,
            cwd: record.effectiveCwd,
            kind: "shell-command",
            command: record.launchSpec.command,
            args: record.launchSpec.args ?? [],
            shell: record.launchSpec.shell,
            env: record.launchSpec.env,
            timeoutMs: 0,
          }
        : {
            projectId: record.projectId,
            cwd: record.effectiveCwd,
            kind: "node-script",
            path: record.launchSpec.args[0] ?? "index.js",
            args: record.launchSpec.args.slice(1),
            timeoutMs: 0,
          }) as any,
      category: commandCategory,
      assessment,
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode,
      executionMode: project.executionMode,
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (decision.decision === "deny") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.COMMAND_BLOCKED,
        decision.reason || "Runtime execution blocked by policy on restart"
      );
    }

    if (decision.decision === "ask") {
      const approvalId = params.approvalId || record.launchSpec.approvalId;
      const { approvalId: _, ...cleanLaunch } = record.launchSpec;
      const payloadHash = canonicalPayloadHash({
        projectId: record.projectId,
        sessionId: record.sessionId,
        launch: cleanLaunch,
        name: record.name,
      });

      if (!this.approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "runtime.restart" requires human approval.`
        );
      }

      this.approvalManager.handleOperationApproval({
        projectId: record.projectId,
        operation: "command.run",
        risk: assessment.risk === "DANGEROUS" ? "DANGEROUS" : "CAUTION",
        summary: `Restart runtime: ${record.name ? `"${record.name}"` : record.id} in project "${record.projectId}"`,
        payloadHash,
        approvalId,
        timeoutMs: 300000,
        decisionSource: decision.decisionSource,
        isProtectedFile: false,
      });
    }

    // Resolve workspace & working directory
    const workspace = this.workspaceResolver?.resolve(record.projectId, record.sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    let workingDir = effectiveRoot;

    if (record.launchSpec.relativeCwd && record.launchSpec.relativeCwd.trim() !== "" && record.launchSpec.relativeCwd !== ".") {
      const resolved = resolveProjectPath(effectiveRoot, record.launchSpec.relativeCwd, {
        mustExist: true,
        allowSensitive: false,
      });
      workingDir = resolved.canonicalPath;
    }

    const { executablePath, finalArgs, safeEnv } = await this.resolveLaunchCommand(
      record.launchSpec,
      effectiveRoot,
      workingDir
    );

    // Increment generation and restart count
    record.generation += 1;
    record.restartCount += 1;
    record.exitCode = null;
    record.signal = null;
    record.lastErrorCode = null;
    record.lastError = null;
    record.state = "starting";
    record.workspaceMode = workspace?.workspaceMode ?? "direct";
    record.worktreeId = workspace?.worktreeId;
    record.effectiveCwd = workingDir;

    const newLogBuffer = new RuntimeLogBuffer(MAX_RUNTIME_LOG_BYTES);
    record.generationLogs.set(record.generation, newLogBuffer);

    try {
      this.spawnGeneration(
        record,
        record.generation,
        executablePath,
        finalArgs,
        workingDir,
        safeEnv
      );

    } catch (err) {
      record.state = "failed";
      record.lastErrorCode = LocalBridgeErrorCode.RUNTIME_RESTART_FAILED;
      record.lastError = err instanceof Error ? err.message : String(err);
      this.persistRuntimes();
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_RESTART_FAILED,
        `Failed to restart runtime: ${record.lastError}`
      );
    }

    this.persistRuntimes();

    return {
      runtimeId: record.id,
      state: record.state,
      generation: record.generation,
      restartedAt: record.startedAt ?? Date.now(),
      pid: record.pid,
    };
  }

  private async resolveLaunchCommand(
    launch: RuntimeLaunchSpec,
    effectiveRoot: string,
    workingDir: string
  ): Promise<{ executablePath: string; finalArgs: string[]; safeEnv: NodeJS.ProcessEnv }> {
    let executablePath: string;
    let finalArgs: string[];

    if (launch.kind === "package-script") {
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
      if (!scripts || typeof scripts[launch.script] !== "string") {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
          `Script '${launch.script}' is not defined in package.json scripts`
        );
      }

      const targetTool = launch.manager;
      const commandArgs = [
        "run",
        launch.script,
        ...(launch.args && launch.args.length > 0 ? ["--", ...launch.args] : []),
      ];
      const resolvedTool = await this.executableRegistry.getExecutable(targetTool);
      executablePath = resolvedTool.executablePath;
      finalArgs = [...(resolvedTool.prependArgs ?? []), ...commandArgs];
    } else if (launch.kind === "shell-command") {
      const cmd = launch.command.trim();
      const rawArgs = launch.args ? [...launch.args] : [];
      let targetCmd = cmd;
      if (cmd.startsWith("./") || cmd.startsWith(".\\") || cmd.includes("/") || cmd.includes("\\")) {
        const resolved = resolveProjectPath(effectiveRoot, cmd, {
          mustExist: true,
          allowSensitive: false,
        });
        targetCmd = resolved.canonicalPath;
      }

      const requestedShell = launch.shell;
      if (requestedShell) {
        if (requestedShell === "powershell") {
          executablePath = this.executableRegistry.findBinaryOnPath("powershell") || "powershell.exe";
          finalArgs = [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `${targetCmd} ${rawArgs.map((a) => `"${a.replace(/"/g, '`"')}"`).join(" ")}`.trim(),
          ];
        } else if (requestedShell === "pwsh") {
          executablePath = this.executableRegistry.findBinaryOnPath("pwsh") || "pwsh.exe";
          finalArgs = [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `${targetCmd} ${rawArgs.map((a) => `"${a.replace(/"/g, '`"')}"`).join(" ")}`.trim(),
          ];
        } else if (requestedShell === "cmd") {
          executablePath = this.executableRegistry.findBinaryOnPath("cmd") || "cmd.exe";
          finalArgs = ["/d", "/c", targetCmd, ...rawArgs];
        } else if (requestedShell === "bash") {
          executablePath = this.executableRegistry.findBinaryOnPath("bash") || "bash";
          finalArgs = [
            "-c",
            `${targetCmd} ${rawArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`.trim(),
          ];
        } else {
          executablePath = this.executableRegistry.findBinaryOnPath("sh") || "sh";
          finalArgs = [
            "-c",
            `${targetCmd} ${rawArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`.trim(),
          ];
        }
      } else {
        if (path.isAbsolute(targetCmd)) {
          executablePath = targetCmd;
          finalArgs = [...rawArgs];
        } else {
          const resolvedTool = await this.executableRegistry.getExecutable(targetCmd);
          executablePath = resolvedTool.executablePath;
          finalArgs = [...(resolvedTool.prependArgs ?? []), ...rawArgs];
        }
        if (
          process.platform === "win32" &&
          (executablePath.toLowerCase().endsWith(".cmd") || executablePath.toLowerCase().endsWith(".bat"))
        ) {
          const cmdExe = this.executableRegistry.findBinaryOnPath("cmd") || "cmd.exe";
          finalArgs = ["/d", "/c", executablePath, ...rawArgs];
          executablePath = cmdExe;
        }
      }
    } else {
      const targetTool = launch.tool;
      const commandArgs = [...launch.args];
      const resolvedTool = await this.executableRegistry.getExecutable(targetTool);
      executablePath = resolvedTool.executablePath;
      finalArgs = [...(resolvedTool.prependArgs ?? []), ...commandArgs];
    }

    const runnerStateDir =
      this.options?.runnerStateDir ||
      (this.persistencePath ? path.dirname(this.persistencePath) : process.cwd());
    const safeEnv = buildSafeProcessEnv(runnerStateDir);

    if (launch.kind === "shell-command" && launch.env && typeof launch.env === "object") {
      const BLOCKED_ENV_KEYS = new Set([
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "COMSPEC",
        "WINDIR",
        "NODE_OPTIONS",
        "PYTHONPATH",
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
      ]);
      for (const [k, v] of Object.entries(launch.env)) {
        if (!BLOCKED_ENV_KEYS.has(k.toUpperCase()) && typeof v === "string") {
          safeEnv[k] = v;
        }
      }
    }

    return { executablePath, finalArgs, safeEnv };
  }

  list(params: RuntimeListParams): RuntimeListResult {

    let list = Array.from(this.runtimes.values());

    if (params.projectId) {
      list = list.filter((r) => r.projectId === params.projectId);
    }
    if (params.sessionId) {
      list = list.filter((r) => r.sessionId === params.sessionId);
    }
    if (params.worktreeId) {
      list = list.filter((r) => r.worktreeId === params.worktreeId);
    }
    if (params.state) {
      list = list.filter((r) => r.state === params.state);
    }

    list.sort((a, b) => b.createdAt - a.createdAt);

    const limit = params.limit ?? 50;
    let startIndex = 0;
    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(decoded);
        if (typeof parsed.lastIndex === "number") {
          startIndex = parsed.lastIndex + 1;
        }
      } catch {
        // Ignore invalid cursor
      }
    }

    const paged = list.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < list.length;
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(
        JSON.stringify({ lastIndex: startIndex + limit - 1 })
      ).toString("base64url");
    }

    const summaries: RuntimeSummary[] = paged.map((r) => this.toSummary(r));

    return {
      runtimes: summaries,
      total: list.length,
      nextCursor,
      hasMore,
    };
  }

  status(params: RuntimeStatusParams): RuntimeStatusResult {
    const record = this.runtimes.get(params.runtimeId);
    if (!record) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime with ID '${params.runtimeId}' not found`
      );
    }
    return this.toSummary(record);
  }

  logs(params: RuntimeLogsParams): RuntimeLogsResult {
    const record = this.runtimes.get(params.runtimeId);
    if (!record) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNTIME_NOT_FOUND,
        `Runtime with ID '${params.runtimeId}' not found`
      );
    }

    const generation = params.generation ?? record.generation;
    const logBuffer = record.generationLogs.get(generation);

    if (!logBuffer) {
      return {
        runtimeId: record.id,
        generation,
        entries: [],
        nextSequence: params.afterSequence ?? 0,
        hasMore: false,
        outputTruncated: false,
      };
    }

    const result = logBuffer.getLogs(params.afterSequence ?? 0, params.limit ?? 100);

    return {
      runtimeId: record.id,
      generation,
      entries: result.entries,
      nextSequence: result.nextSequence,
      hasMore: result.hasMore,
      outputTruncated: result.outputTruncated,
    };
  }

  private toSummary(r: PersistentRuntimeRecord): RuntimeSummary {
    const buffer = r.generationLogs.get(r.generation);
    const uptimeMs =
      r.startedAt && !r.stoppedAt ? Date.now() - r.startedAt : undefined;

    return {
      runtimeId: r.id,
      name: r.name,
      state: r.state,
      processState: r.state,
      listeningPorts: [],
      generation: r.generation,
      projectId: r.projectId,
      sessionId: r.sessionId,
      worktreeId: r.worktreeId,
      kind: r.kind,
      commandCategory: r.commandCategory,
      workspaceMode: r.workspaceMode,
      startedAt: r.startedAt,
      stoppedAt: r.stoppedAt,
      uptimeMs,
      pid: r.pid,
      exitCode: r.exitCode,
      signal: r.signal,
      restartCount: r.restartCount,
      lastErrorCode: r.lastErrorCode,
      lastError: r.lastError,
      outputTruncated: buffer?.isTruncated ?? false,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  hasActiveRuntimesForWorktree(worktreeId: string): boolean {
    for (const r of this.runtimes.values()) {
      if (
        r.worktreeId === worktreeId &&
        (r.state === "starting" || r.state === "running" || r.state === "stopping")
      ) {
        return true;
      }
    }
    return false;
  }

  hasActiveRuntimesForSession(sessionId: string): boolean {
    for (const r of this.runtimes.values()) {
      if (
        r.sessionId === sessionId &&
        (r.state === "starting" || r.state === "running" || r.state === "stopping")
      ) {
        return true;
      }
    }
    return false;
  }

  getActiveRuntimesForSession(sessionId: string): PersistentRuntimeRecord[] {
    const result: PersistentRuntimeRecord[] = [];
    for (const r of this.runtimes.values()) {
      if (
        r.sessionId === sessionId &&
        (r.state === "starting" || r.state === "running" || r.state === "stopping")
      ) {
        result.push(r);
      }
    }
    return result;
  }

  async shutdown(): Promise<void> {
    this.logger?.info("Shutting down PersistentRuntimeManager");
    const active = Array.from(this.runtimes.values()).filter(
      (r) => r.state === "starting" || r.state === "running" || r.state === "stopping"
    );

    await Promise.all(
      active.map((r) =>
        this.stop({ runtimeId: r.id, gracePeriodMs: 1000, reason: "emergency_stop" }).catch((err) => {
          this.logger?.warn({ err, runtimeId: r.id }, "Error stopping runtime during shutdown");
        })
      )
    );
  }
}
