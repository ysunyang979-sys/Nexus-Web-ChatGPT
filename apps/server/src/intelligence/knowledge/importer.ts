import crypto from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import type {
  KnowledgeImportResult,
  KnowledgeType,
  KnowledgeDocument,
  EnhancedMemoryScope,
  MemoryType,
  RulePriority,
  RuleScope,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import type { MemoryRuntime } from "../memory/runtime.js";
import type { GlobalRuleRegistry } from "../rules/rule-registry.js";
import type { VersionedSkillRegistry } from "../skill/versioned-registry.js";
import type { Logger } from "@localbridge/shared";

export class KnowledgeImporter {
  constructor(
    private readonly store: IntelligenceStore,
    private readonly memoryRuntime: MemoryRuntime,
    private readonly ruleRegistry: GlobalRuleRegistry,
    private readonly skillRegistry: VersionedSkillRegistry,
    private readonly logger?: Logger
  ) {}

  /**
   * Import any file (Markdown, JSON, YAML, TXT, Skill Package) with automatic classification,
   * deduplication by SHA-256, path traversal protection, and persistence.
   */
  async importFile(params: {
    filename: string;
    content: Buffer | string;
    mimeType?: string;
    explicitType?: KnowledgeType;
    source?: string;
    projectId?: string;
  }): Promise<KnowledgeImportResult> {
    const rawBuffer = Buffer.isBuffer(params.content) ? params.content : Buffer.from(params.content, "utf-8");
    const rawText = rawBuffer.toString("utf-8");
    const fileHash = crypto.createHash("sha256").update(rawBuffer).digest("hex");
    const importId = `imp_${crypto.randomUUID()}`;
    const filename = path.basename(params.filename);

    // 1. Deduplication check
    const existing = this.store.getImportByHash(fileHash);
    if (existing && existing.result === "success") {
      this.logger?.info({ fileHash, filename }, "Duplicate knowledge file import skipped");
      return {
        importId,
        fileHash,
        filename,
        mimeType: params.mimeType || "application/octet-stream",
        detectedType: existing.detectedType,
        explicitType: params.explicitType,
        source: params.source || "upload",
        result: "duplicate",
        registeredId: existing.registeredId,
        registeredCount: existing.registeredCount,
        errors: [],
        warnings: [`File '${filename}' with identical SHA-256 already imported as '${existing.registeredId}'`],
        createdAt: Date.now(),
      };
    }

    // 2. Security validation: reject executable attachments
    const ext = path.extname(filename).toLowerCase();
    const forbiddenExts = [".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".vbs", ".ps1"];
    if (forbiddenExts.includes(ext)) {
      const errRes: KnowledgeImportResult = {
        importId,
        fileHash,
        filename,
        mimeType: params.mimeType || "application/octet-stream",
        detectedType: "DOCUMENT",
        source: params.source || "upload",
        result: "failed",
        registeredCount: 0,
        errors: [`Security rejection: file extension '${ext}' is strictly forbidden`],
        warnings: [],
        createdAt: Date.now(),
      };
      this.store.recordImport(errRes);
      return errRes;
    }

    // 3. Classification Detection
    const detectedType = params.explicitType || this.detectType(filename, rawText);
    const errors: string[] = [];
    const warnings: string[] = [];
    let registeredId: string | undefined;
    let registeredCount = 0;

    try {
      switch (detectedType) {
        case "MEMORY": {
          const parsed = this.parseJsonOrYaml(rawText);
          const entries = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of entries) {
            if (!item.key && !item.content) {
              warnings.push("Skipping item missing key or content");
              continue;
            }
            const mem = this.memoryRuntime.setMemory({
              key: item.key || `import_${filename}_${registeredCount + 1}`,
              content: item.content || item.value || JSON.stringify(item),
              type: (item.type as MemoryType) || "FACT",
              scope: (item.scope as EnhancedMemoryScope) || (params.projectId ? "PROJECT" : "GLOBAL"),
              scopeId: params.projectId || item.scopeId,
              importance: typeof item.importance === "number" ? item.importance : 5,
              confidence: typeof item.confidence === "number" ? item.confidence : 1.0,
              source: "IMPORT",
              provenance: {
                source: "IMPORT",
                evidence: `Imported from file ${filename} (hash: ${fileHash.slice(0, 8)})`,
                actionIds: [],
              },
              tags: Array.isArray(item.tags) ? item.tags : [filename, "imported"],
            });
            registeredId = registeredId || mem.id;
            registeredCount++;
          }
          break;
        }

        case "RULE": {
          const parsed = this.parseJsonOrYaml(rawText);
          const rules = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of rules) {
            const rule = this.ruleRegistry.addRule({
              name: item.name || `Rule from ${filename}`,
              content: item.content || (typeof item === "string" ? item : JSON.stringify(item)),
              scope: (item.scope as RuleScope) || (params.projectId ? "PROJECT" : "USER_GLOBAL"),
              scopeId: params.projectId || item.scopeId,
              priority: (item.priority as RulePriority) || "USER_GLOBAL",
              tags: Array.isArray(item.tags) ? item.tags : ["imported"],
              provenance: {
                source: "import",
                importedFrom: filename,
              },
            });
            registeredId = registeredId || rule.ruleId;
            registeredCount++;
          }
          break;
        }

        case "SKILL": {
          const parsed = this.parseJsonOrYaml(rawText);
          const skillId = parsed.skillId || parsed.id || filename.replace(/\.(yaml|yml|json)$/i, "");
          const { skill } = this.skillRegistry.createSkillWithVersion({
            skillId,
            name: parsed.name || skillId,
            version: parsed.version || "1.0.0",
            description: parsed.description || `Imported skill from ${filename}`,
            capabilities: parsed.capabilities || [],
            steps: parsed.steps || [],
            tools: parsed.tools || [],
            parameters: parsed.parameters || {},
            preconditions: parsed.preconditions || [],
            successConditions: parsed.successConditions || [],
            errorHandling: parsed.errorHandling || {},
            dependencies: parsed.dependencies || [],
            instructions: parsed.instructions || rawText,
            source: "USER_UPLOADED",
            projectId: params.projectId,
            tags: parsed.tags || ["imported"],
          });
          registeredId = skill.skillId;
          registeredCount = 1;
          break;
        }

        case "DOCUMENT":
        default: {
          const docId = `doc_${crypto.randomUUID()}`;
          const summary = rawText.slice(0, 500).replace(/\r?\n+/g, " ");
          const doc: KnowledgeDocument = {
            documentId: docId,
            filename,
            fileHash,
            mimeType: params.mimeType || "text/plain",
            sizeBytes: rawBuffer.length,
            source: params.source || "upload",
            contentReference: undefined, // Content stored directly in document text summary or file
            textSummary: summary,
            tags: ["document", ext.replace(/^\./, "") || "txt"],
            metadata: {
              importedAt: Date.now(),
              projectId: params.projectId,
            },
            createdAt: Date.now(),
          };
          this.store.saveDocument(doc);
          registeredId = docId;
          registeredCount = 1;
          break;
        }
      }
    } catch (err: any) {
      errors.push(`Processing failed: ${err?.message || String(err)}`);
    }

    const resultStatus = errors.length > 0 ? (registeredCount > 0 ? "partial" : "failed") : "success";

    const record: KnowledgeImportResult = {
      importId,
      fileHash,
      filename,
      mimeType: params.mimeType || "text/plain",
      detectedType,
      explicitType: params.explicitType,
      source: params.source || "upload",
      result: resultStatus,
      registeredId,
      registeredCount,
      errors,
      warnings,
      createdAt: Date.now(),
    };

    this.store.recordImport(record);
    return record;
  }

  private detectType(filename: string, text: string): KnowledgeType {
    const lowerName = filename.toLowerCase();

    // Skill detection
    if (lowerName.includes("skill") && (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml") || lowerName.endsWith(".json"))) {
      return "SKILL";
    }
    if (/^\s*(?:skillId|steps|capabilities|skill\.yaml)/m.test(text)) {
      return "SKILL";
    }

    // Rule detection
    if (lowerName.includes("rule") || /^\s*(?:priority|ruleId|SYSTEM|CORE_GLOBAL|USER_GLOBAL)/m.test(text)) {
      return "RULE";
    }

    // Memory detection
    if (lowerName.includes("memory") || (text.includes('"key"') && text.includes('"content"') && text.includes('"importance"'))) {
      return "MEMORY";
    }

    return "DOCUMENT";
  }

  private parseJsonOrYaml(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return YAML.parse(text);
    }
  }

  listDocuments(filter?: { tag?: string; search?: string }): KnowledgeDocument[] {
    return this.store.listDocuments(filter);
  }

  listImports(): KnowledgeImportResult[] {
    return this.store.listImports();
  }
}
