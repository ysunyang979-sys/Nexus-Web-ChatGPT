import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import YAML from "yaml";
import {
  type SkillImportPreview,
  type SkillImportResult,
  type SkillBatchImportParams,
  type SkillBatchImportResult,
  type SkillMetadata,
  type SkillDeleteResult,
  type SkillRawContentResult,
  type SkillCategory,
  type SkillRisk,
  type SkillValidationStatus,
  type SkillCandidate,
  evaluateCandidateQuality,
  resolveRawSkillName,
} from "@localbridge/protocol";
import type { SkillValidator } from "./skill-validator.js";
import type { SkillLoader } from "./skill-loader.js";
import type { SkillRegistry } from "./skill-registry.js";
import { parseZip, type ZipEntry } from "./zip-util.js";

const EXECUTABLE_FILE_REGEX =
  /\.(sh|bash|zsh|ps1|bat|cmd|exe|com|msi|vbs|vbe|js|mjs|cjs|py|rb|pl|dll|node|jar|bin|app|so|dylib)$/i;

export interface SkillImporterOptions {
  validator: SkillValidator;
  loader: SkillLoader;
  registry: SkillRegistry;
  validMcpTools?: ReadonlySet<string>;
}

function slugify(str: string): string {
  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return slug.slice(0, 50) || "custom-skill";
}

export function normalizeCollectionName(sourceNameOrPath: string): string {
  let base = path.basename(sourceNameOrPath);
  base = base.replace(/\.(zip|tar\.gz|tgz|tar)$/i, "");
  // Strip duplicate download patterns: (1), (2), -1, _1, copy
  base = base.replace(/[\s_-]*\(\d+\)$/, "");
  base = base.replace(/[\s_-]+\d+$/, "");
  base = base.trim();
  return base || "skill-collection";
}

export function normalizeCollectionId(collectionName: string): string {
  return "collection." + slugify(collectionName);
}



function detectZipRootPrefix(entries: ZipEntry[]): string {
  const nonDirEntries = entries.filter((e) => !e.isDirectory && e.name.length > 0);
  if (nonDirEntries.length === 0) return "";
  const firstSegments = nonDirEntries.map((e) => e.name.split("/")[0]);
  const candidate = firstSegments[0];
  if (candidate && firstSegments.every((s) => s === candidate)) {
    if (nonDirEntries.some((e) => e.name.includes("/"))) {
      return candidate + "/";
    }
  }
  return "";
}

function resolveZipPrefix(entries: ZipEntry[], subPath?: string): string {
  const singleRoot = detectZipRootPrefix(entries);
  if (!subPath) return singleRoot;
  const cleanSub = subPath.replace(/^\/+/, "").replace(/\/+$/, "");
  // Check if cleanSub already matches entries directly
  const directMatch = entries.some(
    (e) => e.name.startsWith(cleanSub + "/") || e.name === cleanSub
  );
  if (directMatch) {
    return cleanSub + "/";
  }
  // Check if singleRoot + cleanSub matches entries
  if (singleRoot) {
    const combined = (singleRoot + cleanSub).replace(/\/?$/, "/");
    const combinedMatch = entries.some(
      (e) => e.name.startsWith(combined) || e.name === combined.replace(/\/$/, "")
    );
    if (combinedMatch) {
      return combined;
    }
  }
  return singleRoot ? (singleRoot + cleanSub).replace(/\/?$/, "/") : cleanSub + "/";
}

