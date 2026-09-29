import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ArtifactMetadata,
  ArtifactCreateParams,
  ArtifactCreateResult,
  ArtifactWriteChunkParams,
  ArtifactWriteChunkResult,
  ArtifactReadChunkParams,
  ArtifactReadChunkResult,
  ArtifactGetParams,
  ArtifactGetResult,
  ArtifactListParams,
  ArtifactListResult,
  ArtifactImportParams,
  ArtifactImportResult,
  ArtifactExportParams,
  ArtifactExportResult,
  ArtifactDeleteParams,
  ArtifactDeleteResult,
  ArtifactAbortParams,
  ArtifactAbortResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { Logger } from "@localbridge/shared";

export class ArtifactService {
  private readonly baseDir: string;
  private readonly projectRegistry?: ProjectRegistry;
  private readonly logger?: Logger;

  constructor(
    runnerStateDir: string,
    projectRegistryOrLogger?: ProjectRegistry | Logger,
    maybeLogger?: Logger
  ) {
    this.baseDir = path.join(runnerStateDir, "artifacts");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (projectRegistryOrLogger && "get" in (projectRegistryOrLogger as any)) {
      this.projectRegistry = projectRegistryOrLogger as ProjectRegistry;
      this.logger = maybeLogger;
    } else {
      this.logger = projectRegistryOrLogger as Logger;
    }
  }

  setProjectRegistry(projectRegistry: ProjectRegistry): void {
    (this as any).projectRegistry = projectRegistry;
  }

  private resolveProjectPath(projectId?: string, filePath?: string): string | undefined {
    if (!filePath) return undefined;
    if (path.isAbsolute(filePath)) return filePath;
    if (projectId && this.projectRegistry) {
      const proj = this.projectRegistry.get(projectId);
      if (proj) {
        return path.resolve(proj.canonicalRoot, filePath);
      }
    }
    return path.resolve(filePath);
  }

  private getArtifactDir(artifactId: string): string {
    return path.join(this.baseDir, artifactId);
  }

  private getMetadataPath(artifactId: string): string {
    return path.join(this.getArtifactDir(artifactId), "metadata.json");
  }

  private getDataPath(artifactId: string): string {
    return path.join(this.getArtifactDir(artifactId), "data.bin");
  }

