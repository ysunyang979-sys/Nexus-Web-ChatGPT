import crypto from "node:crypto";
import type {
  AiSkillCandidate,
  AiSkillCandidateEvidence,
  SkillStatusType,
  VersionedSkillRecord,
} from "@localbridge/protocol";
import type { IntelligenceStore } from "../store.js";
import type { VersionedSkillRegistry } from "./versioned-registry.js";
import type { Logger } from "@localbridge/shared";

export class SkillCandidateManager {
  constructor(
    private readonly store: IntelligenceStore,
    private readonly registry: VersionedSkillRegistry,
    private readonly logger?: Logger
  ) {}

  /**
   * WebAI / GPT proposes a skill candidate based on real execution evidence.
   */
  proposeCandidate(params: {
    skillId: string;
    name: string;
    description: string;
    proposedBy?: string;
    extractedSteps: any[];
    tools: string[];
    parameters?: Record<string, any>;
    preconditions?: string[];
    successConditions?: string[];
    errorHandling?: Record<string, any>;
    dependencies?: string[];
    instructions?: string;
    evidence: AiSkillCandidateEvidence;
  }): AiSkillCandidate {
    const candidateId = `sk_cand_${crypto.randomUUID()}`;
    const now = Date.now();

    const candidate: AiSkillCandidate = {
      candidateId,
      skillId: params.skillId,
      name: params.name,
      description: params.description,
      proposedBy: params.proposedBy || "WebAI/GPT",
      extractedSteps: params.extractedSteps || [],
      tools: params.tools || [],
      parameters: params.parameters || {},
      preconditions: params.preconditions || [],
      successConditions: params.successConditions || [],
      errorHandling: params.errorHandling || {},
      dependencies: params.dependencies || [],
      instructions: params.instructions || "",
      evidence: params.evidence,
      status: "CANDIDATE",
      createdAt: now,
      updatedAt: now,
    };

    this.store.saveSkillCandidate(candidate);
    this.logger?.info(
      { candidateId, skillId: candidate.skillId, sourceTaskId: params.evidence.sourceTaskId },
      "Registered AI-generated skill candidate"
    );
    return candidate;
  }

  getCandidate(candidateId: string): AiSkillCandidate | null {
    return this.store.getSkillCandidate(candidateId);
  }

  listCandidates(status?: SkillStatusType): AiSkillCandidate[] {
    return this.store.listSkillCandidates(status);
  }

  /**
   * Promotes a reviewed candidate into an official active skill.
   */
  acceptCandidate(
    candidateId: string,
    options?: {
      targetVersion?: string;
      reviewNotes?: string;
      reviewedBy?: string;
    }
  ): { skill: VersionedSkillRecord; candidate: AiSkillCandidate } {
    const cand = this.store.getSkillCandidate(candidateId);
    if (!cand) throw new Error(`Skill candidate '${candidateId}' not found`);

    const version = options?.targetVersion || "1.0.0";

    // 1. Create in Versioned Registry (triggers 6-point validator)
    const { skill } = this.registry.createSkillWithVersion({
      skillId: cand.skillId || `skill_${candidateId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      name: cand.name || (cand as any).proposedName || "AI Generated Skill",
      version,
      description: cand.description || (cand as any).proposedDescription || "AI Generated Skill Workflow",
      steps: (cand.extractedSteps && cand.extractedSteps.length > 0) ? cand.extractedSteps : ((cand as any).steps || []),
      tools: (cand.tools && cand.tools.length > 0) ? cand.tools : ((cand as any).requiredTools || []),
      parameters: cand.parameters || {},
      preconditions: cand.preconditions || [],
      successConditions: cand.successConditions || [],
      errorHandling: cand.errorHandling || {},
      dependencies: cand.dependencies || [],
      instructions: cand.instructions || (cand as any).rationale || "",
      source: "AI_GENERATED",
      changelog: `Generated from Task ${cand.evidence?.sourceTaskId || "interactive"} by ${cand.proposedBy || "AI"}`,
      tags: ["AI_GENERATED", "AUTO_GENERATED"],
    });

    // 2. Mark candidate as ACTIVE
    this.store.reviewSkillCandidate(
      candidateId,
      "ACTIVE",
      options?.reviewNotes || `Promoted to official skill version ${version}`,
      options?.reviewedBy || "user"
    );

    const updatedCand = this.store.getSkillCandidate(candidateId)!;
    return { skill, candidate: updatedCand };
  }

  rejectCandidate(candidateId: string, reason?: string, reviewer?: string): boolean {
    return this.store.reviewSkillCandidate(candidateId, "REJECTED", reason || "Rejected by user", reviewer || "user");
  }

  reviewCandidate(
    candidateId: string,
    action: "accept" | "reject",
    reviewNotes?: string,
    reviewedBy?: string,
    targetVersion?: string
  ): { success: boolean; action: "accept" | "reject"; candidate: AiSkillCandidate; skill?: VersionedSkillRecord } {
    if (action === "accept") {
      const res = this.acceptCandidate(candidateId, {
        targetVersion,
        reviewNotes,
        reviewedBy,
      });
      return { success: true, action: "accept", candidate: res.candidate, skill: res.skill };
    } else {
      const ok = this.rejectCandidate(candidateId, reviewNotes, reviewedBy);
      const cand = this.store.getSkillCandidate(candidateId)!;
      return { success: ok, action: "reject", candidate: cand };
    }
  }

  deleteCandidate(candidateId: string): boolean {
    return this.store.deleteSkillCandidate(candidateId);
  }
}

