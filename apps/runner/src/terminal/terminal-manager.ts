import crypto from "node:crypto";
import child_process from "node:child_process";
import nodeModule from "node:module";
import {
  evaluateTerminalInput,
} from "@localbridge/security";

const req = nodeModule.createRequire(import.meta.url);
import type {
  TerminalStartParams,
  TerminalStartResult,
  TerminalWriteParams,
  TerminalWriteResult,
  TerminalReadParams,
  TerminalReadResult,
  TerminalResizeParams,
  TerminalResizeResult,
  TerminalStatusParams,
  TerminalStatusResult,
  TerminalStopParams,
  TerminalStopResult,
  TerminalListParams,
  TerminalListResult,
  TerminalSummary,
  TerminalState,
} from "@localbridge/protocol";
import { type Logger } from "@localbridge/shared";
import { WindowsJobObject } from "../process/job-object.js";
import { ProcessInspector } from "../process/process-inspector.js";
import type { ProcessOwnershipTracker } from "../process/ownership-tracker.js";
import type { ProjectRegistry } from "../projects/index.js";

export const MAX_TERMINALS_PER_PROJECT = 8;
export const MAX_TERMINALS_GLOBAL = 32;
export const DEFAULT_TERMINAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_TERMINAL_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_TERMINAL_BUFFER_BYTES = 2 * 1024 * 1024; // 2 MB

interface ActiveTerminalRecord {
  id: string;
  projectId: string;
  sessionId?: string;
  agentTaskId?: string;
  shell: string;
  cols: number;
  rows: number;
  state: TerminalState;
  pid?: number;
  ptyProcess: any;
  jobObject?: WindowsJobObject;
  createdAt: number;
  lastActivityAt: number;
  stoppedAt?: number;
  exitCode?: number | null;
  buffer: Buffer;
  idleTimer?: NodeJS.Timeout;
  graceTimer?: NodeJS.Timeout;
}

export class TerminalManager {
  private readonly terminals = new Map<string, ActiveTerminalRecord>();
  private static ptyLib: any = null;
  private static ptyLoaded = false;
  private safetyLayerDisabled: boolean = false;

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  private static getPty() {
    if (this.ptyLoaded) return this.ptyLib;
    this.ptyLoaded = true;
    try {
      this.ptyLib = req("node-pty");
    } catch {
      this.ptyLib = null;
    }
    return this.ptyLib;
  }

  constructor(
    private readonly projectRegistry?: ProjectRegistry,
    private readonly ownershipTracker?: ProcessOwnershipTracker,
    private readonly logger?: Logger
  ) {}

