import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import {
  evaluateProcessOwnership,
  validateProcessKillAuthorization,
  isSystemProtectedProcess,
  type StoredProcessCreationRecord,
} from "@localbridge/security";
import type {
  ProcessSummary,
  ProcessTreeNode,
  ProcessOwnershipGrade,
} from "@localbridge/protocol";
import { type Logger } from "@localbridge/shared";
import { ProcessInspector } from "./process-inspector.js";
import { PortInspector } from "./port-inspector.js";
import type { WindowsJobObject } from "./job-object.js";
import type { ProjectRegistry } from "../projects/index.js";

export class ProcessOwnershipTracker {
  private readonly records = new Map<number, StoredProcessCreationRecord>();
  private readonly jobObjects = new Map<number, WindowsJobObject>();
  private readonly persistencePath?: string;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly projectRegistry?: ProjectRegistry,
    private readonly logger?: Logger
  ) {
    if (this.runnerStateDir) {
      this.persistencePath = path.join(this.runnerStateDir, "process-ownership.json");
      this.loadRecords();
    }
  }

  private loadRecords(): void {
    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) return;
    try {
      const data = fs.readFileSync(this.persistencePath, "utf-8");
      const list = JSON.parse(data) as StoredProcessCreationRecord[];
      for (const item of list) {
        if (item && item.pid) {
          this.records.set(item.pid, item);
        }
      }
    } catch (err) {
      this.logger?.warn({ err }, "Failed to load process ownership records from disk");
    }
  }

  private saveRecords(): void {
    if (!this.persistencePath) return;
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const list = Array.from(this.records.values());
      const tmpPath = `${this.persistencePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.persistencePath);
    } catch (err) {
      this.logger?.warn({ err }, "Failed to save process ownership records to disk");
    }
  }

  registerProcess(
    record: StoredProcessCreationRecord,
    jobObject?: WindowsJobObject
  ): void {
    this.records.set(record.pid, record);
    if (jobObject) {
      this.jobObjects.set(record.pid, jobObject);
    }
    this.saveRecords();
    this.logger?.debug({ pid: record.pid, projectId: record.projectId }, "Registered process ownership");
  }

  unregisterProcess(pid: number): void {
    this.records.delete(pid);
    this.jobObjects.delete(pid);
    this.saveRecords();
  }

  getRecord(pid: number): StoredProcessCreationRecord | undefined {
    return this.records.get(pid);
  }

  getTrackedPids(): number[] {
    return Array.from(this.records.keys());
  }

  /**
   * List enriched process summaries with ownership grades, resource IDs, and ports.
   */
  async listProcesses(
    targetProjectId?: string,
    filterOwnership?: string
  ): Promise<ProcessSummary[]> {
    const [liveProcs, livePorts] = await Promise.all([
      ProcessInspector.listProcesses(),
      PortInspector.listPorts(),
    ]);

    // Map ports by PID
    const portsByPid = new Map<number, number[]>();
    for (const p of livePorts) {
      if (p.pid) {
        const list = portsByPid.get(p.pid) || [];
        list.push(p.port);
        portsByPid.set(p.pid, list);
      }
    }

    let targetProjectRoot: string | undefined;
    if (targetProjectId && this.projectRegistry) {
      const proj = this.projectRegistry.get(targetProjectId);
      if (proj) {
        targetProjectRoot = proj.root;
      }
    }

    const results: ProcessSummary[] = [];

    for (const proc of liveProcs) {
      const stored = this.records.get(proc.pid);
      const parentStored = proc.ppid ? this.records.get(proc.ppid) : undefined;

      const evalResult = evaluateProcessOwnership(
        proc,
        targetProjectId,
        targetProjectRoot,
        stored,
        parentStored
      );

      // Ownership filter
      if (filterOwnership && filterOwnership !== "ALL") {
        if (evalResult.ownership !== filterOwnership) {
          continue;
        }
      }

      // Project filter
      if (targetProjectId) {
        const belongsToProject =
          stored?.projectId === targetProjectId ||
          parentStored?.projectId === targetProjectId ||
          (evalResult.ownership === "PROBABLE" && evalResult.score >= 20);

        if (!belongsToProject && filterOwnership !== "ALL") {
          continue;
        }
      }

      const assignedPorts = portsByPid.get(proc.pid) || [];

      results.push({
        pid: proc.pid,
        ppid: proc.ppid,
        name: proc.name,
        commandLine: proc.commandLine,
        executablePath: proc.executablePath,
        cwd: proc.cwd || stored?.cwd,
        memoryBytes: proc.memoryBytes,
        cpuTimeMs: proc.cpuTimeMs,
        state: proc.state,
        ownership: evalResult.ownership,
        score: evalResult.score,
        projectId: stored?.projectId || parentStored?.projectId,
        sessionId: stored?.sessionId || parentStored?.sessionId,
        agentTaskId: stored?.agentTaskId || parentStored?.agentTaskId,
        runtimeId: stored?.runtimeId || parentStored?.runtimeId,
        terminalSessionId: stored?.terminalSessionId || parentStored?.terminalSessionId,
        ports: assignedPorts,
        startTime: proc.startTime || stored?.processStartTime,
      });
    }

    return results;
  }

  /**
   * Get detailed status of a specific process.
   */
  async getProcessStatus(pid: number): Promise<{
    summary: ProcessSummary;
    children: number[];
    isSystemProtected: boolean;
    killable: boolean;
    ownershipReasons: string[];
  }> {
    const list = await this.listProcesses(undefined, "ALL");
    const proc = list.find((p) => p.pid === pid);
    if (!proc) {
      throw new Error(`Process with PID ${pid} not found`);
    }

    const children = list.filter((p) => p.ppid === pid).map((p) => p.pid);
    const isSys = isSystemProtectedProcess(proc.name, proc.executablePath);
    const stored = this.records.get(pid);
    const parentStored = proc.ppid ? this.records.get(proc.ppid) : undefined;
    const evalResult = evaluateProcessOwnership(proc, undefined, undefined, stored, parentStored);

    const killCheck = validateProcessKillAuthorization(evalResult.ownership, false);

    return {
      summary: proc,
      children,
      isSystemProtected: isSys,
      killable: killCheck.allowed,
      ownershipReasons: evalResult.reasons,
    };
  }

  /**
   * Build hierarchical process tree.
   */
  async buildProcessTree(filter?: {
    pid?: number;
    projectId?: string;
    terminalSessionId?: string;
    runtimeId?: string;
  }): Promise<{ roots: ProcessTreeNode[]; totalProcesses: number }> {
    const allProcs = await this.listProcesses(filter?.projectId, "ALL");
    const procMap = new Map<number, ProcessTreeNode>();

    for (const p of allProcs) {
      procMap.set(p.pid, { ...p, children: [] });
    }

    const roots: ProcessTreeNode[] = [];

    if (filter?.pid) {
      const rootNode = procMap.get(filter.pid);
      if (rootNode) {
        roots.push(rootNode);
      }
    } else {
      for (const node of procMap.values()) {
        if (node.ppid && procMap.has(node.ppid)) {
          const parent = procMap.get(node.ppid)!;
          parent.children.push(node);
        } else {
          // If no parent in list, it is a root
          roots.push(node);
        }
      }
    }

    // Filter by terminalSessionId or runtimeId if requested
    let filteredRoots = roots;
    if (filter?.terminalSessionId) {
      filteredRoots = roots.filter(
        (r) => r.terminalSessionId === filter.terminalSessionId || hasDescendantWith(r, (n) => n.terminalSessionId === filter.terminalSessionId)
      );
    } else if (filter?.runtimeId) {
      filteredRoots = roots.filter(
        (r) => r.runtimeId === filter.runtimeId || hasDescendantWith(r, (n) => n.runtimeId === filter.runtimeId)
      );
    }

    return {
      roots: filteredRoots,
      totalProcesses: allProcs.length,
    };
  }

  /**
   * Terminate a process with ownership verification and exit validation.
   */
  async killProcess(
    pid: number,
    options?: { force?: boolean; signal?: string; hasApproval?: boolean }
  ): Promise<{ killed: boolean; ownership: ProcessOwnershipGrade; message: string; exitVerified: boolean }> {
    const list = await this.listProcesses(undefined, "ALL");
    const proc = list.find((p) => p.pid === pid);
    if (!proc) {
      return {
        killed: true,
        ownership: "UNOWNED",
        message: `Process ${pid} is already terminated or not found`,
        exitVerified: true,
      };
    }

    // Validate authorization
    const authCheck = validateProcessKillAuthorization(proc.ownership, !!options?.hasApproval);
    if (!authCheck.allowed) {
      throw new Error(authCheck.reason || "Process termination denied");
    }

    // 1. Try Windows Job Object termination if associated
    const jobObj = this.jobObjects.get(pid);
    if (jobObj) {
      await jobObj.terminate();
    }

    // 2. Terminate via OS mechanism
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        try {
          const procTerm = child_process.spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
            shell: false,
          });
          procTerm.on("close", () => resolve());
          procTerm.on("error", () => resolve());
        } catch {
          resolve();
        }
      });
    } else {
      const sig = options?.force ? "SIGKILL" : (options?.signal || "SIGTERM");
      try {
        process.kill(pid, sig as NodeJS.Signals);
      } catch {}
    }

    // 3. Verify exit
    let exitVerified = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        process.kill(pid, 0);
      } catch {
        exitVerified = true;
        break;
      }
    }

    this.unregisterProcess(pid);

    return {
      killed: true,
      ownership: proc.ownership,
      message: `Process ${pid} successfully terminated`,
      exitVerified,
    };
  }
}

function hasDescendantWith(node: ProcessTreeNode, predicate: (n: ProcessTreeNode) => boolean): boolean {
  for (const child of node.children) {
    if (predicate(child) || hasDescendantWith(child, predicate)) {
      return true;
    }
  }
  return false;
}
