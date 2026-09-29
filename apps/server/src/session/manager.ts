import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  RunnerRpcMethods,
  type WorkflowSession,
  type WorkflowSessionSummary,
  type WorkflowSessionEvent,
  type WorkflowCheckpoint,
  type WorkflowHandoffPacket,
  type SessionStartParams,
  type SessionStartResult,
  type SessionListParams,
  type SessionListResult,
  type SessionStatusResult,
  type SessionEventsParams,
  type SessionEventsResult,
  type SessionCheckpointParams,
  type SessionCheckpointResult,
  type SessionFinishParams,
  type SessionFinishResult,
} from "@localbridge/protocol";
import type {
  WorkflowSessionRow,
  WorkflowSessionEventRow,
  WorkflowSessionCheckpointRow,
  JobRow,
  ManagedWorktreeRow,
  PersistentRuntimeRow,
} from "../db/schema.js";
import type { Logger } from "@localbridge/shared";
import type { ServerProjectService } from "../runner/project-service.js";
import type { RunnerRegistry } from "../runner/registry.js";
import type { RunnerRpcService } from "../runner/rpc-service.js";
import { sanitizeSessionMetadata, sanitizeSessionString } from "./sanitizer.js";

export interface WorkflowSessionManagerDeps {
  db: Database.Database;
  projectService: ServerProjectService;
  runnerRegistry: RunnerRegistry;
  rpcService: RunnerRpcService;
  logger?: Logger;
}

const MAX_SESSION_EVENTS = 5000;
const MAX_CHECKPOINTS_PER_SESSION = 50;

export class WorkflowSessionManager {
  private readonly db: Database.Database;
  private readonly projectService: ServerProjectService;
  private readonly runnerRegistry: RunnerRegistry;
  private readonly rpcService: RunnerRpcService;
  private readonly logger?: Logger;

  constructor(deps: WorkflowSessionManagerDeps) {
    this.db = deps.db;
    this.projectService = deps.projectService;
    this.runnerRegistry = deps.runnerRegistry;
    this.rpcService = deps.rpcService;
    this.logger = deps.logger;
  }

