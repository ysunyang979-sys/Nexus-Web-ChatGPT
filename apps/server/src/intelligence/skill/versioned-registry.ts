import crypto from "node:crypto";
import type {
  VersionedSkillRecord,
  SkillVersion,
  SkillValidationReport,
  SkillStatusType,
  SkillSourceType,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import { SkillValidator } from "./validator.js";
import type { Logger } from "@localbridge/shared";

export class VersionedSkillRegistry {
  private readonly validator: SkillValidator;

  constructor(
    private readonly store: IntelligenceStore,
    private readonly logger?: Logger
  ) {
    this.validator = new SkillValidator();
  }

  getValidator(): SkillValidator {
    return this.validator;
  }

  /**
   * Register or update a Skill and its initial/subsequent version.
   */
  createSkillWithVersion(params: {
    skillId: string;
    name: string;
    version: string;
    description: string;
    capabilities?: string[];
    steps?: any[];
    tools?: string[];
    parameters?: Record<string, any>;
    preconditions?: string[];
    successConditions?: string[];
    errorHandling?: Record<string, any>;
    dependencies?: string[];
    instructions?: string;
    source?: SkillSourceType;
    changelog?: string;
    projectId?: string;
    tags?: string[];
  }): { skill: VersionedSkillRecord; validation: SkillValidationReport } {
    const now = Date.now();
    const hash = crypto
      .createHash("sha256")
      .update(`${params.skillId}:${params.version}:${params.instructions || ""}:${JSON.stringify(params.steps || [])}`)
      .digest("hex");

    const versionObj: SkillVersion = {
      version: params.version,
      skillId: params.skillId,
      name: params.name,
      description: params.description,
      capabilities: params.capabilities || [],
      steps: params.steps || [],
      tools: params.tools || [],
      parameters: params.parameters || {},
      preconditions: params.preconditions || [],
      successConditions: params.successConditions || [],
      errorHandling: params.errorHandling || {},
      dependencies: params.dependencies || [],
      instructions: params.instructions || "",
      source: params.source || "USER_UPLOADED",
      hash,
      changelog: params.changelog,
      createdAt: now,
    };

    // 1. Validate
    const validation = this.validator.validate({ skillId: params.skillId, version: versionObj });
    this.store.saveSkillValidation(validation);

    if (validation.validationStatus === "invalid") {
      throw new Error(`Skill validation failed: ${validation.validationErrors.join("; ")}`);
    }

    // 2. Save Skill base
    const existing = this.store.getSkill(params.skillId);
    this.store.saveSkill({
      skillId: params.skillId,
      name: params.name,
      activeVersion: existing?.activeVersion || params.version,
      description: params.description,
      source: params.source || existing?.source || "USER_UPLOADED",
      status: "ACTIVE",
      projectId: params.projectId || existing?.projectId,
      tags: params.tags || existing?.tags || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    // 3. Save Version
    this.store.saveSkillVersion(versionObj);

    const updated = this.store.getSkill(params.skillId)!;
    this.logger?.info({ skillId: params.skillId, version: params.version }, "Saved versioned skill");
    return { skill: updated, validation };
  }

  getSkill(skillId: string): VersionedSkillRecord | null {
    return this.store.getSkill(skillId);
  }

  listSkills(filter?: {
    projectId?: string;
    status?: SkillStatusType;
    source?: SkillSourceType;
  }): VersionedSkillRecord[] {
    return this.store.listSkills(filter);
  }

  activateVersion(skillId: string, version: string): boolean {
    const success = this.store.activateSkillVersion(skillId, version);
    if (success) {
      this.logger?.info({ skillId, version }, "Activated skill version");
    }
    return success;
  }

  rollbackVersion(skillId: string, targetVersion: string): boolean {
    const success = this.store.rollbackSkillVersion(skillId, targetVersion);
    if (success) {
      this.logger?.info({ skillId, targetVersion }, "Rolled back skill active version");
    }
    return success;
  }

  disableSkill(skillId: string): boolean {
    const skill = this.store.getSkill(skillId);
    if (!skill) return false;
    this.store.saveSkill({
      ...skill,
      status: "DISABLED",
      updatedAt: Date.now(),
    });
    return true;
  }

  deleteSkill(skillId: string): boolean {
    return this.store.deleteSkill(skillId);
  }

  compareVersions(
    skillId: string,
    v1: string,
    v2: string
  ): {
    skillId: string;
    version1: string;
    version2: string;
    toolDiff: { added: string[]; removed: string[] };
    stepDiff: { v1StepsCount: number; v2StepsCount: number };
    changelog?: string;
  } {
    const skill = this.store.getSkill(skillId);
    if (!skill) throw new Error(`Skill '${skillId}' not found`);

    const ver1 = skill.versions.find((v) => v.version === v1);
    const ver2 = skill.versions.find((v) => v.version === v2);
    if (!ver1 || !ver2) {
      throw new Error(`One or both versions (${v1}, ${v2}) not found for skill '${skillId}'`);
    }

    const tools1 = new Set(ver1.tools);
    const tools2 = new Set(ver2.tools);
    const addedTools = Array.from(tools2).filter((t) => !tools1.has(t));
    const removedTools = Array.from(tools1).filter((t) => !tools2.has(t));

    return {
      skillId,
      version1: v1,
      version2: v2,
      toolDiff: { added: addedTools, removed: removedTools },
      stepDiff: { v1StepsCount: ver1.steps.length, v2StepsCount: ver2.steps.length },
      changelog: ver2.changelog,
    };
  }
}