function discoverSubCandidatesFromEntries(entries: ZipEntry[], rootPrefix: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const e of entries) {
    if (rootPrefix && !e.name.startsWith(rootPrefix)) continue;
    const rel = rootPrefix ? e.name.slice(rootPrefix.length) : e.name;
    const lowerName = e.name.toLowerCase();

    if (
      !e.isDirectory &&
      (lowerName.endsWith("/skill.yaml") ||
        lowerName.endsWith("/skill.yml") ||
        lowerName.endsWith("/skill.md"))
    ) {
      const parts = rel.split("/");
      if (parts.length >= 2 && parts.length <= 4) {
        const subRelPath = parts.slice(0, parts.length - 1).join("/");
        if (!seenPaths.has(subRelPath)) {
          seenPaths.add(subRelPath);
          const name = parts[parts.length - 2] || subRelPath;
          const candidatePrefix = rootPrefix ? `${rootPrefix}${subRelPath}/` : `${subRelPath}/`;
          const hasYaml = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${candidatePrefix}skill.yaml` ||
                x.name === `${candidatePrefix}skill.yml`)
          );
          const hasMd = entries.some(
            (x) =>
              !x.isDirectory &&
              (x.name === `${candidatePrefix}SKILL.md` ||
                x.name.toLowerCase() === `${candidatePrefix}skill.md`)
          );

          let candidateDoc = "";
          if (hasMd) {
            const docEntry = entries.find(
              (x) =>
                !x.isDirectory &&
                (x.name === `${candidatePrefix}SKILL.md` ||
                  x.name.toLowerCase() === `${candidatePrefix}skill.md`)
            );
            if (docEntry) {
              candidateDoc = docEntry.data.toString("utf-8");
            }
          }
          const quality = evaluateCandidateQuality({
            isRoot: false,
            hasSkillMd: hasMd,
            hasManifest: hasYaml,
            content: candidateDoc,
          });

          candidates.push({
            id: `user.${slugify(name)}`,
            name,
            path: subRelPath,
            hasManifest: hasYaml,
            docPath: hasMd ? `${subRelPath}/SKILL.md` : undefined,
            qualityScore: quality.score,
            isValidCandidate: quality.isValidCandidate,
            qualityReasons: quality.reasons,
            isRoot: false,
          });
        }
      }
    }
  }
  return candidates;
}

function discoverSubCandidatesFromFolder(rootPath: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  const seenPaths = new Set<string>();

  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const nameLower = entry.name.toLowerCase();
        if (nameLower === "skill.yaml" || nameLower === "skill.yml" || nameLower === "skill.md") {
          const entryFull = path.join(entry.parentPath || (entry as any).path || rootPath, entry.name);
          const rel = path.relative(rootPath, entryFull).replace(/\\/g, "/");
          const parts = rel.split("/");
          if (parts.length >= 2 && parts.length <= 4) {
            const subRelPath = parts.slice(0, parts.length - 1).join("/");
            if (!seenPaths.has(subRelPath)) {
              seenPaths.add(subRelPath);
              const dirName = parts[parts.length - 2] || subRelPath;
              const subFull = path.join(rootPath, subRelPath);
              const hasYaml =
                fs.existsSync(path.join(subFull, "skill.yaml")) ||
                fs.existsSync(path.join(subFull, "skill.yml"));
              const hasMd =
                fs.existsSync(path.join(subFull, "SKILL.md")) ||
                fs.existsSync(path.join(subFull, "skill.md"));

              let candidateDoc = "";
              const candidateMdPath = path.join(subFull, "SKILL.md");
              const candidateLowerMdPath = path.join(subFull, "skill.md");
              if (fs.existsSync(candidateMdPath)) {
                candidateDoc = fs.readFileSync(candidateMdPath, "utf-8");
              } else if (fs.existsSync(candidateLowerMdPath)) {
                candidateDoc = fs.readFileSync(candidateLowerMdPath, "utf-8");
              }
              const quality = evaluateCandidateQuality({
                isRoot: false,
                hasSkillMd: hasMd,
                hasManifest: hasYaml,
                content: candidateDoc,
              });

              candidates.push({
                id: `user.${slugify(dirName)}`,
                name: dirName,
                path: subRelPath,
                hasManifest: hasYaml,
                docPath: hasMd ? `${subRelPath}/SKILL.md` : undefined,
                qualityScore: quality.score,
                isValidCandidate: quality.isValidCandidate,
                qualityReasons: quality.reasons,
                isRoot: false,
              });
            }
          }
        }
      }
    }
  } catch {}

  return candidates;
}

export class SkillImporter {
  private readonly validator: SkillValidator;
  private readonly loader: SkillLoader;
  private readonly registry: SkillRegistry;

  constructor(options: SkillImporterOptions) {
    this.validator = options.validator;
    this.loader = options.loader;
    this.registry = options.registry;
  }

  private createStagingDir(): string {
    const baseTmp =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "tmp", "skill-staging")
        : path.join(os.tmpdir(), "localbridge-skill-staging");
    fs.mkdirSync(baseTmp, { recursive: true });
    const stagingDir = path.join(baseTmp, crypto.randomUUID());
    fs.mkdirSync(stagingDir, { recursive: true });
    return stagingDir;
  }

  private findExecutableFilesInDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        const name = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(name)) {
          results.push(name);
        }
      }
    } catch {}
    return results;
  }

  /**
   * Preview a skill folder before importing.
   */
  async previewFolder(
    folderPath: string,
    target: "user" | "project" = "user",
    projectId?: string,
    subPath?: string
  ): Promise<SkillImportPreview> {
    const normPath = path.resolve(folderPath);
    if (!fs.existsSync(normPath)) {
      return this.createInvalidPreview("folder", "Source folder does not exist");
    }

    const stat = fs.statSync(normPath);
    if (!stat.isDirectory()) {
      return this.createInvalidPreview("folder", "Source path is not a directory");
    }

    const activeFolder = subPath ? path.resolve(normPath, subPath) : normPath;
    if (!fs.existsSync(activeFolder)) {
      return this.createInvalidPreview("folder", `Specified sub-path does not exist: ${subPath}`);
    }

    const candidateName = subPath
      ? path.basename(subPath.replace(/[\\/]+$/, ""))
      : path.basename(activeFolder);
    const folderName = candidateName;

    const yamlPath = path.join(activeFolder, "skill.yaml");
    const ymlPath = path.join(activeFolder, "skill.yml");
    const activeYamlPath = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;

    const mdPath = path.join(activeFolder, "SKILL.md");
    const lowerMdPath = path.join(activeFolder, "skill.md");
    const readmePath = path.join(activeFolder, "README.md");
    const readmeZhPath = path.join(activeFolder, "README_zh.md");
    let activeDocPath = fs.existsSync(mdPath)
      ? mdPath
      : fs.existsSync(lowerMdPath)
      ? lowerMdPath
      : fs.existsSync(readmePath)
      ? readmePath
      : fs.existsSync(readmeZhPath)
      ? readmeZhPath
      : null;

    // Scan for all executables in whole folder vs active subfolder
    const totalFolderExecutables: string[] = [];
    try {
      const allEntries = fs.readdirSync(normPath, { recursive: true });
      for (const entry of allEntries) {
        const strEntry = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(strEntry)) {
          totalFolderExecutables.push(strEntry);
        }
      }
    } catch {}

    const executableFilesFound: string[] = [];
    try {
      const entries = fs.readdirSync(activeFolder, { recursive: true });
      for (const entry of entries) {
        const strEntry = typeof entry === "string" ? entry : (entry as any).name;
        if (EXECUTABLE_FILE_REGEX.test(strEntry)) {
          executableFilesFound.push(strEntry);
        }
      }
    } catch {}

    const archiveTotalExecutables = totalFolderExecutables.length;
    const candidateExecutablesCount = executableFilesFound.length;

    const candidateSkills = discoverSubCandidatesFromFolder(normPath);
    if (!activeDocPath && !activeYamlPath && candidateSkills.length > 0) {
      for (const cand of candidateSkills) {
        const candDir = path.join(normPath, cand.path);
        const candMd = path.join(candDir, "SKILL.md");
        const candLowerMd = path.join(candDir, "skill.md");
        const candReadme = path.join(candDir, "README.md");
        if (fs.existsSync(candMd)) {
          activeDocPath = candMd;
          break;
        } else if (fs.existsSync(candLowerMd)) {
          activeDocPath = candLowerMd;
          break;
        } else if (fs.existsSync(candReadme)) {
          activeDocPath = candReadme;
          break;
        }
      }
    }
    let markdownContent = "";
    if (activeDocPath) {
      try {
        markdownContent = fs.readFileSync(activeDocPath, "utf-8");
      } catch {}
    }

    // Case 1: skill.yaml manifest is present
    if (activeYamlPath) {
      let rawYaml = "";
      let parsedYaml: any = null;
      const errors: string[] = [];

      try {
        rawYaml = fs.readFileSync(activeYamlPath, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        errors.push(`Failed to parse skill.yaml: ${err.message}`);
      }

      if (!activeDocPath) {
        errors.push("Missing required SKILL.md instructions file");
      }

      const valResult = this.validator.validate(activeFolder, parsedYaml, markdownContent, {
        isBuiltin: false,
      });
      const allErrors = [...errors, ...valResult.errors];

      let secWarning = valResult.securityWarning;
      if (archiveTotalExecutables > 0 && !secWarning) {
        secWarning =
          candidateExecutablesCount > 0
            ? `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      return this.buildPreview({
        id: parsedYaml?.id || folderName,
        version: parsedYaml?.version || "1.0.0",
        parsedYaml,
        markdownContent,
        rawYaml,
        errors: allErrors,
        securityWarning: secWarning,
        executableFilesFound,
        target,
        projectId,
        importMode: "native",
        detectedRoot: folderName,
        manifestFound: true,
        skillDocFound: Boolean(activeDocPath),
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Raw User Skill
    if (activeDocPath) {
      const isRoot = !subPath || subPath === "" || subPath === "/";
      const candidateDocs: string[] = [];
      try {
        const scan = (d: string, prefix = "") => {
          for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
              if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                scan(path.join(d, ent.name), rel);
              }
            } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
              candidateDocs.push(rel);
            }
          }
        };
        scan(activeFolder);
      } catch {}

      const primaryDocName = path.basename(activeDocPath);
      let skillMdText = "";
      let readmeText = "";
      if (primaryDocName.toLowerCase() === "skill.md") {
        skillMdText = markdownContent;
      } else {
        readmeText = markdownContent;
      }

      const otherSkillMd = path.join(activeFolder, "SKILL.md");
      const otherReadme = path.join(activeFolder, "README.md");
      if (!skillMdText && fs.existsSync(otherSkillMd)) {
        try { skillMdText = fs.readFileSync(otherSkillMd, "utf-8"); } catch {}
      }
      if (!readmeText && fs.existsSync(otherReadme)) {
        try { readmeText = fs.readFileSync(otherReadme, "utf-8"); } catch {}
      }

      const resolvedName = resolveRawSkillName({
        skillMdContent: skillMdText,
        readmeContent: readmeText,
        folderName,
      });

      const tentativeId = "user." + slugify(folderName);
      let secWarning: string | undefined;
      if (archiveTotalExecutables > 0) {
        secWarning =
          candidateExecutablesCount > 0
            ? `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `文件夹共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      let rootNotice: string | undefined;
      if (isRoot && candidateSkills.length > 0) {
        rootNotice = "该仓库包含多个子技能候选，你可以直接导入或从下方选择具体技能。";
      }

      const rawValidation = this.validator.validateRaw(activeFolder, {
        id: tentativeId,
        name: resolvedName,
        markdownContent,
      });

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": resolvedName, "en-US": resolvedName },
          description: { "zh-CN": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(), "en-US": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim() },
          category: "general",
          risk: "low",
          triggers: [folderName, folderName.replace(/[-_]/g, " "), resolvedName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: [],
        securityWarning: secWarning || rawValidation.securityWarning,
        executableFilesFound,
        target,
        projectId,
        validationStatus: secWarning ? "warning" : "valid",
        importMode: "raw",
        skillType: "raw",
        primaryDocument: primaryDocName,
        availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        filesCount: candidateDocs.length,
        detectedRoot: folderName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
        rootQualityNotice: rootNotice,
      });
    }

    // Case 3: Neither manifest nor documentation exists
    return this.createInvalidPreview(
      "folder",
      "Missing required skill.yaml manifest and no documentation found in selected folder"
    );
  }

  /**
   * Preview a skill ZIP archive before importing.
   */
  async previewZip(
    zipBufferOrPath: Buffer | string,
    target: "user" | "project" = "user",
    projectId?: string,
    subPath?: string
  ): Promise<SkillImportPreview> {
    let buffer: Buffer;
    if (typeof zipBufferOrPath === "string") {
      const normPath = path.resolve(zipBufferOrPath);
      if (!fs.existsSync(normPath)) {
        return this.createInvalidPreview("zip", "ZIP file does not exist");
      }
      buffer = fs.readFileSync(normPath);
    } else {
      buffer = zipBufferOrPath;
    }

    let entries: ZipEntry[];
    try {
      entries = parseZip(buffer);
    } catch (err: any) {
      return this.createInvalidPreview("zip", err.message || "Invalid or corrupt ZIP archive");
    }

    const singleRoot = detectZipRootPrefix(entries);
    const rootPrefix = resolveZipPrefix(entries, subPath);

    // Scan for all executable files in entire archive
    const allArchiveExecutables: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory && EXECUTABLE_FILE_REGEX.test(e.name)) {
        allArchiveExecutables.push(e.name);
      }
    }

    // Filter executables belonging to selected candidate
    const candidateExecutables = subPath
      ? allArchiveExecutables.filter((e) => e.startsWith(rootPrefix))
      : allArchiveExecutables;

    const candidateSkills = discoverSubCandidatesFromEntries(entries, singleRoot);

    // Look for manifest under rootPrefix
    let yamlEntry = entries.find(
      (e) =>
        !e.isDirectory &&
        (e.name === `${rootPrefix}skill.yaml` || e.name === `${rootPrefix}skill.yml`)
    );
    if (!yamlEntry && !subPath) {
      yamlEntry = entries.find(
        (e) => !e.isDirectory && (e.name.endsWith("/skill.yaml") || e.name.endsWith("/skill.yml"))
      );
    }

    // Look for documentation under rootPrefix
    let mdEntry = entries.find(
      (e) =>
        !e.isDirectory &&
        (e.name === `${rootPrefix}SKILL.md` ||
          e.name.toLowerCase() === `${rootPrefix}skill.md` ||
          e.name === `${rootPrefix}README.md` ||
          e.name === `${rootPrefix}README_zh.md` ||
          e.name.toLowerCase() === `${rootPrefix}readme.md`)
    );
    if (!mdEntry && !subPath) {
      mdEntry = entries.find(
        (e) =>
          !e.isDirectory &&
          (e.name.toLowerCase().endsWith("/skill.md") || e.name.toLowerCase().endsWith("/readme.md"))
      );
    }

    let markdownContent = "";
    if (mdEntry) {
      try {
        markdownContent = mdEntry.data.toString("utf-8");
      } catch {}
    }

    const candidateName = subPath
      ? path.basename(subPath.replace(/[\\/]+$/, ""))
      : singleRoot.replace(/\/$/, "") ||
        (typeof zipBufferOrPath === "string"
          ? path.basename(zipBufferOrPath, ".zip")
          : "compatible-skill");

    const pkgName = candidateName;
    const archiveTotalExecutables = allArchiveExecutables.length;
    const candidateExecutablesCount = candidateExecutables.length;

    // Case 1: Valid or invalid YAML manifest found
    if (yamlEntry) {
      let rawYaml = "";
      let parsedYaml: any = null;
      const errors: string[] = [];

      try {
        rawYaml = yamlEntry.data.toString("utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        errors.push(`Failed to parse skill.yaml: ${err.message}`);
      }

      if (!mdEntry) {
        errors.push("Missing required SKILL.md instructions file in ZIP archive");
      }

      const valResult = this.validator.validate("", parsedYaml, markdownContent, {
        isBuiltin: false,
      });
      const allErrors = [...errors, ...valResult.errors];

      let secWarning = valResult.securityWarning;
      if (archiveTotalExecutables > 0 && !secWarning) {
        secWarning =
          candidateExecutablesCount > 0
            ? `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      return this.buildPreview({
        id: parsedYaml?.id || pkgName,
        version: parsedYaml?.version || "1.0.0",
        parsedYaml,
        markdownContent,
        rawYaml,
        errors: allErrors,
        securityWarning: secWarning,
        executableFilesFound: candidateExecutables,
        target,
        projectId,
        importMode: singleRoot ? "compatible" : "native",
        detectedRoot: singleRoot || pkgName,
        manifestFound: true,
        skillDocFound: Boolean(mdEntry),
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
      });
    }

    // Case 2: No skill.yaml manifest, but documentation exists -> Raw User Skill
    if (mdEntry) {
      const isRoot = !subPath || subPath === "" || subPath === "/";
      const candidateDocs: string[] = [];
      for (const e of entries) {
        if (!e.name.startsWith(rootPrefix) || e.isDirectory) continue;
        const rel = e.name.slice(rootPrefix.length);
        if (/\.(md|txt)$/i.test(rel)) {
          candidateDocs.push(rel);
        }
      }

      let skillMdText = "";
      let readmeText = "";
      const primaryDocName = path.basename(mdEntry.name);
      if (primaryDocName.toLowerCase() === "skill.md") {
        skillMdText = markdownContent;
      } else {
        readmeText = markdownContent;
      }

      const otherSkillMdEntry = entries.find(
        (e) => !e.isDirectory && (e.name === `${rootPrefix}SKILL.md` || e.name.toLowerCase() === `${rootPrefix}skill.md`)
      );
      const otherReadmeEntry = entries.find(
        (e) => !e.isDirectory && (e.name === `${rootPrefix}README.md` || e.name.toLowerCase() === `${rootPrefix}readme.md`)
      );
      if (!skillMdText && otherSkillMdEntry) {
        try { skillMdText = otherSkillMdEntry.data.toString("utf-8"); } catch {}
      }
      if (!readmeText && otherReadmeEntry) {
        try { readmeText = otherReadmeEntry.data.toString("utf-8"); } catch {}
      }

      const resolvedName = resolveRawSkillName({
        skillMdContent: skillMdText,
        readmeContent: readmeText,
        folderName: pkgName,
        zipName: typeof zipBufferOrPath === "string" ? path.basename(zipBufferOrPath) : undefined,
      });

      const tentativeId = "user." + slugify(pkgName);
      let secWarning: string | undefined;
      if (archiveTotalExecutables > 0) {
        secWarning =
          candidateExecutablesCount > 0
            ? `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 ${candidateExecutablesCount} 个，导入时全部排除。`
            : `归档共发现 ${archiveTotalExecutables} 个可执行资源，当前候选包含 0 个，导入时全部排除。`;
      }

      let rootNotice: string | undefined;
      if (isRoot && candidateSkills.length > 0) {
        rootNotice = "该仓库包含多个子技能候选，你可以直接导入或从下方选择具体技能。";
      }

      return this.buildPreview({
        id: tentativeId,
        version: "1.0.0",
        parsedYaml: {
          name: { "zh-CN": resolvedName, "en-US": resolvedName },
          description: { "zh-CN": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(), "en-US": markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim() },
          category: "general",
          risk: "low",
          triggers: [pkgName, pkgName.replace(/[-_]/g, " "), resolvedName],
          tools: [],
          workflow: [],
        },
        markdownContent,
        rawYaml: "",
        errors: [],
        securityWarning: secWarning,
        executableFilesFound: candidateExecutables,
        target,
        projectId,
        validationStatus: secWarning ? "warning" : "valid",
        importMode: "raw",
        skillType: "raw",
        primaryDocument: primaryDocName,
        availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
        filesCount: candidateDocs.length,
        detectedRoot: singleRoot || pkgName,
        manifestFound: false,
        skillDocFound: true,
        candidateSkills: candidateSkills.length > 0 ? candidateSkills : undefined,
        archiveTotalExecutables,
        candidateExecutablesCount,
        rootQualityNotice: rootNotice,
      });
    }

    // Case 3: Neither manifest nor documentation found
    return this.createInvalidPreview(
      "zip",
      "Missing required skill.yaml manifest and no documentation found in ZIP archive"
    );
  }

  /**
   * Import a skill folder via a secure Staging Directory transaction.
   */
  async importFolder(params: {
    sourcePath: string;
    target: "user" | "project";
    projectId?: string;
    projectRoot?: string;
    overwrite?: boolean;
    customYaml?: string;
    subPath?: string;
    selectedCandidateIds?: string[];
    collectionName?: string;
  }): Promise<SkillImportResult> {
    if (params.selectedCandidateIds && params.selectedCandidateIds.length > 0) {
      return this.importBatch({
        sourceType: "folder",
        sourcePath: params.sourcePath,
        target: params.target,
        projectId: params.projectId,
        projectRoot: params.projectRoot,
        collectionName: params.collectionName,
        selectedCandidateIds: params.selectedCandidateIds,
        overwrite: params.overwrite,
      });
    }

    const stagingDir = this.createStagingDir();

    try {
      // Step 1: Resolve source and candidate path
      const normSrc = path.resolve(params.sourcePath);
      if (!fs.existsSync(normSrc)) {
        return {
          success: false,
          code: "SOURCE_PATH_NOT_FOUND",
          stage: "resolve_subpath",
          message: `源目录不存在: ${params.sourcePath}`,
          error: `源目录不存在: ${params.sourcePath}`,
        };
      }

      if (!params.subPath && !params.customYaml) {
        const candidateSkills = discoverSubCandidatesFromFolder(normSrc);
        if (candidateSkills.length > 1) {
          // Batch Collection Import
          const pkgName = path.basename(normSrc);
          const collectionId = "collection." + slugify(pkgName);
          const collectionName = pkgName;

          for (const candidate of candidateSkills) {
            const candidateSrc = path.join(normSrc, candidate.path);
            if (!fs.existsSync(candidateSrc)) continue;

            const candStaging = path.join(stagingDir, candidate.id);
            fs.mkdirSync(candStaging, { recursive: true });
            this.copyDirRecursive(candidateSrc, candStaging);
            this.sanitizeTargetDir(candStaging);

            const candDocs: string[] = [];
            try {
              const scan = (d: string, prefix = "") => {
                for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
                  const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
                  if (ent.isDirectory()) {
                    if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                      scan(path.join(d, ent.name), rel);
                    }
                  } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
                    candDocs.push(rel);
                  }
                }
              };
              scan(candStaging);
            } catch {}

            let primaryDocName = "SKILL.md";
            if (candDocs.some((d) => d.toLowerCase() === "skill.md")) {
              primaryDocName = candDocs.find((d) => d.toLowerCase() === "skill.md")!;
            } else if (candDocs.some((d) => d.toLowerCase() === "readme.md")) {
              primaryDocName = candDocs.find((d) => d.toLowerCase() === "readme.md")!;
            } else if (candDocs.length > 0) {
              primaryDocName = candDocs[0] || "SKILL.md";
            }

            let docContent = "";
            const primaryFull = path.join(candStaging, primaryDocName);
            if (fs.existsSync(primaryFull)) {
              try { docContent = fs.readFileSync(primaryFull, "utf-8"); } catch {}
            }

            let skillMdText = "";
            let readmeText = "";
            if (primaryDocName.toLowerCase() === "skill.md") {
              skillMdText = docContent;
            } else {
              readmeText = docContent;
            }

            const resolvedName = resolveRawSkillName({
              skillMdContent: skillMdText,
              readmeContent: readmeText,
              folderName: candidate.name,
            });

            const summary = docContent ? docContent.slice(0, 160).replace(/[#*`\n]/g, " ").trim() : resolvedName;
            const baseSlug = candidate.id.replace(/^user\./, "");
            const keywords = Array.from(new Set([
              candidate.id,
              baseSlug,
              ...baseSlug.split(/[-_.]+/),
              resolvedName,
              ...resolvedName.split(/[-_.]+/),
            ].filter(Boolean)));

            const rawSkillManifest = {
              id: candidate.id,
              name: resolvedName,
              type: "raw",
              version: "1.0.0",
              collectionId,
              collectionName,
              enabled: true,
              summary,
              keywords,
              description: summary,
              primaryDocument: primaryDocName,
              availableDocuments: candDocs.length > 0 ? candDocs : [primaryDocName],
              documents: candDocs.length > 0 ? candDocs : [primaryDocName],
              importedAt: new Date().toISOString(),
            };

            fs.writeFileSync(
              path.join(candStaging, "raw-skill.json"),
              JSON.stringify(rawSkillManifest, null, 2),
              "utf-8"
            );

            const targetDir = this.resolveTargetDir(
              candidate.id,
              params.target,
              params.projectId,
              params.projectRoot
            );
            if (fs.existsSync(targetDir)) {
              fs.rmSync(targetDir, { recursive: true, force: true });
            }
            fs.mkdirSync(targetDir, { recursive: true });
            this.copyDirRecursive(candStaging, targetDir);
            this.sanitizeTargetDir(targetDir);
          }

          const projectDirs =
            params.projectId && params.projectRoot
              ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
              : [];
          this.registry.reload(projectDirs);

          const allImported = this.registry.listSkills({ collectionId, projectId: params.projectId });
          return {
            success: true,
            collection: {
              id: collectionId,
              name: collectionName,
              count: allImported.length,
            },
            skills: allImported,
            skill: allImported[0],
          };
        }
      }

      const activeSrc = params.subPath ? path.resolve(normSrc, params.subPath) : normSrc;
      if (!fs.existsSync(activeSrc)) {
        return {
          success: false,
          code: "CANDIDATE_PATH_NOT_FOUND",
          stage: "resolve_subpath",
          message: `所选 candidate 路径不存在: ${params.subPath}`,
          error: `所选 candidate 路径不存在: ${params.subPath}`,
        };
      }

      // Step 2: Copy declarative safe content to staging (skipping executables)
      this.copyDirRecursive(activeSrc, stagingDir);

      // Step 3: Assert Executable Files = 0 in staging
      this.sanitizeTargetDir(stagingDir);
      const remainingExecutables = this.findExecutableFilesInDir(stagingDir);
      if (remainingExecutables.length > 0) {
        return {
          success: false,
          code: "EXECUTABLE_FILES_PERSISTED",
          stage: "declarative_sanitization",
          message: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
          error: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
        };
      }

      // Step 4: Inject customYaml or verify existing manifest in staging
      if (params.customYaml) {
        let parsedCustom: any;
        try {
          parsedCustom = YAML.parse(params.customYaml);
        } catch (err: any) {
          return {
            success: false,
            code: "MANIFEST_PARSE_ERROR",
            stage: "manifest_injection",
            message: `Failed to parse skill.yaml manifest: ${err.message}`,
            error: err.message,
            details: { parseError: err.message },
          };
        }

        let canonicalYaml = params.customYaml;
        try {
          if (parsedCustom && typeof parsedCustom === "object") {
            canonicalYaml = YAML.stringify(parsedCustom, { indent: 2, lineWidth: 0 });
          }
        } catch {}

        fs.writeFileSync(path.join(stagingDir, "skill.yaml"), canonicalYaml, "utf-8");
      }

      const stagingYamlPath = path.join(stagingDir, "skill.yaml");
      const stagingYmlPath = path.join(stagingDir, "skill.yml");
      const activeYaml = fs.existsSync(stagingYamlPath)
        ? stagingYamlPath
        : fs.existsSync(stagingYmlPath)
        ? stagingYmlPath
        : null;

      if (!activeYaml) {
        // Raw User Skill import flow
        const candidateDocs: string[] = [];
        try {
          const scan = (d: string, prefix = "") => {
            for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
              const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
              if (ent.isDirectory()) {
                if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                  scan(path.join(d, ent.name), rel);
                }
              } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
                candidateDocs.push(rel);
              }
            }
          };
          scan(stagingDir);
        } catch {}

        const mdPath = path.join(stagingDir, "SKILL.md");
        const lowerMdPath = path.join(stagingDir, "skill.md");
        const readmePath = path.join(stagingDir, "README.md");
        const readmeZhPath = path.join(stagingDir, "README_zh.md");
        const activeDocPath = fs.existsSync(mdPath)
          ? mdPath
          : fs.existsSync(lowerMdPath)
          ? lowerMdPath
          : fs.existsSync(readmePath)
          ? readmePath
          : fs.existsSync(readmeZhPath)
          ? readmeZhPath
          : candidateDocs.length > 0
          ? path.join(stagingDir, candidateDocs[0]!)
          : null;

        if (!activeDocPath) {
          return {
            success: false,
            code: "DOCUMENTATION_MISSING",
            stage: "staging_validation",
            message: "未发现有效文档 (SKILL.md 或 README.md)",
            error: "未发现有效文档 (SKILL.md 或 README.md)",
            validationErrors: ["Missing documentation file (SKILL.md or README.md)"],
          };
        }

        const primaryDocName = path.relative(stagingDir, activeDocPath).replace(/\\/g, "/");
        let markdownContent = "";
        try {
          markdownContent = fs.readFileSync(activeDocPath, "utf-8");
        } catch {}

        let skillMdText = "";
        let readmeText = "";
        if (primaryDocName.toLowerCase() === "skill.md") {
          skillMdText = markdownContent;
        } else {
          readmeText = markdownContent;
        }
        if (!skillMdText && (fs.existsSync(mdPath) || fs.existsSync(lowerMdPath))) {
          try { skillMdText = fs.readFileSync(fs.existsSync(mdPath) ? mdPath : lowerMdPath, "utf-8"); } catch {}
        }
        if (!readmeText && (fs.existsSync(readmePath) || fs.existsSync(readmeZhPath))) {
          try { readmeText = fs.readFileSync(fs.existsSync(readmePath) ? readmePath : readmeZhPath, "utf-8"); } catch {}
        }

        const candidateName = params.subPath
          ? path.basename(params.subPath.replace(/[\\/]+$/, ""))
          : path.basename(normSrc);
        const folderName = candidateName;

        const resolvedName = resolveRawSkillName({
          skillMdContent: skillMdText,
          readmeContent: readmeText,
          folderName,
        });

        const skillId = "user." + slugify(folderName);

        // Namespace protection
        if (skillId.startsWith("nexus.")) {
          return {
            success: false,
            code: "RESERVED_BUILTIN_NAMESPACE",
            stage: "conflict_check",
            message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
          };
        }

        // Existing skill conflict check
        const existing = this.registry.getSkill(skillId, params.projectId);
        if (existing && !params.overwrite) {
          return {
            success: false,
            code: "SKILL_ALREADY_EXISTS",
            stage: "conflict_check",
            message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
            error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          };
        }

        // Validate raw skill
        const rawVal = this.validator.validateRaw(stagingDir, {
          id: skillId,
          name: resolvedName,
          markdownContent,
        });

        if (!rawVal.valid) {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: rawVal.errors.join("; "),
            error: `Raw Skill 校验失败: ${rawVal.errors.join("; ")}`,
            validationErrors: rawVal.errors,
          };
        }

        // Write raw-skill.json into staging
        const rawSkillManifest = {
          id: skillId,
          name: resolvedName,
          type: "raw",
          version: "1.0.0",
          description: markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(),
          primaryDocument: primaryDocName,
          availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          importedAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(stagingDir, "raw-skill.json"),
          JSON.stringify(rawSkillManifest, null, 2),
          "utf-8"
        );

        // Atomic Install from Staging to Destination
        const targetDir = this.resolveTargetDir(
          skillId,
          params.target,
          params.projectId,
          params.projectRoot
        );

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        this.copyDirRecursive(stagingDir, targetDir);
        this.sanitizeTargetDir(targetDir);

        if (!fs.existsSync(path.join(targetDir, "raw-skill.json")) && !fs.existsSync(path.join(targetDir, primaryDocName))) {
          return {
            success: false,
            code: "FILESYSTEM_COMMIT_FAILED",
            stage: "filesystem_commit",
            message: "安装提交失败：目标目录缺少关键文件",
            error: "安装提交失败：目标目录缺少关键文件",
          };
        }

        // Registry reload
        const projectDirs =
          params.projectId && params.projectRoot
            ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
            : [];
        this.registry.reload(projectDirs);

        const skill = this.registry.getSkill(skillId, params.projectId);
        if (!skill) {
          return {
            success: false,
            code: "REGISTRY_RELOAD_FAILED",
            stage: "registry_reload",
            message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
            error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          };
        }

        const { instructions: _unused, ...meta } = skill;
        return {
          success: true,
          skill: meta,
        };
      }

      let parsedYaml: any;
      try {
        const rawYaml = fs.readFileSync(activeYaml, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        return {
          success: false,
          code: "MANIFEST_PARSE_ERROR",
          stage: "manifest_injection",
          message: `Failed to parse skill.yaml manifest: ${err.message}`,
          error: `Failed to parse skill.yaml manifest: ${err.message}`,
          validationErrors: [err.message],
        };
      }

      // Preserve / ensure SKILL.md in staging
      const stagingMdPath = path.join(stagingDir, "SKILL.md");
      const stagingLowerMdPath = path.join(stagingDir, "skill.md");
      const hasStagingMd = fs.existsSync(stagingMdPath) || fs.existsSync(stagingLowerMdPath);

      if (!hasStagingMd) {
        if (params.customYaml) {
          const readme = path.join(stagingDir, "README.md");
          const readmeZh = path.join(stagingDir, "README_zh.md");
          if (fs.existsSync(readme)) {
            fs.copyFileSync(readme, stagingMdPath);
          } else if (fs.existsSync(readmeZh)) {
            fs.copyFileSync(readmeZh, stagingMdPath);
          } else {
            fs.writeFileSync(
              stagingMdPath,
              `# ${parsedYaml?.id || "skill"}\n\n${parsedYaml?.name?.["zh-CN"] || ""}\n`,
              "utf-8"
            );
          }
        } else {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: "Missing required SKILL.md instructions file",
            error: "Missing required SKILL.md instructions file",
            validationErrors: ["Missing required SKILL.md instructions file"],
          };
        }
      }

      const activeMd = fs.existsSync(stagingMdPath) ? stagingMdPath : stagingLowerMdPath;
      const markdownContent = fs.readFileSync(activeMd, "utf-8");

      // Step 5: Strict Validate STAGING DIRECTORY
      const valResult = this.validator.validate(stagingDir, parsedYaml, markdownContent, {
        isBuiltin: false,
        strictExecutables: true,
      });

      if (!valResult.valid) {
        return {
          success: false,
          code: "SKILL_IMPORT_VALIDATION_FAILED",
          stage: "staging_validation",
          message: valResult.errors.join("; "),
          error: `声明式配置校验失败: ${valResult.errors.join("; ")}`,
          validationErrors: valResult.errors,
          details: valResult.errors,
        };
      }

      const skillId = parsedYaml.id;

      // Step 6: Namespace protection and conflict check
      if (skillId.startsWith("nexus.")) {
        return {
          success: false,
          code: "RESERVED_BUILTIN_NAMESPACE",
          stage: "conflict_check",
          message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
        };
      }

      const existing = this.registry.getSkill(skillId, params.projectId);
      if (existing && !params.overwrite) {
        return {
          success: false,
          code: "SKILL_ALREADY_EXISTS",
          stage: "conflict_check",
          message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
        };
      }

      // Step 7: Atomic Install from Staging to Destination
      const targetDir = this.resolveTargetDir(
        skillId,
        params.target,
        params.projectId,
        params.projectRoot
      );

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      this.copyDirRecursive(stagingDir, targetDir);
      this.sanitizeTargetDir(targetDir);

      if (!fs.existsSync(path.join(targetDir, "skill.yaml")) || !fs.existsSync(path.join(targetDir, "SKILL.md"))) {
        return {
          success: false,
          code: "FILESYSTEM_COMMIT_FAILED",
          stage: "filesystem_commit",
          message: "安装提交失败：目标目录缺少关键文件",
          error: "安装提交失败：目标目录缺少关键文件",
        };
      }

      // Step 8: Registry Reload
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          code: "REGISTRY_RELOAD_FAILED",
          stage: "registry_reload",
          message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
        };
      }

      const { instructions: _unused, ...meta } = skill;
      return {
        success: true,
        skill: meta,
      };
    } catch (err: any) {
      return {
        success: false,
        code: "UNEXPECTED_IMPORT_ERROR",
        stage: "filesystem_commit",
        message: err.message || String(err),
        error: `导入失败: ${err.message || String(err)}`,
      };
    } finally {
      // Step 9: Clean up staging directory
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Import multiple sub-skills from an archive or folder as a collection in a single atomic batch transaction.
   */
  async importBatch(params: SkillBatchImportParams): Promise<SkillBatchImportResult> {
    const collName =
      params.collectionName?.trim() ||
      normalizeCollectionName(params.sourcePath || "skill-collection");
    const collectionId = normalizeCollectionId(collName);

    const baseTmp =
      process.platform === "win32" && process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "LocalBridge", "tmp", "skill-staging")
        : path.join(os.tmpdir(), "localbridge-skill-staging");
    fs.mkdirSync(baseTmp, { recursive: true });
    const batchStagingRoot = path.join(baseTmp, crypto.randomUUID());
    fs.mkdirSync(batchStagingRoot, { recursive: true });

    const installedSkills: SkillMetadata[] = [];
    const skippedSkills: string[] = [];
    const failedSkills: Array<{ id: string; error: string }> = [];

    try {
      if (params.sourceType === "zip") {
        let buffer: Buffer;
        if (params.zipBase64) {
          buffer = Buffer.from(params.zipBase64, "base64");
        } else if (params.sourcePath) {
          const resolvedZip = path.resolve(params.sourcePath);
          if (!fs.existsSync(resolvedZip)) {
            return {
              success: false,
              code: "ZIP_NOT_FOUND",
              stage: "staging_init",
              message: `ZIP 文件未找到: ${params.sourcePath}`,
              error: `ZIP 文件未找到: ${params.sourcePath}`,
            };
          }
          buffer = fs.readFileSync(resolvedZip);
        } else {
          return {
            success: false,
            code: "INVALID_ARGUMENT",
            stage: "staging_init",
            message: "Missing ZIP source (sourcePath or zipBase64 required)",
            error: "Missing ZIP source",
          };
        }

        let entries: ZipEntry[];
        try {
          entries = parseZip(buffer);
        } catch (err: any) {
          return {
            success: false,
            code: "INVALID_ZIP_ARCHIVE",
            stage: "staging_init",
            message: `Failed to parse ZIP archive: ${err.message}`,
            error: `Failed to parse ZIP archive: ${err.message}`,
          };
        }

        const singleRoot = detectZipRootPrefix(entries);
        const candidates = discoverSubCandidatesFromEntries(entries, singleRoot);
        const selected =
          params.selectedCandidateIds && params.selectedCandidateIds.length > 0
            ? candidates.filter(
                (c) =>
                  params.selectedCandidateIds!.includes(c.id) ||
                  params.selectedCandidateIds!.includes(c.name) ||
                  params.selectedCandidateIds!.includes(c.path)
              )
            : candidates;

        for (const candidate of candidates) {
          if (!selected.includes(candidate)) {
            skippedSkills.push(candidate.id);
          }
        }

        if (selected.length === 0) {
          return {
            success: false,
            code: "NO_CANDIDATES_SELECTED",
            stage: "staging_init",
            message: "未选择任何要导入的 Skill",
            error: "未选择任何要导入的 Skill",
          };
        }

        for (const candidate of selected) {
          try {
            const candPrefix = singleRoot ? `${singleRoot}${candidate.path}/` : `${candidate.path}/`;
            const candEntries = entries.filter((e) => e.name.startsWith(candPrefix) && !e.isDirectory);
            const candStaging = path.join(batchStagingRoot, candidate.id);
            fs.mkdirSync(candStaging, { recursive: true });

            let primaryDocName = "SKILL.md";
            let docContent = "";

            for (const e of candEntries) {
              const rel = e.name.slice(candPrefix.length);
              if (!rel || EXECUTABLE_FILE_REGEX.test(rel)) continue;
              const destFile = path.join(candStaging, rel);
              fs.mkdirSync(path.dirname(destFile), { recursive: true });
              fs.writeFileSync(destFile, e.data);

              const lower = rel.toLowerCase();
              if (lower === "skill.md" || (!docContent && lower === "readme.md")) {
                primaryDocName = rel;
                docContent = e.data.toString("utf-8");
              }
            }

            this.sanitizeTargetDir(candStaging);

            const candDocs: string[] = [];
            try {
              const scan = (d: string, prefix = "") => {
                for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
                  const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
                  if (ent.isDirectory()) {
                    if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                      scan(path.join(d, ent.name), rel);
                    }
                  } else if (ent.isFile() && /\.(md|txt|json|ya?ml)$/i.test(ent.name)) {
                    candDocs.push(rel);
                  }
                }
              };
              scan(candStaging);
            } catch {}

            let skillMdText = "";
            let readmeText = "";
            if (primaryDocName.toLowerCase() === "skill.md") {
              skillMdText = docContent;
            } else {
              readmeText = docContent;
            }

            const resolvedName = resolveRawSkillName({
              skillMdContent: skillMdText,
              readmeContent: readmeText,
              folderName: candidate.name,
            });

            const summary = docContent
              ? docContent.slice(0, 160).replace(/[#*`\n]/g, " ").trim()
              : resolvedName;
            const baseSlug = candidate.id.replace(/^user\./, "");
            const keywords = Array.from(
              new Set([
                candidate.id,
                baseSlug,
                ...baseSlug.split(/[-_.]+/),
                candidate.name,
                ...candidate.name.split(/[-_.]+/),
                resolvedName,
              ].filter((k) => k && k.length >= 2))
            );

            const rawSkillManifest = {
              id: candidate.id,
              name: resolvedName,
              type: "raw",
              version: "1.0.0",
              enabled: true,
              collectionId,
              collectionName: collName,
              relativeSourcePath: candidate.path,
              summary,
              keywords,
              description: summary,
              primaryDocument: primaryDocName,
              availableDocuments: candDocs.length > 0 ? candDocs : [primaryDocName],
              documents: candDocs.length > 0 ? candDocs : [primaryDocName],
              importedAt: new Date().toISOString(),
            };

            fs.writeFileSync(
              path.join(candStaging, "raw-skill.json"),
              JSON.stringify(rawSkillManifest, null, 2),
              "utf-8"
            );

            const targetDir = this.resolveTargetDir(
              candidate.id,
              params.target,
              params.projectId,
              params.projectRoot
            );
            if (fs.existsSync(targetDir)) {
              fs.rmSync(targetDir, { recursive: true, force: true });
            }
            fs.mkdirSync(targetDir, { recursive: true });
            this.copyDirRecursive(candStaging, targetDir);
            this.sanitizeTargetDir(targetDir);

            installedSkills.push(rawSkillManifest as any);
          } catch (err: any) {
            failedSkills.push({ id: candidate.id, error: err.message || String(err) });
          }
        }
      } else {
        const normSrc = path.resolve(params.sourcePath!);
        if (!fs.existsSync(normSrc)) {
          return {
            success: false,
            code: "SOURCE_PATH_NOT_FOUND",
            stage: "staging_init",
            message: `源目录不存在: ${params.sourcePath}`,
            error: `源目录不存在: ${params.sourcePath}`,
          };
        }

        const candidates = discoverSubCandidatesFromFolder(normSrc);
        const selected =
          params.selectedCandidateIds && params.selectedCandidateIds.length > 0
            ? candidates.filter(
                (c) =>
                  params.selectedCandidateIds!.includes(c.id) ||
                  params.selectedCandidateIds!.includes(c.name) ||
                  params.selectedCandidateIds!.includes(c.path)
              )
            : candidates;

        for (const candidate of candidates) {
          if (!selected.includes(candidate)) {
            skippedSkills.push(candidate.id);
          }
        }

        if (selected.length === 0) {
          return {
            success: false,
            code: "NO_CANDIDATES_SELECTED",
            stage: "staging_init",
            message: "未选择任何要导入的 Skill",
            error: "未选择任何要导入的 Skill",
          };
        }

        for (const candidate of selected) {
          try {
            const candidateSrc = path.join(normSrc, candidate.path);
            if (!fs.existsSync(candidateSrc)) {
              skippedSkills.push(candidate.id);
              continue;
            }

            const candStaging = path.join(batchStagingRoot, candidate.id);
            fs.mkdirSync(candStaging, { recursive: true });
            this.copyDirRecursive(candidateSrc, candStaging);
            this.sanitizeTargetDir(candStaging);

            const candDocs: string[] = [];
            try {
              const scan = (d: string, prefix = "") => {
                for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
                  const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
                  if (ent.isDirectory()) {
                    if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                      scan(path.join(d, ent.name), rel);
                    }
                  } else if (ent.isFile() && /\.(md|txt|json|ya?ml)$/i.test(ent.name)) {
                    candDocs.push(rel);
                  }
                }
              };
              scan(candStaging);
            } catch {}

            const mdPath = path.join(candStaging, "SKILL.md");
            const lowerMdPath = path.join(candStaging, "skill.md");
            const readmePath = path.join(candStaging, "README.md");
            const readmeZhPath = path.join(candStaging, "README_zh.md");
            const activeDocPath = fs.existsSync(mdPath)
              ? mdPath
              : fs.existsSync(lowerMdPath)
              ? lowerMdPath
              : fs.existsSync(readmePath)
              ? readmePath
              : fs.existsSync(readmeZhPath)
              ? readmeZhPath
              : candDocs.length > 0
              ? path.join(candStaging, candDocs[0]!)
              : null;

            const primaryDocName = activeDocPath
              ? path.relative(candStaging, activeDocPath).replace(/\\/g, "/")
              : "SKILL.md";
            let docContent = "";
            try {
              if (activeDocPath) docContent = fs.readFileSync(activeDocPath, "utf-8");
            } catch {}

            let skillMdText = "";
            let readmeText = "";
            if (primaryDocName.toLowerCase() === "skill.md") {
              skillMdText = docContent;
            } else {
              readmeText = docContent;
            }

            const resolvedName = resolveRawSkillName({
              skillMdContent: skillMdText,
              readmeContent: readmeText,
              folderName: candidate.name,
            });

            const summary = docContent
              ? docContent.slice(0, 160).replace(/[#*`\n]/g, " ").trim()
              : resolvedName;
            const baseSlug = candidate.id.replace(/^user\./, "");
            const keywords = Array.from(
              new Set([
                candidate.id,
                baseSlug,
                ...baseSlug.split(/[-_.]+/),
                candidate.name,
                ...candidate.name.split(/[-_.]+/),
                resolvedName,
              ].filter((k) => k && k.length >= 2))
            );

            const rawSkillManifest = {
              id: candidate.id,
              name: resolvedName,
              type: "raw",
              version: "1.0.0",
              enabled: true,
              collectionId,
              collectionName: collName,
              relativeSourcePath: candidate.path,
              summary,
              keywords,
              description: summary,
              primaryDocument: primaryDocName,
              availableDocuments: candDocs.length > 0 ? candDocs : [primaryDocName],
              documents: candDocs.length > 0 ? candDocs : [primaryDocName],
              importedAt: new Date().toISOString(),
            };

            fs.writeFileSync(
              path.join(candStaging, "raw-skill.json"),
              JSON.stringify(rawSkillManifest, null, 2),
              "utf-8"
            );

            const targetDir = this.resolveTargetDir(
              candidate.id,
              params.target,
              params.projectId,
              params.projectRoot
            );
            if (fs.existsSync(targetDir)) {
              fs.rmSync(targetDir, { recursive: true, force: true });
            }
            fs.mkdirSync(targetDir, { recursive: true });
            this.copyDirRecursive(candStaging, targetDir);
            this.sanitizeTargetDir(targetDir);

            installedSkills.push(rawSkillManifest as any);
          } catch (err: any) {
            failedSkills.push({ id: candidate.id, error: err.message || String(err) });
          }
        }
      }

      // Persist Collection Record (Requirement XIII)
      const baseTargetDir =
        params.target === "project" && params.projectRoot
          ? path.join(params.projectRoot, ".nexus", "skills")
          : this.loader.getUserDir();
      const collectionsDir = path.join(baseTargetDir, "collections");
      fs.mkdirSync(collectionsDir, { recursive: true });
      const collRecord = {
        id: collectionId,
        name: collName,
        sourceType: params.sourceType,
        sourceName: params.sourcePath ? path.basename(params.sourcePath) : undefined,
        totalSkills: installedSkills.length,
        skills: installedSkills.map((s) => s.id),
        importedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(collectionsDir, `${collectionId}.json`),
        JSON.stringify(collRecord, null, 2),
        "utf-8"
      );

      // Registry Reload EXACTLY ONCE (Requirement XIV)
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const allImported = this.registry.listSkills({
        collectionId,
        projectId: params.projectId,
      });

      return {
        success: installedSkills.length > 0,
        collection: collRecord,
        skills: allImported,
        installedCount: installedSkills.length,
        skippedCount: skippedSkills.length,
        failedCount: failedSkills.length,
        errors: failedSkills.length > 0 ? failedSkills : undefined,
        reloadCount: 1,
      };
    } finally {
      try {
        if (fs.existsSync(batchStagingRoot)) {
          fs.rmSync(batchStagingRoot, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Import a skill ZIP archive via a secure Staging Directory transaction.
   */
  async importZip(params: {
    zipBufferOrPath: Buffer | string;
    target: "user" | "project";
    projectId?: string;
    projectRoot?: string;
    overwrite?: boolean;
    customYaml?: string;
    subPath?: string;
    selectedCandidateIds?: string[];
    collectionName?: string;
  }): Promise<SkillImportResult> {
    if (params.selectedCandidateIds && params.selectedCandidateIds.length > 0) {
      return this.importBatch({
        sourceType: "zip",
        sourcePath: typeof params.zipBufferOrPath === "string" ? params.zipBufferOrPath : undefined,
        zipBase64: typeof params.zipBufferOrPath !== "string" ? params.zipBufferOrPath.toString("base64") : undefined,
        target: params.target,
        projectId: params.projectId,
        projectRoot: params.projectRoot,
        collectionName: params.collectionName,
        selectedCandidateIds: params.selectedCandidateIds,
        overwrite: params.overwrite,
      });
    }

    const stagingDir = this.createStagingDir();

    try {
      // Step 1: Read and parse zip
      let buffer: Buffer;
      if (typeof params.zipBufferOrPath === "string") {
        const resolvedZip = path.resolve(params.zipBufferOrPath);
        if (!fs.existsSync(resolvedZip)) {
          return {
            success: false,
            code: "ZIP_NOT_FOUND",
            stage: "resolve_subpath",
            message: `ZIP 文件未找到: ${params.zipBufferOrPath}`,
            error: `ZIP 文件未找到: ${params.zipBufferOrPath}`,
          };
        }
        buffer = fs.readFileSync(resolvedZip);
      } else {
        buffer = params.zipBufferOrPath;
      }

      let entries: ZipEntry[];
      try {
        entries = parseZip(buffer);
      } catch (err: any) {
        return {
          success: false,
          code: "INVALID_ZIP_ARCHIVE",
          stage: "staging_init",
          message: `Failed to parse ZIP archive: ${err.message}`,
          error: `Failed to parse ZIP archive: ${err.message}`,
        };
      }

      // Step 2: Resolve root prefix & subPath
      if (!params.subPath && !params.customYaml) {
        const singleRoot = detectZipRootPrefix(entries);
        const candidateSkills = discoverSubCandidatesFromEntries(entries, singleRoot);
        if (candidateSkills.length > 1) {
          // Batch Collection Import
          const pkgName = singleRoot.replace(/\/$/, "") ||
            (typeof params.zipBufferOrPath === "string"
              ? path.basename(params.zipBufferOrPath, ".zip")
              : "skill-collection");
          const collectionId = "collection." + slugify(pkgName);
          const collectionName = pkgName;

          for (const candidate of candidateSkills) {
            const candPrefix = singleRoot ? `${singleRoot}${candidate.path}/` : `${candidate.path}/`;
            const candidateSkillId = candidate.id;

            const candStaging = path.join(stagingDir, candidate.id);
            fs.mkdirSync(candStaging, { recursive: true });

            const candDocs: string[] = [];
            for (const e of entries) {
              if (!e.name.startsWith(candPrefix) || e.isDirectory) continue;
              const rel = e.name.slice(candPrefix.length);
              if (!rel || EXECUTABLE_FILE_REGEX.test(rel)) continue;

              const out = path.join(candStaging, rel);
              fs.mkdirSync(path.dirname(out), { recursive: true });
              fs.writeFileSync(out, e.data);
              if (/\.(md|txt)$/i.test(rel)) {
                candDocs.push(rel);
              }
            }

            this.sanitizeTargetDir(candStaging);

            let primaryDocName = "SKILL.md";
            if (candDocs.some((d) => d.toLowerCase() === "skill.md")) {
              primaryDocName = candDocs.find((d) => d.toLowerCase() === "skill.md")!;
            } else if (candDocs.some((d) => d.toLowerCase() === "readme.md")) {
              primaryDocName = candDocs.find((d) => d.toLowerCase() === "readme.md")!;
            } else if (candDocs.length > 0) {
              primaryDocName = candDocs[0] || "SKILL.md";
            }

            let docContent = "";
            const primaryFull = path.join(candStaging, primaryDocName);
            if (fs.existsSync(primaryFull)) {
              try { docContent = fs.readFileSync(primaryFull, "utf-8"); } catch {}
            }

            let skillMdText = "";
            let readmeText = "";
            if (primaryDocName.toLowerCase() === "skill.md") {
              skillMdText = docContent;
            } else {
              readmeText = docContent;
            }

            const resolvedName = resolveRawSkillName({
              skillMdContent: skillMdText,
              readmeContent: readmeText,
              folderName: candidate.name,
            });

            const summary = docContent ? docContent.slice(0, 160).replace(/[#*`\n]/g, " ").trim() : resolvedName;
            const baseSlug = candidateSkillId.replace(/^user\./, "");
            const keywords = Array.from(new Set([
              candidateSkillId,
              baseSlug,
              ...baseSlug.split(/[-_.]+/),
              resolvedName,
              ...resolvedName.split(/[-_.]+/),
            ].filter(Boolean)));

            const rawSkillManifest = {
              id: candidateSkillId,
              name: resolvedName,
              type: "raw",
              version: "1.0.0",
              collectionId,
              collectionName,
              enabled: true,
              summary,
              keywords,
              description: summary,
              primaryDocument: primaryDocName,
              availableDocuments: candDocs.length > 0 ? candDocs : [primaryDocName],
              documents: candDocs.length > 0 ? candDocs : [primaryDocName],
              importedAt: new Date().toISOString(),
            };

            fs.writeFileSync(
              path.join(candStaging, "raw-skill.json"),
              JSON.stringify(rawSkillManifest, null, 2),
              "utf-8"
            );

            const targetDir = this.resolveTargetDir(
              candidateSkillId,
              params.target,
              params.projectId,
              params.projectRoot
            );
            if (fs.existsSync(targetDir)) {
              fs.rmSync(targetDir, { recursive: true, force: true });
            }
            fs.mkdirSync(targetDir, { recursive: true });
            this.copyDirRecursive(candStaging, targetDir);
            this.sanitizeTargetDir(targetDir);
          }

          const projectDirs =
            params.projectId && params.projectRoot
              ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
              : [];
          this.registry.reload(projectDirs);

          const allImported = this.registry.listSkills({ collectionId, projectId: params.projectId });
          return {
            success: true,
            collection: {
              id: collectionId,
              name: collectionName,
              count: allImported.length,
            },
            skills: allImported,
            skill: allImported[0],
          };
        }
      }

      const rootPrefix = resolveZipPrefix(entries, params.subPath);

      // Verify subPath exists in zip entries if specified
      if (params.subPath) {
        const subExists = entries.some(
          (e) => e.name.startsWith(rootPrefix) || e.name === rootPrefix.replace(/\/$/, "")
        );
        if (!subExists) {
          return {
            success: false,
            code: "CANDIDATE_PATH_NOT_FOUND",
            stage: "resolve_subpath",
            message: `所选 candidate 路径不存在于 ZIP 归档中: ${params.subPath}`,
            error: `所选 candidate 路径不存在于 ZIP 归档中: ${params.subPath}`,
          };
        }
      }

      // Step 3: Extract safe declarative files into staging directory (Declarative Sanitization)
      for (const entry of entries) {
        if (!entry.name.startsWith(rootPrefix)) continue;
        const relativeName = entry.name.slice(rootPrefix.length);
        if (!relativeName || relativeName === "/") continue;

        // Declarative Sanitization: Skip executable files
        if (!entry.isDirectory && EXECUTABLE_FILE_REGEX.test(relativeName)) {
          continue;
        }

        const outPath = path.join(stagingDir, relativeName);
        const resolvedOut = path.resolve(outPath);
        if (!resolvedOut.startsWith(path.resolve(stagingDir))) {
          return {
            success: false,
            code: "ZIP_SLIP_ATTEMPT",
            stage: "declarative_sanitization",
            message: `Zip Slip security violation: '${entry.name}' escapes staging directory`,
            error: `Zip Slip security violation: '${entry.name}' escapes staging directory`,
          };
        }

        if (entry.isDirectory) {
          fs.mkdirSync(resolvedOut, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
          fs.writeFileSync(resolvedOut, entry.data);
        }
      }

      // Step 4: Assert Executable Files = 0 in staging directory
      this.sanitizeTargetDir(stagingDir);
      const remainingExecutables = this.findExecutableFilesInDir(stagingDir);
      if (remainingExecutables.length > 0) {
        return {
          success: false,
          code: "EXECUTABLE_FILES_PERSISTED",
          stage: "declarative_sanitization",
          message: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
          error: `Staging directory contains forbidden executable files after sanitization: ${remainingExecutables.join(", ")}`,
        };
      }

      // Step 5: Manifest Injection / Setup in Staging
      if (params.customYaml) {
        let parsedCustom: any;
        try {
          parsedCustom = YAML.parse(params.customYaml);
        } catch (err: any) {
          return {
            success: false,
            code: "MANIFEST_PARSE_ERROR",
            stage: "manifest_injection",
            message: `Failed to parse skill.yaml manifest: ${err.message}`,
            error: err.message,
            details: { parseError: err.message },
          };
        }

        let canonicalYaml = params.customYaml;
        try {
          if (parsedCustom && typeof parsedCustom === "object") {
            canonicalYaml = YAML.stringify(parsedCustom, { indent: 2, lineWidth: 0 });
          }
        } catch {}

        fs.writeFileSync(path.join(stagingDir, "skill.yaml"), canonicalYaml, "utf-8");
      }

      const stagingYamlPath = path.join(stagingDir, "skill.yaml");
      const stagingYmlPath = path.join(stagingDir, "skill.yml");
      const activeYaml = fs.existsSync(stagingYamlPath)
        ? stagingYamlPath
        : fs.existsSync(stagingYmlPath)
        ? stagingYmlPath
        : null;

      if (!activeYaml) {
        // Raw User Skill import flow for ZIP
        const candidateDocs: string[] = [];
        try {
          const scan = (d: string, prefix = "") => {
            for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
              const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
              if (ent.isDirectory()) {
                if (["references", "docs", "doc", "examples", "agents", "skills"].includes(ent.name.toLowerCase())) {
                  scan(path.join(d, ent.name), rel);
                }
              } else if (ent.isFile() && /\.(md|txt)$/i.test(ent.name)) {
                candidateDocs.push(rel);
              }
            }
          };
          scan(stagingDir);
        } catch {}

        const mdPath = path.join(stagingDir, "SKILL.md");
        const lowerMdPath = path.join(stagingDir, "skill.md");
        const readmePath = path.join(stagingDir, "README.md");
        const readmeZhPath = path.join(stagingDir, "README_zh.md");
        const activeDocPath = fs.existsSync(mdPath)
          ? mdPath
          : fs.existsSync(lowerMdPath)
          ? lowerMdPath
          : fs.existsSync(readmePath)
          ? readmePath
          : fs.existsSync(readmeZhPath)
          ? readmeZhPath
          : candidateDocs.length > 0
          ? path.join(stagingDir, candidateDocs[0]!)
          : null;

        if (!activeDocPath) {
          return {
            success: false,
            code: "DOCUMENTATION_MISSING",
            stage: "staging_validation",
            message: "未发现有效文档 (SKILL.md 或 README.md)",
            error: "未发现有效文档 (SKILL.md 或 README.md)",
            validationErrors: ["Missing documentation file (SKILL.md or README.md) in ZIP archive"],
          };
        }

        const primaryDocName = path.relative(stagingDir, activeDocPath).replace(/\\/g, "/");
        let markdownContent = "";
        try {
          markdownContent = fs.readFileSync(activeDocPath, "utf-8");
        } catch {}

        let skillMdText = "";
        let readmeText = "";
        if (primaryDocName.toLowerCase() === "skill.md") {
          skillMdText = markdownContent;
        } else {
          readmeText = markdownContent;
        }
        if (!skillMdText && (fs.existsSync(mdPath) || fs.existsSync(lowerMdPath))) {
          try { skillMdText = fs.readFileSync(fs.existsSync(mdPath) ? mdPath : lowerMdPath, "utf-8"); } catch {}
        }
        if (!readmeText && (fs.existsSync(readmePath) || fs.existsSync(readmeZhPath))) {
          try { readmeText = fs.readFileSync(fs.existsSync(readmePath) ? readmePath : readmeZhPath, "utf-8"); } catch {}
        }

        const singleRoot = detectZipRootPrefix(entries);
        const pkgName = params.subPath
          ? path.basename(params.subPath.replace(/[\\/]+$/, ""))
          : singleRoot
          ? singleRoot.replace(/\/$/, "")
          : typeof params.zipBufferOrPath === "string"
          ? path.basename(params.zipBufferOrPath, ".zip")
          : "custom-skill";

        const resolvedName = resolveRawSkillName({
          skillMdContent: skillMdText,
          readmeContent: readmeText,
          folderName: pkgName,
          zipName: typeof params.zipBufferOrPath === "string" ? path.basename(params.zipBufferOrPath) : undefined,
        });

        const skillId = "user." + slugify(pkgName);

        // Namespace protection
        if (skillId.startsWith("nexus.")) {
          return {
            success: false,
            code: "RESERVED_BUILTIN_NAMESPACE",
            stage: "conflict_check",
            message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
            validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
          };
        }

        // Existing skill conflict check
        const existing = this.registry.getSkill(skillId, params.projectId);
        if (existing && !params.overwrite) {
          return {
            success: false,
            code: "SKILL_ALREADY_EXISTS",
            stage: "conflict_check",
            message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
            error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          };
        }

        // Validate raw skill
        const rawVal = this.validator.validateRaw(stagingDir, {
          id: skillId,
          name: resolvedName,
          markdownContent,
        });

        if (!rawVal.valid) {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: rawVal.errors.join("; "),
            error: `Raw Skill 校验失败: ${rawVal.errors.join("; ")}`,
            validationErrors: rawVal.errors,
          };
        }

        // Write raw-skill.json into staging
        const rawSkillManifest = {
          id: skillId,
          name: resolvedName,
          type: "raw",
          version: "1.0.0",
          description: markdownContent.slice(0, 150).replace(/[#*`\n]/g, " ").trim(),
          primaryDocument: primaryDocName,
          availableDocuments: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          documents: candidateDocs.length > 0 ? candidateDocs : [primaryDocName],
          importedAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          path.join(stagingDir, "raw-skill.json"),
          JSON.stringify(rawSkillManifest, null, 2),
          "utf-8"
        );

        // Atomic Install from Staging to Destination
        const targetDir = this.resolveTargetDir(
          skillId,
          params.target,
          params.projectId,
          params.projectRoot
        );

        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        this.copyDirRecursive(stagingDir, targetDir);
        this.sanitizeTargetDir(targetDir);

        if (!fs.existsSync(path.join(targetDir, "raw-skill.json")) && !fs.existsSync(path.join(targetDir, primaryDocName))) {
          return {
            success: false,
            code: "FILESYSTEM_COMMIT_FAILED",
            stage: "filesystem_commit",
            message: "安装提交失败：目标目录缺少关键文件",
            error: "安装提交失败：目标目录缺少关键文件",
          };
        }

        // Registry reload
        const projectDirs =
          params.projectId && params.projectRoot
            ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
            : [];
        this.registry.reload(projectDirs);

        const skill = this.registry.getSkill(skillId, params.projectId);
        if (!skill) {
          return {
            success: false,
            code: "REGISTRY_RELOAD_FAILED",
            stage: "registry_reload",
            message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
            error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          };
        }

        const { instructions: _unused, ...meta } = skill;
        return {
          success: true,
          skill: meta,
        };
      }

      let parsedYaml: any;
      try {
        const rawYaml = fs.readFileSync(activeYaml, "utf-8");
        parsedYaml = YAML.parse(rawYaml);
      } catch (err: any) {
        return {
          success: false,
          code: "MANIFEST_PARSE_ERROR",
          stage: "manifest_injection",
          message: `Failed to parse skill.yaml manifest: ${err.message}`,
          error: `Failed to parse skill.yaml manifest: ${err.message}`,
          validationErrors: [err.message],
        };
      }

      // Preserve / ensure SKILL.md in staging
      const stagingMdPath = path.join(stagingDir, "SKILL.md");
      const stagingLowerMdPath = path.join(stagingDir, "skill.md");
      const hasStagingMd = fs.existsSync(stagingMdPath) || fs.existsSync(stagingLowerMdPath);

      if (!hasStagingMd) {
        if (params.customYaml) {
          const readme = path.join(stagingDir, "README.md");
          const readmeZh = path.join(stagingDir, "README_zh.md");
          if (fs.existsSync(readme)) {
            fs.copyFileSync(readme, stagingMdPath);
          } else if (fs.existsSync(readmeZh)) {
            fs.copyFileSync(readmeZh, stagingMdPath);
          } else {
            fs.writeFileSync(
              stagingMdPath,
              `# ${parsedYaml?.id || "skill"}\n\n${parsedYaml?.name?.["zh-CN"] || ""}\n`,
              "utf-8"
            );
          }
        } else {
          return {
            success: false,
            code: "SKILL_IMPORT_VALIDATION_FAILED",
            stage: "staging_validation",
            message: "Missing required SKILL.md instructions file in ZIP archive",
            error: "Missing required SKILL.md instructions file in ZIP archive",
            validationErrors: ["Missing required SKILL.md instructions file in ZIP archive"],
          };
        }
      }

      const activeMd = fs.existsSync(stagingMdPath) ? stagingMdPath : stagingLowerMdPath;
      const markdownContent = fs.readFileSync(activeMd, "utf-8");

      // Step 6: Strict Validate STAGING DIRECTORY
      const valResult = this.validator.validate(stagingDir, parsedYaml, markdownContent, {
        isBuiltin: false,
        strictExecutables: true, // Strict mode on sanitized staging
      });

      if (!valResult.valid) {
        return {
          success: false,
          code: "SKILL_IMPORT_VALIDATION_FAILED",
          stage: "staging_validation",
          message: valResult.errors.join("; "),
          error: `声明式配置校验失败: ${valResult.errors.join("; ")}`,
          validationErrors: valResult.errors,
          details: valResult.errors,
        };
      }

      const skillId = parsedYaml.id;

      // Step 7: Check Namespace & Existing Conflict
      if (skillId.startsWith("nexus.")) {
        return {
          success: false,
          code: "RESERVED_BUILTIN_NAMESPACE",
          stage: "conflict_check",
          message: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          error: "nexus.* 命名空间仅供 Nexus 官方内置技能使用，无法覆盖内置技能。",
          validationErrors: ["nexus.* 命名空间仅供 Nexus 官方内置技能使用。"],
        };
      }

      const existing = this.registry.getSkill(skillId, params.projectId);
      if (existing && !params.overwrite) {
        return {
          success: false,
          code: "SKILL_ALREADY_EXISTS",
          stage: "conflict_check",
          message: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
          error: `该 Skill (${skillId}) 已存在版本 ${existing.version}，请确认是否替换。`,
        };
      }

      // Step 8: Atomic Install from Staging to Destination
      const targetDir = this.resolveTargetDir(
        skillId,
        params.target,
        params.projectId,
        params.projectRoot
      );

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      this.copyDirRecursive(stagingDir, targetDir);
      this.sanitizeTargetDir(targetDir);

      if (!fs.existsSync(path.join(targetDir, "skill.yaml")) || !fs.existsSync(path.join(targetDir, "SKILL.md"))) {
        return {
          success: false,
          code: "FILESYSTEM_COMMIT_FAILED",
          stage: "filesystem_commit",
          message: "安装提交失败：目标目录缺少关键文件",
          error: "安装提交失败：目标目录缺少关键文件",
        };
      }

      // Step 9: Registry Reload
      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      const skill = this.registry.getSkill(skillId, params.projectId);
      if (!skill) {
        return {
          success: false,
          code: "REGISTRY_RELOAD_FAILED",
          stage: "registry_reload",
          message: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
          error: "Skill 已写入磁盘，但未能成功加载至技能注册表中",
        };
      }

      const { instructions: _unused, ...meta } = skill;
      return {
        success: true,
        skill: meta,
      };
    } catch (err: any) {
      return {
        success: false,
        code: "UNEXPECTED_IMPORT_ERROR",
        stage: "filesystem_commit",
        message: err.message || String(err),
        error: `导入失败: ${err.message || String(err)}`,
      };
    } finally {
      // Step 10: Clean up staging directory
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Delete a user or project skill. Built-in skills cannot be deleted.
   */
  async deleteSkill(params: {
    skillId: string;
    target?: "user" | "project";
    projectId?: string;
    projectRoot?: string;
  }): Promise<SkillDeleteResult> {
    // 1. Try registry getSkill
    let existing = this.registry.getSkill(params.skillId, params.projectId);

    // If not found by exact ID, search in all skills by id or name
    if (!existing) {
      const allSkills = this.registry.listSkills({ projectId: params.projectId });
      const found = allSkills.find(
        (s) =>
          s.id === params.skillId ||
          s.id.endsWith(`.${params.skillId}`) ||
          params.skillId.endsWith(`.${s.id}`)
      );
      if (found) {
        existing = this.registry.getSkill(found.id, params.projectId);
      }
    }

    if (existing && existing.source === "builtin") {
      return {
        success: false,
        skillId: params.skillId,
        error: "内置技能不可删除",
      };
    }

    const userDir = path.resolve(this.loader.getUserDir());
    const dirsToDelete = new Set<string>();

    // If existing has a sourcePath, verify it is safely deletable
    if (existing?.sourcePath && fs.existsSync(existing.sourcePath)) {
      const resolvedPath = path.resolve(existing.sourcePath);
      // Ensure we don't delete system roots
      if (
        resolvedPath.startsWith(userDir) ||
        (params.projectRoot && resolvedPath.startsWith(path.resolve(params.projectRoot))) ||
        resolvedPath.includes(path.join(".nexus", "skills")) ||
        resolvedPath.includes("LocalBridge")
      ) {
        dirsToDelete.add(resolvedPath);
      }
    }

    // Try standard candidate paths in userDir
    const userTargetDir = path.join(userDir, params.skillId);
    if (path.resolve(userTargetDir).startsWith(userDir) && fs.existsSync(userTargetDir)) {
      dirsToDelete.add(path.resolve(userTargetDir));
    }

    const strippedId = params.skillId.replace(/^(user|project)\./, "");
    const strippedUserTargetDir = path.join(userDir, strippedId);
    if (path.resolve(strippedUserTargetDir).startsWith(userDir) && fs.existsSync(strippedUserTargetDir)) {
      dirsToDelete.add(path.resolve(strippedUserTargetDir));
    }

    if (params.projectRoot || existing?.source === "project") {
      const pRoot = params.projectRoot || (existing?.sourcePath ? path.resolve(existing.sourcePath, "../../..") : undefined);
      if (pRoot) {
        const projectSkillsDir = path.resolve(pRoot, ".nexus", "skills");
        const pTarget1 = path.join(projectSkillsDir, params.skillId);
        const pTarget2 = path.join(projectSkillsDir, strippedId);
        if (fs.existsSync(pTarget1)) dirsToDelete.add(path.resolve(pTarget1));
        if (fs.existsSync(pTarget2)) dirsToDelete.add(path.resolve(pTarget2));
      }
    }

    if (dirsToDelete.size === 0 && !existing) {
      return {
        success: false,
        skillId: params.skillId,
        error: `Skill '${params.skillId}' not found on disk or registry`,
      };
    }

    try {
      const removed: string[] = [];
      for (const d of dirsToDelete) {
        try {
          fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          removed.push(d);
        } catch (rmErr: any) {
          try {
            const files = fs.readdirSync(d);
            for (const f of files) {
              fs.rmSync(path.join(d, f), { recursive: true, force: true });
            }
            fs.rmdirSync(d);
            removed.push(d);
          } catch {
            throw rmErr;
          }
        }
      }

      // Remove from registry memory map
      this.registry.removeSkill(params.skillId);
      if (strippedId !== params.skillId) {
        this.registry.removeSkill(strippedId);
      }
      if (existing?.id) {
        this.registry.removeSkill(existing.id);
      }

      const projectDirs =
        params.projectId && params.projectRoot
          ? [{ projectId: params.projectId, rootPath: params.projectRoot }]
          : [];
      this.registry.reload(projectDirs);

      return {
        success: true,
        skillId: params.skillId,
        removedPath: removed.join("; ") || (existing?.sourcePath ?? params.skillId),
      };
    } catch (err: any) {
      return {
        success: false,
        skillId: params.skillId,
        error: `Failed to remove skill directory: ${err.message}`,
      };
    }
  }

  /**
   * Get raw config (skill.yaml and SKILL.md) for a skill.
   */
  getRawContent(skillId: string, projectId?: string): SkillRawContentResult {
    const skill = this.registry.getSkill(skillId, projectId);
    if (!skill) {
      throw new Error(`Skill '${skillId}' not found`);
    }

    let rawYaml = "";
    let markdownContent = skill.instructions || "";

    const yamlPath = path.join(skill.sourcePath, "skill.yaml");
    const ymlPath = path.join(skill.sourcePath, "skill.yml");
    const activeYaml = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;

    if (activeYaml && fs.existsSync(activeYaml)) {
      try {
        rawYaml = fs.readFileSync(activeYaml, "utf-8");
      } catch {
        rawYaml = "";
      }
    }

    return {
      skillId,
      rawYaml,
      markdownContent,
    };
  }

  private resolveTargetDir(
    skillId: string,
    target: "user" | "project",
    _projectId?: string,
    projectRoot?: string
  ): string {
    if (
      skillId.includes("..") ||
      skillId.includes("/") ||
      skillId.includes("\\") ||
      /^[a-zA-Z]:/i.test(skillId)
    ) {
      throw new Error(`Invalid skill ID '${skillId}': contains directory traversal characters`);
    }

    if (target === "user") {
      const userDir = path.resolve(this.loader.getUserDir());
      const dest = path.join(userDir, skillId);
      if (!path.resolve(dest).startsWith(userDir)) {
        throw new Error("Path traversal attempt in user skill destination");
      }
      return dest;
    } else if (target === "project") {
      if (!projectRoot) {
        throw new Error("Project root path is required for project skills");
      }
      const projectSkillsDir = path.resolve(projectRoot, ".nexus", "skills");
      const dest = path.join(projectSkillsDir, skillId);
      if (!path.resolve(dest).startsWith(projectSkillsDir)) {
        throw new Error("Path traversal attempt in project skill destination");
      }
      return dest;
    }

    throw new Error(`Unknown target '${target}'`);
  }

  private copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        if (!EXECUTABLE_FILE_REGEX.test(entry.name)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  private sanitizeTargetDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.sanitizeTargetDir(fullPath);
        } else if (entry.isFile()) {
          if (EXECUTABLE_FILE_REGEX.test(entry.name)) {
            try {
              fs.unlinkSync(fullPath);
            } catch {}
          }
        }
      }
    } catch {}
  }

  private buildPreview(params: {
    id: string;
    version: string | number;
    parsedYaml: any;
    markdownContent: string;
    rawYaml: string;
    errors: string[];
    securityWarning?: string;
    executableFilesFound: string[];
    target: "user" | "project";
    projectId?: string;
    validationStatus?: SkillValidationStatus;
    importMode?: "native" | "compatible" | "raw";
    skillType?: "nexus" | "raw";
    primaryDocument?: string;
    availableDocuments?: string[];
    documents?: string[];
    filesCount?: number;
    detectedRoot?: string;
    manifestFound?: boolean;
    skillDocFound?: boolean;
    candidateSkills?: SkillCandidate[];
    archiveTotalExecutables?: number;
    candidateExecutablesCount?: number;
    manifestRoundTripValid?: boolean;
    rootQualityNotice?: string;
    candidateQualityScore?: number;
    candidateQualityReasons?: string[];
    isCollection?: boolean;
    collectionName?: string;
    collectionId?: string;
  }): SkillImportPreview {
    const yaml = params.parsedYaml || {};
    const existing = this.registry.getSkill(params.id, params.projectId);

    const hasConflict = Boolean(existing);
    const isBuiltinConflict = existing?.source === "builtin" || params.id.startsWith("nexus.");
    const existingVersion = existing?.version;
    const existingSource = existing?.source;

    if (params.id.startsWith("nexus.")) {
      params.errors.push("nexus.* 命名空间仅供 Nexus 官方内置技能使用。");
    }

    const valid = params.validationStatus
      ? params.validationStatus === "valid" || params.validationStatus === "warning"
      : params.errors.length === 0;
    const status: SkillValidationStatus =
      params.validationStatus ||
      (!valid ? "invalid" : params.securityWarning ? "warning" : "valid");

    const nameText =
      yaml.name && typeof yaml.name === "object"
        ? yaml.name
        : typeof yaml.name === "string"
        ? { "zh-CN": yaml.name, "en-US": yaml.name }
        : { "zh-CN": params.id, "en-US": params.id };

    const descText =
      yaml.description && typeof yaml.description === "object"
        ? yaml.description
        : typeof yaml.description === "string"
        ? { "zh-CN": yaml.description, "en-US": yaml.description }
        : { "zh-CN": "", "en-US": "" };

    const tools = Array.isArray(yaml.tools) ? yaml.tools : [];
    const workflow = Array.isArray(yaml.workflow) ? yaml.workflow : [];
    const triggers = Array.isArray(yaml.triggers) ? yaml.triggers : [];

    const excludedCount =
      params.candidateExecutablesCount !== undefined
        ? params.candidateExecutablesCount
        : params.executableFilesFound.length;

    const isColl =
      params.isCollection !== undefined
        ? params.isCollection
        : Boolean(params.candidateSkills && params.candidateSkills.length > 1);

    return {
      valid,
      id: params.id,
      version: params.version,
      name: nameText,
      description: descText,
      category: (yaml.category as SkillCategory) || "general",
      risk: (yaml.risk as SkillRisk) || "medium",
      toolsCount: tools.length,
      workflowStepsCount: workflow.length,
      tools,
      workflow,
      triggers,
      validationStatus: status,
      validationErrors: params.errors,
      securityWarning: params.securityWarning,
      hasConflict,
      existingVersion,
      existingSource,
      isBuiltinConflict,
      executableFilesFound:
        params.executableFilesFound.length > 0 ? params.executableFilesFound : undefined,
      rawYaml: params.rawYaml,
      markdownContent: params.markdownContent,
      importMode: params.importMode || "native",
      skillType: params.skillType || (params.manifestFound ? "nexus" : "raw"),
      primaryDocument: params.primaryDocument || "SKILL.md",
      availableDocuments: params.availableDocuments,
      documents: params.documents || params.availableDocuments,
      filesCount: params.filesCount,
      detectedRoot: params.detectedRoot,
      manifestFound: params.manifestFound ?? true,
      skillDocFound: params.skillDocFound ?? true,
      candidateSkills: params.candidateSkills,
      excludedFilesCount: excludedCount,
      archiveTotalExecutables: params.archiveTotalExecutables,
      candidateExecutablesCount: params.candidateExecutablesCount,
      manifestRoundTripValid: params.manifestRoundTripValid ?? (params.validationStatus === "valid"),
      rootQualityNotice: params.rootQualityNotice,
      candidateQualityScore: params.candidateQualityScore,
      candidateQualityReasons: params.candidateQualityReasons,
      isCollection: isColl,
      collectionName: params.collectionName || (isColl ? normalizeCollectionName(params.detectedRoot || params.id) : undefined),
      collectionId: params.collectionId || (isColl ? normalizeCollectionId(params.collectionName || normalizeCollectionName(params.detectedRoot || params.id)) : undefined),
    };
  }

  private createInvalidPreview(_sourceType: "folder" | "zip", reason: string): SkillImportPreview {
    return {
      valid: false,
      id: "unknown",
      version: "1.0.0",
      name: { "zh-CN": "无效技能", "en-US": "Invalid Skill" },
      description: { "zh-CN": reason, "en-US": reason },
      category: "general",
      risk: "medium",
      toolsCount: 0,
      workflowStepsCount: 0,
      tools: [],
      workflow: [],
      triggers: [],
      validationStatus: "invalid",
      validationErrors: [reason],
      hasConflict: false,
      isBuiltinConflict: false,
      importMode: "native",
      manifestFound: false,
      skillDocFound: false,
      excludedFilesCount: 0,
    };
  }
}