  /**
   * Helper: Map database row to WorkflowSession model
   */
  private mapSessionRow(row: WorkflowSessionRow): WorkflowSession {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title ?? undefined,
      goal: row.goal,
      state: row.state as any,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      lastActiveAt: row.last_activity_at ?? row.updated_at ?? row.created_at,
      startedAt: row.created_at,
      finishedAt: row.finished_at,
      createdBy: row.created_by,
      finishedBy: row.finished_by,
      finishReason: row.finish_reason,
      finalNote: row.final_note,
      finishNotes: row.final_note,
      eventCount: row.event_count,
      eventsTruncated: Boolean(row.events_truncated),
      latestCheckpointAt: row.latest_checkpoint_at,
    } as any;
  }

  /**
   * Find active session for a project. Returns null if none exists.
   */
  getActiveSession(projectId: string): WorkflowSession | null {
    const row = this.db
      .prepare("SELECT * FROM workflow_sessions WHERE project_id = ? AND state = 'active' LIMIT 1")
      .get(projectId) as WorkflowSessionRow | undefined;
    return row ? this.mapSessionRow(row) : null;
  }

  /**
   * Get session by ID. Throws SESSION_NOT_FOUND if not found.
   */
  getSession(sessionId: string): WorkflowSession {
    const row = this.db
      .prepare("SELECT * FROM workflow_sessions WHERE id = ?")
      .get(sessionId) as WorkflowSessionRow | undefined;
    if (!row) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_NOT_FOUND,
        `Workflow session "${sessionId}" not found`
      );
    }
    return this.mapSessionRow(row);
  }

  /**
   * 1. Start a new workflow session for a project.
   * Enforces 1 active session per project at database & manager level.
   */
  startSession(
    params: SessionStartParams & { createdBy?: string }
  ): SessionStartResult {
    const { projectId, goal, goals, title, createdBy = "chat" } = params;
    const project = this.projectService.getProject(projectId);
    if (!project) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_NOT_FOUND,
        `Project "${projectId}" not found or not registered`
      );
    }
    if (!project.enabled) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.PROJECT_DISABLED,
        `Project "${projectId}" is disabled`
      );
    }

    // Check for existing active session
    const existing = this.getActiveSession(projectId);
    if (existing) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_ALREADY_ACTIVE,
        `Project "${projectId}" already has an active workflow session "${existing.id}"`,
        {
          existingSessionId: existing.id,
          activeSessionId: existing.id,
          projectId,
        }
      );
    }

    const sessionId = `session_${crypto.randomUUID()}`;
    const now = Date.now();
    let rawGoal = goal;
    if (!rawGoal && goals && goals.length > 0) {
      rawGoal = goals.join("; ");
    }
    if (!rawGoal && title) {
      rawGoal = title;
    }
    if (!rawGoal) {
      rawGoal = "Development workflow session";
    }
    const cleanGoal = sanitizeSessionString(rawGoal);
    const cleanTitle = title ? sanitizeSessionString(title) : null;
    const cleanGoals = goals && goals.length > 0 ? goals.map((g) => sanitizeSessionString(g)) : [cleanGoal];

    const startTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO workflow_sessions (
             id, project_id, title, goal, state, created_at, updated_at, last_activity_at,
             created_by, event_count, events_truncated
           ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 0, 0)`
        )
        .run(sessionId, projectId, cleanTitle, cleanGoal, now, now, now, createdBy);

      // Record SESSION_STARTED event
      const eventId = `event_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const summaryJson = JSON.stringify({
        goal: cleanGoal,
        goals: cleanGoals,
        title: cleanTitle,
        createdBy,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      });

      this.db
        .prepare(
          `INSERT INTO workflow_session_events (
             id, session_id, project_id, event_type, source, summary_json, created_at
           ) VALUES (?, ?, ?, 'SESSION_STARTED', ?, ?, ?)`
        )
        .run(eventId, sessionId, projectId, createdBy, summaryJson, now);

      this.db
        .prepare(
          "UPDATE workflow_sessions SET event_count = 1 WHERE id = ?"
        )
        .run(sessionId);
    });

    try {
      startTx();
    } catch (err: any) {
      if (err.message && err.message.includes("UNIQUE constraint failed")) {
        const active = this.getActiveSession(projectId);
        throw new LocalBridgeError(
          LocalBridgeErrorCode.SESSION_ALREADY_ACTIVE,
          `Project "${projectId}" already has an active workflow session`,
          { existingSessionId: active?.id, activeSessionId: active?.id }
        );
      }
      throw err;
    }

    this.logger?.info({ sessionId, projectId, goal: cleanGoal }, "Workflow session started");

    const sessionObj = {
      id: sessionId,
      sessionId,
      projectId,
      goal: cleanGoal,
      goals: cleanGoals,
      title: cleanTitle ?? undefined,
      state: "active" as const,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      createdBy,
      eventCount: 1,
      eventsTruncated: false,
      checkpointCount: 0,
    };

    return {
      sessionId,
      projectId,
      goal: cleanGoal,
      goals: cleanGoals,
      title: cleanTitle ?? undefined,
      state: "active",
      createdAt: now,
      checkpointCount: 0,
      eventCount: 1,
      session: sessionObj,
    };
  }

  /**
   * 2. List sessions for a project.
   */
  listSessions(params: SessionListParams): SessionListResult {
    const { projectId, state, limit = 20, offset = 0, cursor } = params;
    const safeLimit = Math.min(Math.max(1, limit), 100);

    let query = "SELECT * FROM workflow_sessions WHERE project_id = ?";
    const queryParams: any[] = [projectId];

    if (state) {
      query += " AND state = ?";
      queryParams.push(state);
    }

    const countQuery = "SELECT COUNT(*) as count FROM workflow_sessions WHERE project_id = ?" + (state ? " AND state = ?" : "");
    const countParams = state ? [projectId, state] : [projectId];
    const totalRow = this.db.prepare(countQuery).get(...countParams) as { count: number };

    if (cursor) {
      const cursorTimestamp = Number(cursor);
      if (!Number.isNaN(cursorTimestamp)) {
        query += " AND created_at < ?";
        queryParams.push(cursorTimestamp);
      }
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    queryParams.push(safeLimit + 1);

    if (offset > 0 && !cursor) {
      query += " OFFSET ?";
      queryParams.push(offset);
    }

    const rows = this.db.prepare(query).all(...queryParams) as WorkflowSessionRow[];
    const hasMore = rows.length > safeLimit;
    const resultRows = hasMore ? rows.slice(0, safeLimit) : rows;

    const sessions: WorkflowSessionSummary[] = resultRows.map((r) => {
      const cpRow = this.db
        .prepare("SELECT COUNT(*) as count FROM workflow_session_checkpoints WHERE session_id = ?")
        .get(r.id) as { count: number };
      return {
        id: r.id,
        sessionId: r.id,
        projectId: r.project_id,
        title: r.title ?? undefined,
        goal: r.goal,
        state: r.state as any,
        checkpointCount: cpRow?.count ?? 0,
        eventCount: r.event_count,
        createdAt: r.created_at,
        lastActivityAt: r.last_activity_at,
        finishedAt: r.finished_at,
      };
    });

    const nextCursor =
      hasMore && resultRows.length > 0
        ? String(resultRows[resultRows.length - 1]!.created_at)
        : undefined;

    return {
      sessions,
      total: totalRow?.count ?? sessions.length,
      nextCursor,
      hasMore,
    };
  }

  /**
   * 3. Get session status with aggregated counters.
   */
  getSessionStatus(paramsOrSessionId: string | { sessionId?: string; projectId?: string }): SessionStatusResult {
    let sessionId: string | undefined;
    let projectIdParam: string | undefined;

    if (typeof paramsOrSessionId === "string") {
      sessionId = paramsOrSessionId;
    } else {
      sessionId = paramsOrSessionId.sessionId;
      projectIdParam = paramsOrSessionId.projectId;
    }

    if (!sessionId && projectIdParam) {
      const active = this.getActiveSession(projectIdParam);
      if (!active) {
        return {
          activeSession: null,
          session: null,
        };
      }
      sessionId = active.id;
    }

    if (!sessionId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_NOT_FOUND,
        "Either sessionId or projectId must be provided"
      );
    }

    const session = this.getSession(sessionId);

    // Touched files count
    const filesRow = this.db
      .prepare("SELECT COUNT(*) as count FROM workflow_session_files WHERE session_id = ?")
      .get(sessionId) as { count: number };

    // Checkpoint count
    const cpCountRow = this.db
      .prepare("SELECT COUNT(*) as count FROM workflow_session_checkpoints WHERE session_id = ?")
      .get(sessionId) as { count: number };

    // Jobs count for this project
    const jobsRow = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM jobs WHERE project_id = ? AND created_at >= ?"
      )
      .get(session.projectId, session.createdAt) as { count: number };

    // Approvals count from events
    const approvalsRow = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM workflow_session_events WHERE session_id = ? AND ref_type = 'approval'"
      )
      .get(sessionId) as { count: number };

    // Latest checkpoint
    const cpRow = this.db
      .prepare(
        "SELECT * FROM workflow_session_checkpoints WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(sessionId) as WorkflowSessionCheckpointRow | undefined;

    let latestCheckpoint: SessionStatusResult["latestCheckpoint"] = null;
    if (cpRow) {
      let nextSteps: string[] | undefined;
      let blockers: string[] | undefined;
      try {
        if (cpRow.next_steps_json) nextSteps = JSON.parse(cpRow.next_steps_json);
        if (cpRow.blockers_json) blockers = JSON.parse(cpRow.blockers_json);
      } catch {
        // ignore
      }
      latestCheckpoint = {
        summary: cpRow.summary,
        nextSteps,
        blockers,
        createdAt: cpRow.created_at,
      };
    }

    // Active jobs
    const activeJobRows = this.db
      .prepare(
        "SELECT id, command_kind, state, created_at FROM jobs WHERE project_id = ? AND state IN ('running', 'queued')"
      )
      .all(session.projectId) as Array<{ id: string; command_kind: string; state: string; created_at: number }>;

    const activeJobs = activeJobRows.map((j) => ({
      jobId: j.id,
      commandKind: j.command_kind,
      state: j.state,
      createdAt: j.created_at,
    }));

    // Active runtimes for this session
    const activeRuntimeRows = this.db
      .prepare(
        "SELECT id, name, kind, state, pid, generation, created_at FROM persistent_runtimes WHERE session_id = ? AND state IN ('starting', 'running', 'stopping')"
      )
      .all(session.id) as Array<{ id: string; name: string | null; kind: string; state: string; pid: number | null; generation: number; created_at: number }>;

    const runtimes = {
      running: activeRuntimeRows.length,
      activeRuntimes: activeRuntimeRows.map((r) => ({
        runtimeId: r.id,
        name: r.name ?? undefined,
        state: r.state,
        generation: r.generation,
      })),
    };

    // Resolve workspace (managed worktree or primary project root)
    const wtRow = this.db
      .prepare(
        "SELECT * FROM managed_worktrees WHERE session_id = ? AND state != 'removed' LIMIT 1"
      )
      .get(session.id) as ManagedWorktreeRow | undefined;

    const project = this.projectService.getProject(session.projectId);
    const workspace: any = wtRow
      ? {
          mode: "worktree",
          worktreeId: wtRow.id,
          worktreePath: wtRow.worktree_path,
          worktreeRoot: wtRow.worktree_path,
          branchName: wtRow.branch_name,
          baseRef: wtRow.base_ref ?? undefined,
          baseBranch: wtRow.base_ref ?? undefined,
          baseCommit: wtRow.base_commit ?? undefined,
          headCommit: wtRow.head_commit ?? undefined,
          isClean: true,
        }
      : {
          mode: "primary",
          projectRoot: (project as any)?.canonicalRoot ?? "",
        };

    const sessionObj = {
      id: session.id,
      sessionId: session.id,
      projectId: session.projectId,
      state: session.state,
      goal: session.goal,
      title: session.title,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      eventCount: session.eventCount,
      checkpointCount: cpCountRow.count,
    };

    return {
      sessionId: session.id,
      projectId: session.projectId,
      state: session.state,
      goal: session.goal,
      title: session.title,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      eventCount: session.eventCount,
      touchedFilesCount: filesRow.count,
      jobsCount: jobsRow.count,
      approvalsCount: approvalsRow.count,
      checkpointCount: cpCountRow.count,
      latestCheckpoint,
      activeJobs: activeJobs.length > 0 ? activeJobs : undefined,
      runtimes,
      workspace,
      session: sessionObj,
      activeSession: session.state === "active" ? sessionObj : null,
    };
  }

  /**
   * 4. Get paginated events for a session.
   */
  getSessionEvents(params: SessionEventsParams): SessionEventsResult {
    const { sessionId, cursor, limit = 50 } = params;
    const session = this.getSession(sessionId);
    const safeLimit = Math.min(Math.max(1, limit), 200);

    let query = "SELECT * FROM workflow_session_events WHERE session_id = ?";
    const queryParams: any[] = [sessionId];

    if (cursor) {
      const parts = cursor.split("_");
      const cursorTimestamp = Number(parts[0]);
      const cursorId = parts.slice(1).join("_");
      if (!Number.isNaN(cursorTimestamp)) {
        if (cursorId) {
          query += " AND (created_at > ? OR (created_at = ? AND id > ?))";
          queryParams.push(cursorTimestamp, cursorTimestamp, cursorId);
        } else {
          query += " AND created_at > ?";
          queryParams.push(cursorTimestamp);
        }
      }
    }

    query += " ORDER BY created_at ASC, id ASC LIMIT ?";
    queryParams.push(safeLimit + 1);

    const rows = this.db.prepare(query).all(...queryParams) as WorkflowSessionEventRow[];
    const hasMore = rows.length > safeLimit;
    const resultRows = hasMore ? rows.slice(0, safeLimit) : rows;

    const events: WorkflowSessionEvent[] = resultRows.map((r) => {
      let summary: Record<string, unknown> | undefined;
      if (r.summary_json) {
        try {
          summary = JSON.parse(r.summary_json);
        } catch {
          // ignore
        }
      }
      let status = "success";
      if (summary && (summary as any).status) {
        status = (summary as any).status;
      } else if (
        r.event_type.includes("FAIL") ||
        r.event_type.includes("DENIED") ||
        r.event_type.includes("CANCEL") ||
        r.event_type.includes("TIMED_OUT")
      ) {
        status = "failure";
      }
      return {
        id: r.id,
        sessionId: r.session_id,
        projectId: r.project_id,
        eventType: r.event_type,
        operation: r.event_type,
        source: r.source,
        refType: r.ref_type ?? undefined,
        refId: r.ref_id ?? undefined,
        target: r.ref_id ?? (summary as any)?.target ?? (summary as any)?.path ?? undefined,
        status,
        summary,
        createdAt: r.created_at,
      };
    });

    const nextCursor =
      hasMore && resultRows.length > 0
        ? `${resultRows[resultRows.length - 1]!.created_at}_${resultRows[resultRows.length - 1]!.id}`
        : undefined;

    return {
      events,
      nextCursor,
      hasMore,
      eventsTruncated: session.eventsTruncated,
    };
  }

  /**
   * 5. Add a checkpoint to an active session.
   */
  addCheckpoint(
    params: SessionCheckpointParams & { createdBy?: string }
  ): SessionCheckpointResult {
    const { sessionId, summary, nextSteps, blockers, createdBy = "chat" } = params;
    const session = this.getSession(sessionId);

    if (session.state !== "active") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_NOT_ACTIVE,
        `Cannot add checkpoint to session "${sessionId}" because it is ${session.state}`
      );
    }

    // Length and item constraints
    if (summary.length > 2000) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_CHECKPOINT_TOO_LARGE,
        "Checkpoint summary exceeds maximum length of 2000 characters"
      );
    }

    if (nextSteps && (nextSteps.length > 10 || nextSteps.some((s) => s.length > 300))) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_CHECKPOINT_TOO_LARGE,
        "Checkpoint nextSteps exceeds 10 items or contains an item > 300 characters"
      );
    }

    if (blockers && (blockers.length > 10 || blockers.some((b) => b.length > 300))) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_CHECKPOINT_TOO_LARGE,
        "Checkpoint blockers exceeds 10 items or contains an item > 300 characters"
      );
    }

    // Prune oldest checkpoint if cap reached
    const countRow = this.db
      .prepare("SELECT COUNT(*) as count FROM workflow_session_checkpoints WHERE session_id = ?")
      .get(sessionId) as { count: number };

    if (countRow.count >= MAX_CHECKPOINTS_PER_SESSION) {
      this.db
        .prepare(
          `DELETE FROM workflow_session_checkpoints WHERE id IN (
             SELECT id FROM workflow_session_checkpoints WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
           )`
        )
        .run(sessionId, countRow.count - MAX_CHECKPOINTS_PER_SESSION + 1);
    }

    const checkpointId = `checkpoint_${crypto.randomUUID()}`;
    const now = Date.now();
    const cleanSummary = sanitizeSessionString(summary);
    const cleanNextSteps = nextSteps?.map((s) => sanitizeSessionString(s));
    const cleanBlockers = blockers?.map((b) => sanitizeSessionString(b));

    const cpTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO workflow_session_checkpoints (
             id, session_id, summary, next_steps_json, blockers_json, created_at, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          checkpointId,
          sessionId,
          cleanSummary,
          cleanNextSteps ? JSON.stringify(cleanNextSteps) : null,
          cleanBlockers ? JSON.stringify(cleanBlockers) : null,
          now,
          createdBy
        );

      this.db
        .prepare(
          `UPDATE workflow_sessions
           SET latest_checkpoint_at = ?, updated_at = ?, last_activity_at = ?
           WHERE id = ?`
        )
        .run(now, now, now, sessionId);

      // Record event
      this.recordProjectEvent({
        projectId: session.projectId,
        eventType: "SESSION_CHECKPOINT",
        source: createdBy,
        refType: "checkpoint",
        refId: checkpointId,
        summary: {
          summary: cleanSummary,
          nextStepsCount: cleanNextSteps?.length ?? 0,
          blockersCount: cleanBlockers?.length ?? 0,
          ...(params.metadata ? { metadata: params.metadata } : {}),
        },
      });
    });

    cpTx();

    this.logger?.info({ checkpointId, sessionId }, "Workflow checkpoint saved");

    const cpCount = this.db
      .prepare("SELECT COUNT(*) as count FROM workflow_session_checkpoints WHERE session_id = ?")
      .get(sessionId) as { count: number };

    const checkpointObj: WorkflowCheckpoint = {
      id: checkpointId,
      checkpointNumber: cpCount.count,
      sessionId,
      summary: cleanSummary,
      nextSteps: cleanNextSteps,
      blockers: cleanBlockers,
      createdAt: now,
      createdBy,
    };

    return {
      checkpointId,
      sessionId,
      createdAt: now,
      checkpoint: checkpointObj,
    };
  }

  /**
   * 6. Build deterministic Handoff Packet for a session.
   */
  async buildHandoffPacket(sessionId: string): Promise<WorkflowHandoffPacket> {
    const session = this.getSession(sessionId);
    const warnings: string[] = [];

    // Project Info
    const project = this.projectService.getProject(session.projectId);
    let projectInfo: WorkflowHandoffPacket["project"];
    if (!project) {
      projectInfo = {
        projectId: session.projectId,
        projectName: session.projectId,
        enabled: false,
        projectUnavailable: true,
      };
      warnings.push("PROJECT_UNAVAILABLE: Project is no longer registered in Nexus");
    } else {
      projectInfo = {
        projectId: project.id,
        projectName: project.name,
        enabled: project.enabled,
      };
      if (!project.enabled) {
        warnings.push("PROJECT_DISABLED: Project is currently disabled");
      }
    }

    // Git Status
    let gitInfo: WorkflowHandoffPacket["git"] = { isRepository: false, dirty: false };
    if (project && project.enabled) {
      try {
        const runnerConn = this.runnerRegistry.get(project.runnerId);
        if (runnerConn) {
          const statusRes = (await this.rpcService.request(
            project.runnerId,
            RunnerRpcMethods.GitStatus,
            { projectId: session.projectId }
          )) as any;

          if (statusRes) {
            gitInfo = {
              isRepository: true,
              branch: statusRes.branch,
              detached: statusRes.detached,
              dirty: Boolean(statusRes.dirty),
              stagedCount: statusRes.staged?.length ?? 0,
              unstagedCount: statusRes.unstaged?.length ?? 0,
              untrackedCount: statusRes.untracked?.length ?? 0,
            };
          }
        } else {
          warnings.push("RUNNER_OFFLINE: Project runner is currently offline");
        }
      } catch {
        // Not a git repo or git query failed
        gitInfo = { isRepository: false, dirty: false };
      }
    }

    // Touched Files (bounded to 100)
    const fileRows = this.db
      .prepare(
        "SELECT relative_path, write_count, patch_count FROM workflow_session_files WHERE session_id = ? ORDER BY last_touched_at DESC LIMIT 101"
      )
      .all(sessionId) as Array<{ relative_path: string; write_count: number; patch_count: number }>;

    const filesTruncated = fileRows.length > 100;
    const boundedFiles = filesTruncated ? fileRows.slice(0, 100) : fileRows;
    const touchedFiles = boundedFiles.map((f) => f.relative_path);
    const recentlyModifiedFiles = boundedFiles
      .filter((f) => f.write_count > 0 || f.patch_count > 0)
      .map((f) => f.relative_path)
      .slice(0, 20);

    // Jobs (running, succeeded, failed, cancelled, timedOut)
    const jobRows = this.db
      .prepare(
        "SELECT id, command_kind, state, exit_code, created_at, finished_at FROM jobs WHERE project_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 51"
      )
      .all(session.projectId, session.createdAt) as JobRow[];

    const jobsTruncated = jobRows.length > 20;
    const boundedJobs = jobRows.slice(0, 20);

    let runningJobsCount = 0;
    let succeededJobsCount = 0;
    let failedJobsCount = 0;
    let cancelledJobsCount = 0;
    let timedOutJobsCount = 0;

    for (const j of jobRows) {
      if (j.state === "running" || j.state === "queued") runningJobsCount++;
      else if (j.state === "succeeded") succeededJobsCount++;
      else if (j.state === "failed") failedJobsCount++;
      else if (j.state === "cancelled") cancelledJobsCount++;
      else if (j.state === "timed_out") timedOutJobsCount++;
    }

    if (runningJobsCount > 0) {
      warnings.push("RUNNING_JOBS_EXIST: There are background jobs currently running or queued");
    }

    const recentJobs = boundedJobs.map((j) => ({
      jobId: j.id,
      commandKind: j.command_kind,
      state: j.state,
      exitCode: j.exit_code,
      createdAt: j.created_at,
      finishedAt: j.finished_at,
    }));

    // Approvals
    // Check pending approvals from events or runner
    const pendingApprovalEvents = this.db
      .prepare(
        `SELECT ref_id FROM workflow_session_events
         WHERE session_id = ? AND event_type IN ('APPROVAL_CREATED', 'APPROVAL_REQUESTED')
         AND ref_id NOT IN (
           SELECT ref_id FROM workflow_session_events
           WHERE session_id = ? AND event_type IN ('APPROVAL_APPROVED', 'APPROVAL_DENIED', 'APPROVAL_CONSUMED', 'APPROVAL_EXPIRED')
         )`
      )
      .all(sessionId, sessionId) as Array<{ ref_id: string }>;

    const pendingCount = pendingApprovalEvents.length;
    if (pendingCount > 0) {
      warnings.push("PENDING_APPROVALS_EXIST: Unresolved pending approvals require operator attention");
    }

    // Recent approval decisions
    const decisionEvents = this.db
      .prepare(
        `SELECT event_type, summary_json FROM workflow_session_events
         WHERE session_id = ? AND event_type IN ('APPROVAL_APPROVED', 'APPROVAL_DENIED')
         ORDER BY created_at DESC LIMIT 10`
      )
      .all(sessionId) as Array<{ event_type: string; summary_json: string | null }>;

    const recentDecisionSummary = decisionEvents.map((e) => {
      let details: any = {};
      try {
        if (e.summary_json) details = JSON.parse(e.summary_json);
      } catch {}
      const tool = details.toolName ?? "tool";
      const source = details.decisionSource ?? "unknown";
      const outcome = e.event_type === "APPROVAL_APPROVED" ? "Approved" : "Denied";
      return `${outcome} ${tool} via ${source}`;
    });

    // Checkpoints list
    const cpRows = this.db
      .prepare(
        "SELECT * FROM workflow_session_checkpoints WHERE session_id = ? ORDER BY created_at DESC LIMIT 10"
      )
      .all(sessionId) as WorkflowSessionCheckpointRow[];

    const recentCheckpoints = cpRows.map((cp, idx) => {
      let nextSteps: string[] | undefined;
      let blockers: string[] | undefined;
      try {
        if (cp.next_steps_json) nextSteps = JSON.parse(cp.next_steps_json);
        if (cp.blockers_json) blockers = JSON.parse(cp.blockers_json);
      } catch {}
      return {
        id: cp.id,
        checkpointNumber: cpRows.length - idx,
        summary: cp.summary,
        nextSteps,
        blockers,
        createdAt: cp.created_at,
      };
    });

    let checkpointData: WorkflowHandoffPacket["checkpoint"] = {};
    if (recentCheckpoints.length > 0) {
      const latest = recentCheckpoints[0]!;
      checkpointData = {
        latestSummary: latest.summary,
        nextSteps: latest.nextSteps?.slice(0, 10),
        blockers: latest.blockers?.slice(0, 10),
        createdAt: latest.createdAt,
      };
    }

    // Recent events
    const recentEventRows = this.db
      .prepare(
        "SELECT * FROM workflow_session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT 20"
      )
      .all(sessionId) as WorkflowSessionEventRow[];

    const recentEvents = recentEventRows.reverse().map((r) => {
      let summary: any = undefined;
      try {
        if (r.summary_json) summary = JSON.parse(r.summary_json);
      } catch {}
      return {
        id: r.id,
        eventType: r.event_type,
        operation: r.event_type,
        refType: r.ref_type,
        refId: r.ref_id,
        target: r.ref_id,
        summary,
        createdAt: r.created_at,
      };
    });

    // Recent Errors
    const failedJobs = jobRows
      .filter((j) => j.state === "failed" || j.state === "timed_out" || j.state === "interrupted")
      .slice(0, 5)
      .map((j) => `Job ${j.id} (${j.command_kind}) ${j.state}: ${j.error_message || "Exit code " + j.exit_code}`);

    const secOrLspEvents = this.db
      .prepare(
        `SELECT event_type, summary_json FROM workflow_session_events
         WHERE session_id = ? AND event_type IN ('SECURITY_EMERGENCY_STOP', 'RUNNER_DISCONNECTED')
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(sessionId) as Array<{ event_type: string; summary_json: string | null }>;

    const recentSecOrLsp = secOrLspEvents.map((e) => {
      let details: any = {};
      try {
        if (e.summary_json) details = JSON.parse(e.summary_json);
      } catch {}
      return `${e.event_type}: ${details.reason || details.message || "Security or runtime event triggered"}`;
    });

    if (session.eventsTruncated) {
      warnings.push("EVENTS_TRUNCATED: Session events exceeded 5,000 items and older events were pruned");
    }

    const currentStatus = {
      git: gitInfo,
      jobs: {
        running: runningJobsCount,
        pendingApprovals: pendingCount,
      },
    };

    const goalsList = (session as any).goals || (session.goal ? [session.goal] : []);

    // Resolve workspace (managed worktree or primary project root)
    const wtRow = this.db
      .prepare(
        "SELECT * FROM managed_worktrees WHERE session_id = ? AND state != 'removed' LIMIT 1"
      )
      .get(session.id) as ManagedWorktreeRow | undefined;

    const workspace: any = wtRow
      ? {
          mode: "worktree",
          worktreeId: wtRow.id,
          worktreePath: wtRow.worktree_path,
          worktreeRoot: wtRow.worktree_path,
          branchName: wtRow.branch_name,
          baseRef: wtRow.base_ref ?? undefined,
          baseBranch: wtRow.base_ref ?? undefined,
          baseCommit: wtRow.base_commit ?? undefined,
          headCommit: wtRow.head_commit ?? undefined,
          isClean: true,
        }
      : {
          mode: "primary",
          projectRoot: (project as any)?.canonicalRoot ?? "",
        };

    const runtimeRows = this.db
      .prepare(
        "SELECT * FROM persistent_runtimes WHERE session_id = ? ORDER BY created_at DESC"
      )
      .all(sessionId) as PersistentRuntimeRow[];

    const activeRuntimeRows = runtimeRows.filter(
      (r) => r.state === "starting" || r.state === "running" || r.state === "stopping"
    );

    const runtimesData = {
      active: activeRuntimeRows.map((r) => ({
        runtimeId: r.id,
        name: r.name ?? undefined,
        state: r.state,
        generation: r.generation,
        kind: r.kind,
      })),
      recent: runtimeRows.slice(0, 10).map((r) => ({
        runtimeId: r.id,
        name: r.name ?? undefined,
        state: r.state,
        generation: r.generation,
        kind: r.kind,
      })),
    };

    const promptLines: string[] = [
      "# Nexus Workflow Session Context",
      `Session ID: ${session.id}`,
      `Project: ${projectInfo.projectName} (${projectInfo.projectId})`,
      `Title: ${session.title || "Untitled Workflow"}`,
      `State: ${session.state}`,
      "",
      "## Workspace:",
      workspace.mode === "worktree"
        ? `- Mode: Managed Worktree (isolated)\n- Branch: ${workspace.branchName}\n- Path: ${workspace.worktreeRoot}`
        : "- Mode: Primary Project Root",
      "",
      "## Session Goals:",
      ...(goalsList.length > 0 ? goalsList.map((g: string) => `- ${g}`) : [`- ${session.goal}`]),
      "",
      "## Latest Checkpoint:",
      checkpointData.latestSummary || "No checkpoints recorded yet.",
      "",
      "## Next Steps:",
      ...((checkpointData.nextSteps && checkpointData.nextSteps.length > 0)
        ? checkpointData.nextSteps.map((s) => `- ${s}`)
        : ["- Resume implementation and run verification tests."]),
      "",
      "## Blockers:",
      ...((checkpointData.blockers && checkpointData.blockers.length > 0)
        ? checkpointData.blockers.map((b) => `- ${b}`)
        : ["- None currently reported."]),
      "",
      "## Git State:",
      gitInfo.isRepository
        ? `- Branch: ${gitInfo.branch || "detached"} (dirty: ${gitInfo.dirty})`
        : "- Not a git repository",
      "",
      "## Touched Files:",
      ...(touchedFiles.length > 0
        ? touchedFiles.slice(0, 20).map((f) => `- ${f}`)
        : ["- No files touched yet"]),
      ...(activeRuntimeRows.length > 0
        ? [
            "",
            "## Active Runtimes:",
            ...activeRuntimeRows.map(
              (r) => `- ${r.name ? `"${r.name}" ` : ""}(${r.kind}, state: ${r.state}, gen: ${r.generation})`
            ),
          ]
        : []),
    ];
    const continuationPrompt = sanitizeSessionString(promptLines.join("\n"));

    const packet: WorkflowHandoffPacket = {
      version: "1.0.0",
      session: {
        id: session.id,
        sessionId: session.id,
        projectId: session.projectId,
        title: session.title,
        goal: session.goal,
        goals: goalsList,
        state: session.state,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      },
      project: projectInfo,
      git: gitInfo,
      workspace,
      currentStatus,
      files: {
        touchedFiles,
        recentlyModifiedFiles,
        truncated: filesTruncated,
      },
      touchedFiles,
      jobs: {
        running: runningJobsCount,
        succeeded: succeededJobsCount,
        failed: failedJobsCount,
        cancelled: cancelledJobsCount,
        timedOut: timedOutJobsCount,
        recentJobs,
        truncated: jobsTruncated,
      },
      approvals: {
        pendingCount,
        recentDecisionSummary,
      },
      runtimes: runtimesData,
      checkpoint: checkpointData,
      recentCheckpoints,
      recentEvents,
      recentErrors: {
        recentFailedJobs: failedJobs,
        recentSecurityOrLspErrors: recentSecOrLsp,
      },
      warnings,
      continuationPrompt,
    };

    return sanitizeSessionMetadata(packet) as unknown as WorkflowHandoffPacket;
  }

  /**
   * 7. Finish session with outcome ('completed' | 'abandoned').
   * Guards against finish when active jobs or pending approvals exist.
   */
  finishSession(
    params: SessionFinishParams & { finishedBy?: string }
  ): SessionFinishResult {
    const { sessionId, outcome = "completed", finalNote, reason, notes, finishedBy = "chat" } = params;
    const session = this.getSession(sessionId);

    if (session.state !== "active") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_NOT_ACTIVE,
        `Cannot finish session "${sessionId}" because it is already ${session.state}`
      );
    }

    // 1. Guard against active running/queued jobs
    const activeJobsCount = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM jobs WHERE project_id = ? AND state IN ('running', 'queued')"
      )
      .get(session.projectId) as { count: number };

    if (activeJobsCount.count > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_HAS_ACTIVE_JOBS,
        `Cannot finish session: ${activeJobsCount.count} background job(s) are still active or queued. Wait for completion or cancel them first.`
      );
    }

    // 1b. Guard against active persistent runtimes for this session
    const activeRuntimesCount = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM persistent_runtimes WHERE session_id = ? AND state IN ('starting', 'running', 'stopping')"
      )
      .get(sessionId) as { count: number };

    if (activeRuntimesCount.count > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_HAS_ACTIVE_RUNTIMES,
        `Cannot finish session: ${activeRuntimesCount.count} persistent runtime(s) are still active. Stop all active runtimes first.`
      );
    }

    // 2. Guard against pending approvals
    const pendingApprovalEvents = this.db
      .prepare(
        `SELECT ref_id FROM workflow_session_events
         WHERE session_id = ? AND event_type IN ('APPROVAL_CREATED', 'APPROVAL_REQUESTED')
         AND ref_id NOT IN (
           SELECT ref_id FROM workflow_session_events
           WHERE session_id = ? AND event_type IN ('APPROVAL_APPROVED', 'APPROVAL_DENIED', 'APPROVAL_CONSUMED', 'APPROVAL_EXPIRED')
         )`
      )
      .all(sessionId, sessionId) as Array<{ ref_id: string }>;

    if (pendingApprovalEvents.length > 0) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.SESSION_HAS_PENDING_APPROVALS,
        `Cannot finish session: ${pendingApprovalEvents.length} pending approval(s) are unresolved. Approve or deny them first.`
      );
    }

    const now = Date.now();
    const noteText = finalNote || notes || reason || null;
    const cleanNote = noteText ? sanitizeSessionString(noteText) : null;
    const finishReason = reason || outcome;
    const eventType = outcome === "completed" ? "SESSION_COMPLETED" : "SESSION_ABANDONED";

    const finishTx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE workflow_sessions
           SET state = ?, finished_at = ?, finished_by = ?, finish_reason = ?, final_note = ?, updated_at = ?, last_activity_at = ?
           WHERE id = ?`
        )
        .run(outcome, now, finishedBy, finishReason, cleanNote, now, now, sessionId);

      this.recordProjectEvent({
        projectId: session.projectId,
        eventType,
        source: finishedBy,
        summary: {
          outcome,
          reason: finishReason,
          finalNote: cleanNote,
        },
      });
    });

    finishTx();

    this.logger?.info({ sessionId, outcome, reason: finishReason }, `Workflow session finished (${outcome})`);

    const sessionObj = {
      id: session.id,
      sessionId: session.id,
      projectId: session.projectId,
      state: outcome,
      finishedAt: now,
      finishReason,
      finalNote: cleanNote ?? undefined,
    };

    return {
      sessionId,
      projectId: session.projectId,
      state: outcome,
      finishedAt: now,
      finishReason,
      finalNote: cleanNote ?? undefined,
      session: sessionObj,
    };
  }

  /**
   * Automatic Event Attribution:
   * Records a project event into the project's active session if one exists.
   * If no active session exists for this project, cleanly returns null (no-op).
   */
  recordProjectEvent(event: {
    projectId: string;
    eventType: string;
    source: string;
    refType?: string;
    refId?: string;
    summary?: Record<string, unknown>;
  }): WorkflowSessionEvent | null {
    const active = this.getActiveSession(event.projectId);
    if (!active) {
      return null;
    }

    const { projectId, eventType, source, refType, refId, summary } = event;
    const sessionId = active.id;
    const now = Date.now();

    // Idempotency check for terminal job and approval events
    if (refId && (eventType.startsWith("JOB_") || eventType.startsWith("APPROVAL_"))) {
      const existing = this.db
        .prepare(
          "SELECT id FROM workflow_session_events WHERE session_id = ? AND event_type = ? AND ref_id = ? LIMIT 1"
        )
        .get(sessionId, eventType, refId);
      if (existing) {
        return null; // Duplicate terminal event skipped
      }
    }

    // File Tracking Aggregation
    if (
      eventType === "FILE_CREATED" ||
      eventType === "FILE_UPDATED" ||
      eventType === "FILE_PATCHED" ||
      eventType === "FILE_DELETED"
    ) {
      const relPath =
        (summary?.path as string) ||
        (summary?.relativePath as string) ||
        (refType === "file" ? refId : undefined);

      if (relPath) {
        const isWrite = eventType === "FILE_CREATED" || eventType === "FILE_UPDATED";
        const isPatch = eventType === "FILE_PATCHED";
        const isDelete = eventType === "FILE_DELETED";

        this.db
          .prepare(
            `INSERT INTO workflow_session_files (
               session_id, relative_path, first_touched_at, last_touched_at, read_count, write_count, patch_count, delete_count
             ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
             ON CONFLICT(session_id, relative_path) DO UPDATE SET
               last_touched_at = excluded.last_touched_at,
               write_count = workflow_session_files.write_count + excluded.write_count,
               patch_count = workflow_session_files.patch_count + excluded.patch_count,
               delete_count = workflow_session_files.delete_count + excluded.delete_count`
          )
          .run(
            sessionId,
            relPath,
            now,
            now,
            isWrite ? 1 : 0,
            isPatch ? 1 : 0,
            isDelete ? 1 : 0
          );
      }
    }

    // Event storage bounded at MAX_SESSION_EVENTS (5000)
    if (active.eventCount >= MAX_SESSION_EVENTS) {
      this.db
        .prepare(
          `DELETE FROM workflow_session_events WHERE id IN (
             SELECT id FROM workflow_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 100
           )`
        )
        .run(sessionId);

      this.db
        .prepare("UPDATE workflow_sessions SET events_truncated = 1 WHERE id = ?")
        .run(sessionId);
    }

    const eventId = `event_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const sanitizedSummary = summary ? sanitizeSessionMetadata(summary) : undefined;
    const summaryJson = sanitizedSummary ? JSON.stringify(sanitizedSummary) : null;

    const eventTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO workflow_session_events (
             id, session_id, project_id, event_type, source, ref_type, ref_id, summary_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          eventId,
          sessionId,
          projectId,
          eventType,
          source,
          refType ?? null,
          refId ?? null,
          summaryJson,
          now
        );

      this.db
        .prepare(
          "UPDATE workflow_sessions SET event_count = event_count + 1, last_activity_at = ?, updated_at = ? WHERE id = ?"
        )
        .run(now, now, sessionId);
    });

    eventTx();

    return {
      id: eventId,
      sessionId,
      projectId,
      eventType,
      source,
      refType,
      refId,
      summary: sanitizedSummary,
      createdAt: now,
    };
  }
}
