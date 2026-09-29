import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  SkillDefinition,
  SkillMetadata,
  SkillListFilter,
  SkillMatchResult,
  SkillCollection,
  SkillSource,
} from "@localbridge/protocol";
import type { SkillLoader } from "./skill-loader.js";
import { SkillResolver } from "./skill-resolver.js";

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private readonly resolver: SkillResolver;

  constructor(private readonly loader: SkillLoader) {
    this.resolver = new SkillResolver(this);
    this.reload();
  }

  reload(projectDirs: Array<{ projectId: string; rootPath: string }> = []): void {
    const loaded = this.loader.loadAll(projectDirs);
    this.skills.clear();

    // Pass 1: Register Built-in skills first (they have highest precedence)
    for (const skill of loaded) {
      if (skill.source === "builtin") {
        this.skills.set(skill.id, skill);
      }
    }

    // Pass 2: Register User and Project skills, detecting conflicts
    for (const skill of loaded) {
      if (skill.source === "builtin") continue;

      const existing = this.skills.get(skill.id);
      if (existing) {
        if (existing.source === "builtin") {
          // Cannot override built-in skill
          this.skills.set(`${skill.id}__conflict_${skill.source}_${skill.projectId || "user"}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Skill ID '${skill.id}' conflicts with official built-in skill namespace and cannot be loaded`,
            ],
          });
        } else {
          // Duplicate user/project skill
          this.skills.set(`${skill.id}__conflict_${Date.now()}`, {
            ...skill,
            enabled: false,
            validationStatus: "conflict",
            validationErrors: [
              ...(skill.validationErrors || []),
              `Duplicate skill ID '${skill.id}' detected from ${skill.sourcePath}`,
            ],
          });
        }
      } else {
        this.skills.set(skill.id, skill);
      }
    }
  }

  listSkills(filter: SkillListFilter = {}): SkillMetadata[] {
    const results: SkillMetadata[] = [];

    for (const skill of this.skills.values()) {
      // Filter out project-scoped skills that belong to other projects
      if (skill.source === "project") {
        if (!filter.projectId || skill.projectId !== filter.projectId) {
          continue;
        }
      }

      if (filter.category && skill.category !== filter.category) {
        continue;
      }

      if (filter.source && skill.source !== filter.source) {
        continue;
      }

      if (filter.collectionId && skill.collectionId !== filter.collectionId) {
        continue;
      }

      if (filter.type && skill.type !== filter.type) {
        continue;
      }

      if (filter.enabledOnly && !skill.enabled) {
        continue;
      }

      // Convert definition to metadata (exclude full instructions markdown to save memory / bandwidth)
      const { instructions: _unused, ...meta } = skill;
      results.push(meta);
    }

    return results;
  }

  listCollections(filter: { projectId?: string; source?: SkillSource } = {}): SkillCollection[] {
    const collectionMap = new Map<string, SkillCollection>();

    for (const skill of this.skills.values()) {
      if (skill.source === "project" && filter.projectId && skill.projectId !== filter.projectId) {
        continue;
      }
      if (filter.source && skill.source !== filter.source) {
        continue;
      }
      if (!skill.collectionId) {
        continue;
      }

      let coll = collectionMap.get(skill.collectionId);
      if (!coll) {
        coll = {
          id: skill.collectionId,
          name: skill.collectionName || skill.collectionId.replace(/^collection\./, ""),
          source: skill.source,
          skillsCount: 0,
          enabledSkillsCount: 0,
          skillIds: [],
          importedAt: skill.importedAt,
        };
        collectionMap.set(skill.collectionId, coll);
      }

      coll.skillsCount++;
      if (skill.enabled) {
        coll.enabledSkillsCount++;
      }
      coll.skillIds.push(skill.id);
    }

    return Array.from(collectionMap.values());
  }

  getCollection(collectionId: string, projectId?: string): SkillCollection | null {
    const list = this.listCollections({ projectId });
    return list.find((c) => c.id === collectionId) || null;
  }

  getSkill(id: string, projectId?: string): SkillDefinition | null {
    const skill = this.skills.get(id);
    if (!skill) {
      return null;
    }

    // If it's a project skill, it can only be accessed with matching projectId
    if (skill.source === "project" && projectId && skill.projectId !== projectId) {
      return null;
    }

    return skill;
  }

  toggleSkill(id: string, enabled: boolean): boolean {
    const skill = this.skills.get(id);
    if (!skill) {
      return false;
    }

    // Cannot enable an invalid or conflict skill
    if (enabled && (skill.validationStatus === "invalid" || skill.validationStatus === "conflict")) {
      return false;
    }

    skill.enabled = enabled;

    // Persist to raw-skill.json or skill.yaml on disk if possible
    try {
      if (skill.sourcePath) {
        const rawJsonPath = path.join(skill.sourcePath, "raw-skill.json");
        if (fs.existsSync(rawJsonPath)) {
          const content = JSON.parse(fs.readFileSync(rawJsonPath, "utf-8"));
          content.enabled = enabled;
          fs.writeFileSync(rawJsonPath, JSON.stringify(content, null, 2), "utf-8");
        } else {
          const yamlPath = path.join(skill.sourcePath, "skill.yaml");
          const ymlPath = path.join(skill.sourcePath, "skill.yml");
          const activeYaml = fs.existsSync(yamlPath) ? yamlPath : fs.existsSync(ymlPath) ? ymlPath : null;
          if (activeYaml) {
            const parsed = YAML.parse(fs.readFileSync(activeYaml, "utf-8")) || {};
            parsed.enabled = enabled;
            fs.writeFileSync(activeYaml, YAML.stringify(parsed), "utf-8");
          }
        }
      }
    } catch {}

    return true;
  }

  toggleCollection(
    collectionId: string,
    enabled: boolean,
    projectId?: string
  ): { success: boolean; modifiedCount: number; skills: SkillMetadata[] } {
    const list = this.listSkills({ collectionId, projectId });
    let modified = 0;
    for (const skill of list) {
      if (this.toggleSkill(skill.id, enabled)) {
        modified++;
      }
    }
    const updated = this.listSkills({ collectionId, projectId });
    return { success: true, modifiedCount: modified, skills: updated };
  }

  removeSkill(id: string): boolean {
    let deleted = this.skills.delete(id);
    for (const [key, skill] of this.skills.entries()) {
      if (skill.id === id || key.startsWith(`${id}__conflict_`)) {
        this.skills.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }

  matchSkills(
    query: string,
    projectId?: string,
    layaRecommendation?: string,
    collectionId?: string
  ): SkillMatchResult {
    return this.resolver.resolve(query, projectId, layaRecommendation, collectionId);
  }
}