  private loadMetadata(artifactId: string): ArtifactMetadata | null {
    const metaPath = this.getMetadataPath(artifactId);
    if (!fs.existsSync(metaPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ArtifactMetadata;
    } catch {
      return null;
    }
  }

  private saveMetadata(metadata: ArtifactMetadata): void {
    const dir = this.getArtifactDir(metadata.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.getMetadataPath(metadata.id), JSON.stringify(metadata, null, 2), "utf-8");
  }

  async create(params: ArtifactCreateParams): Promise<ArtifactCreateResult> {
    const id = `art_${crypto.randomUUID()}`;
    const now = Date.now();
    const metadata: ArtifactMetadata = {
      id,
      projectId: params.projectId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      name: params.name,
      mimeType: params.mimeType || "application/octet-stream",
      sizeBytes: 0,
      sha256: "",
      chunkCount: 0,
      tags: params.tags || [],
      status: "uploading",
      createdAt: now,
      updatedAt: now,
      extra: params.extra,
    };

    const dir = this.getArtifactDir(id);
    fs.mkdirSync(dir, { recursive: true });
    this.saveMetadata(metadata);

    // Initialize empty data file
    fs.writeFileSync(this.getDataPath(id), Buffer.alloc(0));

    this.logger?.info({ artifactId: id, name: params.name }, "Artifact record created");
    return { artifact: metadata };
  }

  async writeChunk(params: ArtifactWriteChunkParams): Promise<ArtifactWriteChunkResult> {
    const metadata = this.loadMetadata(params.artifactId);
    if (!metadata) {
      throw new Error(`Artifact '${params.artifactId}' not found`);
    }

    const dataPath = this.getDataPath(params.artifactId);
    const chunkData = params.chunkBase64 ?? (params as any).dataBase64;
    if (chunkData === undefined) {
      throw new Error(`Missing chunk data in writeChunk`);
    }
    const buffer = Buffer.from(chunkData, "base64");

    // Append buffer
    fs.appendFileSync(dataPath, buffer);

    const stats = fs.statSync(dataPath);
    metadata.sizeBytes = stats.size;
    metadata.chunkCount = (metadata.chunkCount || 0) + 1;
    metadata.updatedAt = Date.now();

    let computedSha256: string | undefined;

    if (params.isLastChunk) {
      // Calculate SHA256 streamingly
      const hash = crypto.createHash("sha256");
      const readStream = fs.createReadStream(dataPath);
      await new Promise<void>((resolve, reject) => {
        readStream.on("data", (chunk) => hash.update(chunk));
        readStream.on("end", () => resolve());
        readStream.on("error", (err) => reject(err));
      });
      computedSha256 = hash.digest("hex");
      if (params.expectedSha256 && computedSha256 !== params.expectedSha256) {
        metadata.status = "error";
        this.saveMetadata(metadata);
        throw new Error(
          `Checksum mismatch for artifact '${params.artifactId}': expected ${params.expectedSha256}, got ${computedSha256}`
        );
      }
      metadata.sha256 = computedSha256;
      metadata.status = "ready";
    }

    this.saveMetadata(metadata);

    return {
      artifactId: metadata.id,
      bytesWritten: buffer.length,
      totalBytesSoFar: metadata.sizeBytes,
      totalSizeBytes: metadata.sizeBytes,
      isReady: metadata.status === "ready",
      status: metadata.status,
      sha256: computedSha256 ?? metadata.sha256,
    } as any;
  }

  async readChunk(params: ArtifactReadChunkParams): Promise<ArtifactReadChunkResult> {
    const metadata = this.loadMetadata(params.artifactId);
    if (!metadata) {
      throw new Error(`Artifact '${params.artifactId}' not found`);
    }
    const dataPath = this.getDataPath(params.artifactId);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Artifact data file missing for '${params.artifactId}'`);
    }

    const totalSize = fs.statSync(dataPath).size;
    const rawOffset = params.offset ?? (params as any).offsetBytes ?? 0;
    const offset = Math.min(rawOffset, totalSize);
    const rawLength = params.length ?? (params as any).maxBytes ?? (totalSize - offset);
    const length = Math.min(rawLength, totalSize - offset);

    const fd = fs.openSync(dataPath, "r");
    const buffer = Buffer.alloc(length);
    if (length > 0) {
      fs.readSync(fd, buffer, 0, length, offset);
    }
    fs.closeSync(fd);

    const isLast = offset + length >= totalSize;

    return {
      artifactId: metadata.id,
      offset,
      length,
      bytesRead: length,
      totalSize,
      chunkBase64: buffer.toString("base64"),
      dataBase64: buffer.toString("base64"),
      isLast,
      isLastChunk: isLast,
      sha256: metadata.sha256,
    } as any;
  }

  async get(params: ArtifactGetParams): Promise<ArtifactGetResult> {
    const metadata = this.loadMetadata(params.artifactId);
    if (!metadata) {
      throw new Error(`Artifact '${params.artifactId}' not found`);
    }
    return { artifact: metadata };
  }

  async list(params: ArtifactListParams): Promise<ArtifactListResult> {
    if (!fs.existsSync(this.baseDir)) {
      return { artifacts: [], total: 0 };
    }

    const dirs = fs.readdirSync(this.baseDir);
    const list: ArtifactMetadata[] = [];

    for (const d of dirs) {
      const meta = this.loadMetadata(d);
      if (!meta || meta.status === "deleted") continue;

      if (params.projectId && meta.projectId !== params.projectId) continue;
      if (params.taskId && meta.taskId !== params.taskId) continue;
      if (params.sessionId && meta.sessionId !== params.sessionId) continue;
      if (params.tag && (!meta.tags || !meta.tags.includes(params.tag))) continue;

      list.push(meta);
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    const paginated = list.slice(0, params.limit || 50);

    return {
      artifacts: paginated,
      total: list.length,
    };
  }

  async importFile(params: ArtifactImportParams): Promise<ArtifactImportResult> {
    const rawPath = params.filePath ?? (params as any).sourcePath;
    const resolvedPath = this.resolveProjectPath(params.projectId, rawPath);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      throw new Error(`File to import does not exist: "${resolvedPath || rawPath}"`);
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      throw new Error(`Target is not a file: "${resolvedPath}"`);
    }

    const name = params.name || path.basename(resolvedPath);
    const id = `art_${crypto.randomUUID()}`;
    const now = Date.now();

    const dir = this.getArtifactDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const targetDataPath = this.getDataPath(id);

    // Stream copy and calculate hash
    const hash = crypto.createHash("sha256");
    const readStream = fs.createReadStream(resolvedPath);
    const writeStream = fs.createWriteStream(targetDataPath);

    await new Promise<void>((resolve, reject) => {
      readStream.on("data", (chunk) => hash.update(chunk));
      readStream.pipe(writeStream);
      writeStream.on("finish", () => resolve());
      writeStream.on("error", (err) => reject(err));
      readStream.on("error", (err) => reject(err));
    });

    const sha256 = hash.digest("hex");
    const metadata: ArtifactMetadata = {
      id,
      projectId: params.projectId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      name,
      mimeType: params.mimeType || "application/octet-stream",
      sizeBytes: stats.size,
      sha256,
      chunkCount: 1,
      tags: params.tags || [],
      status: "ready",
      createdAt: now,
      updatedAt: now,
    };

    this.saveMetadata(metadata);
    this.logger?.info({ artifactId: id, filePath: resolvedPath }, "Imported artifact from disk");
    return { artifact: metadata };
  }

  async exportFile(params: ArtifactExportParams): Promise<ArtifactExportResult> {
    const metadata = this.loadMetadata(params.artifactId);
    if (!metadata) {
      throw new Error(`Artifact '${params.artifactId}' not found`);
    }
    const dataPath = this.getDataPath(params.artifactId);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Artifact data file missing for '${params.artifactId}'`);
    }

