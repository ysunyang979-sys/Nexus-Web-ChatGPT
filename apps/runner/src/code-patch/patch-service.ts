import fs from "node:fs";
import path from "node:path";
import type {
  CodePatchPreviewParams,
  CodePatchPreviewResult,
  CodePatchApplyParams,
  CodePatchApplyResult,
  CodePatchRollbackParams,
  CodePatchRollbackResult,
  PatchHunkPreview,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { WorkspaceCheckpointService } from "../checkpoints/checkpoint-service.js";
import type { Logger } from "@localbridge/shared";

interface ParsedFilePatch {
  filePath: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

export class CodePatchService {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly checkpointService?: WorkspaceCheckpointService,
    private readonly logger?: Logger
  ) {}

  private parseUnifiedDiff(diff: string): ParsedFilePatch[] {
    const filePatches: ParsedFilePatch[] = [];
    const lines = diff.split("\n");
    let currentPatch: ParsedFilePatch | null = null;
    let currentHunk: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("--- ")) {
        // start of file header
      } else if (line.startsWith("+++ ")) {
        // file path
        let target = line.slice(4).trim();
        if (target.startsWith("b/")) target = target.slice(2);
        currentPatch = { filePath: target, hunks: [] };
        filePatches.push(currentPatch);
      } else if (line.startsWith("@@ ")) {
        // hunk header: @@ -oldStart,oldLines +newStart,newLines @@
        const match = line.match(/@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
        if (match && currentPatch) {
          currentHunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: match[2] !== undefined ? parseInt(match[2], 10) : 1,
            newStart: parseInt(match[3], 10),
            newLines: match[4] !== undefined ? parseInt(match[4], 10) : 1,
            lines: [],
          };
          currentPatch.hunks.push(currentHunk);
        }
      } else if (currentHunk) {
        if (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) {
          currentHunk.lines.push(line);
        }
      }
    }

    return filePatches;
  }

  async preview(params: CodePatchPreviewParams): Promise<CodePatchPreviewResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const filePatches = this.parseUnifiedDiff(params.patchContent);
    const hunkPreviews: PatchHunkPreview[] = [];
    let canApplyAll = true;
    const filesAffected: string[] = [];

    for (const fp of filePatches) {
      filesAffected.push(fp.filePath);
      const fullPath = path.resolve(project.canonicalRoot, fp.filePath);

      if (!fs.existsSync(fullPath)) {
        // If file doesn't exist, can only apply if oldStart is 0 or all lines are additions
        const allAdditions = fp.hunks.every((h) => h.lines.every((l: string) => l.startsWith("+")));
        if (!allAdditions) {
          canApplyAll = false;
          hunkPreviews.push({
            path: fp.filePath,
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 1,
            canApply: false,
            conflictReason: `Target file '${fp.filePath}' does not exist on disk`,
          });
          continue;
        }
      }

      const fileContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
      const fileLines = fileContent.split("\n");

      for (const hunk of fp.hunks) {
        let hunkCanApply = true;
        let conflictReason: string | undefined;

        // Verify context and deletion lines
        const oldContentExpected = hunk.lines
          .filter((l: string) => l.startsWith(" ") || l.startsWith("-"))
          .map((l: string) => l.slice(1));

        const startIdx = Math.max(0, hunk.oldStart - 1);
        for (let j = 0; j < oldContentExpected.length; j++) {
          const actualLine = fileLines[startIdx + j];
          const expectedLine = oldContentExpected[j];
          if (actualLine !== undefined && actualLine.trim() !== expectedLine.trim()) {
            hunkCanApply = false;
            conflictReason = `Line ${startIdx + j + 1} mismatch: expected '${expectedLine}', found '${actualLine}'`;
            break;
          }
        }

        if (!hunkCanApply) {
          canApplyAll = false;
        }

        hunkPreviews.push({
          path: fp.filePath,
          oldStart: hunk.oldStart,
          oldLines: hunk.oldLines,
          newStart: hunk.newStart,
          newLines: hunk.newLines,
          canApply: hunkCanApply,
          conflictReason,
        });
      }
    }

    return {
      projectId: params.projectId,
      canApplyAll,
      filesAffected,
      hunks: hunkPreviews,
      diffSummary: `Affects ${filesAffected.length} file(s), ${hunkPreviews.length} hunk(s)`,
    };
  }

  async apply(params: CodePatchApplyParams): Promise<CodePatchApplyResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const previewRes = await this.preview({
      projectId: params.projectId,
      patchContent: params.patchContent,
      reverse: false,
    });

    const isAtomic = params.atomic !== false;
    if (isAtomic && !previewRes.canApplyAll) {
      const firstConflict = previewRes.hunks.find((h) => !h.canApply);
      throw new Error(
        `Cannot apply patch atomically: conflict in '${firstConflict?.path}': ${firstConflict?.conflictReason}`
      );
    }

    let backupCheckpointId: string | undefined;
    if (params.createBackup !== false && this.checkpointService && previewRes.filesAffected.length > 0) {
      const cp = await this.checkpointService.create({
        projectId: params.projectId,
        name: `Pre-patch backup (${previewRes.filesAffected.length} files)`,
        autoTrigger: "pre-edit",
        includePaths: previewRes.filesAffected,
      });
      backupCheckpointId = cp.checkpoint.id;
    }

    const filePatches = this.parseUnifiedDiff(params.patchContent);
    const modifiedFiles: string[] = [];

    for (const fp of filePatches) {
      const fullPath = path.resolve(project.canonicalRoot, fp.filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      const fileContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
      let lines = fileContent ? fileContent.split("\n") : [];

      // Sort hunks in reverse so offsets don't invalidate later line indexes
      const sortedHunks = [...fp.hunks].sort((a, b) => b.oldStart - a.oldStart);

      for (const hunk of sortedHunks) {
        const startIdx = Math.max(0, hunk.oldStart - 1);
        const deleteCount = hunk.lines.filter((l: string) => l.startsWith(" ") || l.startsWith("-")).length;
        const newLines = hunk.lines
          .filter((l: string) => l.startsWith(" ") || l.startsWith("+"))
          .map((l: string) => l.slice(1));

        lines.splice(startIdx, deleteCount, ...newLines);
      }

      fs.writeFileSync(fullPath, lines.join("\n"), "utf-8");
      modifiedFiles.push(fp.filePath);
    }

    this.logger?.info(
      { projectId: params.projectId, modifiedFiles, backupCheckpointId },
      "Unified diff patch applied"
    );

    return {
      projectId: params.projectId,
      applied: true,
      filesModified: modifiedFiles,
      backupCheckpointId,
      appliedAt: Date.now(),
    };
  }

  async rollback(params: CodePatchRollbackParams): Promise<CodePatchRollbackResult> {
    if (!this.checkpointService) {
      throw new Error("Checkpoint service not configured for patch rollback");
    }

    const restored = await this.checkpointService.restore({
      checkpointId: params.backupCheckpointId,
      projectId: params.projectId,
      createBackupBeforeRestore: false,
    });

    const cp = await this.checkpointService.get({
      checkpointId: params.backupCheckpointId,
      projectId: params.projectId,
    });

    return {
      projectId: params.projectId,
      rolledBack: restored.success,
      filesRestored: cp.checkpoint.files.map((f) => f.relativePath),
      rolledBackAt: Date.now(),
    };
  }
}
