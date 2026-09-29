import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  WorkspaceHygieneCheckParams,
  WorkspaceHygieneCheckResult,
  WorkspaceCleanParams,
  WorkspaceCleanResult,
  WorkspaceResetFileParams,
  WorkspaceResetFileResult,
  WorkspaceCleanUntrackedParams,
  WorkspaceCleanUntrackedResult,
  WorkspaceKillZombiesParams,
  WorkspaceKillZombiesResult,
  HygieneIssue,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { ProcessOwnershipTracker } from "../process/ownership-tracker.js";
import type { PersistentRuntimeManager } from "../runtime/manager.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export class WorkspaceHygieneService {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly ownershipTracker?: ProcessOwnershipTracker,
    private readonly runtimeManager?: PersistentRuntimeManager,
    private readonly terminalManager?: TerminalManager,
    private readonly logger?: Logger
  ) {}

  async check(params: WorkspaceHygieneCheckParams): Promise<WorkspaceHygieneCheckResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const issues: HygieneIssue[] = [];
    let uncommittedCount = 0;
    let untrackedCount = 0;
    let tempBytes = 0;

    // 1. Check Git status
    if (params.checkGit !== false && fs.existsSync(path.join(project.canonicalRoot, ".git"))) {
      try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
          cwd: project.canonicalRoot,
        });
        const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          const status = line.slice(0, 2);
          const rel = line.slice(3).trim();
          if (status.includes("?")) {
            untrackedCount++;
            issues.push({
              category: "untracked_file",
              severity: "low",
              pathOrIdentifier: rel,
              description: `Untracked file in workspace: ${rel}`,
            });
          } else {
            uncommittedCount++;
            issues.push({
              category: "dirty_git_file",
              severity: "medium",
              pathOrIdentifier: rel,
              description: `Uncommitted modifications: ${rel}`,
            });
          }
        }
      } catch {
        // Git check non-fatal
      }
    }

    // 2. Check Temp Files
    if (params.checkTempFiles !== false) {
      const scanDir = (dir: string, depth = 0) => {
        if (depth > 4) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.name === "node_modules" || ent.name === ".git") continue;
            const full = path.join(dir, ent.name);
            if (ent.isFile()) {
              if (
                ent.name.endsWith(".tmp") ||
                ent.name.startsWith(".tmp.") ||
                ent.name.endsWith(".bak") ||
                ent.name.endsWith(".log.tmp")
              ) {
                const s = fs.statSync(full);
                tempBytes += s.size;
                issues.push({
                  category: "temp_file",
                  severity: "low",
                  pathOrIdentifier: path.relative(project.canonicalRoot, full).replace(/\\/g, "/"),
                  description: `Temporary residual file: ${ent.name}`,
                  sizeBytes: s.size,
                });
              }
            } else if (ent.isDirectory()) {
              scanDir(full, depth + 1);
            }
          }
        } catch {}
      };
      scanDir(project.canonicalRoot);
    }

    // 3. Check Zombies
    let zombieProcessesCount = 0;
    let orphanedRuntimesCount = 0;

    if (params.checkZombies !== false) {
      if (this.ownershipTracker) {
        const pids = this.ownershipTracker.getTrackedPids?.() || [];
        for (const pid of pids) {
          try {
            process.kill(pid, 0); // test if process is alive
          } catch {
            zombieProcessesCount++;
            issues.push({
              category: "zombie_process",
              severity: "high",
              pathOrIdentifier: String(pid),
              description: `Tracked process ${pid} is defunct/zombie`,
            });
          }
        }
      }

      if (this.runtimeManager) {
        const runtimesRes = this.runtimeManager.list({ projectId: params.projectId });
        const runtimes = runtimesRes?.runtimes || [];
        for (const r of runtimes) {
          if (r.state === "failed" || (r.state as string) === "interrupted" || (r.state as string) === "faulted") {
            orphanedRuntimesCount++;
            issues.push({
              category: "orphaned_runtime",
              severity: "medium",
              pathOrIdentifier: r.runtimeId,
              description: `Runtime '${r.name}' is in faulted/interrupted state (${r.state})`,
            });
          }
        }
      }
    }

    return {
      projectId: params.projectId,
      isClean: issues.length === 0,
      issues,
      uncommittedFilesCount: uncommittedCount,
      untrackedFilesCount: untrackedCount,
      zombieProcessesCount,
      orphanedRuntimesCount,
      tempFilesBytes: tempBytes,
      checkedAt: Date.now(),
    };
  }

  async clean(params: WorkspaceCleanParams): Promise<WorkspaceCleanResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const isDryRun = (params as any).dryRun === true;
    let tempFilesRemoved = 0;
    let bytesFreed = 0;

    if (params.cleanTempFiles) {
      const cleanDir = (dir: string, depth = 0) => {
        if (depth > 4) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.name === "node_modules" || ent.name === ".git") continue;
            const full = path.join(dir, ent.name);
            if (ent.isFile()) {
              if (
                ent.name.endsWith(".tmp") ||
                ent.name.startsWith(".tmp.") ||
                ent.name.endsWith(".bak") ||
                ent.name.endsWith(".log.tmp")
              ) {
                const s = fs.statSync(full);
                bytesFreed += s.size;
                if (!isDryRun) {
                  fs.unlinkSync(full);
                }
                tempFilesRemoved++;
              }
            } else if (ent.isDirectory()) {
              cleanDir(full, depth + 1);
            }
          }
        } catch {}
      };
      cleanDir(project.canonicalRoot);
    }

    let untrackedRemoved = 0;
    if (params.discardUntracked) {
      const untracked = await this.cleanUntracked({ projectId: params.projectId, dryRun: isDryRun });
      untrackedRemoved = untracked.totalCount;
    }

    let zombiesKilled = 0;
    if (params.killZombies && !isDryRun) {
      const killed = await this.killZombies({ projectId: params.projectId });
      zombiesKilled = killed.totalKilled;
    }

    return {
      projectId: params.projectId,
      tempFilesRemoved,
      bytesFreed,
      zombiesKilled,
      untrackedRemoved,
      success: true,
      cleanedAt: Date.now(),
      dryRun: isDryRun,
    } as any;
  }

  async resetFile(params: WorkspaceResetFileParams): Promise<WorkspaceResetFileResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    try {
      await execFileAsync("git", ["checkout", "--", params.relativePath], {
        cwd: project.canonicalRoot,
      });
      return {
        projectId: params.projectId,
        relativePath: params.relativePath,
        reset: true,
        message: `File '${params.relativePath}' restored to HEAD`,
      };
    } catch (err) {
      return {
        projectId: params.projectId,
        relativePath: params.relativePath,
        reset: false,
        message: `Failed to reset file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async cleanUntracked(params: WorkspaceCleanUntrackedParams): Promise<WorkspaceCleanUntrackedResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const removedFiles: string[] = [];

    try {
      const args = ["clean", "-f", "-d"];
      if (params.dryRun) {
        args.push("-n");
      }
      const { stdout } = await execFileAsync("git", args, { cwd: project.canonicalRoot });
      const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        removedFiles.push(line.replace(/^(Would remove|Removing)\s+/, "").trim());
      }
    } catch {}

    return {
      projectId: params.projectId,
      removedFiles,
      totalCount: removedFiles.length,
      dryRun: params.dryRun,
    };
  }

  async killZombies(params: WorkspaceKillZombiesParams): Promise<WorkspaceKillZombiesResult> {
    const killedPids: number[] = [];
    const killedRuntimes: string[] = [];
    const killedTerminals: string[] = [];

    if (this.ownershipTracker) {
      const pids = this.ownershipTracker.getTrackedPids?.() || [];
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGKILL");
          killedPids.push(pid);
        } catch {
          // already dead
        }
        this.ownershipTracker.unregisterProcess?.(pid);
      }
    }

    if (this.runtimeManager) {
      const runtimesRes = this.runtimeManager.list({ projectId: params.projectId });
      const runtimes = runtimesRes?.runtimes || [];
      for (const r of runtimes) {
        if (r.state === "stopped" || r.state === "failed" || (r.state as string) === "interrupted" || (r.state as string) === "faulted") {
          try {
            await this.runtimeManager.stop({ runtimeId: r.runtimeId });
            killedRuntimes.push(r.runtimeId);
          } catch {}
        }
      }
    }

    if (this.terminalManager) {
      const termList = await this.terminalManager.list({ projectId: params.projectId });
      const terms = termList?.terminals || [];
      for (const t of terms) {
        try {
          await this.terminalManager.stop({ terminalSessionId: t.terminalSessionId, force: true });
          killedTerminals.push(t.terminalSessionId);
        } catch {}
      }
    }

    return {
      killedProcessPids: killedPids,
      killedRuntimes,
      killedTerminals,
      totalKilled: killedPids.length + killedRuntimes.length + killedTerminals.length,
    };
  }
}
