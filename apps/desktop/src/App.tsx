import React, { useState, useEffect, useCallback, useRef } from "react";
import { OctagonAlert } from "lucide-react";
import { Sidebar, type NavPage } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { StartupScreen } from "./components/StartupScreen.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { DesktopPage } from "./pages/computer/DesktopPage.js";
import { FilesPage } from "./pages/computer/FilesPage.js";
import { ApplicationsPage } from "./pages/computer/ApplicationsPage.js";
import { BrowserPage } from "./pages/computer/BrowserPage.js";
import { ExecutionPage } from "./pages/execution/ExecutionPage.js";
import { ActionLedgerPage } from "./pages/execution/ActionLedgerPage.js";
import { RuntimePage } from "./pages/execution/RuntimePage.js";
import { McpServersPage } from "./pages/mcp/McpServersPage.js";
import { McpToolsPage } from "./pages/mcp/McpToolsPage.js";
import { ToolRegistryPage } from "./pages/mcp/ToolRegistryPage.js";
import { PromptPage } from "./pages/PromptPage.js";
import { JobsPage } from "./pages/JobsPage.js";
import { ConnectionsPage } from "./pages/ConnectionsPage.js";
import { TokensPage } from "./pages/TokensPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { ActivityPage } from "./pages/ActivityPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { GlobalRulesPage } from "./pages/GlobalRulesPage.js";
import { KnowledgeImportPage } from "./pages/KnowledgeImportPage.js";
import { StoragePage } from "./pages/StoragePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { AuthorizeProjectModal } from "./components/modals/AuthorizeProjectModal.js";
import { CreateTokenModal } from "./components/modals/CreateTokenModal.js";
import { EmergencyStopModal } from "./components/modals/EmergencyStopModal.js";
import { ResolveApprovalModal } from "./components/modals/ResolveApprovalModal.js";
import { OnboardingModal } from "./components/modals/OnboardingModal.js";
import { FullControlModal } from "./components/modals/FullControlModal.js";
import { AppErrorBoundary } from "./components/common/AppErrorBoundary.js";
import { bridge, type TunnelStatusDto } from "./api/bridge.js";
import { useTranslation } from "./i18n/useTranslation.js";
import type {
  ServerStatus,
  McpStatus,
  Project,
  Approval,
  Job,
  RunnerInfo,
  Token,
  AuditEvent,
  ApprovalRoutingMode,
  UserExperienceMode,
  FullControlStatusDto,
  AIConnectionDto,
  StartupDiagnostics,
} from "./types.js";
import { applyServerPollResult } from "./polling-state.js";

