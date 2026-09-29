import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  WorkspaceCheckpointManifest,
  CheckpointCreateParams,
  CheckpointCreateResult,
  CheckpointListParams,
  CheckpointListResult,
  CheckpointGetParams,
  CheckpointGetResult,
  CheckpointRestoreParams,
  CheckpointRestoreResult,
  CheckpointDeleteParams,
  CheckpointDeleteResult,
  CheckpointFileEntry,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export class WorkspaceCheckpointService {
  private readonly checkpointsDir: string;

  constructor(
    runnerStateDir: string,
    private readonly projectRegistry: ProjectRegistry,
    private readonly logger?: Logger
  ) {
    this.checkpointsDir = path.join(runnerStateDir, "checkpoints");
    if (!fs.existsSync(this.checkpointsDir)) {
      fs.mkdirSync(this.checkpointsDir, { recursive: true });
    }
  }

  private getCheckpointDir(checkpointId: string): string {
    return path.join(this.checkpointsDir, checkpointId);
  }

  private getManifestPath(checkpointId: string): string {
    return path.join(this.getCheckpointDir(checkpointId), "manifest.json");
  }

  private getFilesDir(checkpointId: string): string {
    return path.join(this.getCheckpointDir(checkpointId), "files");
  }

  private loadManifest(checkpointId: string): WorkspaceCheckpointManifest | null {
    const p = this.getManifestPath(checkpointId);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as WorkspaceCheckpointManifest;
    } catch {
      return null;
    }
  }

  private saveManifest(manifest: WorkspaceCheckpointManifest): void {
    const dir = this.getCheckpointDir(manifest.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.getManifestPath(manifest.id), JSON.stringify(manifest, null, 2), "utf-8");
  }

  private async getGitInfo(root: string): Promise<{ branch?: string; commit?: string; statusOutput?: string }> {
    try {
      const gitDir = path.join(root, ".git");
      if (!fs.existsSync(gitDir)) {
        return {};
      }
      const branchRes = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
      const commitRes = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
      const statusRes = await execFileAsync("git", ["status", "--porcelain", "-uall"], { cwd: root });
      return {
        branch: branchRes.stdout.trim(),
        commit: commitRes.stdout.trim(),
        statusOutput: statusRes.stdout,
      };
    } catch {
      return {};
    }
  }

  async create(params: CheckpointCreateParams): Promise<CheckpointCreateResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const checkpointId = `cp_${crypto.randomUUID()}`;
    const now = Date.now();
    const filesDir = this.getFilesDir(checkpointId);
    fs.mkdirSync(filesDir, { recursive: true });

    const gitInfo = await this.getGitInfo(project.canonicalRoot);
    const fileEntries: CheckpointFileEntry[] = [];

    // If specific includePaths provided, snapshot those files
    if (params.includePaths && params.includePaths.length > 0) {
      for (const rel of params.includePaths) {
        const full = path.resolve(project.canonicalRoot, rel);
        if (fs.existsSync(full)) {
          const content = fs.readFileSync(full);
          const hash = crypto.createHash("sha256").update(content).digest("hex");
          const targetBackup = path.join(filesDir, rel.replace(/[\\/]/g, "_"));
          fs.mkdirSync(path.dirname(targetBackup), { recursive: true });
          fs.writeFileSync(targetBackup, content);
          fileEntries.push({
            relativePath: rel.replace(/\\/g, "/"),
            sha256: hash,
            sizeBytes: content.length,
            action: "modified",
          });
        }
      }
    } else if (gitInfo.statusOutput) {
      // Snapshot all dirty and untracked git files
      const lines = gitInfo.statusOutput.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const status = line.slice(0, 2);
        let rel = line.slice(3).trim();
        if (rel.startsWith('"') && rel.endsWith('"')) {
          rel = rel.slice(1, -1);
        }
        const full = path.resolve(project.canonicalRoot, rel);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const content = fs.readFileSync(full);
          const hash = crypto.createHash("sha256").update(content).digest("hex");
          const targetBackup = path.join(filesDir, rel.replace(/[\\/]/g, "_"));
          fs.mkdirSync(path.dirname(targetBackup), { recursive: true });
          fs.writeFileSync(targetBackup, content);
          fileEntries.push({
            relativePath: rel.replace(/\\/g, "/"),
            sha256: hash,
            sizeBytes: content.length,
            action: status.includes("?") ? "created" : "modified",
          });
        }
      }
    }

    if (fileEntries.length === 0) {
      // Clean git or non-git workspace: snapshot existing project files
      const scanDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (
              entry.name.startsWith(".") ||
              entry.name === "node_modules" ||
              entry.name === "dist" ||
              entry.name === "coverage" ||
              entry.name === "target"
            ) {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath);
            } else if (entry.isFile()) {
              const rel = path.relative(project.canonicalRoot, fullPath);
              const content = fs.readFileSync(fullPath);
              const hash = crypto.createHash("sha256").update(content).digest("hex");
              const targetBackup = path.join(filesDir, rel.replace(/[\\/]/g, "_"));
              fs.mkdirSync(path.dirname(targetBackup), { recursive: true });
              fs.writeFileSync(targetBackup, content);
              fileEntries.push({
                relativePath: rel.replace(/\\/g, "/"),
                sha256: hash,
                sizeBytes: content.length,
                action: "modified",
              });
            }
          }
        } catch {
          // ignore scan errors
        }
      };
      scanDir(project.canonicalRoot);
    }

    const manifest: WorkspaceCheckpointManifest = {
      id: checkpointId,
      projectId: params.projectId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      name: params.name,
      description: params.description,
      gitBranch: gitInfo.branch,
      gitCommit: gitInfo.commit,
      files: fileEntries,
      autoTrigger: params.autoTrigger || "manual",
      createdAt: now,
      snapshotDirPath: filesDir,
    };

    this.saveManifest(manifest);
    this.logger?.info(
      { checkpointId, projectId: params.projectId, filesCount: fileEntries.length },
      "Workspace Checkpoint created"
    );

    return { checkpoint: manifest };
  }

  async list(params: CheckpointListParams): Promise<CheckpointListResult> {
    if (!fs.existsSync(this.checkpointsDir)) {
      return { checkpoints: [], total: 0 };
    }

    const entries = fs.readdirSync(this.checkpointsDir);
    const manifests: WorkspaceCheckpointManifest[] = [];

    for (const id of entries) {
      const m = this.loadManifest(id);
      if (!m) continue;
      if (m.projectId !== params.projectId) continue;
      if (params.taskId && m.taskId !== params.taskId) continue;
      if (params.sessionId && m.sessionId !== params.sessionId) continue;
      manifests.push(m);
    }

    manifests.sort((a, b) => b.createdAt - a.createdAt);
    const paginated = manifests.slice(0, params.limit || 30);

    return {
      checkpoints: paginated,
      total: manifests.length,
    };
  }

  async get(params: CheckpointGetParams): Promise<CheckpointGetResult> {
    const manifest = this.loadManifest(params.checkpointId);
    if (!manifest || manifest.projectId !== params.projectId) {
      throw new Error(`Checkpoint '${params.checkpointId}' not found for project '${params.projectId}'`);
    }
    return { checkpoint: manifest };
  }

  async restore(params: CheckpointRestoreParams): Promise<CheckpointRestoreResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const manifest = this.loadManifest(params.checkpointId);
    if (!manifest || manifest.projectId !== params.projectId) {
      throw new Error(`Checkpoint '${params.checkpointId}' not found for project '${params.projectId}'`);
    }

    const filesDir = this.getFilesDir(manifest.id);

    if ((params as any).dryRun) {
      let previewCount = 0;
      for (const f of manifest.files) {
        const backupPath = path.join(filesDir, f.relativePath.replace(/[\\/]/g, "_"));
        if (fs.existsSync(backupPath)) {
          previewCount++;
        }
      }
      return {
        checkpointId: manifest.id,
        restoredFilesCount: previewCount,
        success: true,
        restoredAt: Date.now(),
        dryRun: true,
      } as any;
    }

    let backupCheckpointId: string | undefined;

    if (params.createBackupBeforeRestore && manifest.files.length > 0) {
      const preRestore = await this.create({
        projectId: params.projectId,
        name: `Pre-restore backup before ${manifest.id}`,
        autoTrigger: "pre-reconcile",
        includePaths: manifest.files.map((f) => f.relativePath),
      });
      backupCheckpointId = preRestore.checkpoint.id;
    }

    let restoredCount = 0;

    for (const f of manifest.files) {
      const backupPath = path.join(filesDir, f.relativePath.replace(/[\\/]/g, "_"));
      const targetPath = path.resolve(project.canonicalRoot, f.relativePath);

      if (fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (fs.existsSync(targetPath)) {
          const cur = fs.readFileSync(targetPath);
          const bkp = fs.readFileSync(backupPath);
          if (cur.equals(bkp)) {
            restoredCount++;
            continue;
          }
        }
        fs.copyFileSync(backupPath, targetPath);
        restoredCount++;
      }
    }

    this.logger?.info(
      { checkpointId: manifest.id, restoredCount, backupCheckpointId },
      "Restored workspace checkpoint successfully"
    );

    return {
      checkpointId: manifest.id,
      restoredFilesCount: restoredCount,
      backupCheckpointId,
      success: true,
      restoredAt: Date.now(),
    };
  }

  async delete(params: CheckpointDeleteParams): Promise<CheckpointDeleteResult> {
    const dir = this.getCheckpointDir(params.checkpointId);
    if (!fs.existsSync(dir)) {
      return { checkpointId: params.checkpointId, deleted: false };
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return { checkpointId: params.checkpointId, deleted: true };
    } catch (err) {
      this.logger?.warn({ err, checkpointId: params.checkpointId }, "Error deleting checkpoint");
      return { checkpointId: params.checkpointId, deleted: false };
    }
  }
}
