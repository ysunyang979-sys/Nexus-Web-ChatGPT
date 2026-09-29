import React, { useState, useEffect, useCallback } from "react";
import {
  Compass,
  Send,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import type { WorkflowSession } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { SessionDetailModal } from "./modals/SessionDetailModal.js";

interface WorkflowSessionCardProps {
  projectId: string;
  projectName?: string;
  enabled: boolean;
}

export const WorkflowSessionCard: React.FC<WorkflowSessionCardProps> = ({
  projectId,
  enabled,
}) => {
  const { t, translateError } = useTranslation();
  const [activeSession, setActiveSession] = useState<WorkflowSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<WorkflowSession | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Start session form
  const [showStartForm, setShowStartForm] = useState(false);
  const [startTitle, setStartTitle] = useState("");
  const [startGoals, setStartGoals] = useState("");
  const [starting, setStarting] = useState(false);

  const fetchSession = useCallback(async () => {
    if (!enabled) {
      setActiveSession(null);
      return;
    }
    try {
      const res = await bridge.listSessions({
        projectId,
        state: "active",
        limit: 1,
      });
      if (res && res.sessions && res.sessions.length > 0) {
        setActiveSession(res.sessions[0]);
      } else {
        setActiveSession(null);
      }
      setErrorMsg(null);
    } catch (_err: any) {
      // Don't show network errors as critical card failures
      setActiveSession(null);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 8000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setErrorMsg(null);
    try {
      const goalsList = startGoals
        .split("\n")
        .map((g) => g.trim())
        .filter(Boolean);
      const res = await bridge.startSession(
        projectId,
        startTitle.trim() || undefined,
        goalsList.length > 0 ? goalsList : undefined
      );
      setActiveSession(res.session);
      setStartTitle("");
      setStartGoals("");
      setShowStartForm(false);
    } catch (err: any) {
      setErrorMsg(translateError(err.code, err.message));
    } finally {
      setStarting(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle space-y-2.5 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-semibold text-theme-primary">{t.workflow.title}</span>
          {activeSession ? (
            <span className="badge badge-green text-[10px]">
              {t.workflow.activeSession}
            </span>
          ) : (
            <span className="badge badge-gray text-[10px]">
              {t.workflow.noActiveSession}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeSession ? (
            <button
              onClick={() => setSelectedSession(activeSession)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition"
            >
              <Send className="w-3 h-3" />
              <span>{t.workflow.viewSessionBtn}</span>
            </button>
          ) : !showStartForm ? (
            <button
              onClick={() => setShowStartForm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition"
            >
              <Plus className="w-3 h-3" />
              <span>{t.workflow.startSessionBtn}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active Session Info */}
      {activeSession && (
        <div className="pt-2 border-t border-theme-subtle/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-theme-muted">
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-theme-secondary truncate">
              {activeSession.title || `Session ${activeSession.id.slice(0, 8)}`}
            </span>
            {activeSession.workspace?.mode === "worktree" ? (
              <span className="badge badge-amber text-[10px] flex items-center gap-1">
                <span>worktree: {activeSession.workspace.branchName}</span>
              </span>
            ) : (
              <span className="badge badge-gray text-[10px]">primary</span>
            )}
            <span className="mx-1">&bull;</span>
            <span>
              {activeSession.checkpointCount} {t.workflow.checkpoints}
            </span>
            <span className="mx-1">&bull;</span>
            <span>
              {activeSession.eventCount} {t.workflow.events}
            </span>
          </div>
          <div>
            {t.workflow.lastActive}: {(() => {
              const raw = (activeSession as any).lastActiveAt || (activeSession as any).lastActivityAt || activeSession.updatedAt || activeSession.createdAt;
              if (!raw) return "-";
              const d = new Date(raw);
              return isNaN(d.getTime()) ? "-" : d.toLocaleTimeString();
            })()}
          </div>
        </div>
      )}

      {/* Start Session Inline Form */}
      {showStartForm && !activeSession && (
        <form
          onSubmit={handleStartSession}
          className="pt-2 border-t border-theme-subtle/50 space-y-2.5"
        >
          <div>
            <label className="block text-[11px] text-theme-muted mb-1">
              Title (Optional)
            </label>
            <input
              type="text"
              value={startTitle}
              onChange={(e) => setStartTitle(e.target.value)}
              placeholder="e.g., Refactor Auth Flow & Token Validation"
              className="w-full bg-theme-input border border-theme-input rounded px-2.5 py-1 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-theme-muted mb-1">
              Goals (Optional, one per line)
            </label>
            <textarea
              value={startGoals}
              onChange={(e) => setStartGoals(e.target.value)}
              placeholder="Goal 1: Implement token rotation&#10;Goal 2: Add test suite"
              rows={2}
              className="w-full bg-theme-input border border-theme-input rounded p-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowStartForm(false)}
              className="px-2.5 py-1 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded text-xs transition"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={starting}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded text-xs transition disabled:opacity-50"
            >
              {starting ? t.common.loading : t.workflow.startSessionBtn}
            </button>
          </div>
        </form>
      )}

      {/* Detail Modal */}
      {selectedSession && (
        <SessionDetailModal
          isOpen={true}
          onClose={() => {
            setSelectedSession(null);
            fetchSession();
          }}
          session={selectedSession}
          onRefresh={fetchSession}
        />
      )}
    </div>
  );
};
