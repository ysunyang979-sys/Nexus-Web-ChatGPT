import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Compass,
  Bookmark,
  Clock,
  Send,
  CheckCircle2,
  Copy,
  AlertTriangle,
  FileCode,
  GitBranch,
  Layers,
  Flag,
  Loader2,
  Server,
  RotateCw,
  Square,
  Terminal,
} from "lucide-react";
import { bridge } from "../../api/bridge.js";
import type {
  WorkflowSession,
  WorkflowSessionEvent,
  WorkflowHandoffPacket,
  RuntimeLogChunk,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface SessionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: WorkflowSession | null;
  onRefresh: () => void;
}

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({
  isOpen,
  onClose,
  session,
  onRefresh,
}) => {
  const { t, translateError } = useTranslation();
  const [activeTab, setActiveTab] = useState<"checkpoints" | "events" | "handoff" | "runtimes">("checkpoints");
  const [handoff, setHandoff] = useState<WorkflowHandoffPacket | null>(null);
  const [events, setEvents] = useState<WorkflowSessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Runtime tab state
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogChunk[]>([]);
  const [loadingRuntimeLogs, setLoadingRuntimeLogs] = useState(false);
  const [runtimeActionId, setRuntimeActionId] = useState<string | null>(null);

  // Worktree state
  const [worktreeDiff, setWorktreeDiff] = useState<string | null>(null);
  const [showWorktreeDiff, setShowWorktreeDiff] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [removingWorktree, setRemovingWorktree] = useState(false);

  // Checkpoint creation form
  const [showCheckpointForm, setShowCheckpointForm] = useState(false);
  const [summary, setSummary] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [blockers, setBlockers] = useState("");
  const [submittingCheckpoint, setSubmittingCheckpoint] = useState(false);

  // Finish session form
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [finishReason, setFinishReason] = useState("");
  const [finishNotes, setFinishNotes] = useState("");
  const [submittingFinish, setSubmittingFinish] = useState(false);

  const fetchSessionData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [handoffRes, eventsRes] = await Promise.all([
        bridge.getSessionHandoff(session.id),
        bridge.getSessionEvents(session.id, undefined, 100),
      ]);
      setHandoff(handoffRes.handoff);
      setEvents(eventsRes.events || []);
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  }, [session, translateError]);

  useEffect(() => {
    if (isOpen && session) {
      fetchSessionData();
      setShowCheckpointForm(false);
      setShowFinishForm(false);
    }
  }, [isOpen, session, fetchSessionData]);

  if (!isOpen || !session) return null;

  const handleCopyPrompt = () => {
    if (!handoff) return;
    navigator.clipboard.writeText(handoff.continuationPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleCopyJson = () => {
    if (!handoff) return;
    navigator.clipboard.writeText(JSON.stringify(handoff, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    setSubmittingCheckpoint(true);
    setError(null);
    try {
      const nsList = nextSteps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const blList = blockers
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await bridge.checkpointSession(
        session.id,
        summary.trim(),
        nsList.length > 0 ? nsList : undefined,
        blList.length > 0 ? blList : undefined
      );
      setSummary("");
      setNextSteps("");
      setBlockers("");
      setShowCheckpointForm(false);
      await fetchSessionData();
      onRefresh();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setSubmittingCheckpoint(false);
    }
  };

  const handleFinishSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingFinish(true);
    setError(null);
    try {
      await bridge.finishSession(
        session.id,
        finishReason.trim() || undefined,
        finishNotes.trim() || undefined
      );
      setShowFinishForm(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setSubmittingFinish(false);
    }
  };

  const handleLoadLogs = async (runtimeId: string) => {
    if (selectedRuntimeId === runtimeId) {
      setSelectedRuntimeId(null);
      setRuntimeLogs([]);
      return;
    }
    setSelectedRuntimeId(runtimeId);
    setLoadingRuntimeLogs(true);
    try {
      const logsRes = await bridge.getRuntimeLogs(runtimeId, { limit: 200 });
      setRuntimeLogs(logsRes.entries || []);
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingRuntimeLogs(false);
    }
  };

  const handleRestartRuntime = async (runtimeId: string) => {
    setRuntimeActionId(runtimeId);
    setError(null);
    try {
      await bridge.restartRuntime(runtimeId);
      await fetchSessionData();
      onRefresh();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setRuntimeActionId(null);
    }
  };

  const handleStopRuntime = async (runtimeId: string) => {
    setRuntimeActionId(runtimeId);
    setError(null);
    try {
      await bridge.stopRuntime(runtimeId);
      await fetchSessionData();
      onRefresh();
    } catch (err: any) {
      setError(translateError(err.code, err.message));
    } finally {
      setRuntimeActionId(null);
    }
  };

  const checkpoints = handoff?.recentCheckpoints || [];
  const isActive = session.state === "active";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-theme-card border border-theme-subtle rounded-xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between bg-theme-card-muted/50">
          <div className="flex items-center gap-3 min-w-0">
            <Compass className="w-5 h-5 text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-theme-primary truncate">
                  {session.title || session.id}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    session.state === "active"
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : session.state === "completed"
                      ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                  }`}
                >
                  {session.state === "active"
                    ? t.workflow.activeSession
                    : session.state === "completed"
                    ? t.workflow.completedSession
                    : t.workflow.abandonedSession}
                </span>
              </div>
              <div className="text-[11px] text-theme-muted mt-0.5">
                {t.workflow.lastActive}: {(() => {
                  const raw = (session as any).lastActiveAt || (session as any).lastActivityAt || session.updatedAt || session.createdAt;
                  if (!raw) return "-";
                  const d = new Date(raw);
                  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
                })()} &bull;{" "}
                {session.checkpointCount} {t.workflow.checkpoints} &bull; {session.eventCount}{" "}
                {t.workflow.events}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1.5 rounded-lg hover:bg-theme-card-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Goals Banner if any */}
        {session.goals && session.goals.length > 0 && (
          <div className="px-6 py-2.5 bg-indigo-500/5 border-b border-indigo-500/10 text-xs">
            <div className="font-medium text-indigo-400 mb-1">{t.workflow.goals}:</div>
            <ul className="list-disc list-inside space-y-0.5 text-theme-secondary text-[11px]">
              {session.goals.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Worktree Workspace Banner */}
        {handoff?.workspace?.mode === "worktree" && (
          <div className="px-6 py-2.5 bg-amber-500/5 border-b border-amber-500/10 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="font-semibold text-amber-400">
                  Isolated Worktree: {handoff.workspace.branchName}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                    handoff.workspace.isClean
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {handoff.workspace.isClean ? "clean" : "modified"}
                </span>
              </div>
              <div className="text-[11px] text-theme-muted font-mono truncate max-w-xl">
                {handoff.workspace.worktreeRoot}
              </div>
              {handoff.workspace.baseBranch && (
                <div className="text-[10px] text-theme-muted">
                  Base: {handoff.workspace.baseBranch}{" "}
                  {handoff.workspace.baseCommit ? `(${handoff.workspace.baseCommit.slice(0, 7)})` : ""}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!handoff?.workspace || handoff.workspace.mode !== "worktree") return;
                  if (showWorktreeDiff) {
                    setShowWorktreeDiff(false);
                    return;
                  }
                  setLoadingDiff(true);
                  try {
                    const diffRes = await bridge.getWorktreeDiff(handoff.workspace.worktreeId);
                    setWorktreeDiff(diffRes.diff || "No changes detected against base branch.");
                    setShowWorktreeDiff(true);
                  } catch (err: any) {
                    setError(translateError(err.code, err.message));
                  } finally {
                    setLoadingDiff(false);
                  }
                }}
                className="px-2.5 py-1 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded text-xs transition"
              >
                {loadingDiff ? "Loading Diff..." : showWorktreeDiff ? "Hide Diff" : "View Diff"}
              </button>
              <button
                type="button"
                disabled={removingWorktree}
                onClick={async () => {
                  if (!handoff?.workspace || handoff.workspace.mode !== "worktree") return;
                  if (
                    !confirm(
                      `Are you sure you want to remove worktree "${handoff.workspace.branchName}"? The branch will be preserved. Worktree cannot be removed if dirty, running jobs, or unmerged commits exist.`
                    )
                  )
                    return;
                  setRemovingWorktree(true);
                  setError(null);
                  try {
                    await bridge.removeWorktree(handoff.workspace.worktreeId);
                    await fetchSessionData();
                    onRefresh();
                  } catch (err: any) {
                    setError(translateError(err.code, err.message));
                  } finally {
                    setRemovingWorktree(false);
                  }
                }}
                className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded text-xs font-medium transition disabled:opacity-50"
              >
                {removingWorktree ? "Removing..." : "Remove Worktree"}
              </button>
            </div>
          </div>
        )}

        {/* Worktree Diff Viewer */}
        {showWorktreeDiff && worktreeDiff !== null && (
          <div className="mx-6 my-2 p-3 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs space-y-2">
            <div className="flex items-center justify-between text-[11px] text-theme-muted font-medium">
              <span>Worktree Diff</span>
              <button
                onClick={() => setShowWorktreeDiff(false)}
                className="text-theme-muted hover:text-theme-primary"
              >
                Close
              </button>
            </div>
            <pre className="p-2.5 bg-black/40 rounded font-mono text-[11px] text-theme-secondary overflow-x-auto max-h-64 whitespace-pre-wrap">
              {worktreeDiff}
            </pre>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-theme-subtle">
          <button
            onClick={() => setActiveTab("checkpoints")}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "checkpoints"
                ? "border-indigo-500 text-indigo-500"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>
              {t.workflow.checkpoints} ({checkpoints.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "events"
                ? "border-indigo-500 text-indigo-500"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>
              {t.workflow.timeline} ({events.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("handoff")}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "handoff"
                ? "border-indigo-500 text-indigo-500"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t.workflow.handoff}</span>
          </button>
          <button
            onClick={() => setActiveTab("runtimes")}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === "runtimes"
                ? "border-indigo-500 text-indigo-500"
                : "border-transparent text-theme-muted hover:text-theme-primary"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>
              {t.runtimes.title} ({handoff?.runtimes?.active?.length ?? 0})
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-theme-muted gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t.common.loading}</span>
            </div>
          ) : activeTab === "checkpoints" ? (
            <div className="space-y-4">
              {/* Checkpoints list */}
              {checkpoints.length === 0 ? (
                <div className="text-center py-10 text-theme-muted">
                  <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div>No checkpoints saved yet for this session.</div>
                </div>
              ) : (
                checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-4 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-theme-muted">
                      <span className="font-semibold text-indigo-400">
                        #{cp.checkpointNumber}
                      </span>
                      <span>{new Date(cp.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-theme-primary font-medium">{cp.summary}</p>
                    {cp.nextSteps && cp.nextSteps.length > 0 && (
                      <div className="pt-2 border-t border-theme-subtle/50">
                        <div className="text-[11px] text-theme-muted font-medium mb-1">
                          Next Steps:
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-theme-secondary text-[11px]">
                          {cp.nextSteps.map((ns, idx) => (
                            <li key={idx}>{ns}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {cp.blockers && cp.blockers.length > 0 && (
                      <div className="pt-2 border-t border-theme-subtle/50">
                        <div className="text-[11px] text-amber-500 font-medium mb-1">
                          Blockers / Issues:
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-400/90 text-[11px]">
                          {cp.blockers.map((b, idx) => (
                            <li key={idx}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Checkpoint Form Modal / Inline */}
              {showCheckpointForm && (
                <form
                  onSubmit={handleCreateCheckpoint}
                  className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg space-y-3"
                >
                  <div className="font-bold text-theme-primary text-xs">
                    {t.workflow.createCheckpointTitle}
                  </div>
                  <div>
                    <label className="block text-[11px] text-theme-muted mb-1">
                      Summary (Required)
                    </label>
                    <textarea
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder={t.workflow.summaryPlaceholder}
                      rows={2}
                      required
                      className="w-full bg-theme-input border border-theme-input rounded-lg p-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-theme-muted mb-1">
                      Next Steps (Optional, one per line)
                    </label>
                    <textarea
                      value={nextSteps}
                      onChange={(e) => setNextSteps(e.target.value)}
                      placeholder={t.workflow.nextStepsPlaceholder}
                      rows={2}
                      className="w-full bg-theme-input border border-theme-input rounded-lg p-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-theme-muted mb-1">
                      Blockers (Optional, one per line)
                    </label>
                    <textarea
                      value={blockers}
                      onChange={(e) => setBlockers(e.target.value)}
                      placeholder={t.workflow.blockersPlaceholder}
                      rows={2}
                      className="w-full bg-theme-input border border-theme-input rounded-lg p-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCheckpointForm(false)}
                      className="px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs transition"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={submittingCheckpoint || !summary.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs transition disabled:opacity-50"
                    >
                      {submittingCheckpoint ? t.common.loading : t.common.save}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : activeTab === "events" ? (
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-center py-10 text-theme-muted">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div>No events attributed to this session yet.</div>
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-theme-muted font-mono">
                        #{evt.eventNumber}
                      </span>
                      <span className="badge badge-indigo text-[10px] shrink-0">
                        {evt.kind}
                      </span>
                      <span className="font-medium text-theme-primary truncate">
                        {evt.operation}
                      </span>
                      {evt.target && (
                        <span className="text-[11px] text-theme-muted truncate max-w-xs">
                          &bull; {evt.target}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          evt.status === "success"
                            ? "text-emerald-400 bg-emerald-500/10"
                            : evt.status === "failure"
                            ? "text-red-400 bg-red-500/10"
                            : "text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {evt.status}
                      </span>
                      <span className="text-[10px] text-theme-muted">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === "runtimes" ? (
            <div className="space-y-4">
              {(!handoff?.runtimes ||
                ((handoff.runtimes.active?.length ?? 0) === 0 &&
                  (handoff.runtimes.recent?.length ?? 0) === 0)) ? (
                <div className="text-center py-10 text-theme-muted">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div>{t.runtimes.noActiveRuntimes}</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    ...(handoff.runtimes.active || []),
                    ...(handoff.runtimes.recent || []),
                  ].map((rt) => {
                    const isRunning = rt.state === "running" || rt.state === "starting";
                    const isActioning = runtimeActionId === rt.runtimeId;
                    const isLogsOpen = selectedRuntimeId === rt.runtimeId;

                    return (
                      <div
                        key={rt.runtimeId}
                        className="p-4 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-theme-primary truncate">
                              {rt.name || rt.runtimeId}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                                rt.state === "running"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : rt.state === "starting"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : rt.state === "stopping"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : rt.state === "failed"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                              }`}
                            >
                              {rt.state}
                            </span>
                            <span className="text-[10px] text-theme-muted font-mono">
                              gen {rt.generation}
                            </span>
                            <span className="badge badge-indigo text-[10px]">
                              {rt.kind}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isRunning && (
                              <button
                                onClick={() => handleStopRuntime(rt.runtimeId)}
                                disabled={isActioning}
                                className="flex items-center gap-1 px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded text-xs transition disabled:opacity-50"
                              >
                                <Square className="w-3 h-3" />
                                <span>{t.runtimes.stop}</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartRuntime(rt.runtimeId)}
                              disabled={isActioning}
                              className="flex items-center gap-1 px-2.5 py-1 bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded text-xs transition disabled:opacity-50"
                            >
                              <RotateCw className={`w-3 h-3 ${isActioning ? "animate-spin" : ""}`} />
                              <span>{t.runtimes.restart}</span>
                            </button>
                            <button
                              onClick={() => handleLoadLogs(rt.runtimeId)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-theme-card hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded text-xs transition"
                            >
                              <Terminal className="w-3 h-3" />
                              <span>{isLogsOpen ? t.runtimes.hideLogs : t.runtimes.viewLogs}</span>
                            </button>
                          </div>
                        </div>

                        {isLogsOpen && (
                          <div className="mt-2 pt-2 border-t border-theme-subtle/50 space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-theme-muted">
                              <span>{t.runtimes.logs}</span>
                              {loadingRuntimeLogs && (
                                <span className="flex items-center gap-1 text-[10px]">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Loading...
                                </span>
                              )}
                            </div>
                            <pre className="p-3 bg-black/40 rounded font-mono text-[11px] text-theme-secondary overflow-x-auto max-h-48 whitespace-pre-wrap">
                              {runtimeLogs.length === 0
                                ? "No log output recorded."
                                : runtimeLogs.map((l) => `[${l.stream}] ${l.text}`).join("")}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Handoff Packet Tab */
            handoff && (
              <div className="space-y-4">
                {/* Continuation Prompt Card */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-theme-primary">
                      {t.workflow.continuationPrompt}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyPrompt}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition"
                      >
                        {copiedPrompt ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.workflow.promptCopied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{t.workflow.copyPromptBtn}</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleCopyJson}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded text-xs font-semibold transition"
                      >
                        {copiedJson ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t.workflow.jsonCopied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{t.workflow.copyHandoffJsonBtn}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 bg-slate-950 text-slate-200 border border-theme-subtle rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64 select-all leading-relaxed">
                    {handoff.continuationPrompt}
                  </pre>
                </div>

                {/* Real-time State Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Git State */}
                  <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-1">
                    <div className="text-[11px] font-semibold text-theme-muted flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                      Git State
                    </div>
                    <div className="text-theme-primary font-medium">
                      Branch: {handoff.currentStatus.git.branch || "unknown"}
                    </div>
                    <div className="text-[11px] text-theme-muted">
                      {handoff.currentStatus.git.dirty ? (
                        <span className="text-amber-400">Working tree dirty</span>
                      ) : (
                        <span className="text-emerald-400">Clean working tree</span>
                      )}
                    </div>
                  </div>

                  {/* Touched Files */}
                  <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-1">
                    <div className="text-[11px] font-semibold text-theme-muted flex items-center gap-1">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      Touched Files
                    </div>
                    <div className="text-theme-primary font-medium">
                      {handoff.touchedFiles.length} files modified
                    </div>
                    <div className="text-[11px] text-theme-muted">
                      Across all operations in session
                    </div>
                  </div>

                  {/* Active Jobs, Runtimes & Approvals */}
                  <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-1">
                    <div className="text-[11px] font-semibold text-theme-muted flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      Runtime Guards
                    </div>
                    <div className="text-theme-primary font-medium">
                      {handoff.runtimes?.active?.length ?? 0} runtimes &bull; {handoff.currentStatus.activeJobs.length} jobs
                    </div>
                    <div className="text-[11px] text-theme-muted">
                      {handoff.currentStatus.pendingApprovals.length} pending approvals
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Finish Session Form */}
          {showFinishForm && (
            <form
              onSubmit={handleFinishSession}
              className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg space-y-3"
            >
              <div className="font-bold text-red-400 text-xs">
                {t.workflow.finishSessionTitle}
              </div>
              <div>
                <label className="block text-[11px] text-theme-muted mb-1">
                  {(t.workflow as any).reasonLabel || "Reason (Optional)"}
                </label>
                <input
                  type="text"
                  value={finishReason}
                  onChange={(e) => setFinishReason(e.target.value)}
                  placeholder={t.workflow.reasonPlaceholder}
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-theme-muted mb-1">
                  {(t.workflow as any).notesLabel || "Final Notes (Optional)"}
                </label>
                <textarea
                  value={finishNotes}
                  onChange={(e) => setFinishNotes(e.target.value)}
                  placeholder={t.workflow.notesPlaceholder}
                  rows={2}
                  className="w-full bg-theme-input border border-theme-input rounded-lg p-2 text-xs text-theme-primary focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowFinishForm(false)}
                  className="px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs transition"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submittingFinish}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs transition disabled:opacity-50"
                >
                  {submittingFinish ? t.common.loading : t.workflow.finishSessionBtn}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-theme-subtle flex items-center justify-between bg-theme-card-muted/50">
          <div className="flex items-center gap-2">
            {isActive && !showCheckpointForm && (
              <button
                onClick={() => setShowCheckpointForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-sm"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{t.workflow.checkpointBtn}</span>
              </button>
            )}
            {isActive && !showFinishForm && (
              <button
                onClick={() => setShowFinishForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-muted hover:bg-red-500/10 text-theme-secondary hover:text-red-400 border border-theme-subtle rounded-lg text-xs font-semibold transition"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{t.workflow.finishSessionBtn}</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border border-theme-subtle rounded-lg text-xs font-semibold transition"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
