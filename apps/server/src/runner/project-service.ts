import type Database from "better-sqlite3";
import type { ProjectListItem, ProjectPublic, ProjectTrustPolicy } from "@localbridge/protocol";
import type { ProjectRow, ProjectTrustPolicyRow, SystemSettingRow } from "../db/schema.js";
import type { RunnerRegistry } from "./registry.js";
import type { Logger } from "@localbridge/shared";

export class ServerProjectService {
  private readonly stmtUpsertProject: Database.Statement;
  private readonly stmtListProjects: Database.Statement;
  private readonly stmtGetProject: Database.Statement;
  private readonly stmtRemoveProject: Database.Statement;
  private readonly stmtUpdateAccess: Database.Statement;
  private readonly stmtUpdateExecution: Database.Statement;
  private readonly stmtUpdateEnabled: Database.Statement;
  private readonly stmtUpsertTrustPolicy: Database.Statement;
  private readonly stmtGetTrustPolicy: Database.Statement;
  private readonly stmtDeleteTrustPolicy: Database.Statement;
  private readonly stmtDeleteAllTrustPolicies: Database.Statement;
  private readonly stmtGetSystemSetting: Database.Statement;
  private readonly stmtSetSystemSetting: Database.Statement;

  constructor(
    private readonly db: Database.Database,
    private readonly runnerRegistry: RunnerRegistry,
    private readonly logger?: Logger
  ) {
    this.stmtUpsertProject = this.db.prepare(`
      INSERT INTO projects (id, runner_id, name, enabled, access_mode, execution_mode, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        runner_id = excluded.runner_id,
        name = excluded.name,
        enabled = excluded.enabled,
        access_mode = excluded.access_mode,
        execution_mode = excluded.execution_mode,
        last_seen_at = excluded.last_seen_at
    `);
    this.stmtListProjects = this.db.prepare(
      "SELECT * FROM projects ORDER BY first_seen_at ASC"
    );
    this.stmtGetProject = this.db.prepare(
      "SELECT * FROM projects WHERE id = ?"
    );
    this.stmtRemoveProject = this.db.prepare(
      "DELETE FROM projects WHERE id = ?"
    );
    this.stmtUpdateAccess = this.db.prepare(
      "UPDATE projects SET access_mode = ?, last_seen_at = ? WHERE id = ?"
    );
    this.stmtUpdateExecution = this.db.prepare(
      "UPDATE projects SET execution_mode = ?, last_seen_at = ? WHERE id = ?"
    );
    this.stmtUpdateEnabled = this.db.prepare(
      "UPDATE projects SET enabled = ?, last_seen_at = ? WHERE id = ?"
    );
    this.stmtUpsertTrustPolicy = this.db.prepare(`
      INSERT INTO project_trust_policies (project_id, trust_level, file_policy, command_policy, protected_files_policy, custom_rules, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        trust_level = excluded.trust_level,
        file_policy = excluded.file_policy,
        command_policy = excluded.command_policy,
        protected_files_policy = excluded.protected_files_policy,
        custom_rules = excluded.custom_rules,
        updated_at = excluded.updated_at
    `);
    this.stmtGetTrustPolicy = this.db.prepare(
      "SELECT * FROM project_trust_policies WHERE project_id = ?"
    );
    this.stmtDeleteTrustPolicy = this.db.prepare(
      "DELETE FROM project_trust_policies WHERE project_id = ?"
    );
    this.stmtDeleteAllTrustPolicies = this.db.prepare(
      "DELETE FROM project_trust_policies"
    );
    this.stmtGetSystemSetting = this.db.prepare(
      "SELECT value FROM system_settings WHERE key = ?"
    );
    this.stmtSetSystemSetting = this.db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
  }