export const App: React.FC = () => {
  const { t, language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [currentPage, setCurrentPage] = useState<NavPage>("overview");

  // User Experience Mode (defaults to standard for all first-time and regular users)
  const [uxMode, setUxMode] = useState<UserExperienceMode>(() => {
    const saved = localStorage.getItem("nexus_ux_mode");
    if (saved === "standard" || saved === "advanced") {
      return saved;
    }
    return "standard";
  });

  const handleUxModeChange = (nextMode: UserExperienceMode) => {
    setUxMode(nextMode);
    localStorage.setItem("nexus_ux_mode", nextMode);
  };

  // First-time onboarding wizard modal
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem("nexus_onboarding_completed");
  });

  // State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatusDto | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<number | null>(null);
  const lastSuccessfulRefreshRef = useRef<number | null>(null);
  const refreshGeneration = useRef(0);

  // Modals
  const [isAuthorizeModalOpen, setIsAuthorizeModalOpen] = useState(false);
  const [isCreateTokenModalOpen, setIsCreateTokenModalOpen] = useState(false);
  const [isEmergencyStopModalOpen, setIsEmergencyStopModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [approvalRoutingMode, setApprovalRoutingMode] = useState<ApprovalRoutingMode>("chat");
  const [fullControlStatus, setFullControlStatus] = useState<FullControlStatusDto | null>(null);
  const [isFullControlModalOpen, setIsFullControlModalOpen] = useState(false);
  const [connections, setConnections] = useState<AIConnectionDto[]>([]);

  // Startup Readiness State
  const [isStartupComplete, setIsStartupComplete] = useState(false);
  const [startupTimeout, setStartupTimeout] = useState(false);
  const [startupDiag, setStartupDiag] = useState<StartupDiagnostics | null>(null);
  const [startupServerReady, setStartupServerReady] = useState(false);
  const [startupRunnerReady, setStartupRunnerReady] = useState(false);
  const [startupMcpReady, setStartupMcpReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Fetch all state
  const loadData = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const [
        statusRes,
        mcpRes,
        projRes,
        appRes,
        healthRes,
        tunnelRes,
        fcRes,
      ] = await Promise.allSettled([
        bridge.getStatus(),
        bridge.getMcpStatus(),
        bridge.listProjects(),
        bridge.listApprovals(),
        bridge.getDesktopHealth(),
        bridge.getTunnelStatus(),
        bridge.getFullControlStatus(),
      ]);

      if (generation !== refreshGeneration.current) return;

      if (healthRes.status === "fulfilled" && healthRes.value?.startup_error) {
        setStartupError(healthRes.value.startup_error);
      } else {
        setStartupError(null);
      }

      const updateStateIfChanged = (setter: any, newValue: any) => {
        setter((prev: any) => {
          if (prev === newValue) return prev;
          return JSON.stringify(prev) === JSON.stringify(newValue) ? prev : newValue;
        });
      };

      const nextServer = applyServerPollResult(
        { serverStatus: null, lastSuccessfulRefresh: lastSuccessfulRefreshRef.current },
        statusRes
      );
      if (lastSuccessfulRefreshRef.current === null && nextServer.lastSuccessfulRefresh) {
        lastSuccessfulRefreshRef.current = nextServer.lastSuccessfulRefresh;
        setLastSuccessfulRefresh(nextServer.lastSuccessfulRefresh);
      }
      updateStateIfChanged(setServerStatus, nextServer.serverStatus);
      if (mcpRes.status === "fulfilled") updateStateIfChanged(setMcpStatus, mcpRes.value);
      else updateStateIfChanged(setMcpStatus, null);
      if (projRes.status === "fulfilled") updateStateIfChanged(setProjects, projRes.value.projects || []);
      else updateStateIfChanged(setProjects, []);
      if (appRes.status === "fulfilled") updateStateIfChanged(setApprovals, appRes.value.approvals || []);
      else updateStateIfChanged(setApprovals, []);
      if (tunnelRes.status === "fulfilled") updateStateIfChanged(setTunnelStatus, tunnelRes.value);
      else updateStateIfChanged(setTunnelStatus, null);
      if (fcRes.status === "fulfilled") updateStateIfChanged(setFullControlStatus, fcRes.value);
      else updateStateIfChanged(setFullControlStatus, null);
    } catch {
      if (generation === refreshGeneration.current) {
        const updateStateIfChanged = (setter: any, newValue: any) => {
          setter((prev: any) => JSON.stringify(prev) === JSON.stringify(newValue) ? prev : newValue);
        };
        updateStateIfChanged(setServerStatus, null);
        updateStateIfChanged(setMcpStatus, null);
        updateStateIfChanged(setTunnelStatus, null);
        updateStateIfChanged(setProjects, []);
        updateStateIfChanged(setApprovals, []);
        updateStateIfChanged(setFullControlStatus, null);
      }
    }
  }, []);

  // Page-specific on-demand data loading
  useEffect(() => {
    if (!isStartupComplete) return;

    if (currentPage === "tokens") {
      bridge.listTokens().then((res) => setTokens(res.tokens || [])).catch(() => {});
    } else if (currentPage === "activity") {
      bridge.listAudit().then((res) => setAuditEvents(res.events || [])).catch(() => {});
    } else if (currentPage === "connections") {
      bridge.listAiConnections().then((res) => setConnections(res.connections || [])).catch(() => {});
      bridge.listRunners().then((res: any) => {
        const list = Array.isArray(res) ? res : Array.isArray(res?.runners) ? res.runners : [];
        setRunners(list);
      }).catch(() => {});
    } else if (currentPage === "jobs") {
      bridge.listJobs().then((res) => setJobs(res.jobs || [])).catch(() => {});
    }
  }, [currentPage, isStartupComplete]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    if (currentPage === "tokens") {
      await bridge.listTokens().then((res) => setTokens(res.tokens || [])).catch(() => {});
    } else if (currentPage === "activity") {
      await bridge.listAudit().then((res) => setAuditEvents(res.events || [])).catch(() => {});
    } else if (currentPage === "connections") {
      await bridge.listAiConnections().then((res) => setConnections(res.connections || [])).catch(() => {});
      await bridge.listRunners().then((res: any) => {
        const list = Array.isArray(res) ? res : Array.isArray(res?.runners) ? res.runners : [];
        setRunners(list);
      }).catch(() => {});
    } else if (currentPage === "jobs") {
      await bridge.listJobs().then((res) => setJobs(res.jobs || [])).catch(() => {});
    }
    const now = Date.now();
    lastSuccessfulRefreshRef.current = now;
    setLastSuccessfulRefresh(now);
    setIsRefreshing(false);
  };

  // Initial startup & readiness polling
  useEffect(() => {
    if (isStartupComplete) return;

    let cancelled = false;
    const timeoutTimer = setTimeout(async () => {
      if (!isStartupComplete && !cancelled) {
        setStartupTimeout(true);
        const diag = await bridge.getStartupDiagnostics();
        if (diag && !cancelled) setStartupDiag(diag);
      }
    }, 30000);

    const poll = async () => {
      if (cancelled || isStartupComplete) return;
      try {
        const health = await bridge.getDesktopHealth();
        if (cancelled) return;
        if (health) {
          if (health.startup_error) {
            setStartupError(health.startup_error);
            setStartupTimeout(true);
            const diag = await bridge.getStartupDiagnostics();
            if (diag && !cancelled) setStartupDiag(diag);
            return;
          }
          if (health.server_running) {
            setStartupServerReady(true);
          }
          if (health.runner_running) {
            setStartupRunnerReady(true);
          }
          if (health.ready) {
            setStartupServerReady(true);
            setStartupRunnerReady(true);
            setStartupMcpReady(true);
            clearTimeout(timeoutTimer);
            await loadData();
            if (!cancelled) {
              setIsStartupComplete(true);
            }
            return;
          }
        } else {
          // Outside Tauri (e.g. browser dev mode)
          try {
            const status = await bridge.getStatus();
            if (status) {
              setStartupServerReady(true);
              setStartupRunnerReady(true);
              setStartupMcpReady(true);
              clearTimeout(timeoutTimer);
              await loadData();
              if (!cancelled) {
                setIsStartupComplete(true);
              }
              return;
            }
          } catch {
            // Server not up yet, keep polling
          }
        }
      } catch {
        // Keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutTimer);
      clearInterval(interval);
    };
  }, [isStartupComplete, retryNonce, loadData]);

  // Regular data polling after startup
  useEffect(() => {
    if (!isStartupComplete) return;
    const interval = setInterval(loadData, 6000);
    return () => {
      refreshGeneration.current++;
      clearInterval(interval);
    };
  }, [isStartupComplete, loadData]);

  const handleRetryStartup = async () => {
    setStartupTimeout(false);
    setStartupError(null);
    setStartupServerReady(false);
    setStartupRunnerReady(false);
    setStartupMcpReady(false);
    setStartupDiag(null);
    await bridge.retryStartup();
    setRetryNonce((n) => n + 1);
  };

  // Toggle Global Pause
  const handleTogglePause = async () => {
    const nextPaused = !(mcpStatus?.paused ?? false);
    try {
      await bridge.setPauseState(nextPaused);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle pause:", err);
    }
  };

  const handleStopFullControl = async () => {
    try {
      await bridge.stopFullControl();
      const fc = await bridge.getFullControlStatus();
      setFullControlStatus(fc);
    } catch (err) {
      console.error("Failed to stop full control:", err);
    }
  };

  // Handle Approval Routing Mode Change
  const handleChangeApprovalRoutingMode = async (mode: ApprovalRoutingMode) => {
    try {
      await bridge.setApprovalRoutingMode(mode);
      setApprovalRoutingMode(mode);
      await loadData();
    } catch (err) {
      console.error("Failed to update approval routing mode:", err);
    }
  };

  const pageTitles: Record<NavPage, { title: string; subtitle: string; breadcrumb?: string }> = {
    overview: {
      title: isZh ? "工作台概览" : "Workspace Overview",
      subtitle: isZh ? "确定性本地执行桥接中心" : "Deterministic Execution Bridge",
      breadcrumb: isZh ? "工作区" : "WORKSPACE",
    },
    projects: {
      title: isZh ? "已授权项目" : "Authorized Projects",
      subtitle: isZh ? "项目工作区与本地目录范围" : "Project Roots & Local Directory Scope",
      breadcrumb: isZh ? "工作区" : "WORKSPACE",
    },
    desktop: {
      title: isZh ? "电脑桌面预览" : "Computer Desktop",
      subtitle: isZh ? "Windows 桌面主机与受控交互界面" : "Windows Host & Interactive Control Surface",
      breadcrumb: isZh ? "电脑控制" : "COMPUTER",
    },
    files: {
      title: isZh ? "文件浏览器" : "Files Explorer",
      subtitle: isZh ? "按需资源检索与工作区目录" : "On-Demand Resource Navigation",
      breadcrumb: isZh ? "电脑控制" : "COMPUTER",
    },
    applications: {
      title: isZh ? "托管应用与窗口" : "Managed Applications",
      subtitle: isZh ? "原生桌面应用与窗口自动化控制" : "Desktop Application & Window Automation",
      breadcrumb: isZh ? "电脑控制" : "COMPUTER",
    },
    browser: {
      title: isZh ? "浏览器自动化" : "Browser Automation",
      subtitle: isZh ? "Chromium CDP 确定性网页自动化工作台" : "Chromium CDP Automation Workspace",
      breadcrumb: isZh ? "电脑控制" : "COMPUTER",
    },
    execution: {
      title: isZh ? "执行管道" : "Execution Pipeline",
      subtitle: isZh ? "实时工具调用流程与确定性证据网格" : "Active Tool Execution & Verification Flow",
      breadcrumb: isZh ? "执行管理" : "EXECUTION",
    },
    ledger: {
      title: isZh ? "操作审计账本" : "Action Ledger",
      subtitle: isZh ? "不可变操作履历与 WAL 审计留痕" : "Immutable Action History & Audit Log",
      breadcrumb: isZh ? "执行管理" : "EXECUTION",
    },
    runtime: {
      title: isZh ? "运行时基础设施" : "Runtime Infrastructure",
      subtitle: isZh ? "Node.js 引擎、Runner 守护与 LSP 服务状态" : "Node.js Engine, Runner & LSP Status",
      breadcrumb: isZh ? "执行管理" : "EXECUTION",
    },
    "mcp-servers": {
      title: isZh ? "MCP 服务节点" : "MCP Servers",
      subtitle: isZh ? "活动协议端点与安全网关" : "Active Protocol Endpoints & Gateways",
      breadcrumb: isZh ? "MCP 协议" : "MCP",
    },
    "mcp-tools": {
      title: isZh ? "MCP 工具库" : "MCP Tools Registry",
      subtitle: isZh ? "332 个经权威验证的规范执行工具" : "332 Canonical Verified Execution Tools",
      breadcrumb: isZh ? "MCP 协议" : "MCP",
    },
    "mcp-registry": {
      title: isZh ? "注册表与能力矩阵" : "Capability Matrix",
      subtitle: isZh ? "Provider 执行绑定与证据交付契约" : "Provider Mappings & Evidence Contracts",
      breadcrumb: isZh ? "MCP 协议" : "MCP",
    },
    skills: {
      title: isZh ? "技能中心" : "Executable Skills",
      subtitle: isZh ? "确定性本地任务工作流与执行规范" : "Deterministic Workflows & Automation Tasks",
      breadcrumb: isZh ? "智能管理" : "INTELLIGENCE",
    },
    memory: {
      title: isZh ? "记忆库运行时" : "Memory Store",
      subtitle: isZh ? "服务端权威 SQLite/WAL 智能持久化事实源" : "SQLite Authoritative Fact & Knowledge Store",
      breadcrumb: isZh ? "智能管理" : "INTELLIGENCE",
    },
    knowledge: {
      title: isZh ? "知识文档库" : "Knowledge Documents",
      subtitle: isZh ? "自动化摄取、智能分类与去重机制" : "Indexed Documents & Deduplicated Chunks",
      breadcrumb: isZh ? "智能管理" : "INTELLIGENCE",
    },
    prompts: {
      title: isZh ? "提示词管理" : "Prompt Management",
      subtitle: isZh ? "系统级、项目级与执行指令提示词维护" : "System, Project & Execution Directives",
      breadcrumb: isZh ? "智能管理" : "INTELLIGENCE",
    },
    settings: {
      title: isZh ? "应用设置" : "Settings",
      subtitle: isZh ? "系统配置、安全策略与本地基础设施" : "Configuration, System Trust & Local Infrastructure",
      breadcrumb: isZh ? "设置" : "SETTINGS",
    },
    // Compatibility
    jobs: { title: isZh ? "后台任务" : "Jobs", subtitle: isZh ? "异步任务执行列表" : "Background Tasks", breadcrumb: isZh ? "执行管理" : "EXECUTION" },
    connections: { title: isZh ? "AI 连接中心" : "Connections", subtitle: isZh ? "ChatGPT & 隧道连接" : "External Endpoints", breadcrumb: isZh ? "MCP 协议" : "MCP" },
    tokens: { title: isZh ? "访问令牌" : "API Tokens", subtitle: isZh ? "安全认证与授权凭证" : "Access Control", breadcrumb: isZh ? "设置" : "SETTINGS" },
    approvals: { title: isZh ? "审批中心" : "Approvals", subtitle: isZh ? "待处理的敏感操作" : "Pending Authorizations", breadcrumb: isZh ? "执行管理" : "EXECUTION" },
    activity: { title: isZh ? "活动记录" : "Activity", subtitle: isZh ? "系统操作历史" : "Audit History", breadcrumb: isZh ? "执行管理" : "EXECUTION" },
    rules: { title: isZh ? "全局规则" : "Global Rules", subtitle: isZh ? "策略层级与安全边界" : "Policy Hierarchy", breadcrumb: isZh ? "智能管理" : "INTELLIGENCE" },
    storage: { title: isZh ? "本地存储" : "Storage", subtitle: isZh ? "磁盘与持久化管理" : "Local Disk Partitions", breadcrumb: isZh ? "设置" : "SETTINGS" },
  };

  const handleNavigate = (page: NavPage) => {
    if (page !== "projects") {
      setSelectedProjectId(null);
    }
    setCurrentPage(page);
  };

  if (!isStartupComplete) {
    return (
      <StartupScreen
        isTimeout={startupTimeout}
        startupError={startupError}
        serverReady={startupServerReady}
        runnerReady={startupRunnerReady}
        mcpReady={startupMcpReady}
        diagnostics={startupDiag}
        onRetry={handleRetryStartup}
        onOpenLogs={() => bridge.openLogsFolder()}
        onQuit={() => bridge.quitNexus()}
      />
    );
  }

  return (
    <div className="flex h-screen bg-theme-base text-theme-primary font-sans antialiased overflow-hidden select-none">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={handleNavigate}
        serverStatus={serverStatus}
        runnersCount={serverStatus?.runners_connected ?? 0}
        uxMode={uxMode}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={
            currentPage === "projects" && selectedProjectId
              ? (projects.find((p) => p.id === selectedProjectId)?.name || "Project Detail")
              : pageTitles[currentPage]?.title || "Nexus"
          }
          subtitle={
            currentPage === "projects" && selectedProjectId
              ? (projects.find((p) => p.id === selectedProjectId)?.root || pageTitles[currentPage]?.subtitle)
              : pageTitles[currentPage]?.subtitle
          }
          breadcrumb={
            currentPage === "projects" && selectedProjectId
              ? "Project Detail"
              : pageTitles[currentPage]?.breadcrumb
          }
          mcpStatus={mcpStatus}
          approvalRoutingMode={approvalRoutingMode}
          onChangeApprovalRoutingMode={handleChangeApprovalRoutingMode}
          onTogglePause={handleTogglePause}
          onTriggerEmergencyStop={() => setIsEmergencyStopModalOpen(true)}
          onRefreshAll={handleManualRefresh}
          isRefreshing={isRefreshing}
          serverAvailable={serverStatus !== null}
          lastSuccessfulRefresh={lastSuccessfulRefresh}
          uxMode={uxMode}
          fullControlStatus={fullControlStatus}
          onOpenFullControl={() => setIsFullControlModalOpen(true)}
          onStopFullControl={handleStopFullControl}
        />

        {startupError && (
          <div className="m-6 p-6 bg-red-500/10 border border-red-500/30 rounded-xl space-y-3">
            <div className="flex items-center gap-3 text-red-500">
              <OctagonAlert className="w-6 h-6 shrink-0" />
              <div>
                <div className="font-semibold text-sm">
                  Nexus Core Server failed to start / 核心服务启动失败
                </div>
                <div className="text-xs text-red-400 font-mono mt-1">
                  Reason: {startupError}
                </div>
              </div>
            </div>
            <div className="text-xs text-theme-muted space-y-1 pl-9">
              <div>&bull; Verify bundled runtime resources are intact.</div>
              <div>&bull; Ensure port 18080 is not occupied by another process.</div>
            </div>
            <div className="pl-9 pt-1">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                {isRefreshing ? t.common.refreshing : t.common.refresh}
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <AppErrorBoundary
            isZh={t.common ? true : false}
            componentName="MainRoute"
            onReset={loadData}
          >
            {currentPage === "overview" && (
              <OverviewPage
                serverStatus={serverStatus}
                mcpStatus={mcpStatus}
                tunnelStatus={tunnelStatus}
                projects={projects}
                approvals={approvals}
                onNavigate={handleNavigate}
                onSelectProject={(id) => {
                  setSelectedProjectId(id);
                  setCurrentPage("projects");
                }}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
              />
            )}

            {currentPage === "projects" && (
              <ProjectsPage
                projects={projects}
                onOpenAuthorizeModal={() => setIsAuthorizeModalOpen(true)}
                onRefresh={loadData}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                uxMode={uxMode}
              />
            )}

            {currentPage === "desktop" && <DesktopPage />}

            {currentPage === "files" && <FilesPage projects={projects} />}

            {currentPage === "applications" && <ApplicationsPage />}

            {currentPage === "browser" && <BrowserPage />}

            {currentPage === "execution" && <ExecutionPage />}

            {currentPage === "ledger" && <ActionLedgerPage />}

            {currentPage === "runtime" && <RuntimePage serverStatus={serverStatus} />}

            {currentPage === "mcp-servers" && (
              <McpServersPage mcpStatus={mcpStatus} tunnelStatus={tunnelStatus} />
            )}

            {currentPage === "mcp-tools" && <McpToolsPage />}

            {currentPage === "mcp-registry" && <ToolRegistryPage />}

            {currentPage === "skills" && (
              <SkillsPage
                uxMode={uxMode}
                projectId={selectedProjectId ?? undefined}
              />
            )}

            {currentPage === "memory" && <MemoryPage />}

            {currentPage === "knowledge" && <KnowledgeImportPage />}

            {currentPage === "prompts" && <PromptPage projects={projects} />}

            {currentPage === "settings" && (
              <SettingsPage
                tunnelStatus={tunnelStatus}
                serverStatus={serverStatus}
                mcpStatus={mcpStatus}
                onRefresh={loadData}
                uxMode={uxMode}
                onChangeUxMode={handleUxModeChange}
                onNavigate={handleNavigate}
              />
            )}

            {/* Backward Compatibility Aliases */}
            {currentPage === "jobs" && <JobsPage jobs={jobs} onRefresh={loadData} />}

            {currentPage === "connections" && (
              <ConnectionsPage
                serverStatus={serverStatus}
                runners={runners}
                onRefresh={loadData}
              />
            )}

            {currentPage === "tokens" && (
              <TokensPage
                tokens={tokens}
                onOpenCreateTokenModal={() => setIsCreateTokenModalOpen(true)}
                onRefresh={loadData}
              />
            )}

            {currentPage === "approvals" && (
              <ApprovalsPage
                approvals={approvals}
                onSelectApproval={(approval) => setSelectedApproval(approval)}
                onRefresh={loadData}
              />
            )}

            {currentPage === "activity" && (
              <ActivityPage
                events={auditEvents}
                approvals={approvals}
                onRefresh={loadData}
                initialFilter="all"
                onResolveApproval={async (id, action) => {
                  await bridge.resolveApproval(id, action);
                  await loadData();
                }}
                uxMode={uxMode}
              />
            )}

            {currentPage === "rules" && <GlobalRulesPage />}

            {currentPage === "storage" && <StoragePage />}
          </AppErrorBoundary>
        </main>
      </div>

      {/* Modals */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAuthorizeProject={() => setIsAuthorizeModalOpen(true)}
        onDownloadLaya={async () => {
          try {
            await bridge.downloadAndEnableModel();
          } catch (err) {
            console.error("Failed to start Laya download from onboarding:", err);
          }
        }}
      />

      <AuthorizeProjectModal
        isOpen={isAuthorizeModalOpen}
        onClose={() => setIsAuthorizeModalOpen(false)}
        onSuccess={loadData}
      />

      <CreateTokenModal
        isOpen={isCreateTokenModalOpen}
        onClose={() => setIsCreateTokenModalOpen(false)}
        onSuccess={loadData}
      />

      <EmergencyStopModal
        isOpen={isEmergencyStopModalOpen}
        onClose={() => setIsEmergencyStopModalOpen(false)}
        onSuccess={loadData}
      />

      <ResolveApprovalModal
        approval={selectedApproval}
        isOpen={Boolean(selectedApproval)}
        onClose={() => setSelectedApproval(null)}
        onSuccess={loadData}
      />

      <FullControlModal
        isOpen={isFullControlModalOpen}
        onClose={() => setIsFullControlModalOpen(false)}
        onStarted={async () => {
          await loadData();
        }}
        currentProjectId={selectedProjectId || (projects.length > 0 ? projects[0].id : undefined)}
        currentProjectName={
          (projects.find((p) => p.id === selectedProjectId) || projects[0])?.name
        }
        connections={connections}
      />
    </div>
  );
};
