import React, { useState, useEffect } from "react";
import {
  FolderLock,
  Plus,
  Radio,
  Server,
  Cpu,
  ShieldCheck,
  ChevronRight,
  Brain,
  Sparkles,
  ShieldAlert,
  Zap,
} from "lucide-react";
import type {
  ServerStatus,
  McpStatus,
  TunnelStatusDto,
  Project,
  Approval,
  Job,
  IntelligenceStatusDto,
  UserExperienceMode,
  FullControlStatusDto,
} from "../types.js";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { ApprovalCard } from "../components/ApprovalCard.js";

interface ControlPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
  projects: Project[];
  approvals: Approval[];
  jobs: Job[];
  onNavigate: (page: any) => void;
  onSelectProject: (projectId: string) => void;
  onOpenAuthorizeModal: () => void;
  onOpenCreateTokenModal: () => void;
  onOpenEmergencyStopModal: () => void;
  onQuickResolveApproval: (id: string, action: "approve" | "deny") => Promise<void>;
  uxMode?: UserExperienceMode;
  fullControlStatus?: FullControlStatusDto | null;
  onRefresh?: () => Promise<void> | void;
  onOpenFullControlModal?: () => void;
}

// Project summary card for the Recent Work section
const RecentProjectCard: React.FC<{
  project: Project;
  onOpen: () => void;
  isAdvanced?: boolean;
}> = ({ project, onOpen }) => {
  const { t } = useTranslation();

  return (
    <div
      onClick={onOpen}
      className="p-4 rounded-xl bg-theme-card border border-theme-subtle hover:border-theme-strong transition-all duration-150 cursor-pointer group shadow-sm flex items-center justify-between gap-4"
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-theme-primary text-sm tracking-tight group-hover:text-sky-500 dark:group-hover:text-sky-300 transition-colors truncate">
            {project.name}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              project.enabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            {project.enabled
              ? (t.control?.statusAuthorized || "AUTHORIZED")
              : (t.control?.statusDisabled || "DISABLED")}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-theme-card-muted text-theme-muted border border-theme-subtle">
            {project.accessMode === "read-write" ? "RW" : "RO"}
          </span>
        </div>
        <div className="text-xs text-theme-muted font-mono truncate max-w-lg">
          {project.root}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-theme-muted group-hover:text-theme-primary bg-theme-card-muted group-hover:bg-theme-card-hover border border-theme-subtle transition shrink-0"
      >
        <span>{t.control?.openProject || "Open"}</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const ControlPage: React.FC<ControlPageProps> = ({
  serverStatus,
  mcpStatus,
  tunnelStatus,
  projects,
  approvals,
  jobs,
  onNavigate,
  onSelectProject,
  onOpenAuthorizeModal,
  onOpenCreateTokenModal,
  onOpenEmergencyStopModal,
  onQuickResolveApproval,
  uxMode = "standard",
  fullControlStatus,
  onRefresh,
  onOpenFullControlModal,
}) => {
  const { t } = useTranslation();
  const isAdvanced = uxMode === "advanced";
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [intelStatus, setIntelStatus] = useState<IntelligenceStatusDto | null>(null);

  useEffect(() => {
    bridge.getIntelligenceStatus().then(setIntelStatus).catch(() => {});
  }, []);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  const handleApprove = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "approve");
    } finally {
      setResolvingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setResolvingId(id);
    try {
      await onQuickResolveApproval(id, "deny");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto select-none">
      {/* Full Control Active Banner */}
      {fullControlStatus?.activeSession && (
        <section className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/30 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-amber-700 dark:text-amber-300">
                    完全控制模式进行中 (Full Control Active)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/30">
                    {fullControlStatus.activeSession.scope === "device" ? "整台设备 (Device-Wide)" : "当前项目 (Project-Scoped)"}
                  </span>
                </div>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                  AI 客户端已获临时完全控制权，允许执行二进制删除、递归目录清理与自动化本地文件系统操作。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={async () => {
                  if (fullControlStatus.activeSession?.id) {
                    await bridge.stopFullControl(fullControlStatus.activeSession.id);
                    if (onRefresh) await onRefresh();
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm"
              >
                立即恢复安全模式
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20 text-xs font-mono">
            <div>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-[10px] block">授权客户端</span>
              <span className="font-semibold text-amber-800 dark:text-amber-200 truncate block">
                {fullControlStatus.activeSession.clientName || fullControlStatus.activeSession.clientId}
              </span>
            </div>
            <div>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-[10px] block">目标范围</span>
              <span className="truncate block font-semibold text-amber-800 dark:text-amber-200">
                {fullControlStatus.activeSession.scope === "device"
                  ? "整台设备本地存储"
                  : fullControlStatus.activeSession.projectName || fullControlStatus.activeSession.projectId || "当前项目"}
              </span>
            </div>
            <div>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-[10px] block">生效时间</span>
              <span className="text-amber-800 dark:text-amber-200">
                {new Date(fullControlStatus.activeSession.startedAt).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-[10px] block">自动失效</span>
              <span className="text-amber-800 dark:text-amber-200">
                {fullControlStatus.activeSession.expiresAt
                  ? `预计 ${new Date(fullControlStatus.activeSession.expiresAt).toLocaleTimeString()}`
                  : "手动关闭为止"}
              </span>
            </div>
          </div>
        </section>
      )}
      {/* ================= STANDARD MODE TOP HERO ================= */}
      {!isAdvanced ? (
        <section className="space-y-6">
          {/* Greeting & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-theme-primary tracking-tight">
                  {t.overview?.greetingReady || "Nexus is ready"}
                </h1>
                {intelStatus?.provider === "laya" && intelStatus?.status === "ready" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <Brain className="w-3 h-3 text-purple-500" />
                    <span>Laya · {t.intelligence?.advisoryOnly || "Advisory Only"}</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-theme-muted">
                {t.overview?.greetingSubtitle || "Your local AI environment is ready to assist."}
              </p>
            </div>

            {/* Primary Action Button */}
            <div>
              {projects.length > 0 ? (
                <button
                  onClick={() => onSelectProject(projects[0].id)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
                >
                  <span>{t.overview?.primaryCtaOpen || "Open Project"}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={onOpenAuthorizeModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.overview?.primaryCtaAuthorize || "Authorize Project"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 3 Core Questions Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Current Project */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.currentProjectTitle || "Current Project"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  {projects.length > 0 ? projects[0].name : (t.overview?.noProjectSelected || "No Project Selected")}
                </div>
                <div className="text-xs text-theme-muted truncate">
                  {projects.length > 0 ? (t.control?.statusAuthorized || "Authorized") : (t.control?.authorizeProject || "Authorize a directory")}
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${projects.length > 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
            </div>

            {/* 2. ChatGPT Connection */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.chatGptConnectionTitle || "ChatGPT Connection"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  ChatGPT
                </div>
                <div className="text-xs text-theme-muted truncate">
                  {isTunnelConnected || (mcpStatus?.mcpActive && !mcpStatus?.paused)
                    ? (t.overview?.aiConnected || "Connected")
                    : (t.overview?.aiDisconnected || "Standby")}
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isTunnelConnected || (mcpStatus?.mcpActive && !mcpStatus?.paused) ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"}`} />
            </div>

            {/* 3. Nexus Services */}
            <div className="p-4 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-theme-muted">
                  {t.overview?.localServicesTitle || "Nexus Services"}
                </div>
                <div className="text-sm font-semibold text-theme-primary truncate">
                  {serverStatus ? (t.overview?.localServicesHealthy || "Running smoothly") : (t.control?.serverOffline || "Offline")}
                </div>
                <div className="text-xs text-theme-muted truncate font-mono">
                  127.0.0.1:18080 · Safe Sandbox
                </div>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${serverStatus ? "bg-emerald-500" : "bg-red-500"}`} />
            </div>
          </div>

          {/* 1-2-3 Getting Started Guide */}
          <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
                {t.overview?.gettingStartedTitle || "Getting Started"}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step1GuideTitle || "Authorize a Project"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step1GuideDesc || "Choose a local folder and assign access permissions."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step2GuideTitle || "Connect AI"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step2GuideDesc || "Pair ChatGPT or remote agent securely through controlled tunnel."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-theme-card-muted border border-theme-subtle">
                <div className="w-6 h-6 rounded-full bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.overview?.step3GuideTitle || "Start Working"}
                  </div>
                  <div className="text-[11px] text-theme-muted leading-relaxed">
                    {t.overview?.step3GuideDesc || "Let AI search code safely while sensitive actions require confirmation."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* ================= ADVANCED MODE TOP 5-CARD COCKPIT ================= */
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Tunnel Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-sky-500" />
                <span>{t.control?.secureTunnel || "Secure Tunnel"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {isTunnelConnected
                  ? (t.control?.tunnelConnected || "Connected")
                  : (t.control?.tunnelStandby || "Standby")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                {tunnelStatus?.network_mode === "custom"
                  ? (t.control?.proxyCustom || "Custom Proxy")
                  : tunnelStatus?.network_mode === "direct"
                    ? (t.control?.proxyDirect || "Direct")
                    : (t.control?.proxySystem || "System Proxy")}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                isTunnelConnected ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"
              }`}
            />
          </div>

          {/* Control Plane Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Server className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.controlPlane || "Control Plane"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {serverStatus
                  ? (t.control?.serverOnline || "Online")
                  : (t.control?.serverOffline || "Offline")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                127.0.0.1:18080
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
          </div>

          {/* Runner Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.localRunner || "Local Runner"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {serverStatus?.runners_connected || 0} {t.control?.runnerConnected || "Connected"}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                Node v{serverStatus?.version || "1.2.0"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                (serverStatus?.runners_connected || 0) > 0
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
            />
          </div>

          {/* MCP Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-theme-muted" />
                <span>{t.control?.mcpProtocol || "MCP Protocol"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {mcpStatus?.paused
                  ? (t.control?.mcpPaused || "Execution Paused")
                  : `${mcpStatus?.toolsCount ?? 87} ${t.control?.mcpToolsActive || "Tools Active"}`}
              </div>
              <div className="text-[10px] font-mono text-theme-muted">
                v{mcpStatus?.protocolVersion || "2024-11-05"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                mcpStatus?.paused
                  ? "bg-amber-500"
                  : mcpStatus?.mcpActive
                    ? "bg-emerald-500"
                    : "bg-red-500"
              }`}
            />
          </div>

          {/* Decision Intelligence (Laya) Compact Card */}
          <div className="p-3.5 rounded-xl bg-theme-card border border-theme-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-sky-500" />
                <span>{t.control?.intelligencePill || "Decision Intelligence"}</span>
              </div>
              <div className="text-xs font-semibold text-theme-primary">
                {intelStatus?.provider === "laya" && intelStatus?.status === "ready"
                  ? `Laya · ${t.control?.intelligenceReady || "Ready"}`
                  : intelStatus?.provider === "laya"
                    ? `Laya · ${t.intelligence?.statusLoading || "Loading"}`
                    : (t.control?.intelligenceDisabled || "Disabled")}
              </div>
              <div className="text-[10px] font-mono text-theme-muted truncate max-w-[120px]">
                {(intelStatus?.latencyMs || intelStatus?.inferenceTimeMs) ? `${intelStatus.latencyMs || intelStatus.inferenceTimeMs}ms` : "mmBERT-base"}
              </div>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                intelStatus?.status === "ready"
                  ? "bg-emerald-500"
                  : intelStatus?.status === "loading"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-slate-400 dark:bg-slate-600"
              }`}
            />
          </div>
        </section>
      )}

      {/* Pending Approvals Banner (If any) */}
      {pendingApprovals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-amber-600 dark:text-amber-300 font-semibold">
                {t.control?.pendingApprovals || "Pending Operator Approvals"} ({pendingApprovals.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-theme-muted hover:text-theme-primary transition"
            >
              {t.control?.viewInActivity || "View in Activity timeline ›"}
            </button>
          </div>

          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                projectName={
                  projects.find((p) => p.id === approval.projectId)?.name
                }
                onApprove={handleApprove}
                onDeny={handleDeny}
                isProcessing={resolvingId === approval.id}
              />
            ))}
          </div>
        </section>
      )}


      {/* Recent Work (最近工作区) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-theme-primary tracking-tight">
              {isAdvanced ? (t.control?.recentWork || "Recent Work") : (t.overview?.recentWorkTitle || "Recent Work")}
            </h2>
            <p className="text-xs text-theme-muted">
              {isAdvanced
                ? (t.control?.recentWorkDesc || "Live status across authorized projects, active runtimes, workflows, and code intelligence.")
                : (t.projects?.subtitle || "Manage authorized workspace directories for AI collaboration.")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAuthorizeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-sky-500" />
              <span>{t.control?.authorizeProject || "Authorize Project"}</span>
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-10 rounded-xl bg-theme-card border border-theme-subtle text-center space-y-3 shadow-sm">
            <FolderLock className="w-8 h-8 text-theme-muted mx-auto" />
            <div className="text-sm font-medium text-theme-primary">
              {t.control?.noAuthorizedProjects || "No Authorized Projects"}
            </div>
            <p className="text-xs text-theme-muted max-w-sm mx-auto">
              {t.control?.noAuthorizedProjectsDesc ||
                "Authorize a local project directory so ChatGPT and the local MCP runner can inspect code, run tests, and manage persistent runtimes safely."}
            </p>
            <button
              onClick={onOpenAuthorizeModal}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
            >
              {t.control?.authorizeFirstProject || "Authorize First Project"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {projects.map((project) => (
              <RecentProjectCard
                key={project.id}
                project={project}
                onOpen={() => onSelectProject(project.id)}
                isAdvanced={isAdvanced}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions Footer Strip (Advanced Mode: Full, Standard Mode: Minimal) */}
      {isAdvanced ? (
        <section className="pt-4 border-t border-theme-subtle flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenCreateTokenModal}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.generateToken || "+ Generate Token"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("settings")}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.tunnelOutboundSettings || "Tunnel & Outbound Settings"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("activity")}
              className="text-theme-muted hover:text-theme-secondary transition font-mono text-[11px]"
            >
              {t.control?.auditLog || "Audit Log"} ({jobs.length} {t.control?.jobsExecuted || "jobs executed"})
            </button>
            {onOpenFullControlModal && (
              <>
                <span className="text-theme-muted/30">|</span>
                <button
                  onClick={onOpenFullControlModal}
                  className="text-amber-600 dark:text-amber-400 hover:text-amber-500 font-mono text-[11px] transition flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>完全控制模式</span>
                </button>
              </>
            )}
          </div>

          <button
            onClick={onOpenEmergencyStopModal}
            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-mono text-[11px] transition"
          >
            {t.control?.emergencyHaltAll || "Emergency Halt All"}
          </button>
        </section>
      ) : (
        <section className="pt-4 border-t border-theme-subtle flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("activity")}
              className="text-theme-muted hover:text-theme-secondary transition text-xs"
            >
              {t.control?.auditLog || "Activity & Audit"}
            </button>
            <span className="text-theme-muted/30">|</span>
            <button
              onClick={() => onNavigate("settings")}
              className="text-theme-muted hover:text-theme-secondary transition text-xs"
            >
              {t.settings?.title || "Settings"}
            </button>
          </div>

          <span className="text-theme-muted text-[11px]">
            Nexus v{serverStatus?.version || "1.2.0"} · Standard Mode
          </span>
        </section>
      )}
    </div>
  );
};

