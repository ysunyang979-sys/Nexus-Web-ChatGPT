import fs from "node:fs";
import path from "node:path";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type CommandClassifyParams,
  type CommandClassifyResult,
  type CommandRunParams,
  type CommandRunResult,
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
import type { ExecutableRegistry } from "./executable-registry.js";
import type { ProcessRunner } from "./runner.js";
import { buildSafeProcessEnv } from "./environment.js";
import type { ApprovalManager } from "../approvals/index.js";

export class CommandExecutionService {
  private workspaceResolver?: WorkspaceResolver;
  private safetyLayerDisabled: boolean = false;

  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly executableRegistry: ExecutableRegistry,
    private readonly processRunner: ProcessRunner,
    private readonly runnerStateDir: string,
    private readonly logger?: Logger,
    private readonly approvalManager?: ApprovalManager
  ) {}

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
    this.logger?.info({ disabled }, "Safety layer status updated in CommandExecutionService");
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  setWorkspaceResolver(resolver: WorkspaceResolver): void {
    this.workspaceResolver = resolver;
  }

  /**
   * Classify the risk profile of a command specification without executing it.
   */
  async classify(params: CommandClassifyParams): Promise<CommandClassifyResult> {
    this.logger?.debug({ params }, "Classifying command risk");
    const assessment = CommandClassifier.classify(params);
    const project = this.projectRegistry.get(params.projectId);
    const isSessionTrusted = this.projectRegistry.isSessionTrusted(params.projectId);
    const decision = project
      ? CommandPolicy.evaluateUnified({
          projectId: params.projectId,
          spec: params,
          projectEnabled: project.enabled,
          projectAccessMode: project.accessMode,
          executionMode: project.executionMode,
          trustPolicy: project.trustPolicy,
          isSessionTrusted,
        })
      : { decision: "deny", reason: `Project '${params.projectId}' not found` };

    return {
      risk: assessment.risk,
      reasons: assessment.reasons,
      executesProjectCode: assessment.executesProjectCode,
      mayModifyFiles: assessment.mayModifyFiles,
      mayAccessNetwork: assessment.mayAccessNetwork,
      allowed: decision.decision === "allow",
      ...(decision.reason ? { reason: decision.reason } : {}),
    };
  }

  /**
   * Execute a structured command subject to project execution authorization,
   * risk classification policy, sandboxing, and resource limits.
   */
  async run(params: CommandRunParams): Promise<CommandRunResult> {
    this.logger?.debug({ params }, "Evaluating and running command");

    // 1. Verify project exists
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

    // 2. Validate argument bounds if args are present
    if ("args" in params && Array.isArray(params.args)) {
      const validation = validateCommandArguments(params.args);
      if (!validation.valid) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_ARGUMENTS_TOO_LARGE,
          validation.reason || "Command arguments exceed allowed limits"
        );
      }
    }

    // 3. Classify risk and evaluate unified execution policy
    const assessment = CommandClassifier.classify(params);
    const isSessionTrusted = this.projectRegistry.isSessionTrusted(params.projectId);
    const decision = CommandPolicy.evaluateUnified({
      projectId: params.projectId,
      spec: params,
      projectEnabled: project.enabled,
      projectAccessMode: project.accessMode,
      executionMode: project.executionMode,
      trustPolicy: project.trustPolicy,
      isSessionTrusted,
    });

    if (decision.decision === "deny") {
      // If Command Safety Layer is disabled, cancel command restrictions (except emergency stop)
      if (!this.safetyLayerDisabled) {
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
    }

    if (decision.decision === "ask") {
      const { approvalId, ...commandPayload } = params;
      const pHash = canonicalPayloadHash(commandPayload);

      let summaryText: string = params.kind;
      if (params.kind === "node-script" || params.kind === "python-script") {
        summaryText = `run ${params.kind} "${params.path}"`;
      } else if (params.kind === "package-script") {
        summaryText = `run package script "${params.script}" via ${params.manager}`;
      } else if (params.kind === "tool-version") {
        summaryText = `check ${params.tool} version`;
      } else if (params.kind === "shell-command") {
        summaryText = `run shell command "${params.command} ${(params.args ?? []).join(" ")}"`;
      }

      if (!this.approvalManager) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.APPROVAL_REQUIRED,
          `Operation "command.run" requires human approval.`
        );
      }

      this.approvalManager.handleOperationApproval({
        projectId: params.projectId,
        operation: "command.run",
        risk: assessment.risk === "DANGEROUS" ? "DANGEROUS" : "CAUTION",
        summary: `Execute command: ${summaryText} in project "${params.projectId}"`,
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

    // 4. Resolve working directory
    const workspace = this.workspaceResolver?.resolve(params.projectId, (params as any).sessionId);
    const effectiveRoot = workspace?.workspaceRoot ?? project.canonicalRoot;
    let workingDir = effectiveRoot;
    const specifiedCwd = "cwd" in params ? params.cwd : undefined;
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

    // 5. Spec-specific validations and command preparation
    let targetExecutableTool: string;
    let commandArgs: string[] = [];

    switch (params.kind) {
      case "tool-version": {
        targetExecutableTool = params.tool;
        commandArgs = ["--version"];
        break;
      }

      case "node-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(effectiveRoot, params.path, {
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
                `Node script '${params.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${params.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || (!this.safetyLayerDisabled && lstat.isSymbolicLink())) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Node script '${params.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect node script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetExecutableTool = "node";
        commandArgs = [scriptCanonicalPath, ...(params.args ?? [])];
        break;
      }

      case "python-script": {
        let scriptCanonicalPath: string;
        try {
          const resolved = resolveProjectPath(effectiveRoot, params.path, {
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
                `Python script '${params.path}' does not exist`
              );
            }
            if (
              err.code === LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED ||
              err.code === LocalBridgeErrorCode.PATH_NOT_ALLOWED
            ) {
              throw new LocalBridgeError(
                LocalBridgeErrorCode.SENSITIVE_FILE_BLOCKED,
                `Script path '${params.path}' is located in a protected sensitive location`
              );
            }
          }
          throw err;
        }

        try {
          const stat = fs.statSync(scriptCanonicalPath);
          const lstat = fs.lstatSync(scriptCanonicalPath);
          if (!stat.isFile() || (!this.safetyLayerDisabled && lstat.isSymbolicLink())) {
            throw new LocalBridgeError(
              LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
              `Python script '${params.path}' is not a regular file or is a symbolic link`
            );
          }
        } catch (err) {
          if (err instanceof LocalBridgeError) throw err;
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Failed to inspect python script: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        targetExecutableTool = "python";
        commandArgs = [scriptCanonicalPath, ...(params.args ?? [])];
        break;
      }

      case "package-script": {
        // Inspect package.json in working directory
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
        if (!scripts || typeof scripts[params.script] !== "string") {
          throw new LocalBridgeError(
            LocalBridgeErrorCode.COMMAND_SCRIPT_NOT_FOUND,
            `Script '${params.script}' is not defined in package.json scripts`
          );
        }

        targetExecutableTool = params.manager;
        commandArgs = [
          "run",
          params.script,
          ...(params.args && params.args.length > 0 ? ["--", ...params.args] : []),
        ];
        break;
      }

      case "shell-command": {
        const cmd = params.command.trim();
        if (path.isAbsolute(cmd)) {
          targetExecutableTool = cmd;
        } else if (cmd.startsWith("./") || cmd.startsWith(".\\") || cmd.includes("/") || cmd.includes("\\")) {
          const resolved = resolveProjectPath(effectiveRoot, cmd, {
            mustExist: true,
            allowSensitive: false,
            unrestricted: this.safetyLayerDisabled,
          });
          targetExecutableTool = resolved.canonicalPath;
        } else {
          targetExecutableTool = cmd;
        }
        commandArgs = params.args ? [...params.args] : [];
        break;
      }

      default: {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.COMMAND_UNSUPPORTED,
          `Unsupported command kind`
        );
      }
    }

    // 6. Resolve trusted host executable and arguments
    let executablePath: string;
    let finalArgs: string[];

    const requestedShell = params.kind === "shell-command" ? params.shell : undefined;

    if (requestedShell) {
      if (requestedShell === "powershell") {
        executablePath = this.executableRegistry.findBinaryOnPath("powershell") || "powershell.exe";
        finalArgs = [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `${targetExecutableTool} ${commandArgs.map((a) => `"${a.replace(/"/g, '`"')}"`).join(" ")}`.trim(),
        ];
      } else if (requestedShell === "pwsh") {
        executablePath = this.executableRegistry.findBinaryOnPath("pwsh") || "pwsh.exe";
        finalArgs = [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `${targetExecutableTool} ${commandArgs.map((a) => `"${a.replace(/"/g, '`"')}"`).join(" ")}`.trim(),
        ];
      } else if (requestedShell === "cmd") {
        executablePath = this.executableRegistry.findBinaryOnPath("cmd") || "cmd.exe";
        finalArgs = ["/d", "/c", targetExecutableTool, ...commandArgs];
      } else if (requestedShell === "bash") {
        executablePath = this.executableRegistry.findBinaryOnPath("bash") || "bash";
        finalArgs = [
          "-c",
          `${targetExecutableTool} ${commandArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`.trim(),
        ];
      } else {
        executablePath = this.executableRegistry.findBinaryOnPath("sh") || "sh";
        finalArgs = [
          "-c",
          `${targetExecutableTool} ${commandArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`.trim(),
        ];
      }
    } else {
      if (path.isAbsolute(targetExecutableTool)) {
        executablePath = targetExecutableTool;
        finalArgs = [...commandArgs];
      } else {
        const resolvedTool = await this.executableRegistry.getExecutable(targetExecutableTool);
        executablePath = resolvedTool.executablePath;
        finalArgs = [...(resolvedTool.prependArgs ?? []), ...commandArgs];
      }

      // On Windows, if target executable is a .cmd or .bat file and not wrapped by node, invoke via cmd.exe
      if (
        process.platform === "win32" &&
        (executablePath.toLowerCase().endsWith(".cmd") || executablePath.toLowerCase().endsWith(".bat"))
      ) {
        const cmdExe = this.executableRegistry.findBinaryOnPath("cmd") || "cmd.exe";
        finalArgs = ["/d", "/c", executablePath, ...commandArgs];
        executablePath = cmdExe;
      }
    }

    // 7. Build hardened environment with sanitized custom env vars
    const safeEnv = buildSafeProcessEnv(this.runnerStateDir);
    if ("env" in params && params.env && typeof params.env === "object") {
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
      for (const [k, v] of Object.entries(params.env)) {
        if (!BLOCKED_ENV_KEYS.has(k.toUpperCase()) && typeof v === "string") {
          safeEnv[k] = v;
        }
      }
    }

    // 8. Execute subprocess with resource bounds and timeout
    const timeoutMs = "timeoutMs" in params ? params.timeoutMs : undefined;
    const execution = await this.processRunner.run({
      executablePath,
      args: finalArgs,
      cwd: workingDir,
      env: safeEnv,
      timeoutMs,
      canonicalProjectRoot: project.canonicalRoot,
      runnerStateDir: this.runnerStateDir,
    });


    return {
      projectId: params.projectId,
      risk: assessment.risk as "SAFE" | "CAUTION",
      exitCode: execution.exitCode,
      signal: null,
      durationMs: execution.durationMs,
      stdout: execution.stdout,
      stderr: execution.stderr,
      timedOut: execution.timedOut,
    };
  }
}