    const resolvedTarget = this.resolveProjectPath((params as any).projectId, params.targetPath) || params.targetPath;

    if (fs.existsSync(resolvedTarget) && !params.overwrite) {
      throw new Error(`Target file already exists: "${resolvedTarget}" (set overwrite to true)`);
    }

    const parentDir = path.dirname(resolvedTarget);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.copyFileSync(dataPath, resolvedTarget);
    const stats = fs.statSync(resolvedTarget);

    this.logger?.info(
      { artifactId: params.artifactId, targetPath: resolvedTarget },
      "Exported artifact to disk"
    );

    return {
      artifactId: metadata.id,
      targetPath: resolvedTarget,
      sizeBytes: stats.size,
      sha256: metadata.sha256,
    };
  }

  async exportArtifact(params: {
    artifactId: string;
    projectId?: string;
    targetPath: string;
    overwrite?: boolean;
  }): Promise<{ success: boolean; bytesWritten: number; sha256?: string; targetPath: string }> {
    const res = await this.exportFile({
      artifactId: params.artifactId,
      projectId: params.projectId,
      targetPath: params.targetPath,
      overwrite: params.overwrite,
    } as any);
    return {
      success: true,
      bytesWritten: res.sizeBytes,
      sha256: res.sha256,
      targetPath: res.targetPath,
    };
  }

  async importArtifact(params: {
    projectId?: string;
    taskId?: string;
    sessionId?: string;
    sourcePath?: string;
    filePath?: string;
    name?: string;
    mimeType?: string;
    tags?: string[];
  }): Promise<ArtifactImportResult> {
    const targetFilePath = params.filePath || params.sourcePath || "";
    return this.importFile({
      projectId: params.projectId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      filePath: targetFilePath,
      name: params.name,
      mimeType: params.mimeType,
      tags: params.tags,
    });
  }

  async delete(params: ArtifactDeleteParams): Promise<ArtifactDeleteResult> {
    const dir = this.getArtifactDir(params.artifactId);
    if (!fs.existsSync(dir)) {
      return { artifactId: params.artifactId, deleted: false };
    }

    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return { artifactId: params.artifactId, deleted: true };
    } catch (err) {
      this.logger?.warn({ err, artifactId: params.artifactId }, "Error deleting artifact");
      return { artifactId: params.artifactId, deleted: false };
    }
  }

  async abort(params: ArtifactAbortParams): Promise<ArtifactAbortResult> {
    const metadata = this.loadMetadata(params.artifactId);
    if (metadata) {
      (metadata as any).status = "aborted";
      metadata.updatedAt = Date.now();
      this.saveMetadata(metadata);
    }
    const dataPath = this.getDataPath(params.artifactId);
    if (fs.existsSync(dataPath)) {
      fs.rmSync(dataPath, { force: true });
    }
    return { artifactId: params.artifactId, aborted: true };
  }
}