  /**
   * Synchronize public project metadata reported by a connected Runner.
   * Strictly stores only ID, name, enabled status, and timestamps. Zero physical paths.
   */
  syncRunnerProjects(runnerId: string, projects: ProjectListItem[]): void {
    if (!this.db.open) return;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      for (const p of projects) {
        this.stmtUpsertProject.run(
          p.id,
          runnerId,
          p.name,
          p.enabled ? 1 : 0,
          p.accessMode ?? "read-only",
          p.executionMode ?? "disabled",
          now,
          now
        );
      }
    });

    tx();

    this.logger?.info(
      {
        event: "runner_projects_synced",
        runner_id: runnerId,
        project_count: projects.length,
      },
      `Synchronized ${projects.length} public projects for runner "${runnerId}"`
    );
  }

  /**
   * List all projects known to the server with dynamic availability.
   * A project is available only if its associated Runner is currently online and the project is enabled.
   */
  listProjects(): ProjectPublic[] {
    if (!this.db.open) return [];
    const rows = this.stmtListProjects.all() as ProjectRow[];

    const list: ProjectPublic[] = rows.map((row) => {
      const runnerOnline = this.runnerRegistry.get(row.runner_id) !== undefined;
      const isEnabled = Boolean(row.enabled);

      return {
        id: row.id,
        runnerId: row.runner_id,
        name: row.name,
        enabled: isEnabled,
        available: runnerOnline && isEnabled,
        accessMode: row.access_mode === "read-write" ? "read-write" : "read-only",
        executionMode: (row.execution_mode as any) || "disabled",
      };
    });

    if (this.getSafetyLayerDisabled()) {
      const hasC = list.some(
        (p) =>
          p.name === "C盘" ||
          p.name === "C" ||
          p.id === "drive-c" ||
          p.id === "c"
      );
      if (!hasC) {
        const firstOnlineRunner =
          Array.from(this.runnerRegistry.keys())[0] || "runner_default";
        list.unshift({
          id: "drive-c",
          runnerId: firstOnlineRunner,
          name: "C盘 (系统全盘访问)",
          enabled: true,
          available: true,
          accessMode: "read-write",
          executionMode: "project-code",
        });
      }
    }

    return list;
  }

  /**
   * Get public project details by ID with dynamic availability.
   */
  getProject(projectId: string): ProjectPublic | undefined {
    if (!this.db.open) return undefined;
    const row = this.stmtGetProject.get(projectId) as ProjectRow | undefined;

    if (!row) {
      if (this.getSafetyLayerDisabled()) {
        const firstOnlineRunner =
          Array.from(this.runnerRegistry.keys())[0] || "runner_default";
        let name = projectId;
        if (
          projectId === "drive-c" ||
          projectId.toLowerCase() === "c" ||
          projectId === "C盘"
        ) {
          name = "C盘 (系统全盘访问)";
        }
        return {
          id: projectId,
          runnerId: firstOnlineRunner,
          name,
          enabled: true,
          available: true,
          accessMode: "read-write",
          executionMode: "project-code",
        };
      }
      return undefined;
    }

    const runnerOnline = this.runnerRegistry.get(row.runner_id) !== undefined;
    const isEnabled = Boolean(row.enabled);

    return {
      id: row.id,
      runnerId: row.runner_id,
      name: row.name,
      enabled: isEnabled,
      available: runnerOnline && isEnabled,
      accessMode: row.access_mode === "read-write" ? "read-write" : "read-only",
      executionMode: (row.execution_mode as any) || "disabled",
    };
  }

  removeProject(projectId: string): void {
    if (!this.db.open) return;
    this.stmtRemoveProject.run(projectId);
    this.stmtDeleteTrustPolicy.run(projectId);
  }

  updateProjectAccess(projectId: string, accessMode: string): void {
    if (!this.db.open) return;
    this.stmtUpdateAccess.run(accessMode, Date.now(), projectId);
  }

  updateProjectExecution(projectId: string, executionMode: string): void {
    if (!this.db.open) return;
    this.stmtUpdateExecution.run(executionMode, Date.now(), projectId);
  }

  updateProjectEnabled(projectId: string, enabled: boolean): void {
    if (!this.db.open) return;
    this.stmtUpdateEnabled.run(enabled ? 1 : 0, Date.now(), projectId);
  }

  setTrustPolicy(projectId: string, policy: ProjectTrustPolicy): void {
    if (!this.db.open) return;
    this.stmtUpsertTrustPolicy.run(
      projectId,
      policy.trustLevel,
      policy.filePolicy,
      policy.commandPolicy,
      policy.protectedFilesPolicy,
      policy.customRules ? JSON.stringify(policy.customRules) : null,
      policy.updatedAt || Date.now()
    );
  }

  getTrustPolicy(projectId: string): ProjectTrustPolicy | undefined {
    if (!this.db.open) return undefined;
    const row = this.stmtGetTrustPolicy.get(projectId) as
      | ProjectTrustPolicyRow
      | undefined;
    if (!row) return undefined;
    let customRules = undefined;
    if (row.custom_rules) {
      try {
        customRules = JSON.parse(row.custom_rules);
      } catch {
        // ignore parse error
      }
    }
    return {
      trustLevel: row.trust_level as any,
      filePolicy: row.file_policy as any,
      commandPolicy: row.command_policy as any,
      protectedFilesPolicy: row.protected_files_policy as any,
      customRules,
      canonicalRoot: "",
      policyVersion: 1,
      updatedAt: row.updated_at,
    };
  }

  resetAllTrustPolicies(): void {
    if (!this.db.open) return;
    this.stmtDeleteAllTrustPolicies.run();
  }

  getOperatorDisplayName(): string {
    if (!this.db.open) return "本机用户";
    const row = this.stmtGetSystemSetting.get("operator_display_name") as
      | SystemSettingRow
      | undefined;
    return row?.value || "本机用户";
  }

  setOperatorDisplayName(name: string): void {
    if (!this.db.open) return;
    const trimmed = name.trim() || "本机用户";
    this.stmtSetSystemSetting.run("operator_display_name", trimmed, Date.now());
  }

  getApprovalRoutingMode(): "chat" | "auto-trusted" | "desktop" | "hybrid" {
    if (!this.db.open) return "chat";
    const row = this.stmtGetSystemSetting.get("approval_routing_mode") as
      | SystemSettingRow
      | undefined;
    if (row?.value === "auto-trusted" || row?.value === "desktop" || row?.value === "hybrid") {
      return row.value;
    }
    return "chat";
  }

  setApprovalRoutingMode(mode: "chat" | "auto-trusted" | "desktop" | "hybrid"): void {
    if (!this.db.open) return;
    this.stmtSetSystemSetting.run("approval_routing_mode", mode, Date.now());
  }

  getSecurityMode(): "safe" | "universal" {
    if (!this.db.open) return "safe";
    const row = this.stmtGetSystemSetting.get("security_mode") as
      | SystemSettingRow
      | undefined;
    if (row?.value === "universal") return "universal";
    if (row?.value === "safe") return "safe";
    return this.getSafetyLayerDisabled() ? "universal" : "safe";
  }

  getSafetyLayerDisabled(): boolean {
    if (!this.db.open) return false;
    const row = this.stmtGetSystemSetting.get("command_safety_layer_disabled") as
      | SystemSettingRow
      | undefined;
    return row?.value === "true";
  }

  setSafetyLayerDisabled(disabled: boolean, mode?: "safe" | "universal"): void {
    if (!this.db.open) return;
    const targetMode = mode ?? (disabled ? "universal" : "safe");
    const isDisabled = targetMode === "universal" || disabled;
    this.stmtSetSystemSetting.run(
      "command_safety_layer_disabled",
      isDisabled ? "true" : "false",
      Date.now()
    );
    this.stmtSetSystemSetting.run(
      "security_mode",
      targetMode,
      Date.now()
    );
  }
}

