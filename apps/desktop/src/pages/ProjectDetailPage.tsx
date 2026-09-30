import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Square,
  Terminal,
  Code2,
  Compass,
  GitBranch,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  Project,
  PersistentRuntime,
  WorkflowSession,
  LspServerStatus,
  RuntimeLogChunk,
  UserExperienceMode,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { SessionDetailModal } from "../components/modals/SessionDetailModal.js";

interface ProjectDetailPageProps {
  projectId: string;
  onBack: () => void;
  onRefreshProjects: () => void;
  uxMode?: UserExperienceMode;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  projectId,
  onBack,
  onRefreshProjects,
  uxMode = "standard",
}) => {
  const { t, translateError } = useTranslation();

  // Core Data States
  const [project, setProject] = useState<Project | null>(null);
  const [selectedRuntime, setSelectedRuntime] = useState<PersistentRuntime | null>(null);
  const [sessions, setSessions] = useState<WorkflowSession[]>([]);
  const [lspStatus, setLspStatus] = useState<LspServerStatus | null>(null);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<WorkflowSession | null>(null);

  // Runtime Logs State
  const [logs, setLogs] = useState<RuntimeLogChunk[]>([]);
  const [selectedGen, setSelectedGen] = useState<number>(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Actions in progress & error
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [worktreeSafetyWarning, setWorktreeSafetyWarning] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const isAdvanced = uxMode === "advanced" || showAdvancedDetails;

  // Load project details and dependencies
  const loadProjectData = useCallback(async () => {
    try {
      const [projRes, runtimesRes, sessionsRes, lspRes] = await Promise.allSettled([
        bridge.listProjects(),
        bridge.listRuntimes({ projectId }),
        bridge.listSessions({ projectId, limit: 10 }),
        bridge.getLspStatus(projectId),
      ]);

      if (projRes.status === "fulfilled") {
        const found = projRes.value.projects.find((p) => p.id === projectId);
        if (found) setProject(found);
      }

      if (runtimesRes.status === "fulfilled") {
        const list = runtimesRes.value?.runtimes || [];
        if (list.length > 0) {
          setSelectedRuntime((prev) => {
            if (!prev) return list[0];
            const updated = list.find((r) => r.runtimeId === prev.runtimeId);
            return updated || list[0];
          });
        } else {
          setSelectedRuntime(null);
        }
      }

      if (sessionsRes.status === "fulfilled") {
        setSessions(sessionsRes.value?.sessions || []);
      }

      if (lspRes.status === "fulfilled" && lspRes.value?.servers?.length > 0) {
        setLspStatus(lspRes.value.servers[0]);
      } else {
        setLspStatus(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load project details");
    }
  }, [projectId]);

  // Polling for project status
  useEffect(() => {
    loadProjectData();
    const interval = setInterval(loadProjectData, 4000);
    return () => clearInterval(interval);
  }, [loadProjectData]);

  // Update selectedGen when runtime generation changes
  useEffect(() => {
    if (selectedRuntime) {
      setSelectedGen(selectedRuntime.generation);
    }
  }, [selectedRuntime?.runtimeId, selectedRuntime?.generation]);

  // Poll logs for the selected runtime
  const fetchLogs = useCallback(async () => {
    if (!selectedRuntime) {
      setLogs([]);
      return;
    }
    try {
      const res = await bridge.getRuntimeLogs(selectedRuntime.runtimeId, {
        generation: selectedGen,
        limit: 200,
      });
      if (res && Array.isArray(res.entries)) {
        setLogs(res.entries);
      }
    } catch {
      // Quiet log poll failure
    }
  }, [selectedRuntime, selectedGen]);

  useEffect(() => {
    fetchLogs();
    const logInterval = setInterval(fetchLogs, 2500);
    return () => clearInterval(logInterval);
  }, [fetchLogs]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handlers for Project Actions
  const handleToggleAccess = async () => {
    if (!project) return;
    const newMode = project.accessMode === "read-only" ? "read-write" : "read-only";
    setActionLoading("access");
    setErrorMsg(null);
    try {
      const updated = await bridge.setProjectAccess(project.id, newMode);
      setProject((prev) => (prev ? { ...prev, ...updated } : updated));
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeExecution = async (mode: "disabled" | "safe-only" | "project-code") => {
    if (!project) return;
    setActionLoading("execution");
    setErrorMsg(null);
    try {
      const updated = await bridge.setProjectExecution(project.id, mode);
      setProject((prev) => (prev ? { ...prev, ...updated } : updated));
      onRefreshProjects();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleEnable = async () => {
    if (!project) return;
    const nextEnabled = !project.enabled;
    setActionLoading("enable");
    setErrorMsg(null);
    setProject((prev) => (prev ? { ...prev, enabled: nextEnabled } : null));
    try {
      if (project.enabled) {
        await bridge.disableProject(project.id);
      } else {
        await bridge.enableProject(project.id);
      }
      onRefreshProjects();
    } catch (err: any) {
      setProject((prev) => (prev ? { ...prev, enabled: project.enabled } : null));
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveProject = async () => {
    if (!project) return;
    setActionLoading("remove");
    setErrorMsg(null);
    try {
      await bridge.removeProject(project.id);
      onRefreshProjects();
      onBack();
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
      setActionLoading(null);
    }
  };

  // Handlers for Runtime Actions
  const handleStopRuntime = async () => {
    if (!selectedRuntime) return;
    setActionLoading("stop-runtime");
    setErrorMsg(null);
    try {
      await bridge.stopRuntime(selectedRuntime.runtimeId);
      await loadProjectData();
      setSuccessMsg("Runtime stopped successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to stop runtime");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestartRuntime = async () => {
    if (!selectedRuntime) return;
    setActionLoading("restart-runtime");
    setErrorMsg(null);
    try {
      await bridge.restartRuntime(selectedRuntime.runtimeId);
      await loadProjectData();
      setSuccessMsg("Runtime restarted with new generation");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to restart runtime");
    } finally {
      setActionLoading(null);
    }
  };

  // Handlers for LSP Actions
  const handleRestartLsp = async () => {
    setActionLoading("restart-lsp");
    setErrorMsg(null);
    try {
      const res = await bridge.restartLspServer(projectId);
      setLspStatus(res.status);
      setSuccessMsg("LSP language server restarted");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to restart LSP server");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopLsp = async () => {
    setActionLoading("stop-lsp");
    setErrorMsg(null);
    try {
      await bridge.stopLspServer(projectId);
      setLspStatus(null);
      setSuccessMsg("LSP server stopped");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to stop LSP server");
    } finally {
      setActionLoading(null);
    }
  };

  // Worktree removal handler
  const handleRemoveWorktree = async (worktreeId: string) => {
    setActionLoading(`remove-worktree-${worktreeId}`);
    setWorktreeSafetyWarning(null);
    try {
      await bridge.removeWorktree(worktreeId);
      await loadProjectData();
      setSuccessMsg("Worktree removed safely");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setWorktreeSafetyWarning(
        `Cannot remove worktree: ${err.message || "Contains uncommitted changes or active process."}`
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.stream}] ${l.text}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  if (!project) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4 text-center">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-primary transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.projectDetail.backToProjects}</span>
        </button>
        <div className="text-theme-muted text-sm py-12">{t.projectDetail.loading}</div>
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.state === "active");
  const isRuntimeRunning = selectedRuntime?.state === "running";

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* 1. Header & Navigation Back */}
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-theme-muted hover:text-sky-400 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.projectDetail.backToProjects}</span>
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-theme-primary tracking-tight">
                {project.name}
              </h2>
              <span className="font-mono text-xs text-theme-muted">{project.id}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  project.enabled
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                {project.enabled ? t.projectDetail.authorized : t.control.statusDisabled}
              </span>
            </div>
            {project.root && (
              <div className="text-xs font-mono text-theme-secondary bg-theme-card-muted px-2.5 py-1 rounded border border-theme-subtle inline-block select-all">
                {project.root}
              </div>
            )}
          </div>

          {/* Quick Settings Bar in Header */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAccess}
              disabled={actionLoading === "access"}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition ${
                project.accessMode === "read-write"
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              }`}
              title="Toggle Read-Only / Read-Write mode"
            >
              {project.accessMode === "read-write" ? t.projectDetail.modeReadWrite : t.projectDetail.modeReadOnly}
            </button>

            <select
              value={project.executionMode}
              onChange={(e) =>
                handleChangeExecution(
                  e.target.value as "disabled" | "safe-only" | "project-code"
                )
              }
              disabled={actionLoading === "execution"}
              className="bg-theme-card-muted border border-theme-subtle text-xs font-mono text-theme-secondary rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
            >
              <option value="safe-only">{t.projectDetail.execSafeOnly}</option>
              <option value="project-code">{t.projectDetail.execProjectCode}</option>
              <option value="disabled">{t.projectDetail.execDisabled}</option>
            </select>

            <button
              onClick={handleToggleEnable}
              disabled={actionLoading === "enable"}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                project.enabled
                  ? "bg-theme-card-muted text-theme-secondary border-theme-subtle hover:bg-theme-card"
                  : "bg-emerald-600 text-white border-emerald-500"
              }`}
            >
              {project.enabled ? t.projectDetail.disable : t.projectDetail.enable}
            </button>

            {deleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRemoveProject}
                  disabled={actionLoading === "remove"}
                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition"
                >
                  {t.projectDetail.confirmRemove}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-2 py-1.5 text-xs text-theme-muted hover:text-theme-primary transition"
                >
                  {t.projectDetail.cancel}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-1.5 rounded-lg text-theme-muted hover:text-red-400 hover:bg-theme-card-muted transition"
                title={t.projectDetail.removeProject}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* High-Level Overview Card (Standard Mode) */}
      {!isAdvanced && (
        <div className="p-6 rounded-xl bg-theme-card border border-theme-subtle space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[11px] font-mono text-theme-muted uppercase tracking-wider">
                {t.projects?.accessMode || "Access Mode"}
              </div>
              <div className="text-sm font-semibold text-theme-primary">
                {project.accessMode === "read-write" ? t.projectDetail.modeReadWrite : t.projectDetail.modeReadOnly}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[11px] font-mono text-theme-muted uppercase tracking-wider">
                {t.projects?.executionMode || "Execution Mode"}
              </div>
              <div className="text-sm font-semibold text-theme-primary">
                {project.executionMode}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[11px] font-mono text-theme-muted uppercase tracking-wider">
                {t.projectDetail.status || "Status"}
              </div>
              <div className="text-sm font-semibold text-emerald-500">
                {project.enabled ? t.projectDetail.authorized : t.control.statusDisabled}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Technical Details */}
      {isAdvanced && (
        <>
          {/* 2. Top Status Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card A: Persistent Runtime Summary */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>{t.projectDetail.cardRuntime}</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                isRuntimeRunning
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {isRuntimeRunning ? t.projectDetail.running : t.projectDetail.stopped}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div>
              PID: <span className="text-theme-secondary">{selectedRuntime?.pid || "—"}</span>
            </div>
            <div>
              Generation: <span className="text-theme-secondary">Gen {selectedRuntime?.generation || 1}</span>
            </div>
            <div>
              Port:{" "}
              {selectedRuntime?.listeningPorts?.[0] ? (
                <a
                  href={`http://localhost:${selectedRuntime.listeningPorts[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  http://localhost:{selectedRuntime.listeningPorts[0]}
                </a>
              ) : (
                <span className="text-theme-secondary">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Card B: Code Intelligence (LSP) Summary */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>{t.projectDetail.cardCodeIntelligence}</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                lspStatus?.status === "ready"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {lspStatus?.status ? (t.statusMap[lspStatus.status.toLowerCase() as keyof typeof t.statusMap] || lspStatus.status.toUpperCase()) : t.projectDetail.stopped}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div>
              {t.projectDetail.engine}: <span className="text-theme-secondary">TypeScript LSP (Bundled)</span>
            </div>
            <div>
              PID: <span className="text-theme-secondary">{lspStatus?.pid || "—"}</span>
            </div>
            <div>
              {t.projectDetail.restarts}: <span className="text-theme-secondary">{lspStatus?.restartCount || 0}</span>
            </div>
          </div>
        </div>

        {/* Card C: Active Workflow Session */}
        <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-theme-primary flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>{t.projectDetail.cardActiveWorkflow}</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                activeSession
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {activeSession ? t.statusMap.active : t.statusMap.idle}
            </span>
          </div>
          <div className="text-[11px] font-mono text-theme-muted space-y-1">
            <div className="truncate">
              {t.activity.summary}:{" "}
              <span className="text-theme-secondary">
                {activeSession?.title || t.projectDetail.noActiveSession}
              </span>
            </div>
            <div>
              {t.projectDetail.checkpoints}:{" "}
              <span className="text-theme-secondary">
                {activeSession?.checkpointCount || 0} {t.projectDetail.checkpoints}
              </span>
            </div>
            <div>
              Workspace:{" "}
              <span className="text-theme-secondary">
                {activeSession?.workspace?.mode === "worktree"
                  ? `worktree (${activeSession.workspace.branchName})`
                  : t.projectDetail.primaryRepository}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Persistent Runtime Controller & Quiet Log Viewer */}
      <section className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <span>{t.projectDetail.runtimeControllerTitle}</span>
            </h3>
            <p className="text-xs text-theme-muted">
              {t.projectDetail.runtimeControllerDesc}
            </p>
          </div>

          {/* Runtime Control Actions */}
          <div className="flex items-center gap-2">
            {/* Generation Switcher */}
            {selectedRuntime && selectedRuntime.generation > 1 && (
              <div className="flex items-center gap-1 text-xs font-mono text-theme-muted">
                <span>Gen:</span>
                <select
                  value={selectedGen}
                  onChange={(e) => setSelectedGen(Number(e.target.value))}
                  className="bg-theme-card-muted border border-theme-subtle text-xs font-mono rounded px-2 py-1 text-theme-secondary focus:outline-none"
                >
                  {Array.from({ length: selectedRuntime.generation }, (_, i) => i + 1).map(
                    (gen) => (
                      <option key={gen} value={gen}>
                        Gen {gen} {gen === selectedRuntime.generation ? t.projectDetail.genCurrent : ""}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {isRuntimeRunning ? (
              <button
                onClick={handleStopRuntime}
                disabled={actionLoading === "stop-runtime"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 transition disabled:opacity-50"
              >
                {actionLoading === "stop-runtime" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>{t.projectDetail.stopRuntime}</span>
              </button>
            ) : null}

            <button
              onClick={handleRestartRuntime}
              disabled={actionLoading === "restart-runtime"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition disabled:opacity-50"
            >
              {actionLoading === "restart-runtime" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{t.projectDetail.restartRuntime}</span>
            </button>
          </div>
        </div>

        {/* Quiet Terminal Log Viewer */}
        <div className="rounded-xl overflow-hidden border border-theme-subtle bg-[#05070d]">
          {/* Terminal Toolbar */}
          <div className="px-4 py-2 bg-theme-card-muted border-b border-theme-subtle flex items-center justify-between text-[11px] font-mono text-theme-muted">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                {selectedRuntime
                  ? `${selectedRuntime.runtimeId} · Gen ${selectedGen}`
                  : t.projectDetail.noRuntimeCreated}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-theme-secondary transition">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-black border-white/20 text-sky-500 focus:ring-0 w-3 h-3"
                />
                <span>{t.projectDetail.autoScroll}</span>
              </label>

              <button
                onClick={handleCopyLogs}
                className="flex items-center gap-1 hover:text-theme-secondary transition"
              >
                {copiedLogs ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedLogs ? t.projectDetail.copied : t.projectDetail.copyLogs}</span>
              </button>

              <button
                onClick={() => setLogs([])}
                className="hover:text-theme-secondary transition"
              >
                {t.projectDetail.clearView}
              </button>
            </div>
          </div>

          {/* Terminal Output Area */}
          <div
            ref={logContainerRef}
            className="p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed space-y-0.5 text-slate-300 select-text"
          >
            {logs.length === 0 ? (
              <div className="text-slate-500 italic">
                {selectedRuntime
                  ? `[Generation ${selectedGen}] ${t.projectDetail.noRuntimeOutput}`
                  : t.projectDetail.noRuntimeCreated}
              </div>
            ) : (
              logs.map((chunk, idx) => (
                <div
                  key={`${chunk.seq}-${idx}`}
                  className={`whitespace-pre-wrap break-all ${
                    chunk.stream === "stderr" ? "text-amber-400/90" : "text-slate-300"
                  }`}
                >
                  <span className="text-slate-500 select-none text-[10px] mr-2">
                    {new Date(chunk.timestamp).toLocaleTimeString()}
                  </span>
                  {chunk.text}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 4. Workflow Task Trajectory & Checkpoints */}
      <section className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>{t.projectDetail.workflowTrajectoryTitle}</span>
            </h3>
            <p className="text-xs text-theme-muted">
              {t.projectDetail.workflowTrajectoryDesc}
            </p>
          </div>

          {activeSession && (
            <button
              onClick={() => setSelectedSessionForModal(activeSession)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
            >
              {t.projectDetail.openFullSessionHandoff}
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 rounded-lg bg-theme-card-muted border border-theme-subtle text-center text-xs text-theme-muted">
            {t.projectDetail.noWorkflowSessions}
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => setSelectedSessionForModal(sess)}
                className="p-4 rounded-lg bg-theme-card-muted border border-theme-subtle hover:border-theme-primary/30 transition cursor-pointer flex items-center justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-theme-primary truncate">
                      {sess.title || `Session ${sess.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        sess.state === "active"
                          ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                          : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                      }`}
                    >
                      {sess.state ? (t.statusMap[sess.state.toLowerCase() as keyof typeof t.statusMap] || sess.state.toUpperCase()) : sess.state}
                    </span>
                    {sess.workspace?.mode === "worktree" && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        worktree: {sess.workspace.branchName}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-theme-muted flex items-center gap-3">
                    <span>{sess.checkpointCount} {t.projectDetail.checkpoints}</span>
                    <span>&bull;</span>
                    <span>{sess.eventCount} {t.projectDetail.operations}</span>
                    <span>&bull;</span>
                    <span>
                      {t.projectDetail.started}: {new Date(sess.startedAt).toLocaleDateString()}{" "}
                      {new Date(sess.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <button className="text-xs text-theme-muted hover:text-theme-primary font-mono transition">
                  {t.projectDetail.details}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Managed Worktree Inspector (If active worktree exists) */}
      {activeSession?.workspace && activeSession.workspace.mode === "worktree" && (() => {
        const wt = activeSession.workspace;
        return (
          <section className="p-5 rounded-xl bg-theme-card border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-theme-primary">
                  {t.projectDetail.activeManagedWorktree}
                </h3>
              </div>
              <button
                onClick={() => handleRemoveWorktree(wt.worktreeId)}
                disabled={actionLoading?.startsWith("remove-worktree")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 transition"
              >
                {t.projectDetail.safeRemoveWorktree}
              </button>
            </div>

            <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs font-mono space-y-1.5 text-theme-secondary">
              <div>
                {t.projectDetail.branch}: <span className="text-amber-300">{wt.branchName}</span>
              </div>
              <div>
                {t.projectDetail.path}: <span className="text-theme-muted">{wt.worktreeRoot}</span>
              </div>
              <div>
                {t.projectDetail.cleanState}:{" "}
                <span className={wt.isClean ? "text-emerald-400" : "text-amber-400"}>
                  {wt.isClean ? t.projectDetail.clean : t.projectDetail.modifiedFilesPresent}
                </span>
              </div>
            </div>

            {worktreeSafetyWarning && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{worktreeSafetyWarning}</span>
              </div>
            )}
          </section>
        );
      })()}

      {/* 6. Code Intelligence (LSP) Engine Card */}
      <section className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-theme-primary flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>{t.projectDetail.lspTitle}</span>
            </h3>
            <p className="text-xs text-theme-muted">
              {t.projectDetail.lspDesc}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartLsp}
              disabled={actionLoading === "restart-lsp"}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-theme-card-muted hover:bg-theme-card text-theme-secondary border border-theme-subtle transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.projectDetail.restartLsp}</span>
            </button>
            {lspStatus && lspStatus.status !== "stopped" && (
              <button
                onClick={handleStopLsp}
                disabled={actionLoading === "stop-lsp"}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{t.projectDetail.stopLsp}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded bg-theme-card-muted border border-theme-subtle">
            <div className="text-[10px] text-theme-muted">{t.projectDetail.status}</div>
            <div className="text-emerald-400 font-semibold mt-0.5">
              {lspStatus?.status ? (t.statusMap[lspStatus.status.toLowerCase() as keyof typeof t.statusMap] || lspStatus.status.toUpperCase()) : t.projectDetail.stopped}
            </div>
          </div>
          <div className="p-2.5 rounded bg-theme-card-muted border border-theme-subtle">
            <div className="text-[10px] text-theme-muted">{t.projectDetail.engine}</div>
            <div className="text-theme-secondary mt-0.5">Bundled TS LSP</div>
          </div>
          <div className="p-2.5 rounded bg-theme-card-muted border border-theme-subtle">
            <div className="text-[10px] text-theme-muted">PID</div>
            <div className="text-theme-secondary mt-0.5">{lspStatus?.pid || "—"}</div>
          </div>
          <div className="p-2.5 rounded bg-theme-card-muted border border-theme-subtle">
            <div className="text-[10px] text-theme-muted">{t.projectDetail.restarts}</div>
            <div className="text-theme-secondary mt-0.5">{lspStatus?.restartCount || 0}</div>
          </div>
        </div>
      </section>
        </>
      )}

      {/* In-place Expandable Toggle for Standard Mode */}
      {uxMode === "standard" && (
        <div className="pt-2 flex justify-center">
          <button
            onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary border border-theme-subtle transition shadow-sm"
          >
            {showAdvancedDetails ? (
              <>
                <ChevronUp className="w-4 h-4 text-theme-muted" />
                <span>{t.projectDetail.hideAdvancedDetails || "Hide Advanced Details"}</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 text-theme-muted" />
                <span>{t.projectDetail.showAdvancedDetails || "Show Advanced Details"}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSessionForModal && (
        <SessionDetailModal
          isOpen={true}
          onClose={() => {
            setSelectedSessionForModal(null);
            loadProjectData();
          }}
          session={selectedSessionForModal}
          onRefresh={loadProjectData}
        />
      )}
    </div>
  );
};
