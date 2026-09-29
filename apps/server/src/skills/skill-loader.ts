import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveRawSkillName, type SkillDefinition, type SkillSource } from "@localbridge/protocol";
import type { SkillValidator } from "./skill-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SkillLoaderOptions {
  builtinDir?: string;
  userDir?: string;
  projectDirs?: Array<{ projectId: string; rootPath: string }>;
}

export class SkillLoader {
  private readonly builtinDir: string;
  private readonly userDir: string;
  private readonly defaultProjectDirs: Array<{ projectId: string; rootPath: string }>;

  constructor(
    private readonly validator: SkillValidator,
    options: SkillLoaderOptions = {}
  ) {
    this.builtinDir =
      options.builtinDir ||
      this.resolveDefaultBuiltinDir();

    this.userDir =
      options.userDir ||
      this.resolveDefaultUserDir();

    this.defaultProjectDirs = options.projectDirs || [];
  }

  private resolveDefaultBuiltinDir(): string {
    // 1. Try environment variable
    if (process.env.NEXUS_SKILLS_DIR && fs.existsSync(process.env.NEXUS_SKILLS_DIR)) {
      return process.env.NEXUS_SKILLS_DIR;
    }

    // 2. Try app resources directory
    const candidates = [
      path.resolve(__dirname, "../skills"),
      path.resolve(__dirname, "../../resources/skills"),
      path.resolve(__dirname, "../../../resources/skills"),
      path.resolve(process.cwd(), "resources/skills"),
      path.resolve(process.cwd(), "apps/desktop/src-tauri/resources/skills"),
      path.resolve(process.cwd(), "../resources/skills"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(path.join(cand, "nexus.project-inspect", "skill.yaml"))) {
        return cand;
      }
    }

    return path.resolve(process.cwd(), "resources/skills");
  }

  private resolveDefaultUserDir(): string {
    if (process.platform === "win32" && process.env.LOCALAPPDATA) {
      return path.join(process.env.LOCALAPPDATA, "LocalBridge", "skills");
    }
    return path.join(os.homedir(), ".localbridge", "skills");
  }

  getBuiltinDir(): string {
    return this.builtinDir;
  }

  getUserDir(): string {
    return this.userDir;
  }

  loadAll(projectDirs: Array<{ projectId: string; rootPath: string }> = []): SkillDefinition[] {
    const skills: SkillDefinition[] = [];

    // 1. Load Built-in skills
    skills.push(...this.loadFromDirectory(this.builtinDir, "builtin"));

    // 2. Load User skills
    skills.push(...this.loadFromDirectory(this.userDir, "user"));

    // 3. Load Project skills
    const activeProjectDirs = projectDirs.length > 0 ? projectDirs : this.defaultProjectDirs;
    for (const proj of activeProjectDirs) {
      const projSkillDir = path.join(proj.rootPath, ".nexus", "skills");
      skills.push(...this.loadFromDirectory(projSkillDir, "project", proj.projectId));
    }

    return skills;
  }

  loadFromDirectory(
    dirPath: string,
    source: SkillSource,
    projectId?: string
  ): SkillDefinition[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const skills: SkillDefinition[] = [];
    let entries: string[] = [];

    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      return [];
    }

