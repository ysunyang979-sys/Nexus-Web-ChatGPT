import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ProjectListItem,
  type ProjectInfoResult,
  type ProjectValidateResult,
  type ProjectTrustLevel,
  type FileActionPolicy,
  type CommandActionPolicy,
  type ProtectedFilesPolicy,
  type ProjectCustomRules,
  type ProjectTrustPolicy,
} from "@localbridge/protocol";
import { resolveProjectPath, isSensitiveFile } from "@localbridge/security";
import type { Logger } from "@localbridge/shared";
import type { RunnerProjectRecord, ProjectStateFile } from "./types.js";
import { loadProjectsState, saveProjectsState } from "./storage.js";

function normalizeCanonicalPath(p: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch {
    resolved = fs.realpathSync(p);
  }
  if (process.platform === "win32" && resolved.startsWith("\\\\?\\")) {
    resolved = resolved.slice(4);
  }
  return path.normalize(resolved);
}

function getComparisonKey(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

export class ProjectRegistry extends EventEmitter {
  private readonly projects = new Map<string, RunnerProjectRecord>();
  private readonly sessionTrustGrants = new Map<string, Set<string>>();
  private safetyLayerDisabled: boolean = false;

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
    this.logger?.info({ disabled }, "Safety layer status updated in ProjectRegistry");
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  constructor(
    private readonly storagePath: string,
    private readonly logger?: Logger
  ) {
    super();
    this.reload();
  }

  /**
   * Reload projects from persistent storage
   */
  reload(): void {
    this.projects.clear();
    const state: ProjectStateFile = loadProjectsState(this.storagePath);
    for (const p of state.projects) {
      let trustPolicy = p.trustPolicy;
      if (trustPolicy && trustPolicy.canonicalRoot !== p.canonicalRoot) {
        trustPolicy = {
          trustLevel: "standard",
          canonicalRoot: p.canonicalRoot,
          policyVersion: (trustPolicy.policyVersion ?? 1) + 1,
          commandPolicy: "ask",
          protectedFilesPolicy: "always-ask",
          updatedAt: Date.now(),
        };
      }
      this.projects.set(p.id, {
        ...p,
        accessMode: p.accessMode ?? "read-only",
        executionMode: p.executionMode ?? "disabled",
        trustPolicy,
      });
    }
    this.logger?.debug(
      { count: this.projects.size, storagePath: this.storagePath },
      "Loaded authorized projects from disk"
    );
  }

  private save(): void {
    const state: ProjectStateFile = {
      version: 1,
      projects: Array.from(this.projects.values()),
    };
    saveProjectsState(this.storagePath, state);
  }

  /**
   * Authorize a new local directory.
   * Only runnable by local machine user via CLI.
   */
  add(projectPath: string, options?: { name?: string; accessMode?: "read-only" | "read-write" }): RunnerProjectRecord {
    const resolvedInput = path.resolve(projectPath);

    // 1. Must exist on disk
    if (!fs.existsSync(resolvedInput)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        `Project directory does not exist: "${resolvedInput}"`
      );
    }

    // 2. Must be a directory
    const stat = fs.statSync(resolvedInput);
    if (!stat.isDirectory()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY,
        `Project path is not a directory: "${resolvedInput}"`
      );
    }

    // 3. Resolve physical canonical root
    const canonicalRoot = normalizeCanonicalPath(resolvedInput);

    // 4. Duplicate root detection (Section 34)
    const newKey = getComparisonKey(canonicalRoot);
    for (const existing of this.projects.values()) {
      if (getComparisonKey(existing.canonicalRoot) === newKey) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.PROJECT_ALREADY_EXISTS,
          `A project with physical root "${canonicalRoot}" is already authorized (ID: ${existing.id})`
        );
      }
    }

    // 5. Generate stable project ID: proj_<UUIDv4>
    const id = `proj_${crypto.randomUUID()}`;
    const name = options?.name?.trim() || path.basename(canonicalRoot) || "Unnamed Project";

    const record: RunnerProjectRecord = {
      id,
      name,
      root: resolvedInput,
      canonicalRoot,
      enabled: true,
      accessMode: options?.accessMode ?? "read-only",
      executionMode: "disabled",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.projects.set(id, record);
    this.save();

    this.logger?.info(
      { event: "project_authorized", projectId: id, name },
      `Authorized project "${name}" (${id})`
    );

    return record;
  }

  /**
   * Remove an authorized project.
   */
  remove(projectId: string): boolean {
    const existing = this.projects.get(projectId);
    if (!existing) {
      return false;
    }

    this.projects.delete(projectId);
    this.save();

    this.logger?.info(
      { event: "project_removed", projectId },
      `Removed authorized project "${existing.name}" (${projectId})`
    );

    this.emit("project:removed", projectId);
    return true;
  }

  private ensureProjectRecord(projectId: string): RunnerProjectRecord | undefined {
    const existing = this.projects.get(projectId);
    if (existing) return existing;

    const match = projectId.match(/^(?:drive[-_]([a-zA-Z])|([a-zA-Z])(?::|盘|_drive|-drive))$/i);
    if (match && (this.safetyLayerDisabled || projectId.toLowerCase() === "drive-c")) {
      const driveLetter = (match[1] || match[2]).toUpperCase();
      const root = process.platform === "win32" ? `${driveLetter}:\\` : "/";
      if (process.platform !== "win32" || fs.existsSync(root)) {
        const name = driveLetter === "C" ? "C盘 (系统全盘访问)" : `${driveLetter}盘`;
        const record: RunnerProjectRecord = {
          id: projectId,
          name,
          root,
          canonicalRoot: root,
          enabled: true,
          accessMode: "read-write",
          executionMode: "project-code",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.projects.set(projectId, record);
        this.save();
        return record;
      }
    }

    return undefined;
  }

  /**
   * Enable an authorized project.
   */
  enable(projectId: string): boolean {
    const project = this.ensureProjectRecord(projectId);
    if (!project) return false;

    project.enabled = true;
    project.updatedAt = Date.now();
    this.save();
    this.emit("project:enabled", projectId);
    return true;
  }

  /**
   * Disable an authorized project.
   */
  disable(projectId: string): boolean {
    const project = this.ensureProjectRecord(projectId);
    if (!project) return false;

    project.enabled = false;
    project.updatedAt = Date.now();
    this.save();
    this.emit("project:disabled", projectId);
    return true;
  }

  /**
   * Set project access mode ("read-only" or "read-write").
   * Only callable by local machine user via CLI.
   */
  setAccessMode(
    projectId: string,
    accessMode: "read-only" | "read-write"
  ): RunnerProjectRecord {
    const project = this.ensureProjectRecord(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (accessMode !== "read-only" && accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        `Invalid access mode: "${accessMode}". Must be "read-only" or "read-write"`
      );
    }

    project.accessMode = accessMode;
    let downgradedExecution = false;
    // Security coupling: if accessMode is downgraded to read-only, project-code execution must be disabled
    if (accessMode === "read-only" && project.executionMode === "project-code") {
      project.executionMode = "disabled";
      downgradedExecution = true;
      this.logger?.warn(
        { event: "project_execution_mode_downgraded", projectId },
        `Downgraded executionMode to "disabled" because accessMode was set to "read-only"`
      );
    }
    project.updatedAt = Date.now();
    this.save();

    this.logger?.info(
      { event: "project_access_mode_changed", projectId, accessMode },
      `Set access mode for project "${project.name}" (${projectId}) to "${accessMode}"`
    );

    this.emit("project:access_mode_changed", projectId, accessMode);
    if (downgradedExecution) {
      this.emit("project:execution_mode_changed", projectId, "disabled");
    }

    return project;
  }

  /**
   * Set project execution mode ("disabled", "safe-only", or "project-code").
   * Only callable by local machine user via CLI.
   */
  setExecutionMode(
    projectId: string,
    executionMode: "disabled" | "safe-only" | "project-code"
  ): RunnerProjectRecord {
    const project = this.ensureProjectRecord(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (
      executionMode !== "disabled" &&
      executionMode !== "safe-only" &&
      executionMode !== "project-code"
    ) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.INVALID_REQUEST,
        `Invalid execution mode: "${executionMode}". Must be "disabled", "safe-only", or "project-code"`
      );
    }

    // Safety rule: project-code strictly requires read-write access
    if (executionMode === "project-code" && project.accessMode !== "read-write") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_EXECUTION_REQUIRES_WRITE_ACCESS,
        `Enabling executionMode "project-code" requires project accessMode to be "read-write"`
      );
    }

    project.executionMode = executionMode;
    project.updatedAt = Date.now();
    this.save();

    this.logger?.info(
      { event: "project_execution_mode_changed", projectId, executionMode },
      `Set execution mode for project "${project.name}" (${projectId}) to "${executionMode}"`
    );

    this.emit("project:execution_mode_changed", projectId, executionMode);
    return project;
  }

  /**
   * Get internal project record (Runner-private, contains physical root).
   */
  get(projectId: string): RunnerProjectRecord | undefined {
    const existing = this.projects.get(projectId);
    if (existing) return existing;

    if (this.safetyLayerDisabled || projectId.toLowerCase() === "drive-c") {
      const match = projectId.match(/^(?:drive[-_]([a-zA-Z])|([a-zA-Z])(?::|盘|_drive|-drive)?)$/i);
      if (match) {
        const driveLetter = (match[1] || match[2]).toUpperCase();
        const root = process.platform === "win32" ? `${driveLetter}:\\` : "/";
        const name = driveLetter === "C" ? "C盘 (系统全盘访问)" : `${driveLetter}盘`;
        return {
          id: projectId,
          name,
          root,
          canonicalRoot: root,
          enabled: true,
          accessMode: "read-write",
          executionMode: "project-code",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
    }

    return undefined;
  }

  /**
   * Get all internal project records.
   */
  list(): RunnerProjectRecord[] {
    const list = Array.from(this.projects.values());
    if (this.safetyLayerDisabled) {
      const hasC = list.some(
        (p) =>
          p.name === "C盘" ||
          p.name === "C" ||
          p.id === "drive-c" ||
          p.id === "c"
      );
      if (!hasC && (process.platform !== "win32" || fs.existsSync("C:\\"))) {
        const root = process.platform === "win32" ? "C:\\" : "/";
        list.unshift({
          id: "drive-c",
          name: "C盘",
          root,
          canonicalRoot: root,
          enabled: true,
          accessMode: "read-write",
          executionMode: "project-code",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
    return list;
  }

  /**
   * List public project metadata for remote RPC (strictly no physical paths).
   */
  listPublic(): ProjectListItem[] {
    const list = Array.from(this.projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      accessMode: p.accessMode ?? "read-only",
      executionMode: p.executionMode ?? "disabled",
    }));

    if (this.safetyLayerDisabled) {
      const hasC = list.some(
        (p) =>
          p.name === "C盘" ||
          p.name === "C" ||
          p.id === "drive-c" ||
          p.id === "c"
      );
      if (!hasC && (process.platform !== "win32" || fs.existsSync("C:\\"))) {
        list.unshift({
          id: "drive-c",
          name: "C盘 (系统全盘访问)",
          enabled: true,
          accessMode: "read-write",
          executionMode: "project-code",
        });
      }
    }

    return list;
  }

  /**
   * Get public project info for remote RPC (strictly no physical paths).
   */
  infoPublic(projectId: string): ProjectInfoResult {
    const project = this.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const healthy =
      fs.existsSync(project.canonicalRoot) &&
      fs.statSync(project.canonicalRoot).isDirectory();

    return {
      id: project.id,
      name: project.name,
      enabled: project.enabled,
      healthy,
      accessMode: project.accessMode ?? "read-only",
      executionMode: project.executionMode ?? "disabled",
    };
  }

  /**
   * Validate project health, authorization state, and optionally a relative target path.
   */
  validate(projectId: string, targetPath?: string): ProjectValidateResult {
    const project = this.get(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is currently disabled`
      );
    }

    if (!fs.existsSync(project.canonicalRoot)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_FOUND,
        `Project "${projectId}" root directory no longer exists on disk`
      );
    }

    const stat = fs.statSync(project.canonicalRoot);
    if (!stat.isDirectory()) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_ROOT_NOT_DIRECTORY,
        `Project "${projectId}" root is no longer a directory`
      );
    }

    if (targetPath !== undefined && targetPath !== "") {
      if (isSensitiveFile(targetPath)) {
        return {
          valid: false,
          isSensitive: true,
          reason: "File matches sensitive credential file pattern",
        };
      }

      try {
        resolveProjectPath(project.canonicalRoot, targetPath, { mustExist: false });
      } catch (err: unknown) {
        return {
          valid: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get the active trust policy for a project.
   */
  getTrustPolicy(projectId: string): ProjectTrustPolicy {
    const project = this.ensureProjectRecord(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }
    const isSession = this.isSessionTrusted(projectId);
    const basePolicy: ProjectTrustPolicy = project.trustPolicy ?? {
      trustLevel: "standard",
      filePolicy: "ask",
      canonicalRoot: project.canonicalRoot,
      policyVersion: 1,
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
      updatedAt: project.updatedAt,
    };
    if (isSession) {
      return {
        ...basePolicy,
        trustLevel: "session-trusted",
        filePolicy: "allow",
      };
    }
    return basePolicy;
  }

  /**
   * Set and persist the trust policy for an authorized project.
   */
  setTrustPolicy(
    projectIdOrParams:
      | string
      | {
          projectId: string;
          trustPolicy?: {
            trustLevel: ProjectTrustLevel;
            filePolicy?: FileActionPolicy;
            commandPolicy?: CommandActionPolicy;
            protectedFilesPolicy?: ProtectedFilesPolicy;
            customRules?: ProjectCustomRules;
          };
          policy?: {
            trustLevel: ProjectTrustLevel;
            filePolicy?: FileActionPolicy;
            commandPolicy?: CommandActionPolicy;
            protectedFilesPolicy?: ProtectedFilesPolicy;
            customRules?: ProjectCustomRules;
          };
          trustLevel?: ProjectTrustLevel;
          filePolicy?: FileActionPolicy;
          commandPolicy?: CommandActionPolicy;
          protectedFilesPolicy?: ProtectedFilesPolicy;
          customRules?: ProjectCustomRules;
        },
    maybePolicy?: {
      trustLevel: ProjectTrustLevel;
      filePolicy?: FileActionPolicy;
      commandPolicy?: CommandActionPolicy;
      protectedFilesPolicy?: ProtectedFilesPolicy;
      customRules?: ProjectCustomRules;
    }
  ): { projectId: string; policy: ProjectTrustPolicy } {
    let projectId: string;
    let policy: {
      trustLevel: ProjectTrustLevel;
      filePolicy?: FileActionPolicy;
      commandPolicy?: CommandActionPolicy;
      protectedFilesPolicy?: ProtectedFilesPolicy;
      customRules?: ProjectCustomRules;
    };

    if (typeof projectIdOrParams === "string") {
      projectId = projectIdOrParams;
      policy = maybePolicy!;
    } else {
      projectId = projectIdOrParams.projectId;
      policy = (projectIdOrParams.policy ??
        projectIdOrParams.trustPolicy ??
        projectIdOrParams) as any;
    }

    const project = this.ensureProjectRecord(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }

    const currentVersion = project.trustPolicy?.policyVersion ?? 0;

    if (policy.trustLevel === "session-trusted") {
      this.grantSessionTrust(projectId);
      const persistentPolicy: ProjectTrustPolicy = {
        trustLevel: "standard",
        filePolicy: "ask",
        canonicalRoot: project.canonicalRoot,
        policyVersion: currentVersion + 1,
        commandPolicy: policy.commandPolicy ?? project.trustPolicy?.commandPolicy ?? "ask",
        protectedFilesPolicy:
          policy.protectedFilesPolicy ?? project.trustPolicy?.protectedFilesPolicy ?? "always-ask",
        customRules:
          "customRules" in policy ? policy.customRules : project.trustPolicy?.customRules,
        updatedAt: Date.now(),
      };

      project.trustPolicy = persistentPolicy;
      project.updatedAt = Date.now();
      this.save();

      const activePolicy: ProjectTrustPolicy = {
        ...persistentPolicy,
        trustLevel: "session-trusted",
        filePolicy: "allow",
      };
      this.emit("trustPolicyChanged", { projectId, policy: activePolicy });
      return { projectId, policy: activePolicy };
    }

    this.revokeSessionTrust(projectId);
    const newPolicy: ProjectTrustPolicy = {
      trustLevel: policy.trustLevel,
      filePolicy:
        policy.filePolicy ??
        (policy.trustLevel === "full-project-trust" ? "allow" : "ask"),
      canonicalRoot: project.canonicalRoot,
      policyVersion: currentVersion + 1,
      commandPolicy: policy.commandPolicy ?? project.trustPolicy?.commandPolicy ?? "ask",
      protectedFilesPolicy:
        policy.protectedFilesPolicy ?? project.trustPolicy?.protectedFilesPolicy ?? "always-ask",
      customRules:
        "customRules" in policy ? policy.customRules : project.trustPolicy?.customRules,
      updatedAt: Date.now(),
    };

    project.trustPolicy = newPolicy;
    project.updatedAt = Date.now();
    this.save();
    this.emit("trustPolicyChanged", { projectId, policy: newPolicy });

    return { projectId, policy: newPolicy };
  }

  /**
   * Grant in-memory session trust for a project (cleared on app exit).
   */
  grantSessionTrust(projectId: string, operations?: string[]): void {
    const project = this.ensureProjectRecord(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found`
      );
    }
    const current = this.sessionTrustGrants.get(projectId) ?? new Set<string>();
    if (!operations || operations.length === 0) {
      current.add("*");
    } else {
      for (const op of operations) {
        current.add(op);
      }
    }
    this.sessionTrustGrants.set(projectId, current);
    this.emit("sessionTrustChanged", { projectId, operations: Array.from(current) });
  }

  /**
   * Revoke in-memory session trust for a project.
   */
  revokeSessionTrust(projectId: string): void {
    this.sessionTrustGrants.delete(projectId);
    this.emit("sessionTrustChanged", { projectId, operations: [] });
  }

  /**
   * Check if a project (and optional operation) has an active in-memory session trust grant.
   */
  isSessionTrusted(projectId: string, operation?: string): boolean {
    const grants = this.sessionTrustGrants.get(projectId);
    if (!grants) return false;
    if (grants.has("*")) return true;
    if (operation && grants.has(operation)) return true;
    return false;
  }

  /**
   * List operations granted in-memory session trust for a project.
   */
  getSessionTrustOperations(projectId: string): string[] {
    const grants = this.sessionTrustGrants.get(projectId);
    return grants ? Array.from(grants) : [];
  }

  /**
   * Clear all in-memory session trust grants across all projects.
   */
  clearAllSessionTrust(): void {
    this.sessionTrustGrants.clear();
    this.emit("allSessionTrustCleared");
  }

  /**
   * Reset a project's trust policy to safe standard defaults.
   */
  resetTrustPolicyToDefaults(projectId: string): ProjectTrustPolicy {
    this.revokeSessionTrust(projectId);
    const res = this.setTrustPolicy(projectId, {
      trustLevel: "standard",
      commandPolicy: "ask",
      protectedFilesPolicy: "always-ask",
      customRules: undefined,
    });
    return res.policy;
  }

  /**
   * Reset all projects' trust policies to safe standard defaults.
   */
  resetAllTrustPoliciesToDefaults(): void {
    this.clearAllSessionTrust();
    for (const projectId of this.projects.keys()) {
      this.resetTrustPolicyToDefaults(projectId);
    }
  }
}