  /**
   * Start a persistent terminal session with ConPTY / PTY.
   */
  async start(params: TerminalStartParams): Promise<TerminalStartResult> {
    // 1. Capacity limit check
    if (this.terminals.size >= MAX_TERMINALS_GLOBAL) {
      throw new Error(`RESOURCE_LIMIT: Global terminal limit (${MAX_TERMINALS_GLOBAL}) reached`);
    }

    let projectCount = 0;
    for (const t of this.terminals.values()) {
      if (t.projectId === params.projectId && t.state !== "stopped") {
        projectCount++;
      }
    }
    if (projectCount >= MAX_TERMINALS_PER_PROJECT) {
      throw new Error(
        `RESOURCE_LIMIT: Project terminal limit (${MAX_TERMINALS_PER_PROJECT}) reached for project ${params.projectId}`
      );
    }

    // 2. Determine project CWD
    let effectiveCwd = params.cwd || process.cwd();
    if (this.projectRegistry && params.projectId) {
      const proj = this.projectRegistry.get(params.projectId);
      if (proj) {
        effectiveCwd = params.cwd || proj.root;
      }
    }

    // 3. Choose Shell
    let shell = params.shell;
    if (!shell) {
      if (process.platform === "win32") {
        shell = "powershell.exe";
      } else {
        shell = process.env.SHELL || "bash";
      }
    }

    const terminalId = `term_${crypto.randomUUID()}`;
    const cols = params.cols || 80;
    const rows = params.rows || 24;

    const pty = TerminalManager.getPty();
    let ptyProc: any;
    let pid = 0;
    let jobObj: WindowsJobObject | undefined;

    if (pty) {
      try {
        ptyProc = pty.spawn(shell, [], {
          name: "xterm-color",
          cols,
          rows,
          cwd: effectiveCwd,
          env: { ...process.env, ...(params.env || {}) },
        });
        pid = ptyProc.pid;
      } catch (err) {
        this.logger?.warn({ err }, "node-pty spawn failed, falling back to child_process");
      }
    }

    // Fallback if node-pty is unavailable or failed
    if (!ptyProc) {
      ptyProc = child_process.spawn(shell, [], {
        cwd: effectiveCwd,
        env: { ...process.env, ...(params.env || {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      pid = ptyProc.pid;
    }

    // Associate with Windows Job Object
    if (pid > 0 && process.platform === "win32") {
      jobObj = new WindowsJobObject(`LocalBridge_Terminal_${terminalId}`, this.logger);
      jobObj.assignProcess(pid);
    }

    // Register ownership
    if (pid > 0 && this.ownershipTracker) {
      const startTime = ProcessInspector.getProcessStartTime(pid) || Date.now().toString();
      this.ownershipTracker.registerProcess(
        {
          pid,
          projectId: params.projectId,
          sessionId: params.sessionId,
          agentTaskId: params.agentTaskId,
          terminalSessionId: terminalId,
          processStartTime: startTime,
          executablePath: shell,
          cwd: effectiveCwd,
          createdAt: Date.now(),
        },
        jobObj
      );
    }

    const record: ActiveTerminalRecord = {
      id: terminalId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      agentTaskId: params.agentTaskId,
      shell,
      cols,
      rows,
      state: "running",
      pid,
      ptyProcess: ptyProc,
      jobObject: jobObj,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      buffer: Buffer.alloc(0),
    };

    // Buffer output & exit handling
    const onData = (data: Buffer | string) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      record.buffer = Buffer.concat([record.buffer, chunk]);
      if (record.buffer.length > MAX_TERMINAL_BUFFER_BYTES) {
        record.buffer = record.buffer.subarray(record.buffer.length - MAX_TERMINAL_BUFFER_BYTES);
      }
      this.touchActivity(record);
    };

    if (ptyProc.onData) {
      ptyProc.onData(onData);
    } else if (ptyProc.stdout) {
      ptyProc.stdout.on("data", onData);
      ptyProc.stderr?.on("data", onData);
    }

    const onExit = (exitCode?: number) => {
      record.state = "stopped";
      record.stoppedAt = Date.now();
      record.exitCode = exitCode ?? null;
      this.clearTimers(record);
      if (record.jobObject) {
        record.jobObject.dispose();
      }
    };

    if (ptyProc.onExit) {
      ptyProc.onExit((e: any) => onExit(e?.exitCode));
    } else {
      ptyProc.on("close", (code: number) => onExit(code));
    }

    this.terminals.set(terminalId, record);
    this.scheduleIdleTimer(record);

    return {
      terminalSessionId: terminalId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      agentTaskId: params.agentTaskId,
      shell,
      pid,
      cols,
      rows,
      state: "running",
      createdAt: record.createdAt,
    };
  }

  /**
   * Write input into terminal, with risk evaluation and idle reset.
   */
  async write(params: TerminalWriteParams): Promise<TerminalWriteResult> {
    const record = this.terminals.get(params.terminalSessionId);
    if (!record || record.state === "stopped") {
      throw new Error(`Terminal session '${params.terminalSessionId}' not found or already stopped`);
    }

    this.touchActivity(record);

    // 1. Evaluate input security
    const evaluation = evaluateTerminalInput(params.input);

    if (!this.safetyLayerDisabled && evaluation.requiresApproval && !params.approvalId) {
      return {
        terminalSessionId: params.terminalSessionId,
        bytesWritten: 0,
        riskLevel: evaluation.riskLevel,
        requiresApproval: true,
        approvalId: `app_${crypto.randomUUID()}`,
        state: record.state,
      };
    }

    let payload = params.input;
    if (params.execute && !payload.endsWith("\n") && !payload.endsWith("\r")) {
      payload += process.platform === "win32" ? "\r\n" : "\n";
    }

    const bytes = Buffer.byteLength(payload, "utf8");

    if (record.ptyProcess.write) {
      record.ptyProcess.write(payload);
    } else if (record.ptyProcess.stdin) {
      record.ptyProcess.stdin.write(payload);
    }

    return {
      terminalSessionId: params.terminalSessionId,
      bytesWritten: bytes,
      riskLevel: evaluation.riskLevel,
      state: record.state,
      executedCommand: evaluation.commands[0],
    };
  }

  /**
   * Read buffered output from the terminal session.
   */
  async read(params: TerminalReadParams): Promise<TerminalReadResult> {
    const record = this.terminals.get(params.terminalSessionId);
    if (!record) {
      throw new Error(`Terminal session '${params.terminalSessionId}' not found`);
    }

    this.touchActivity(record);

    const offset = Math.min(params.offset || 0, record.buffer.length);
    const maxBytes = params.maxBytes || 65536;
    const slice = record.buffer.subarray(offset, offset + maxBytes);
    const text = slice.toString("utf8");

    return {
      terminalSessionId: params.terminalSessionId,
      output: text,
      nextOffset: offset + slice.length,
      bytesRead: slice.length,
      isFinished: record.state === "stopped",
      exitCode: record.exitCode,
      state: record.state,
    };
  }

  /**
   * Resize terminal window dimensions.
   */
  async resize(params: TerminalResizeParams): Promise<TerminalResizeResult> {
    const record = this.terminals.get(params.terminalSessionId);
    if (!record || record.state === "stopped") {
      throw new Error(`Terminal session '${params.terminalSessionId}' not found or stopped`);
    }

    record.cols = params.cols;
    record.rows = params.rows;

    if (record.ptyProcess.resize) {
      try {
        record.ptyProcess.resize(params.cols, params.rows);
      } catch {}
    }

    return {
      terminalSessionId: params.terminalSessionId,
      cols: record.cols,
      rows: record.rows,
      success: true,
    };
  }

  /**
   * Get current terminal status.
   */
  async status(params: TerminalStatusParams): Promise<TerminalStatusResult> {
    const record = this.terminals.get(params.terminalSessionId);
    if (!record) {
      throw new Error(`Terminal session '${params.terminalSessionId}' not found`);
    }

    // Status query also touches grace period to revive idle session
    if (record.state === "idle") {
      this.touchActivity(record);
    }

    const uptimeSeconds = Math.floor(
      ((record.stoppedAt || Date.now()) - record.createdAt) / 1000
    );

    return {
      terminalSessionId: record.id,
      projectId: record.projectId,
      sessionId: record.sessionId,
      agentTaskId: record.agentTaskId,
      shell: record.shell,
      cols: record.cols,
      rows: record.rows,
      state: record.state,
      pid: record.pid,
      uptimeSeconds,
      createdAt: record.createdAt,
      lastActivityAt: record.lastActivityAt,
      exitCode: record.exitCode,
      bufferSize: record.buffer.length,
    };
  }

  /**
   * Terminate a terminal session and its process tree.
   */
  async stop(params: TerminalStopParams): Promise<TerminalStopResult> {
    const record = this.terminals.get(params.terminalSessionId);
    if (!record) {
      return {
        terminalSessionId: params.terminalSessionId,
        state: "stopped",
        stoppedAt: Date.now(),
      };
    }

    this.clearTimers(record);
    record.state = "stopped";
    record.stoppedAt = Date.now();

    if (record.jobObject) {
      await record.jobObject.terminate();
      record.jobObject.dispose();
    } else if (record.pid) {
      try {
        if (record.ptyProcess.kill) {
          record.ptyProcess.kill();
        } else {
          process.kill(record.pid, "SIGTERM");
        }
      } catch {}
    }

    if (record.pid && this.ownershipTracker) {
      this.ownershipTracker.unregisterProcess(record.pid);
    }

    return {
      terminalSessionId: record.id,
      state: "stopped",
      stoppedAt: record.stoppedAt,
      exitCode: record.exitCode,
    };
  }

  /**
   * List terminal sessions.
   */
  async list(params: TerminalListParams = {}): Promise<TerminalListResult> {
    const list: TerminalSummary[] = [];

    for (const record of this.terminals.values()) {
      if (params?.projectId && record.projectId !== params.projectId) continue;
      if (params?.state && record.state !== params.state) continue;

      const uptimeSeconds = Math.floor(
        ((record.stoppedAt || Date.now()) - record.createdAt) / 1000
      );

      list.push({
        terminalSessionId: record.id,
        projectId: record.projectId,
        sessionId: record.sessionId,
        agentTaskId: record.agentTaskId,
        shell: record.shell,
        cols: record.cols,
        rows: record.rows,
        state: record.state,
        pid: record.pid,
        uptimeSeconds,
        createdAt: record.createdAt,
        lastActivityAt: record.lastActivityAt,
        exitCode: record.exitCode,
      });
    }

    return {
      terminals: list,
      total: list.length,
    };
  }

  /**
   * Shutdown all active terminal sessions and clean up process trees and timers.
   */
  async shutdown(): Promise<void> {
    for (const record of this.terminals.values()) {
      this.clearTimers(record);
      if (record.state !== "stopped") {
        await this.stop({
          terminalSessionId: record.id,
          force: true,
          reason: "runner_shutdown",
        });
      }
    }
    this.terminals.clear();
  }

  private touchActivity(record: ActiveTerminalRecord): void {
    record.lastActivityAt = Date.now();
    if (record.state === "idle") {
      record.state = "running";
      this.logger?.debug({ terminalId: record.id }, "Terminal returned from idle to running state");
    }
    this.scheduleIdleTimer(record);
  }

  private scheduleIdleTimer(record: ActiveTerminalRecord): void {
    this.clearTimers(record);
    if (record.state === "stopped") return;

    record.idleTimer = setTimeout(() => {
      record.state = "idle";
      this.logger?.info({ terminalId: record.id }, "Terminal session entered idle state");

      record.graceTimer = setTimeout(() => {
        if (record.state === "idle") {
          this.logger?.info({ terminalId: record.id }, "Terminal idle grace period expired, stopping session");
          this.stop({ terminalSessionId: record.id, force: true, reason: "idle_timeout" }).catch(() => {});
        }
      }, DEFAULT_TERMINAL_GRACE_PERIOD_MS);
      record.graceTimer.unref?.();
    }, DEFAULT_TERMINAL_IDLE_TIMEOUT_MS);
    record.idleTimer.unref?.();
  }

  private clearTimers(record: ActiveTerminalRecord): void {
    if (record.idleTimer) clearTimeout(record.idleTimer);
    if (record.graceTimer) clearTimeout(record.graceTimer);
    record.idleTimer = undefined;
    record.graceTimer = undefined;
  }
}
