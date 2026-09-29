import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import type {
  EnhancedMemoryEntry,
  MemoryCandidate,
  KnowledgeDocument,
  KnowledgeImportResult,
  VersionedSkillRecord,
  SkillVersion,
  AiSkillCandidate,
  ContextSnapshot,
  ContextCompactionState,
  IntelligenceStorageStats,
  IntelligenceStorageScanResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export interface StorageManifest {
  version: string;
  schema: string;
  createdAt: number;
  lastWriteAt: number;
  totalItems: number;
  domainCounts: {
    memory: number;
    knowledge: number;
    skills: number;
    context: number;
    candidates: number;
    rules: number;
  };
}

export class LocalStorageEngine {
  private rootDir: string;
  private memoryDb?: Database.Database;
  private knowledgeDb?: Database.Database;
  private skillsDb?: Database.Database;
  private contextDb?: Database.Database;
  private manifest: StorageManifest;
  private initialized = false;
  private cachedSizeBytes = 0;

  constructor(
    customRootDir?: string,
    private readonly logger?: Logger
  ) {
    this.rootDir = customRootDir
      ? path.resolve(customRootDir)
      : path.join(os.homedir(), ".nexus", "intelligence-data");

    this.manifest = {
      version: "1.0.0",
      schema: "nexus-intelligence-v1",
      createdAt: Date.now(),
      lastWriteAt: Date.now(),
      totalItems: 0,
      domainCounts: {
        memory: 0,
        knowledge: 0,
        skills: 0,
        context: 0,
        candidates: 0,
        rules: 0,
      },
    };
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Initializes the standard directory layout, WAL, manifest, and domain index SQLite DBs.
   */
  public initialize(): void {
    if (this.initialized) return;

    // 1. Create standard folder structure
    const dirs = [
      this.rootDir,
      // Memory
      path.join(this.rootDir, "memory"),
      path.join(this.rootDir, "memory", "candidates"),
      path.join(this.rootDir, "memory", "archive"),
      // Knowledge
      path.join(this.rootDir, "knowledge"),
      path.join(this.rootDir, "knowledge", "documents"),
      path.join(this.rootDir, "knowledge", "attachments"),
      path.join(this.rootDir, "knowledge", "archive"),
      path.join(this.rootDir, "knowledge", "metadata"),
      // Skills
      path.join(this.rootDir, "skills"),
      path.join(this.rootDir, "skills", "registry"),
      path.join(this.rootDir, "skills", "candidates"),
      path.join(this.rootDir, "skills", "versions"),
      path.join(this.rootDir, "skills", "executions"),
      path.join(this.rootDir, "skills", "archive"),
      // Context
      path.join(this.rootDir, "context"),
      path.join(this.rootDir, "context", "snapshots"),
      path.join(this.rootDir, "context", "sessions"),
      path.join(this.rootDir, "context", "archive"),
      // System
      path.join(this.rootDir, "system"),
      // WAL
      path.join(this.rootDir, "wal"),
      path.join(this.rootDir, "wal", "memory"),
      path.join(this.rootDir, "wal", "knowledge"),
      path.join(this.rootDir, "wal", "skills"),
      path.join(this.rootDir, "wal", "context"),
    ];

    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }

    // 2. System files
    const schemaFile = path.join(this.rootDir, "system", "schema-version.json");
    if (!fs.existsSync(schemaFile)) {
      fs.writeFileSync(
        schemaFile,
        JSON.stringify(
          {
            version: "1.0.0",
            schema: "nexus-intelligence-v1",
            supportedDomains: ["memory", "knowledge", "skills", "context", "rules"],
            updatedAt: Date.now(),
          },
          null,
          2
        ),
        "utf8"
      );
    }

    const storageFile = path.join(this.rootDir, "system", "storage.json");
    if (!fs.existsSync(storageFile)) {
      fs.writeFileSync(
        storageFile,
        JSON.stringify(
          {
            rootDir: this.rootDir,
            status: "HEALTHY",
            initializedAt: Date.now(),
            lastSyncAt: Date.now(),
          },
          null,
          2
        ),
        "utf8"
      );
    }

    const manifestFile = path.join(this.rootDir, "system", "manifest.json");
    if (fs.existsSync(manifestFile)) {
      try {
        const raw = fs.readFileSync(manifestFile, "utf8");
        this.manifest = JSON.parse(raw);
      } catch {
        this.saveManifest();
      }
    } else {
      this.saveManifest();
    }

    // 3. Domain index.db SQLite databases
    this.initDomainDatabases();

    this.initialized = true;
    this.logger?.info?.({ rootDir: this.rootDir }, "LocalStorageEngine initialized successfully");
  }

  private initDomainDatabases(): void {
    // Memory Index DB
    const memDbPath = path.join(this.rootDir, "memory", "index.db");
    this.memoryDb = new Database(memDbPath);
    this.memoryDb.pragma("journal_mode = WAL");
    this.memoryDb.exec(`
      CREATE TABLE IF NOT EXISTS memory_index (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        scope_id TEXT,
        status TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line_number INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mem_key ON memory_index(key);
      CREATE INDEX IF NOT EXISTS idx_mem_status ON memory_index(status);
    `);

    // Knowledge Index DB
    const knowDbPath = path.join(this.rootDir, "knowledge", "index.db");
    this.knowledgeDb = new Database(knowDbPath);
    this.knowledgeDb.pragma("journal_mode = WAL");
    this.knowledgeDb.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_index (
        document_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        source TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_know_hash ON knowledge_index(file_hash);
    `);

    // Skills Index DB
    const skillsDbPath = path.join(this.rootDir, "skills", "index.db");
    this.skillsDb = new Database(skillsDbPath);
    this.skillsDb.pragma("journal_mode = WAL");
    this.skillsDb.exec(`
      CREATE TABLE IF NOT EXISTS skills_index (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        active_version TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        versions_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skill_versions_index (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(skill_id, version)
      );
    `);

    // Context Index DB
    const ctxDbPath = path.join(this.rootDir, "context", "index.db");
    this.contextDb = new Database(ctxDbPath);
    this.contextDb.pragma("journal_mode = WAL");
    this.contextDb.exec(`
      CREATE TABLE IF NOT EXISTS context_index (
        context_id TEXT PRIMARY KEY,
        task_id TEXT,
        session_id TEXT,
        goal TEXT,
        token_estimate INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ctx_task ON context_index(task_id);
    `);
  }

  private saveManifest(): void {
    const manifestFile = path.join(this.rootDir, "system", "manifest.json");
    this.manifest.lastWriteAt = Date.now();
    this.manifest.totalItems =
      this.manifest.domainCounts.memory +
      this.manifest.domainCounts.knowledge +
      this.manifest.domainCounts.skills +
      this.manifest.domainCounts.context +
      this.manifest.domainCounts.candidates;
    try {
      fs.writeFileSync(manifestFile, JSON.stringify(this.manifest, null, 2), "utf8");
    } catch (err) {
      this.logger?.warn?.({ err }, "Failed to write storage manifest.json");
    }
  }

  // ==========================================================================
  // WAL helper
  // ==========================================================================

  private appendWal(domain: "memory" | "knowledge" | "skills" | "context", action: string, data: any): void {
    const walDir = path.join(this.rootDir, "wal", domain);
    if (!fs.existsSync(walDir)) fs.mkdirSync(walDir, { recursive: true });
    const walFile = path.join(walDir, "wal.log");
    const entry = JSON.stringify({ action, timestamp: Date.now(), data }) + "\n";
    fs.appendFileSync(walFile, entry, "utf8");
  }

  // ==========================================================================
  // Memory Partitioning & Storage
  // ==========================================================================

  private getPartitionDir(domain: string, timestamp: number): string {
    const date = new Date(timestamp);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const p = path.join(this.rootDir, domain, year, month);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
    return p;
  }

  private getPartitionFile(domain: string, timestamp: number, prefix: string, maxBytes = 2 * 1024 * 1024): string {
    const dir = this.getPartitionDir(domain, timestamp);
    // Find current file or create new
    let seq = 1;
    while (true) {
      const fileName = `${prefix}-${String(seq).padStart(3, "0")}.jsonl`;
      const fullPath = path.join(dir, fileName);
      if (!fs.existsSync(fullPath)) {
        return fullPath;
      }
      const stat = fs.statSync(fullPath);
      if (stat.size < maxBytes) {
        return fullPath;
      }
      seq++;
    }
  }

  public writeMemory(entry: EnhancedMemoryEntry): string {
    this.initialize();
    this.appendWal("memory", "write", { id: entry.id, key: entry.key });

    const targetFile = this.getPartitionFile("memory", entry.createdAt || Date.now(), "memories");
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(targetFile, line, "utf8");

    // Update domain index.db
    if (this.memoryDb) {
      try {
        this.memoryDb
          .prepare(`
            INSERT INTO memory_index (
              id, key, content, type, scope, scope_id, status, tags_json, file_path, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              content = excluded.content,
              status = excluded.status,
              tags_json = excluded.tags_json,
              updated_at = excluded.updated_at
          `)
          .run(
            entry.id,
            entry.key,
            entry.content,
            entry.type,
            entry.scope,
            entry.scopeId || null,
            entry.status || "ACTIVE",
            JSON.stringify(entry.tags || []),
            targetFile,
            entry.createdAt || Date.now(),
            entry.updatedAt || Date.now()
          );
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to update memory index.db");
      }
    }

    this.manifest.domainCounts.memory++;
    this.saveManifest();
    return targetFile;
  }

  public writeMemoryCandidate(candidate: MemoryCandidate): void {
    this.initialize();
    this.appendWal("memory", "candidate", { id: candidate.candidateId });
    const candDir = path.join(this.rootDir, "memory", "candidates");
    const candFile = path.join(candDir, "candidates.jsonl");
    fs.appendFileSync(candFile, JSON.stringify(candidate) + "\n", "utf8");
    this.manifest.domainCounts.candidates++;
    this.saveManifest();
  }

  public deleteMemory(id: string): boolean {
    this.initialize();
    this.appendWal("memory", "delete", { id });

    // 1. Write deletion tombstone to archive
    const archiveDir = path.join(this.rootDir, "memory", "archive");
    const tombstoneFile = path.join(archiveDir, "deleted-memories.jsonl");
    fs.appendFileSync(tombstoneFile, JSON.stringify({ id, deletedAt: Date.now() }) + "\n", "utf8");

    // 2. Remove or mark DELETED in domain index
    if (this.memoryDb) {
      this.memoryDb.prepare(`DELETE FROM memory_index WHERE id = ?`).run(id);
    }

    if (this.manifest.domainCounts.memory > 0) {
      this.manifest.domainCounts.memory--;
    }
    this.saveManifest();
    return true;
  }

  public archiveMemory(id: string): boolean {
    this.initialize();
    this.appendWal("memory", "archive", { id });

    const archiveDir = path.join(this.rootDir, "memory", "archive");
    const archiveFile = path.join(archiveDir, "archived-memories.jsonl");
    fs.appendFileSync(archiveFile, JSON.stringify({ id, archivedAt: Date.now() }) + "\n", "utf8");

    if (this.memoryDb) {
      this.memoryDb.prepare(`UPDATE memory_index SET status = 'ARCHIVED' WHERE id = ?`).run(id);
    }
    this.saveManifest();
    return true;
  }

  // ==========================================================================
  // Knowledge Partitioning & Storage
  // ==========================================================================

  public writeDocument(doc: KnowledgeDocument): string {
    this.initialize();
    this.appendWal("knowledge", "write", { id: doc.documentId, filename: doc.filename });

    const targetFile = this.getPartitionFile(
      path.join("knowledge", "documents"),
      doc.createdAt || Date.now(),
      "documents"
    );
    fs.appendFileSync(targetFile, JSON.stringify(doc) + "\n", "utf8");

    if (this.knowledgeDb) {
      try {
        this.knowledgeDb
          .prepare(`
            INSERT INTO knowledge_index (
              document_id, filename, file_hash, mime_type, size_bytes, source, file_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(document_id) DO UPDATE SET
              filename = excluded.filename,
              size_bytes = excluded.size_bytes
          `)
          .run(
            doc.documentId,
            doc.filename,
            doc.fileHash,
            doc.mimeType,
            doc.sizeBytes,
            doc.source || "upload",
            targetFile,
            doc.createdAt || Date.now()
          );
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to update knowledge index.db");
      }
    }

    this.manifest.domainCounts.knowledge++;
    this.saveManifest();
    return targetFile;
  }

  public writeImport(res: KnowledgeImportResult): void {
    this.initialize();
    const metaDir = path.join(this.rootDir, "knowledge", "metadata");
    const importFile = path.join(metaDir, "imports.jsonl");
    fs.appendFileSync(importFile, JSON.stringify(res) + "\n", "utf8");
    this.saveManifest();
  }

  public deleteDocument(documentId: string): boolean {
    this.initialize();
    this.appendWal("knowledge", "delete", { documentId });

    const archiveDir = path.join(this.rootDir, "knowledge", "archive");
    const tombstoneFile = path.join(archiveDir, "deleted-documents.jsonl");
    fs.appendFileSync(tombstoneFile, JSON.stringify({ documentId, deletedAt: Date.now() }) + "\n", "utf8");

    if (this.knowledgeDb) {
      this.knowledgeDb.prepare(`DELETE FROM knowledge_index WHERE document_id = ?`).run(documentId);
    }

    if (this.manifest.domainCounts.knowledge > 0) {
      this.manifest.domainCounts.knowledge--;
    }
    this.saveManifest();
    return true;
  }

  // ==========================================================================
  // Skills Partitioning & Storage
  // ==========================================================================

  public writeSkill(skill: Omit<VersionedSkillRecord, "versions">): void {
    this.initialize();
    this.appendWal("skills", "write_skill", { skillId: skill.skillId, name: skill.name });

    const registryFile = path.join(this.rootDir, "skills", "registry", "skills.jsonl");
    fs.appendFileSync(registryFile, JSON.stringify(skill) + "\n", "utf8");

    if (this.skillsDb) {
      try {
        this.skillsDb
          .prepare(`
            INSERT INTO skills_index (
              id, name, active_version, source, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              active_version = excluded.active_version,
              status = excluded.status,
              updated_at = excluded.updated_at
          `)
          .run(
            skill.skillId,
            skill.name,
            skill.activeVersion,
            skill.source,
            skill.status,
            skill.createdAt || Date.now(),
            skill.updatedAt || Date.now()
          );
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to update skills index.db");
      }
    }

    this.manifest.domainCounts.skills++;
    this.saveManifest();
  }

  public writeSkillVersion(version: SkillVersion): string {
    this.initialize();
    this.appendWal("skills", "write_version", { skillId: version.skillId, version: version.version });

    const skillVerDir = path.join(this.rootDir, "skills", "versions", version.skillId);
    if (!fs.existsSync(skillVerDir)) {
      fs.mkdirSync(skillVerDir, { recursive: true });
    }

    const versionFile = path.join(skillVerDir, `${version.version}.json`);
    const tempFile = `${versionFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(version, null, 2), "utf8");
    fs.renameSync(tempFile, versionFile);

    if (this.skillsDb) {
      try {
        const id = `${version.skillId}::${version.version}`;
        this.skillsDb
          .prepare(`
            INSERT INTO skill_versions_index (
              id, skill_id, version, name, file_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(skill_id, version) DO UPDATE SET
              name = excluded.name,
              file_path = excluded.file_path
          `)
          .run(
            id,
            version.skillId,
            version.version,
            version.name,
            versionFile,
            version.createdAt || Date.now()
          );
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to update skill_versions_index in skills index.db");
      }
    }

    this.saveManifest();
    return versionFile;
  }

  public writeSkillCandidate(candidate: AiSkillCandidate): void {
    this.initialize();
    this.appendWal("skills", "candidate", { candidateId: candidate.candidateId });

    const candFile = path.join(this.rootDir, "skills", "candidates", "candidates.jsonl");
    fs.appendFileSync(candFile, JSON.stringify(candidate) + "\n", "utf8");
    this.manifest.domainCounts.candidates++;
    this.saveManifest();
  }

  public deleteSkillCandidate(candidateId: string): boolean {
    this.initialize();
    this.appendWal("skills", "delete_candidate", { candidateId });
    if (this.manifest.domainCounts.candidates > 0) {
      this.manifest.domainCounts.candidates--;
    }
    this.saveManifest();
    return true;
  }

  public deleteSkill(skillId: string): boolean {
    this.initialize();
    this.appendWal("skills", "delete_skill", { skillId });

    // Move skill versions to archive
    const skillVerDir = path.join(this.rootDir, "skills", "versions", skillId);
    const archiveDir = path.join(this.rootDir, "skills", "archive", skillId);
    if (fs.existsSync(skillVerDir)) {
      if (!fs.existsSync(path.dirname(archiveDir))) {
        fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
      }
      try {
        fs.cpSync(skillVerDir, archiveDir, { recursive: true });
        fs.rmSync(skillVerDir, { recursive: true, force: true });
      } catch {}
    }

    if (this.skillsDb) {
      this.skillsDb.prepare(`DELETE FROM skills_index WHERE id = ?`).run(skillId);
      this.skillsDb.prepare(`DELETE FROM skill_versions_index WHERE skill_id = ?`).run(skillId);
    }

    if (this.manifest.domainCounts.skills > 0) {
      this.manifest.domainCounts.skills--;
    }
    this.saveManifest();
    return true;
  }

  // ==========================================================================
  // Context Partitioning & Storage
  // ==========================================================================

  public writeContextSnapshot(snapshot: ContextSnapshot): string {
    this.initialize();
    this.appendWal("context", "snapshot", { contextId: snapshot.contextId, goal: snapshot.goal });

    const targetFile = this.getPartitionFile(
      path.join("context", "snapshots"),
      snapshot.createdAt || Date.now(),
      "snapshots"
    );
    fs.appendFileSync(targetFile, JSON.stringify(snapshot) + "\n", "utf8");

    if (this.contextDb) {
      try {
        this.contextDb
          .prepare(`
            INSERT INTO context_index (
              context_id, task_id, session_id, goal, token_estimate, file_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(context_id) DO UPDATE SET
              token_estimate = excluded.token_estimate
          `)
          .run(
            snapshot.contextId,
            snapshot.taskId || null,
            snapshot.sessionId || null,
            snapshot.goal || null,
            snapshot.tokenEstimate || 0,
            targetFile,
            snapshot.createdAt || Date.now()
          );
      } catch (err) {
        this.logger?.warn?.({ err }, "Failed to update context index.db");
      }
    }

    this.manifest.domainCounts.context++;
    this.saveManifest();
    return targetFile;
  }

  public deleteContextSnapshot(contextId: string): boolean {
    this.initialize();
    this.appendWal("context", "delete", { contextId });

    const archiveDir = path.join(this.rootDir, "context", "archive");
    const tombstoneFile = path.join(archiveDir, "deleted-snapshots.jsonl");
    fs.appendFileSync(tombstoneFile, JSON.stringify({ contextId, deletedAt: Date.now() }) + "\n", "utf8");

    if (this.contextDb) {
      this.contextDb.prepare(`DELETE FROM context_index WHERE context_id = ?`).run(contextId);
    }

    if (this.manifest.domainCounts.context > 0) {
      this.manifest.domainCounts.context--;
    }
    this.saveManifest();
    return true;
  }

  public writeCompaction(compaction: ContextCompactionState, contextId: string): void {
    this.initialize();
    const compFile = path.join(this.rootDir, "context", "snapshots", "compactions.jsonl");
    fs.appendFileSync(compFile, JSON.stringify({ contextId, compaction }) + "\n", "utf8");
    this.saveManifest();
  }

  // ==========================================================================
  // Storage Stats, Scan & Integrity Verification
  // ==========================================================================

  public getStats(): IntelligenceStorageStats {
    this.initialize();

    let totalBytes = this.cachedSizeBytes;
    if (totalBytes === 0) {
      // Lightweight calculation only if not yet cached
      try {
        const calculateDirSize = (dir: string) => {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              calculateDirSize(full);
            } else if (ent.isFile()) {
              try {
                totalBytes += fs.statSync(full).size;
              } catch {}
            }
          }
        };
        calculateDirSize(this.rootDir);
        this.cachedSizeBytes = totalBytes;
      } catch {}
    }

    // Format size
    let sizeFormatted = `${totalBytes} B`;
    if (totalBytes >= 1024 * 1024 * 1024) {
      sizeFormatted = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (totalBytes >= 1024 * 1024) {
      sizeFormatted = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (totalBytes >= 1024) {
      sizeFormatted = `${(totalBytes / 1024).toFixed(2)} KB`;
    }

    return {
      rootDir: this.rootDir,
      status: "HEALTHY",
      totalItems:
        this.manifest.domainCounts.memory +
        this.manifest.domainCounts.knowledge +
        this.manifest.domainCounts.skills +
        this.manifest.domainCounts.context +
        this.manifest.domainCounts.candidates,
      sizeBytes: totalBytes,
      sizeFormatted,
      lastWriteTime: this.manifest.lastWriteAt,
      counts: {
        memory: this.manifest.domainCounts.memory,
        knowledge: this.manifest.domainCounts.knowledge,
        skills: this.manifest.domainCounts.skills,
        context: this.manifest.domainCounts.context,
        candidates: this.manifest.domainCounts.candidates,
        rules: this.manifest.domainCounts.rules,
      },
      domainCounts: {
        memory: this.manifest.domainCounts.memory,
        knowledge: this.manifest.domainCounts.knowledge,
        skills: this.manifest.domainCounts.skills,
        context: this.manifest.domainCounts.context,
        candidates: this.manifest.domainCounts.candidates,
        rules: this.manifest.domainCounts.rules,
      },
      directories: {
        memory: path.join(this.rootDir, "memory"),
        knowledge: path.join(this.rootDir, "knowledge"),
        skills: path.join(this.rootDir, "skills"),
        context: path.join(this.rootDir, "context"),
        system: path.join(this.rootDir, "system"),
        wal: path.join(this.rootDir, "wal"),
      },
    };
  }

  public scan(): IntelligenceStorageScanResult {
    return this.scanStorage();
  }

  public scanStorage(): IntelligenceStorageScanResult {
    this.initialize();
    let scannedFiles = 0;
    let repaired = 0;
    let validItems = 0;
    let tombstones = 0;
    const errors: string[] = [];
    const corruptedFiles: string[] = [];

    const scanDirectory = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of list) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanDirectory(full);
        } else if (item.isFile()) {
          scannedFiles++;
          if (full.includes(path.sep + "archive" + path.sep)) {
            tombstones++;
          }
          if (item.name.endsWith(".jsonl") || item.name.endsWith(".json")) {
            try {
              const content = fs.readFileSync(full, "utf8");
              if (item.name.endsWith(".json")) {
                JSON.parse(content);
                validItems++;
              } else {
                const lines = content.split("\n").filter((l) => l.trim().length > 0);
                for (const line of lines) {
                  JSON.parse(line);
                  validItems++;
                }
              }
            } catch (err: any) {
              errors.push(`Malformed file ${full}: ${err.message}`);
              corruptedFiles.push(full);
              repaired++;
            }
          }
        }
      }
    };

    scanDirectory(this.rootDir);

    return {
      valid: corruptedFiles.length === 0,
      scannedFilesCount: scannedFiles,
      repairedCount: repaired,
      validItems,
      tombstones,
      corruptedFiles,
      errors,
      lastScanTime: Date.now(),
    };
  }

  /**
   * Migrate current intelligence storage to a new root directory
   */
  public async migrateTo(newRootDir: string): Promise<{ success: boolean; targetDir: string; migratedFiles: number }> {
    const target = path.resolve(newRootDir);
    if (target === this.rootDir) {
      return { success: true, targetDir: target, migratedFiles: 0 };
    }

    // 1. Close open SQLite connections
    this.closeDatabases();

    // 2. Ensure target exists
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    // 3. Copy recursive
    fs.cpSync(this.rootDir, target, { recursive: true });

    // Count migrated files
    let count = 0;
    const countFiles = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          countFiles(full);
        } else if (ent.isFile()) {
          count++;
        }
      }
    };
    countFiles(target);

    // 4. Update storage.json in new location
    const storageFile = path.join(target, "system", "storage.json");
    fs.writeFileSync(
      storageFile,
      JSON.stringify(
        {
          rootDir: target,
          previousRootDir: this.rootDir,
          migratedAt: Date.now(),
          status: "HEALTHY",
        },
        null,
        2
      ),
      "utf8"
    );

    // 5. Switch active root dir
    this.rootDir = target;
    this.initialized = false;
    this.initialize();

    return { success: true, targetDir: target, migratedFiles: count };
  }

  /**
   * Create backup folder with complete timestamped intelligence snapshot
   */
  public async backupTo(backupDir?: string): Promise<{ backupPath: string; sizeBytes: number }> {
    this.initialize();
    const destParent = backupDir
      ? path.resolve(backupDir)
      : path.join(this.rootDir, "backups");
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFolder = path.join(destParent, `nexus-backup-${timestamp}`);
    fs.mkdirSync(backupFolder, { recursive: true });

    // Copy memory, knowledge, skills, context, system
    const domains = ["memory", "knowledge", "skills", "context", "system"];
    for (const d of domains) {
      const src = path.join(this.rootDir, d);
      const dst = path.join(backupFolder, d);
      if (fs.existsSync(src)) {
        fs.cpSync(src, dst, { recursive: true });
      }
    }

    let sizeBytes = 0;
    const calc = (d: string) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, ent.name);
        if (ent.isDirectory()) calc(f);
        else sizeBytes += fs.statSync(f).size;
      }
    };
    calc(backupFolder);

    return { backupPath: backupFolder, sizeBytes };
  }

  /**
   * Restore storage from backup directory
   */
  public async restoreFrom(backupPath: string): Promise<boolean> {
    const src = path.resolve(backupPath);
    if (!fs.existsSync(src)) {
      throw new Error(`Backup directory not found: ${src}`);
    }

    this.closeDatabases();

    const domains = ["memory", "knowledge", "skills", "context", "system"];
    for (const d of domains) {
      const srcDomain = path.join(src, d);
      const targetDomain = path.join(this.rootDir, d);
      if (fs.existsSync(srcDomain)) {
        if (fs.existsSync(targetDomain)) {
          fs.rmSync(targetDomain, { recursive: true, force: true });
        }
        fs.cpSync(srcDomain, targetDomain, { recursive: true });
      }
    }

    this.initialized = false;
    this.initialize();
    return true;
  }

  public closeDatabases(): void {
    try {
      this.memoryDb?.close();
      this.knowledgeDb?.close();
      this.skillsDb?.close();
      this.contextDb?.close();
    } catch {}
    this.memoryDb = undefined;
    this.knowledgeDb = undefined;
    this.skillsDb = undefined;
    this.contextDb = undefined;
  }
}