    for (const entry of entries) {
      const skillPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(skillPath);
        if (!stat.isDirectory()) {
          continue;
        }

        const skill = this.loadSkillFromPath(skillPath, source, projectId);
        if (skill) {
          skills.push(skill);
        }
      } catch (err: any) {
        // Individual directory access error: record as invalid skill
        skills.push({
          id: entry,
          version: "1.0.0",
          name: { "zh-CN": entry, "en-US": entry },
          description: { "zh-CN": "加载失败", "en-US": "Failed to load skill" },
          category: "general",
          risk: "medium",
          triggers: [],
          tools: [],
          workflow: [],
          enabled: false,
          source,
          sourcePath: skillPath,
          projectId,
          instructions: "",
          validationStatus: "invalid",
          validationErrors: [err?.message || String(err)],
        });
      }
    }

    return skills;
  }

  loadSkillFromPath(
    skillDir: string,
    source: SkillSource,
    projectId?: string
  ): SkillDefinition | null {
    const yamlPath = path.join(skillDir, "skill.yaml");
    const ymlPath = path.join(skillDir, "skill.yml");
    const activeYamlPath = fs.existsSync(yamlPath)
      ? yamlPath
      : fs.existsSync(ymlPath)
      ? ymlPath
      : null;
    const mdPath = path.join(skillDir, "SKILL.md");

    const dirName = path.basename(skillDir);

    if (!activeYamlPath) {
      return this.loadRawSkillFromPath(skillDir, source, projectId);
    }

    let parsedYaml: any = null;
    let yamlErrors: string[] = [];
    let markdownContent = "";

    try {
      const rawYaml = fs.readFileSync(activeYamlPath, "utf-8");
      parsedYaml = YAML.parse(rawYaml);
    } catch (err: any) {
      yamlErrors.push(`Failed to parse skill.yaml: ${err?.message || String(err)}`);
    }

    if (fs.existsSync(mdPath)) {
      try {
        markdownContent = fs.readFileSync(mdPath, "utf-8");
      } catch (err: any) {
        yamlErrors.push(`Failed to read SKILL.md: ${err?.message || String(err)}`);
      }
    } else if (parsedYaml) {
      // Auto-heal missing SKILL.md from skill.yaml if available
      try {
        const title = parsedYaml?.name?.["zh-CN"] || parsedYaml?.name?.["en-US"] || parsedYaml?.name || dirName;
        const desc = parsedYaml?.description?.["zh-CN"] || parsedYaml?.description?.["en-US"] || parsedYaml?.description || "";
        const wf = Array.isArray(parsedYaml?.workflow)
          ? parsedYaml.workflow.map((w: string) => `- ${w}`).join("\n")
          : "";
        const autoMd = `# ${title}\n\n${desc}\n\n## 流程规范 (Workflow)\n${wf}\n`;
        fs.writeFileSync(mdPath, autoMd, "utf-8");
        markdownContent = autoMd;
      } catch {
        yamlErrors.push("Missing SKILL.md instructions file");
      }
    } else {
      yamlErrors.push("Missing SKILL.md instructions file");
    }

    // Run validator
    const validation = this.validator.validate(skillDir, parsedYaml, markdownContent, {
      isBuiltin: source === "builtin",
    });
    const combinedErrors = [...yamlErrors, ...validation.errors];

    const finalStatus = combinedErrors.length > 0 ? "invalid" : validation.status;

    return {
      id: parsedYaml?.id || dirName,
      version: parsedYaml?.version || "1.0.0",
      name: parsedYaml?.name || { "zh-CN": dirName, "en-US": dirName },
      description: parsedYaml?.description || { "zh-CN": "", "en-US": "" },
      category: parsedYaml?.category || "general",
      risk: parsedYaml?.risk || "medium",
      triggers: Array.isArray(parsedYaml?.triggers) ? parsedYaml.triggers : [],
      tools: Array.isArray(parsedYaml?.tools) ? parsedYaml.tools : [],
      workflow: Array.isArray(parsedYaml?.workflow) ? parsedYaml.workflow : [],
      enabled: parsedYaml?.enabled ?? (finalStatus === "valid" || finalStatus === "warning"),
      source,
      sourcePath: skillDir,
      projectId,
      instructions: markdownContent,
      validationStatus: finalStatus,
      validationErrors: combinedErrors.length > 0 ? combinedErrors : undefined,
      securityWarning: validation.securityWarning,
      type: "nexus",
      primaryDocument: "SKILL.md",
      collectionId: parsedYaml?.collectionId,
      collectionName: parsedYaml?.collectionName,
      summary: parsedYaml?.summary || (typeof parsedYaml?.description === "string" ? parsedYaml.description : parsedYaml?.description?.["zh-CN"] || parsedYaml?.description?.["en-US"] || ""),
      keywords: parsedYaml?.keywords || (Array.isArray(parsedYaml?.triggers) ? parsedYaml.triggers : []),
    };
  }

  loadRawSkillFromPath(
    skillDir: string,
    source: SkillSource,
    projectId?: string
  ): SkillDefinition | null {
    const rawJsonPath = path.join(skillDir, "raw-skill.json");
    let rawMeta: any = null;
    if (fs.existsSync(rawJsonPath)) {
      try {
        rawMeta = JSON.parse(fs.readFileSync(rawJsonPath, "utf-8"));
      } catch {}
    }

    const dirName = path.basename(skillDir);
    const skillId = rawMeta?.id || (dirName.startsWith("user.") ? dirName : `user.${dirName}`);

    // Discover documents in skillDir
    const docFiles: string[] = [];
    let primaryDoc = rawMeta?.primaryDocument;
    let markdownContent = "";
    let skillMdContent = "";
    let readmeContent = "";

    try {
      const scanDocs = (dir: string, relPrefix = "") => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (["references", "docs", "doc", "examples", "agents", "skills"].includes(entry.name.toLowerCase())) {
              scanDocs(path.join(dir, entry.name), relPath);
            }
          } else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
            docFiles.push(relPath);
            if (entry.name.toLowerCase() === "skill.md") {
              try {
                skillMdContent = fs.readFileSync(path.join(dir, entry.name), "utf-8");
              } catch {}
            } else if (entry.name.toLowerCase() === "readme.md") {
              try {
                readmeContent = fs.readFileSync(path.join(dir, entry.name), "utf-8");
              } catch {}
            }
          }
        }
      };
      scanDocs(skillDir);
    } catch {}

    if (!primaryDoc) {
      if (docFiles.some((f) => f.toLowerCase() === "skill.md")) {
        primaryDoc = docFiles.find((f) => f.toLowerCase() === "skill.md")!;
      } else if (docFiles.some((f) => f.toLowerCase() === "readme.md")) {
        primaryDoc = docFiles.find((f) => f.toLowerCase() === "readme.md")!;
      } else if (docFiles.length > 0) {
        primaryDoc = docFiles[0];
      }
    }

    if (primaryDoc) {
      const fullDocPath = path.join(skillDir, primaryDoc);
      if (fs.existsSync(fullDocPath)) {
        try {
          markdownContent = fs.readFileSync(fullDocPath, "utf-8");
        } catch {}
      }
    }

    if (!primaryDoc && !markdownContent && docFiles.length === 0) {
      return null;
    }

    // Determine Title / Name
    let skillName = rawMeta?.name;
    if (!skillName) {
      const titleFromDoc = resolveRawSkillName({
        skillMdContent,
        readmeContent,
        folderName: dirName.replace(/^user\./, ""),
      });
      skillName = titleFromDoc || dirName.replace(/^user\./, "");
    }
    const nameObj = typeof skillName === "string" ? { "zh-CN": skillName, "en-US": skillName } : skillName;

    const validation = this.validator.validateRaw(skillDir, {
      id: skillId,
      name: nameObj,
      markdownContent,
    }, { isBuiltin: source === "builtin" });

    // Build keywords/triggers for matching
    const baseSlug = skillId.replace(/^user\./, "");
    const triggers = Array.from(new Set([
      skillId,
      baseSlug,
      baseSlug.replace(/[-_]/g, " "),
      typeof skillName === "string" ? skillName : skillName["zh-CN"],
      typeof skillName === "string" ? skillName : skillName["en-US"],
    ].filter(Boolean)));

    // Extract summary and keywords
    const leadSummary =
      rawMeta?.summary ||
      (typeof rawMeta?.description === "string"
        ? rawMeta.description
        : rawMeta?.description?.["zh-CN"] || rawMeta?.description?.["en-US"]) ||
      (markdownContent ? markdownContent.slice(0, 160).replace(/[#*`\n]/g, " ").trim() : "");

    const keywords = Array.from(new Set([
      ...(Array.isArray(rawMeta?.keywords) ? rawMeta.keywords : []),
      ...triggers,
    ]));

    const enabled =
      rawMeta?.enabled !== undefined
        ? Boolean(rawMeta.enabled)
        : validation.status !== "invalid";

    return {
      id: skillId,
      version: rawMeta?.version || "1.0.0",
      name: nameObj,
      description: {
        "zh-CN": typeof rawMeta?.description === "string" ? rawMeta.description : rawMeta?.description?.["zh-CN"] || leadSummary,
        "en-US": typeof rawMeta?.description === "string" ? rawMeta.description : rawMeta?.description?.["en-US"] || leadSummary,
      },
      category: "general",
      risk: "low",
      triggers,
      tools: [],
      workflow: [],
      enabled,
      source,
      sourcePath: skillDir,
      projectId,
      instructions: markdownContent,
      validationStatus: validation.status,
      validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
      securityWarning: validation.securityWarning,
      type: "raw",
      collectionId: rawMeta?.collectionId,
      collectionName: rawMeta?.collectionName,
      summary: leadSummary,
      keywords,
      primaryDocument: primaryDoc,
      availableDocuments: docFiles,
      documents: docFiles,
      importedAt: rawMeta?.importedAt || new Date().toISOString(),
      filesCount: docFiles.length,
    };
  }
}
