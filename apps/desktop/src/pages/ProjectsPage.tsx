import React, { useState, useEffect } from "react";
import {
  FolderLock,
  Plus,
  Trash2,
  Shield,
  Terminal,
  AlertTriangle,
  Search,
  ChevronRight,
} from "lucide-react";
import type { Project, UserExperienceMode } from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ProjectDetailPage } from "./ProjectDetailPage.js";

interface ProjectsPageProps {
  projects: Project[];
  onOpenAuthorizeModal: () => void;
  onRefresh: () => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  uxMode?: UserExperienceMode;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  onOpenAuthorizeModal,
  onRefresh,
  selectedProjectId: propSelectedProjectId,
  onSelectProject,
  uxMode = "standard",
}) => {
  const { t, translateError } = useTranslation();
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "disabled">("all");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const activeSelectedId = propSelectedProjectId !== undefined ? propSelectedProjectId : internalSelectedId;

  const handleSelect = (id: string | null) => {
    if (onSelectProject) {
      onSelectProject(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  // If a project is selected, render the rich detail view
  if (activeSelectedId) {
    return (
      <ProjectDetailPage
        projectId={activeSelectedId}
        onBack={() => handleSelect(null)}
        onRefreshProjects={onRefresh}
        uxMode={uxMode}
      />
    );
  }

  const handleToggleEnable = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextEnabled = !project.enabled;

    // Immediate optimistic update
    setLocalProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, enabled: nextEnabled } : p))
    );
    setLoadingId(project.id);
    setError(null);

    try {
      if (project.enabled) {
        await bridge.disableProject(project.id);
      } else {
        await bridge.enableProject(project.id);
      }
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on failure
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, enabled: project.enabled } : p))
      );
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleAccess = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode = project.accessMode === "read-only" ? "read-write" : "read-only";

    // Immediate optimistic update
    setLocalProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, accessMode: newMode } : p))
    );
    setLoadingId(project.id);
    setError(null);

    try {
      await bridge.setProjectAccess(project.id, newMode);
      onRefresh();
    } catch (err: any) {
      // Revert optimistic state on failure
      setLocalProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, accessMode: project.accessMode } : p))
      );
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Immediate optimistic update
    setLocalProjects((prev) => prev.filter((p) => p.id !== projectId));
    setLoadingId(projectId);
    setError(null);

    try {
      await bridge.removeProject(projectId);
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: any) {
      setLocalProjects(projects);
      setError(translateError(err.code, err.message));
    } finally {
      setLoadingId(null);
    }
  };

  // Filter projects based on search query and status filter
  const filteredProjects = localProjects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.root.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterMode === "enabled") return p.enabled;
    if (filterMode === "disabled") return !p.enabled;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-theme-primary tracking-tight">
            {t.projects.title || "Authorized Projects"}
          </h2>
          <p className="text-xs text-theme-muted">
            {t.projects.subtitle ||
              "Local directories authorized for AI tool operations, persistent runtimes, and diagnostics."}
          </p>
        </div>
        <button
          onClick={onOpenAuthorizeModal}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-xs shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{t.projects.authorizeBtn || "Authorize Directory"}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.projects?.searchPlaceholder || "Search projects by name, root path, or ID..."}
            className="w-full bg-theme-input border border-theme-input rounded-lg pl-9 pr-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-sky-500 transition font-mono"
          />
        </div>

        <div className="flex items-center gap-1 bg-theme-card-muted border border-theme-subtle rounded-lg p-1 text-xs">
          <button
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "all"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.all || "All"} ({localProjects.length})
          </button>
          <button
            onClick={() => setFilterMode("enabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "enabled"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.enable || "Enabled"} ({localProjects.filter((p) => p.enabled).length})
          </button>
          <button
            onClick={() => setFilterMode("disabled")}
            className={`px-2.5 py-1 rounded font-medium transition ${
              filterMode === "disabled"
                ? "bg-theme-card text-theme-primary shadow-sm border border-theme-subtle"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.common?.disable || "Disabled"} ({localProjects.filter((p) => !p.enabled).length})
          </button>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="p-12 text-center bg-theme-card border border-theme-subtle rounded-xl space-y-3 shadow-sm">
          <FolderLock className="w-10 h-10 text-theme-muted mx-auto" />
          <div className="text-theme-primary font-semibold text-sm">
            {projects.length === 0
              ? t.projects?.noProjects || "No authorized projects yet"
              : "No matching projects found"}
          </div>
          <p className="text-theme-muted text-xs max-w-md mx-auto">
            {projects.length === 0
              ? t.projects?.noProjectsDesc || "Authorize a local workspace to get started."
              : "Try adjusting your search or status filter."}
          </p>
          {projects.length === 0 && (
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-xs transition shadow-sm"
            >
              {t.projects?.authorizeBtn || "Authorize Directory"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredProjects.map((project) => {
            const isDeleting = deleteConfirmId === project.id;
            const isLoading = loadingId === project.id;

            return (
              <div
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className={`p-5 bg-theme-card border rounded-xl space-y-3 transition-all duration-150 cursor-pointer group shadow-sm hover:border-theme-strong ${
                  project.enabled
                    ? "border-theme-subtle"
                    : "border-theme-subtle opacity-60"
                }`}
              >
                {/* Upper Row: Name, Path, and Actions */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-theme-primary text-base group-hover:text-sky-500 dark:group-hover:text-sky-300 transition-colors truncate">
                        {project.name}
                      </span>
                      <span className="font-mono text-xs text-theme-muted">
                        {project.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          project.enabled
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {project.enabled
                          ? (t.control?.statusAuthorized || "AUTHORIZED")
                          : (t.control?.statusDisabled || "DISABLED")}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-theme-secondary bg-theme-card-muted px-2.5 py-1 rounded border border-theme-subtle inline-block select-all">
                      {project.root}
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleToggleEnable(project, e)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        project.enabled
                          ? "bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary border-theme-subtle"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"
                      }`}
                    >
                      {project.enabled ? (t.projectDetail?.disable || "Disable") : (t.projectDetail?.enable || "Enable")}
                    </button>

                    {isDeleting ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleRemove(project.id, e)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          {t.projectDetail?.confirmRemove || "Confirm"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs border border-theme-subtle transition"
                        >
                          {t.common?.cancel || "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(project.id);
                        }}
                        disabled={isLoading}
                        className="p-1.5 text-theme-muted hover:text-red-500 hover:bg-theme-card-hover rounded-lg transition"
                        title={t.projectDetail?.removeProject || "Remove authorization"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 group-hover:bg-sky-500/20 transition">
                      <span>{t.common?.details || "Detail"}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Lower Row: Security & Permission Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-theme-subtle text-xs font-mono">
                  <div className="flex items-center justify-between p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle">
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-theme-muted" />
                        <span>{t.projects?.accessMode || "Access Mode"}</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        {project.accessMode === "read-only"
                          ? (t.projects?.readOnly || "Files are protected against edits")
                          : (t.projects?.readWrite || "Full file modification authorized")}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleToggleAccess(project, e)}
                      disabled={isLoading}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        project.accessMode === "read-only"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {project.accessMode === "read-only"
                        ? (t.projects?.readOnly || "Read-Only")
                        : (t.projects?.readWrite || "Read-Write")}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle">
                    <div>
                      <div className="font-medium text-theme-secondary flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-theme-muted" />
                        <span>{t.projects?.executionMode || "Execution Boundary"}</span>
                      </div>
                      <div className="text-theme-muted text-[11px] mt-0.5">
                        Mode: {project.executionMode}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                      {project.executionMode}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
