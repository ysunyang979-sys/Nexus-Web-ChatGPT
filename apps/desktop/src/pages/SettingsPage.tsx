import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Check,
  RotateCcw,
  Globe,
  SunMoon,
  Server,
  Info,
  Radio,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Activity,
  Shield,
  User,
  Sliders,
  Zap,
  X,
  MessageSquare,
  Brain,
  Download,
  DownloadCloud,
  FolderOpen,
  Sparkles,
  Unlock,
  HardDrive,
} from "lucide-react";
import { bridge, type TunnelStatusDto } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { useTheme, type ThemeMode } from "../theme/ThemeContext.js";
import {
  mapRiskLabel,
  mapApprovalRecommendation,
  mapCategory,
  mapReasoningTag,
  formatLatency,
} from "../i18n/intelligence-map.js";
import nexusLogo from "../assets/nexus.png";
import { ChatGPTConnection } from "../components/connections/ChatGPTConnection.js";
import { GeminiConnection } from "../components/connections/GeminiConnection.js";
import { ConnectionCenterErrorBoundary } from "../components/common/AppErrorBoundary.js";
import { DesktopPage } from "./computer/DesktopPage.js";
import { FilesPage } from "./computer/FilesPage.js";
import { ApplicationsPage } from "./computer/ApplicationsPage.js";
import { BrowserPage } from "./computer/BrowserPage.js";
import { ExecutionPage } from "./execution/ExecutionPage.js";
import { ActionLedgerPage } from "./execution/ActionLedgerPage.js";
import { RuntimePage } from "./execution/RuntimePage.js";
import { McpServersPage } from "./mcp/McpServersPage.js";
import { McpToolsPage } from "./mcp/McpToolsPage.js";
import { ToolRegistryPage } from "./mcp/ToolRegistryPage.js";
import {
  Monitor,
  FolderTree,
  AppWindow,
  Terminal,
  FileText,
  Cpu,
  Wrench,
  Layers,
} from "lucide-react";
import type {
  Project,
  ProjectTrustPolicy,
  ProjectTrustLevel,
  FileActionPolicy,
  ProtectedFilesPolicy,
  ProjectCustomRules,
  ApprovalRoutingMode,
  IntelligenceStatusDto,
  DecisionAdvice,
  ModelStatusDto,
  ModelValidationResult,
  UserExperienceMode,
  ServerStatus,
  McpStatus,
} from "../types.js";

interface SettingsPageProps {
  tunnelStatus: TunnelStatusDto | null;
  serverStatus?: ServerStatus | null;
  mcpStatus?: McpStatus | null;
  onRefresh: () => void;
  uxMode?: UserExperienceMode;
  onChangeUxMode?: (mode: UserExperienceMode) => void;
  onNavigate?: (page: any) => void;
}

export type SettingsRoute =
  | { page: "general" }
  | { page: "appearance" }
  | { page: "intelligence" }
  | { page: "computer" }
  | { page: "execution" }
  | { page: "mcp" }
  | { page: "gemini" }
  | { page: "connections" }
  | { page: "security" }
  | { page: "advanced" }
  | { page: "about" };

export type SettingsTab =
  | "general"
  | "appearance"
  | "intelligence"
  | "computer"
  | "execution"
  | "mcp"
  | "gemini"
  | "connections"
  | "security"
  | "advanced"
  | "about";

export const SettingsPage: React.FC<SettingsPageProps> = ({
  tunnelStatus,
  serverStatus,
  mcpStatus,
  onRefresh,
  uxMode = "standard",
  onChangeUxMode,
  onNavigate: _onNavigate,
}) => {
  const { t, language, setLanguage } = useTranslation();
  const isZh = language === "zh-CN";
  const { themeMode, setThemeMode } = useTheme();
  const [route, setRoute] = useState<SettingsRoute>({ page: "general" });
  const activeTab: SettingsTab = route.page;

  const [computerSubPage, setComputerSubPage] = useState<"desktop" | "files" | "applications" | "browser">("desktop");
  const [executionSubPage, setExecutionSubPage] = useState<"pipeline" | "ledger" | "runtime">("pipeline");
  const [mcpSubPage, setMcpSubPage] = useState<"servers" | "tools" | "registry">("servers");

  // Server URL State
  const [serverUrl, setServerUrl] = useState(bridge.getBaseUrl());
  const [saved, setSaved] = useState(false);



  const defaultCustomRules: ProjectCustomRules = {
    files: {
      read: "allow",
      create: "allow",
      write: "allow",
      patch: "allow",
      delete: "ask",
      rename: "ask",
    },
    git: {
      status: "allow",
      diff: "allow",
      log: "allow",
      stage: "ask",
      unstage: "ask",
      createBranch: "ask",
      switchBranch: "ask",
      commit: "ask",
    },
    commands: {
      inspect: "allow",
      test: "allow",
      lint: "allow",
      typecheck: "allow",
      build: "ask",
      devServer: "ask",
      packageScript: "ask",
      packageInstall: "ask",
      gitRead: "allow",
      customSafe: "allow",
      controlledCommand: "ask",
    },
  };

  // Projects & Trust Policy State
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [trustPolicy, setTrustPolicy] = useState<ProjectTrustPolicy>({
    trustLevel: "standard",
    filePolicy: "ask",
    commandPolicy: "ask",
    protectedFilesPolicy: "always-ask",
  });
  const [operatorDisplayName, setOperatorDisplayName] = useState<string>("本机用户");
  const [operatorSaved, setOperatorSaved] = useState(false);
  const [showFullTrustModal, setShowFullTrustModal] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policySavedMsg, setPolicySavedMsg] = useState<string | null>(null);
  const [policyErrorMsg, setPolicyErrorMsg] = useState<string | null>(null);

  // Command Safety Layer State
  const [safetyLayerDisabled, setSafetyLayerDisabled] = useState(false);
  const [safetyLayerLoading, setSafetyLayerLoading] = useState(true);
  const [safetyLayerBusy, setSafetyLayerBusy] = useState(false);
  const [safetyLayerMsg, setSafetyLayerMsg] = useState<string | null>(null);

  const loadSafetyLayerStatus = async () => {
    try {
      setSafetyLayerLoading(true);
      const res = await bridge.getSafetyLayerStatus();
      setSafetyLayerDisabled(Boolean(res.disabled));
    } catch {
      // Quiet
    } finally {
      setSafetyLayerLoading(false);
    }
  };

  const handleToggleSafetyLayer = async () => {
    try {
      setSafetyLayerBusy(true);
      setSafetyLayerMsg(null);
      const newDisabled = !safetyLayerDisabled;
      const res = await bridge.setSafetyLayerStatus(newDisabled);
      setSafetyLayerDisabled(Boolean(res.disabled));
      setSafetyLayerMsg(
        res.disabled
          ? (isZh ? "已永久关闭安全层，Nexus 现已允许访问电脑所有文件和目录" : "Safety Layer permanently disabled. Nexus can access all files and directories.")
          : (isZh ? "已恢复安全层限制，Nexus 恢复为仅允许访问用户授权目录" : "Safety Layer restored. Nexus restricted to user-authorized project directories.")
      );
      setTimeout(() => setSafetyLayerMsg(null), 5000);
    } catch (err: any) {
      setSafetyLayerMsg(isZh ? `操作失败: ${err?.message || err}` : `Failed: ${err?.message || err}`);
    } finally {
      setSafetyLayerBusy(false);
    }
  };

  // Approval Routing Mode State
  const [approvalRoutingMode, setApprovalRoutingMode] = useState<ApprovalRoutingMode>("chat");
  const [routingModeBusy, setRoutingModeBusy] = useState(false);
  const [routingModeSavedMsg, setRoutingModeSavedMsg] = useState<string | null>(null);

  // Decision Intelligence State
  const [intelStatus, setIntelStatus] = useState<IntelligenceStatusDto | null>(null);
  const [intelProvider, setIntelProvider] = useState<"disabled" | "laya">("disabled");
  const [intelModelPath, setIntelModelPath] = useState("");
  const [intelPythonPath, setIntelPythonPath] = useState("");
  const [intelStartupTimeout, setIntelStartupTimeout] = useState(30000);
  const [intelInferenceTimeout, setIntelInferenceTimeout] = useState(5000);
  const [intelDeveloperOverride, setIntelDeveloperOverride] = useState(false);
  const [intelBusy, setIntelBusy] = useState(false);
  const [intelTesting, setIntelTesting] = useState(false);
  const [intelSuccessMsg, setIntelSuccessMsg] = useState<string | null>(null);
  const [intelErrorMsg, setIntelErrorMsg] = useState<string | null>(null);
  const [testAdvice, setTestAdvice] = useState<DecisionAdvice | null>(null);

  const applyIntelStatus = (res: IntelligenceStatusDto) => {
    setIntelStatus(res);
    setIntelProvider(res.provider);
    if (res.modelPath) setIntelModelPath(res.modelPath);
    if (res.pythonPath) setIntelPythonPath(res.pythonPath);
    if (res.startupTimeoutMs) setIntelStartupTimeout(res.startupTimeoutMs);
    if (res.inferenceTimeoutMs) setIntelInferenceTimeout(res.inferenceTimeoutMs);
    if (res.developerOverride !== undefined) setIntelDeveloperOverride(res.developerOverride);
  };

  // Model Download & Productization State
  const [modelStatus, setModelStatus] = useState<ModelStatusDto | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [showModelPrompt, setShowModelPrompt] = useState(false);
  const [downloadProxyMode, setDownloadProxyMode] = useState<"system" | "direct" | "custom">("system");
  const [downloadCustomProxyUrl, setDownloadCustomProxyUrl] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSourceDir, setImportSourceDir] = useState("");
  const [importCopyToManaged, setImportCopyToManaged] = useState(false);
  const [importValidation, setImportValidation] = useState<ModelValidationResult | null>(null);
  const [importValidating, setImportValidating] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loadModelStatus = async () => {
    try {
      const res = await bridge.getModelStatus();
      setModelStatus(res);
    } catch {
      // Quiet
    }
  };

  useEffect(() => {
    bridge.listProjects().then((res) => {
      setProjects(res.projects);
      if (res.projects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.projects[0].id);
      }
    }).catch(() => {});

    bridge.getOperatorDisplayName().then((res) => {
      if (res.displayName) {
        setOperatorDisplayName(res.displayName);
      }
    }).catch(() => {});

    bridge.getApprovalRoutingMode().then((res) => {
      if (res.mode) {
        setApprovalRoutingMode(res.mode);
      }
    }).catch(() => {});

    bridge.getIntelligenceStatus().then((res) => {
      if (res) {
        applyIntelStatus(res);
      }
    }).catch(() => {});

    loadModelStatus();
    loadSafetyLayerStatus();
    const interval = setInterval(loadModelStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    bridge.getProjectTrustPolicy(selectedProjectId).then((res) => {
      if (res.trustPolicy) {
        setTrustPolicy(res.trustPolicy);
      }
    }).catch(() => {
      setTrustPolicy({
        trustLevel: "standard",
        filePolicy: "ask",
        commandPolicy: "ask",
        protectedFilesPolicy: "always-ask",
      });
    });
  }, [selectedProjectId]);

  const handleSaveOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await bridge.setOperatorDisplayName(operatorDisplayName);
      setOperatorSaved(true);
      setTimeout(() => setOperatorSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleSaveApprovalRoutingMode = async (mode: ApprovalRoutingMode) => {
    setRoutingModeBusy(true);
    setRoutingModeSavedMsg(null);
    try {
      await bridge.setApprovalRoutingMode(mode);
      setApprovalRoutingMode(mode);
      setRoutingModeSavedMsg(t.settings.approvalRoutingSaved);
      setTimeout(() => setRoutingModeSavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setRoutingModeBusy(false);
    }
  };

  const handleStartDownload = async () => {
    setDownloadBusy(true);
    setIntelErrorMsg(null);
    try {
      const res = await bridge.startModelDownload({
        proxyMode: downloadProxyMode,
        customProxyUrl: downloadProxyMode === "custom" ? downloadCustomProxyUrl.trim() : undefined,
      });
      setModelStatus(res);
    } catch (err: any) {
      setIntelErrorMsg(err?.message || "Failed to start download");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleCancelDownload = async () => {
    setDownloadBusy(true);
    try {
      const res = await bridge.cancelModelDownload();
      setModelStatus(res);
    } catch (err: any) {
      setIntelErrorMsg(err?.message || "Failed to cancel download");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleBrowseImportFolder = async () => {
    try {
      const selected = await bridge.selectModelDirectory();
      if (selected) {
        setImportSourceDir(selected);
        setImportValidating(true);
        setImportError(null);
        try {
          const val = await bridge.validateModelPath(selected);
          setImportValidation(val);
        } catch (e: any) {
          setImportError(e.message || "Failed to validate directory");
        } finally {
          setImportValidating(false);
        }
      }
    } catch (err: any) {
      setImportError(err.message || String(err));
    }
  };

  const handleValidateImportDir = async (dir: string) => {
    setImportSourceDir(dir);
    if (!dir.trim()) {
      setImportValidation(null);
      return;
    }
    setImportValidating(true);
    setImportError(null);
    try {
      const val = await bridge.validateModelPath(dir.trim());
      setImportValidation(val);
    } catch (e: any) {
      setImportError(e.message || "Failed to validate directory");
    } finally {
      setImportValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importSourceDir.trim()) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await bridge.importExistingModel({
        sourceDir: importSourceDir.trim(),
        copyToManaged: importCopyToManaged,
      });
      setModelStatus(res);
      if (res.modelPath) {
        setIntelModelPath(res.modelPath);
      }
      setShowImportModal(false);
      setShowModelPrompt(false);
      const status = await bridge.getIntelligenceStatus();
      setIntelStatus(status);
      setIntelSuccessMsg(t.intelligence.savedSuccess);
      setTimeout(() => setIntelSuccessMsg(null), 3000);
    } catch (err: any) {
      setImportError(err.message || "Failed to import model");
    } finally {
      setImportBusy(false);
    }
  };

  const handleBrowseAdvancedModelPath = async () => {
    try {
      const selected = await bridge.selectModelDirectory();
      if (selected) {
        setIntelModelPath(selected);
        const val = await bridge.validateModelPath(selected);
        if (val.valid) {
          const res = await bridge.setModelPath(selected);
          setModelStatus(res);
          const status = await bridge.getIntelligenceStatus();
          applyIntelStatus(status);
        }
      }
    } catch (err: any) {
      console.warn("Folder picker error:", err);
    }
  };

  const handleBrowsePythonPath = async () => {
    try {
      const selected = await bridge.selectExecutableFile();
      if (selected) {
        setIntelPythonPath(selected);
      }
    } catch (err: any) {
      console.warn("Python executable picker error:", err);
    }
  };

  const handleToggleLayaDecisions = async () => {
    const nextEnabled = intelProvider !== "laya";
    if (nextEnabled) {
      // Verify if model is installed
      if (!modelStatus?.installed && modelStatus?.status !== "ready") {
        setShowModelPrompt(true);
        return;
      }
      setIntelBusy(true);
      setIntelErrorMsg(null);
      try {
        const res = await bridge.updateIntelligenceConfig({ provider: "laya" });
        applyIntelStatus(res);
        if (res.provider === "laya") {
          setIntelSuccessMsg(t.intelligence.savedSuccess);
          setTimeout(() => setIntelSuccessMsg(null), 3000);
        } else {
          setIntelProvider("disabled");
          setIntelErrorMsg(res.lastError || "Failed to start Laya worker");
        }
      } catch (err: any) {
        setIntelProvider("disabled");
        setIntelErrorMsg(err?.message || "Failed to enable Laya decisions");
      } finally {
        setIntelBusy(false);
      }
    } else {
      setIntelBusy(true);
      setIntelErrorMsg(null);
      try {
        const res = await bridge.updateIntelligenceConfig({ provider: "disabled" });
        applyIntelStatus(res);
        setIntelSuccessMsg(t.intelligence.savedSuccess);
        setTimeout(() => setIntelSuccessMsg(null), 3000);
      } catch (err: any) {
        setIntelErrorMsg(err?.message || "Failed to disable Laya decisions");
      } finally {
        setIntelBusy(false);
      }
    }
  };

  const handleDownloadAndEnable = async () => {
    setShowModelPrompt(false);
    setDownloadBusy(true);
    setIntelErrorMsg(null);
    try {
      const res = await bridge.downloadAndEnableModel({
        proxyMode: downloadProxyMode,
        customProxyUrl: downloadProxyMode === "custom" ? downloadCustomProxyUrl.trim() : undefined,
      });
      applyIntelStatus(res);
      await loadModelStatus();
      setIntelSuccessMsg(t.intelligence.savedSuccess);
      setTimeout(() => setIntelSuccessMsg(null), 3000);
    } catch (err: any) {
      setIntelErrorMsg(err?.message || "Failed to download and enable Laya model");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleSaveIntelligence = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIntelBusy(true);
    setIntelSuccessMsg(null);
    setIntelErrorMsg(null);
    try {
      const res = await bridge.updateIntelligenceConfig({
        provider: intelProvider,
        modelPath: intelModelPath.trim() || undefined,
        pythonPath: intelDeveloperOverride ? intelPythonPath.trim() || undefined : undefined,
        startupTimeoutMs: intelStartupTimeout,
        inferenceTimeoutMs: intelInferenceTimeout,
        developerOverride: intelDeveloperOverride,
      });
      applyIntelStatus(res);
      setIntelSuccessMsg(t.intelligence.savedSuccess);
      setTimeout(() => setIntelSuccessMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      setIntelErrorMsg(err?.message || String(err));
    } finally {
      setIntelBusy(false);
    }
  };

  const handleTestBenchmark = async () => {
    setIntelTesting(true);
    setTestAdvice(null);
    setIntelErrorMsg(null);
    try {
      const isZh = language.startsWith("zh");
      const advice = await bridge.evaluateDecision({
        operation: isZh ? "command.execute" : "file.read",
        command: isZh ? "rm -rf /" : undefined,
        pathType: isZh ? undefined : "relative",
        protectedResource: false,
        locale: language,
      });
      setTestAdvice(advice);
    } catch (err: any) {
      setIntelErrorMsg(err?.message || String(err));
    } finally {
      setIntelTesting(false);
    }
  };

  const handleSelectTrustLevel = (level: ProjectTrustLevel) => {
    if (level === "full-project-trust") {
      setShowFullTrustModal(true);
      return;
    }
    setTrustPolicy((prev) => ({
      ...prev,
      trustLevel: level,
      filePolicy: level === "session-trusted" ? "allow" : "ask",
      customRules:
        level === "custom"
          ? {
              ...prev.customRules,
              files: prev.customRules?.files || defaultCustomRules.files,
              git: prev.customRules?.git || defaultCustomRules.git,
            }
          : prev.customRules,
    }));
  };

  const confirmFullProjectTrust = () => {
    setTrustPolicy((prev) => ({
      ...prev,
      trustLevel: "full-project-trust",
      filePolicy: "allow",
    }));
    setShowFullTrustModal(false);
  };

  const handleSavePolicy = async () => {
    if (!selectedProjectId) return;
    setPolicyBusy(true);
    setPolicySavedMsg(null);
    setPolicyErrorMsg(null);
    try {
      const hasFileCustom = trustPolicy.trustLevel === "custom";
      const hasGitCustom = trustPolicy.trustLevel === "custom";
      const hasCommandCustom =
        trustPolicy.commandPolicy === "controlled" &&
        Boolean(trustPolicy.customRules?.commands);

      let customRulesToSave: ProjectCustomRules | undefined = undefined;
      if (hasFileCustom || hasGitCustom || hasCommandCustom) {
        customRulesToSave = {};
        if (hasFileCustom) {
          customRulesToSave.files = {
            ...defaultCustomRules.files,
            ...trustPolicy.customRules?.files,
          };
          customRulesToSave.git = {
            ...defaultCustomRules.git,
            ...trustPolicy.customRules?.git,
          };
        }
        if (hasCommandCustom) {
          customRulesToSave.commands = {
            ...defaultCustomRules.commands,
            ...trustPolicy.customRules?.commands,
          };
        }
      }

      const payload: ProjectTrustPolicy = {
        trustLevel: trustPolicy.trustLevel,
        filePolicy:
          trustPolicy.trustLevel === "full-project-trust" ||
          trustPolicy.trustLevel === "session-trusted"
            ? "allow"
            : "ask",
        commandPolicy: trustPolicy.commandPolicy ?? "ask",
        protectedFilesPolicy: trustPolicy.protectedFilesPolicy ?? "always-ask",
        customRules: customRulesToSave,
      };

      await bridge.setProjectTrustPolicy(selectedProjectId, payload);
      setPolicySavedMsg(t.trust.policySaved);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      console.error("Failed to save project trust policy:", err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes("Invalid parameters") ||
        errMsg.includes("INVALID_REQUEST") ||
        errMsg.includes("invalid-parameter")
      ) {
        setPolicyErrorMsg(t.trust.saveErrorInvalidCombination);
      } else {
        setPolicyErrorMsg(errMsg);
      }
      setTimeout(() => setPolicyErrorMsg(null), 6000);
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleResetAllDefaults = async () => {
    if (!confirm(t.trust.resetAllDefaultsConfirm)) return;
    setPolicyBusy(true);
    try {
      await bridge.resetTrustPoliciesToDefaults();
      if (selectedProjectId) {
        const res = await bridge.getProjectTrustPolicy(selectedProjectId);
        if (res.trustPolicy) setTrustPolicy(res.trustPolicy);
      }
      setPolicySavedMsg(t.trust.resetSuccess);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleClearAllSessions = async () => {
    if (!confirm(t.trust.clearAllSessionsConfirm)) return;
    setPolicyBusy(true);
    try {
      await bridge.clearAllSessionTrust();
      setPolicySavedMsg(t.trust.clearSuccess);
      setTimeout(() => setPolicySavedMsg(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setPolicyBusy(false);
    }
  };



  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    bridge.setBaseUrl(serverUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  const handleResetServer = () => {
    bridge.setBaseUrl("http://127.0.0.1:18080");
    setServerUrl("http://127.0.0.1:18080");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden select-none">
      {/* Main Dual Pane: Left Categories, Right Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Category Column */}
        <div className="w-56 border-r border-theme-subtle bg-theme-base/60 p-3 overflow-y-auto space-y-1 shrink-0">
          {[
            { id: "general", label: isZh ? "常规设置" : "General", icon: Sliders },
            { id: "appearance", label: isZh ? "界面外观" : "Appearance", icon: SunMoon },
            { id: "security", label: isZh ? "安全与信任策略" : "Security", icon: Shield },
            { id: "computer", label: isZh ? "桌面与电脑控制" : "Computer Control", icon: Monitor },
            { id: "execution", label: isZh ? "任务执行与账本" : "Execution & Ledger", icon: Terminal },
            { id: "mcp", label: isZh ? "MCP 协议生态" : "MCP Ecosystem", icon: Wrench },
            { id: "intelligence", label: isZh ? "智能决策模型" : "Intelligence", icon: Brain },
            { id: "connections", label: "MCP & Tokens", icon: Radio },
            { id: "gemini", label: "Gemini Spark", icon: Sparkles },
            { id: "advanced", label: isZh ? "高级选项与 Runner" : "Advanced & Runner", icon: Server },
            { id: "about", label: isZh ? "关于 Nexus" : "About", icon: Info },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = route.page === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setRoute({ page: cat.id as any })}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isSelected
                    ? "bg-theme-card text-theme-primary border border-theme-subtle shadow-sm font-semibold"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card/50 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-sky-500" : "text-theme-muted"}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Content Pane */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6">
        {/* Tab: Computer Control */}
        {activeTab === "computer" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-theme-card border border-theme-subtle w-fit shadow-xs">
              {[
                { id: "desktop", label: isZh ? "桌面预览" : "Desktop Preview", icon: Monitor },
                { id: "files", label: isZh ? "文件浏览器" : "Files Explorer", icon: FolderTree },
                { id: "applications", label: isZh ? "托管应用与窗口" : "Applications", icon: AppWindow },
                { id: "browser", label: isZh ? "浏览器自动化" : "Browser Automation", icon: Globe },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = computerSubPage === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setComputerSubPage(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      active
                        ? "bg-theme-base text-sky-500 shadow-xs font-semibold border border-theme-subtle"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 border border-theme-subtle rounded-xl bg-theme-base overflow-hidden">
              {computerSubPage === "desktop" && <DesktopPage />}
              {computerSubPage === "files" && <FilesPage projects={projects || []} />}
              {computerSubPage === "applications" && <ApplicationsPage />}
              {computerSubPage === "browser" && <BrowserPage />}
            </div>
          </div>
        )}

        {/* Tab: Execution & Ledger */}
        {activeTab === "execution" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-theme-card border border-theme-subtle w-fit shadow-xs">
              {[
                { id: "pipeline", label: isZh ? "执行管道" : "Pipeline", icon: Terminal },
                { id: "ledger", label: isZh ? "操作审计账本" : "Action Ledger", icon: FileText },
                { id: "runtime", label: isZh ? "运行时环境" : "Runtime Status", icon: Cpu },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = executionSubPage === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setExecutionSubPage(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      active
                        ? "bg-theme-base text-sky-500 shadow-xs font-semibold border border-theme-subtle"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 border border-theme-subtle rounded-xl bg-theme-base overflow-hidden">
              {executionSubPage === "pipeline" && <ExecutionPage />}
              {executionSubPage === "ledger" && <ActionLedgerPage />}
              {executionSubPage === "runtime" && <RuntimePage serverStatus={serverStatus || null} />}
            </div>
          </div>
        )}

        {/* Tab: MCP Ecosystem */}
        {activeTab === "mcp" && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-theme-card border border-theme-subtle w-fit shadow-xs">
              {[
                { id: "servers", label: isZh ? "服务节点" : "Servers", icon: Server },
                { id: "tools", label: isZh ? "工具库 (332)" : "Tools (332)", icon: Wrench },
                { id: "registry", label: isZh ? "注册表契约" : "Registry", icon: Layers },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = mcpSubPage === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMcpSubPage(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      active
                        ? "bg-theme-base text-sky-500 shadow-xs font-semibold border border-theme-subtle"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 border border-theme-subtle rounded-xl bg-theme-base overflow-hidden">
              {mcpSubPage === "servers" && (
                <McpServersPage mcpStatus={mcpStatus || null} tunnelStatus={tunnelStatus} />
              )}
              {mcpSubPage === "tools" && <McpToolsPage />}
              {mcpSubPage === "registry" && <ToolRegistryPage />}
            </div>
          </div>
        )}

        {/* Tab: Gemini Spark Connection */}
        {activeTab === "gemini" && (
          <ConnectionCenterErrorBoundary isZh={isZh}>
            <GeminiConnection
              tunnelStatus={tunnelStatus}
              onRefreshAll={onRefresh}
              uxMode={uxMode}
            />
          </ConnectionCenterErrorBoundary>
        )}

        {/* Tab: ChatGPT Connection */}
        {activeTab === "connections" && (
          <ConnectionCenterErrorBoundary isZh={isZh}>
            <ChatGPTConnection
              tunnelStatus={tunnelStatus}
              onRefreshAll={onRefresh}
              uxMode={uxMode}
            />
          </ConnectionCenterErrorBoundary>
        )}


      {/* Tab 2: Security & Trust Policies */}
      {activeTab === "security" && (
        <div className="max-w-4xl space-y-6">
          {/* Command Safety Layer Control Card */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                {safetyLayerDisabled ? (
                  <Unlock className="w-5 h-5 text-amber-500" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                )}
                <span>{isZh ? "Nexus 命令安全层 (Command Safety Layer)" : "Nexus Command Safety Layer"}</span>
              </div>
              {safetyLayerMsg && (
                <span className={`text-xs font-medium flex items-center gap-1 ${
                  safetyLayerDisabled ? "text-amber-400" : "text-emerald-400"
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {safetyLayerMsg}
                </span>
              )}
            </div>

            {/* Current Mode & Status Indicator */}
            <div className={`p-4 rounded-xl border transition ${
              safetyLayerDisabled
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${
                    safetyLayerDisabled
                      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse"
                      : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  }`} />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">
                      {isZh ? "当前模式及状态" : "Current Mode & Status"}
                    </div>
                    <div className="text-sm font-semibold text-theme-primary mt-0.5">
                      {safetyLayerDisabled ? (
                        <span className="text-amber-400 font-bold">
                          {isZh ? "Mode B: 关闭安全层（Universal Computer Use / 全桌面控制模式）" : "Mode B: Universal Computer Use / Full Desktop Control Mode"}
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold">
                          {isZh ? "Mode A: 安全层开启（受控工具保护模式）" : "Mode A: Safe Mode Active (Controlled Tools Protection)"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {safetyLayerDisabled ? (
                    <span className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {isZh ? "UNIVERSAL 模式" : "UNIVERSAL MODE"}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {isZh ? "SAFE 受控模式" : "SAFE MODE"}
                    </span>
                  )}
                </div>
              </div>

              {/* Mode Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3.5 pt-3 border-t border-theme-subtle text-xs">
                <div className="space-y-1">
                  <span className="text-theme-muted font-medium">
                    {isZh ? "桌面控制与 Computer Use：" : "Desktop Control & Computer Use:"}
                  </span>
                  <div className="font-medium">
                    {safetyLayerDisabled ? (
                      <span className="text-amber-400 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 shrink-0" />
                        {isZh ? "全面开启 Universal Computer Use（鼠标/键盘/窗口/截图/全盘控制）" : "Universal Computer Use Active (Full Mouse/Keyboard/Window/Screen Control)"}
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        {isZh ? "受控保护模式（仅允许受控工具，禁用通用桌面控制）" : "Safe Mode (Controlled Tools only, Universal Computer Use blocked)"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-theme-muted font-medium">
                    {isZh ? "命令审批弹窗策略：" : "Command Approval Policy:"}
                  </span>
                  <div className="font-medium text-purple-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    {isZh ? "免审批弹窗确认（两种模式下均不再弹出命令审批确认）" : "Zero Popups (No approval prompts in either mode)"}
                  </div>
                </div>
              </div>
            </div>

            {/* Mode Explanation & Toggle Button */}
            <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
              <div className="text-xs text-theme-muted max-w-xl leading-relaxed">
                {safetyLayerDisabled ? (
                  isZh
                    ? "Nexus 已进入 Universal Computer Use 模式，Agent 可直接操作 Windows 桌面（鼠标、键盘、快捷键、截图、窗口控制），并无阻碍访问全盘。再次点击下方按钮可恢复 Mode A 安全受控模式。"
                    : "Nexus is in Universal Computer Use mode. The Agent can directly control the Windows desktop (mouse, keyboard, shortcuts, screenshots, windows) and access all files. Click below to restore Mode A Safe Mode."
                ) : (
                  isZh
                    ? "当前为 Mode A 安全受控模式。受控工具（filesystem、git、shell 等）遵循边界限制。点击「关闭安全层」可进入 Mode B Universal Computer Use 模式，开放桌面全控能力。"
                    : "Currently in Mode A Safe Mode. Controlled tools follow project boundaries. Click 'Disable Safety Layer' to enter Mode B Universal Computer Use for full desktop control."
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleSafetyLayer}
                disabled={safetyLayerBusy || safetyLayerLoading}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm disabled:opacity-50 ${
                  safetyLayerDisabled
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-amber-600 hover:bg-amber-500 text-white"
                }`}
              >
                {safetyLayerBusy ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : safetyLayerDisabled ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>
                  {safetyLayerDisabled
                    ? (isZh ? "恢复安全层限制" : "Restore Safety Layer")
                    : (isZh ? "永久关闭安全层" : "Permanently Disable Safety Layer")}
                </span>
              </button>
            </div>
          </div>

          {/* Approval Routing Mode */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <span>{t.settings.approvalRoutingGroup}</span>
              </div>
              {routingModeSavedMsg && (
                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {routingModeSavedMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-theme-muted">{t.settings.approvalRoutingDesc}</p>

            <div className="grid grid-cols-1 gap-2.5">
              {[
                {
                  mode: "chat" as const,
                  label: t.settings.modeChat,
                  desc: t.settings.modeChatDesc,
                  recommended: true,
                },
                {
                  mode: "auto-trusted" as const,
                  label: t.settings.modeAutoTrusted,
                  desc: t.settings.modeAutoTrustedDesc,
                  recommended: false,
                },
                {
                  mode: "desktop" as const,
                  label: t.settings.modeDesktop,
                  desc: t.settings.modeDesktopDesc,
                  recommended: false,
                },
              ].map((item) => {
                const active = approvalRoutingMode === item.mode;
                return (
                  <div
                    key={item.mode}
                    onClick={() => !routingModeBusy && handleSaveApprovalRoutingMode(item.mode)}
                    className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                      active
                        ? "bg-indigo-500/10 border-indigo-500 shadow-sm"
                        : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                    }`}
                  >
                    <div className="mt-0.5">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          active
                            ? "border-indigo-500 bg-indigo-500"
                            : "border-theme-muted"
                        }`}
                      >
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-xs text-theme-primary flex items-center gap-1.5">
                        <span>{item.label}</span>
                        {item.recommended && (
                          <span className="badge badge-green text-[10px]">Default</span>
                        )}
                      </div>
                      <div className="text-[11px] text-theme-muted mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trust & Approval Policy */}
          <div className="p-6 bg-theme-card border border-theme-card rounded-xl space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                <Shield className="w-4 h-4 text-indigo-500" />
                <span>{t.trust.title}</span>
              </div>
              {policySavedMsg && (
                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {policySavedMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-theme-muted">{t.trust.subtitle}</p>

            {/* Target Project Dropdown */}
            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.trust.selectProject}
              </label>
              {projects.length === 0 ? (
                <div className="p-3 bg-theme-card-muted rounded-lg text-xs text-theme-muted border border-theme-subtle">
                  {t.projects.noProjectsDesc}
                </div>
              ) : (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.root || p.id})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedProjectId && (
              <div className="space-y-4 pt-2">
                {/* Trust Level Cards */}
                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-2">
                    {t.trust.currentTrustLevel}
                  </label>
                  <div className="grid grid-cols-1 gap-2.5">
                    {/* Standard */}
                    <div
                      onClick={() => handleSelectTrustLevel("standard")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "standard"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "standard"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "standard" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelStandard}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelStandardDesc}
                        </div>
                      </div>
                    </div>

                    {/* Session Trusted */}
                    <div
                      onClick={() => handleSelectTrustLevel("session-trusted")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "session-trusted"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "session-trusted"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "session-trusted" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelSession}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelSessionDesc}
                        </div>
                      </div>
                    </div>

                    {/* Full Project Trust */}
                    <div
                      onClick={() => handleSelectTrustLevel("full-project-trust")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "full-project-trust"
                          ? "bg-amber-500/10 border-amber-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "full-project-trust"
                              ? "border-amber-500 bg-amber-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "full-project-trust" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary flex items-center gap-1.5">
                          <span>{t.trust.levelFull}</span>
                          <span className="badge badge-amber text-[10px]">Persistent</span>
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelFullDesc}
                        </div>
                      </div>
                    </div>

                    {/* Custom */}
                    <div
                      onClick={() => handleSelectTrustLevel("custom")}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        trustPolicy.trustLevel === "custom"
                          ? "bg-indigo-500/10 border-indigo-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            trustPolicy.trustLevel === "custom"
                              ? "border-indigo-500 bg-indigo-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {trustPolicy.trustLevel === "custom" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.trust.levelCustom}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          {t.trust.levelCustomDesc}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Rules Matrix */}
                {trustPolicy.trustLevel === "custom" && (
                  <div className="p-3.5 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-3 text-xs">
                    <div className="font-semibold text-theme-primary flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{t.trust.levelCustom} Matrix</span>
                    </div>

                    {/* Files rules */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-theme-secondary">
                        {t.trust.filePolicyTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {(["read", "create", "write", "patch", "delete", "rename"] as const).map(
                          (action) => (
                            <div
                              key={action}
                              className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                            >
                              <span className="font-mono text-theme-primary">file.{action}</span>
                              <select
                                value={
                                  trustPolicy.customRules?.files?.[action] ??
                                  (action === "delete" || action === "rename"
                                    ? "ask"
                                    : "allow")
                                }
                                onChange={(e) => {
                                  const val = e.target.value as FileActionPolicy;
                                  setTrustPolicy((prev) => ({
                                    ...prev,
                                    customRules: {
                                      ...prev.customRules,
                                      files: {
                                        ...prev.customRules?.files,
                                        [action]: val,
                                      },
                                    },
                                  }));
                                }}
                                className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary"
                              >
                                <option value="allow">Allow</option>
                                <option value="ask">Ask</option>
                                <option value="deny">Deny</option>
                              </select>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Git write rules */}
                    <div className="space-y-1.5 pt-2 border-t border-theme-subtle">
                      <div className="text-[11px] font-medium text-theme-secondary">
                        {t.trust.gitPolicyTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {(
                          [
                            { key: "stage", label: t.trust.gitActionStage, def: "ask" },
                            { key: "unstage", label: t.trust.gitActionUnstage, def: "ask" },
                            { key: "createBranch", label: t.trust.gitActionCreateBranch, def: "ask" },
                            { key: "switchBranch", label: t.trust.gitActionSwitchBranch, def: "ask" },
                            { key: "commit", label: t.trust.gitActionCommit, def: "ask" },
                          ] as const
                        ).map(({ key, label, def }) => (
                          <div
                            key={key}
                            className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                          >
                            <span className="font-mono text-theme-primary text-[10px] truncate mr-1" title={label}>
                              git.{key}
                            </span>
                            <select
                              value={
                                trustPolicy.customRules?.git?.[
                                  key as keyof NonNullable<typeof defaultCustomRules.git>
                                ] ?? def
                              }
                              onChange={(e) => {
                                const val = e.target.value as FileActionPolicy;
                                setTrustPolicy((prev) => ({
                                  ...prev,
                                  customRules: {
                                    ...prev.customRules,
                                    git: {
                                      ...defaultCustomRules.git,
                                      ...prev.customRules?.git,
                                      [key]: val,
                                    },
                                  },
                                }));
                              }}
                              className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary shrink-0"
                            >
                              <option value="allow">{t.trust.commandAllow}</option>
                              <option value="ask">{t.trust.commandAsk}</option>
                              <option value="deny">{t.trust.commandDeny}</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Command rules */}
                    <div className="space-y-1.5 pt-2 border-t border-theme-subtle">
                      <div className="text-[11px] font-medium text-theme-secondary">
                        {t.trust.commandPolicyTitle}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {(
                          [
                            { key: "inspect", label: t.trust.commandCategoryInspect, def: "allow" },
                            { key: "test", label: t.trust.commandCategoryTest, def: "allow" },
                            { key: "lint", label: t.trust.commandCategoryLint, def: "allow" },
                            { key: "typecheck", label: t.trust.commandCategoryTypecheck, def: "allow" },
                            { key: "build", label: t.trust.commandCategoryBuild, def: "ask" },
                            { key: "devServer", label: t.trust.commandCategoryDevServer, def: "ask" },
                            { key: "packageScript", label: t.trust.commandCategoryPackageScript, def: "ask" },
                            { key: "packageInstall", label: t.trust.commandCategoryPackageInstall, def: "ask" },
                            { key: "gitRead", label: t.trust.commandCategoryGitRead, def: "allow" },
                            { key: "customSafe", label: t.trust.commandCategoryCustomSafe, def: "allow" },
                          ] as const
                        ).map(({ key, label, def }) => (
                          <div
                            key={key}
                            className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                          >
                            <span className="font-mono text-theme-primary text-[10px] truncate mr-1" title={label}>
                              {key}
                            </span>
                            <select
                              value={
                                trustPolicy.customRules?.commands?.[key as keyof typeof defaultCustomRules.commands] ??
                                def
                              }
                              onChange={(e) => {
                                const val = e.target.value as FileActionPolicy;
                                setTrustPolicy((prev) => ({
                                  ...prev,
                                  customRules: {
                                    ...prev.customRules,
                                    commands: {
                                      ...defaultCustomRules.commands,
                                      ...prev.customRules?.commands,
                                      [key]: val,
                                    },
                                  },
                                }));
                              }}
                              className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary shrink-0"
                            >
                              <option value="allow">{t.trust.commandAllow}</option>
                              <option value="ask">{t.trust.commandAsk}</option>
                              <option value="deny">{t.trust.commandDeny}</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Command Execution Policy Section */}
                <div className="pt-2 border-t border-theme-subtle space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-theme-secondary">
                        {t.trust.commandExecPolicyTitle}
                      </div>
                      <div className="text-[11px] text-theme-muted mt-0.5">
                        {t.trust.commandExecPolicyDesc}
                      </div>
                    </div>
                  </div>

                  {/* Absolute Security Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                      <AlertTriangle className="w-3 h-3" />
                      {t.trust.badgeRawShellDenied}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                      <AlertTriangle className="w-3 h-3" />
                      {t.trust.badgeUnknownCommandDenied}
                    </span>
                  </div>

                  {/* 4 Execution Modes */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        mode: "disabled",
                        label: t.trust.commandExecDisabled,
                        desc: t.trust.commandExecDisabledDesc,
                        active: trustPolicy.commandPolicy === "deny",
                        onClick: () =>
                          setTrustPolicy((prev) => ({
                            ...prev,
                            commandPolicy: "deny",
                          })),
                      },
                      {
                        mode: "safe-only",
                        label: t.trust.commandExecSafe,
                        desc: t.trust.commandExecSafeDesc,
                        active:
                          trustPolicy.commandPolicy === "controlled" &&
                          !trustPolicy.customRules?.commands,
                        onClick: () =>
                          setTrustPolicy((prev) => ({
                            ...prev,
                            commandPolicy: "controlled",
                            customRules: prev.customRules
                              ? { ...prev.customRules, commands: undefined }
                              : undefined,
                          })),
                      },
                      {
                        mode: "ask-before-execute",
                        label: t.trust.commandExecAsk,
                        desc: t.trust.commandExecAskDesc,
                        active: trustPolicy.commandPolicy === "ask",
                        onClick: () =>
                          setTrustPolicy((prev) => ({
                            ...prev,
                            commandPolicy: "ask",
                          })),
                      },
                      {
                        mode: "custom",
                        label: t.trust.commandExecCustom,
                        desc: t.trust.commandExecCustomDesc,
                        active:
                          trustPolicy.commandPolicy === "controlled" &&
                          Boolean(trustPolicy.customRules?.commands),
                        onClick: () =>
                          setTrustPolicy((prev) => ({
                            ...prev,
                            commandPolicy: "controlled",
                            customRules: {
                              ...prev.customRules,
                              commands:
                                prev.customRules?.commands ??
                                defaultCustomRules.commands,
                            },
                          })),
                      },
                    ].map((item) => (
                      <div
                        key={item.mode}
                        onClick={item.onClick}
                        className={`p-2.5 rounded-lg border cursor-pointer transition text-left ${
                          item.active
                            ? "bg-indigo-500/10 border-indigo-500 shadow-sm"
                            : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                        }`}
                      >
                        <div className="font-semibold text-xs text-theme-primary">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-theme-muted mt-0.5 line-clamp-2">
                          {item.desc}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Custom Command Accordion when custom mode is active */}
                  {trustPolicy.commandPolicy === "controlled" &&
                    Boolean(trustPolicy.customRules?.commands) && (
                      <div className="p-3 bg-theme-card-muted border border-theme-subtle rounded-lg space-y-2 mt-2">
                        <div className="text-[11px] font-semibold text-theme-primary">
                          {t.trust.commandExecCustomDesc}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {(
                            [
                              { key: "inspect", label: t.trust.commandCategoryInspect, def: "allow" },
                              { key: "test", label: t.trust.commandCategoryTest, def: "allow" },
                              { key: "lint", label: t.trust.commandCategoryLint, def: "allow" },
                              { key: "typecheck", label: t.trust.commandCategoryTypecheck, def: "allow" },
                              { key: "build", label: t.trust.commandCategoryBuild, def: "ask" },
                              { key: "devServer", label: t.trust.commandCategoryDevServer, def: "ask" },
                              { key: "packageScript", label: t.trust.commandCategoryPackageScript, def: "ask" },
                              { key: "packageInstall", label: t.trust.commandCategoryPackageInstall, def: "ask" },
                              { key: "gitRead", label: t.trust.commandCategoryGitRead, def: "allow" },
                              { key: "customSafe", label: t.trust.commandCategoryCustomSafe, def: "allow" },
                            ] as const
                          ).map(({ key, label, def }) => (
                            <div
                              key={key}
                              className="flex items-center justify-between p-1.5 bg-theme-card rounded border border-theme-subtle"
                            >
                              <span className="font-mono text-theme-primary text-[10px] truncate mr-1" title={label}>
                                {key}
                              </span>
                              <select
                                value={
                                  trustPolicy.customRules?.commands?.[
                                    key as keyof typeof defaultCustomRules.commands
                                  ] ?? def
                                }
                                onChange={(e) => {
                                  const val = e.target.value as FileActionPolicy;
                                  setTrustPolicy((prev) => ({
                                    ...prev,
                                    customRules: {
                                      ...prev.customRules,
                                      commands: {
                                        ...defaultCustomRules.commands,
                                        ...prev.customRules?.commands,
                                        [key]: val,
                                      },
                                    },
                                  }));
                                }}
                                className="bg-theme-input border border-theme-input rounded px-1.5 py-0.5 text-[10px] text-theme-primary shrink-0"
                              >
                                <option value="allow">{t.trust.commandAllow}</option>
                                <option value="ask">{t.trust.commandAsk}</option>
                                <option value="deny">{t.trust.commandDeny}</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                {/* Protected Files Policy Selector */}
                <div className="pt-2">
                  <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                    {t.trust.protectedFilesTitle}
                  </label>
                  <p className="text-[11px] text-theme-muted mb-2">
                    {t.trust.protectedFilesDesc}
                  </p>
                  <select
                    value={trustPolicy.protectedFilesPolicy}
                    onChange={(e) =>
                      setTrustPolicy((prev) => ({
                        ...prev,
                        protectedFilesPolicy: e.target.value as ProtectedFilesPolicy,
                      }))
                    }
                    className="w-full bg-theme-input border border-theme-input rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-indigo-500"
                  >
                    <option value="always-ask">{t.trust.protectedAlwaysAsk}</option>
                    <option value="deny">{t.trust.protectedDeny}</option>
                    <option value="follow-policy">{t.trust.protectedFollowPolicy}</option>
                  </select>
                </div>

                {/* Save Policy Button & Status */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={policyBusy}
                      onClick={handleSavePolicy}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t.common.save}</span>
                    </button>
                  </div>
                  {policySavedMsg && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-500 text-xs font-medium flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{policySavedMsg}</span>
                    </div>
                  )}
                  {policyErrorMsg && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{policyErrorMsg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Global Trust Controls */}
            <div className="pt-4 border-t border-theme-subtle flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={policyBusy}
                onClick={handleResetAllDefaults}
                className="flex items-center gap-1 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.trust.resetAllDefaultsBtn}</span>
              </button>

              <button
                type="button"
                disabled={policyBusy}
                onClick={handleClearAllSessions}
                className="flex items-center gap-1 px-3 py-1.5 bg-theme-card-muted hover:bg-theme-card-hover text-amber-500 rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t.trust.clearAllSessionsBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Decision Intelligence (Laya Multilingual Productization) */}
      {activeTab === "intelligence" && (
        <div className="max-w-4xl space-y-6">
          {/* Main Laya Product Card */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
                <Brain className="w-4 h-4 text-purple-400" />
                <span>{t.intelligence.layaCardTitle || "Laya 决策模型"}</span>
              </div>
              <span
                className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                  modelStatus?.status === "ready"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : modelStatus?.status === "downloading"
                    ? "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse"
                    : modelStatus?.status === "verifying"
                    ? "bg-purple-500/15 text-purple-400 border-purple-500/30 animate-pulse"
                    : modelStatus?.status === "error"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                }`}
              >
                {modelStatus?.status === "ready"
                  ? (t.intelligence.modelReady || "Ready")
                  : modelStatus?.status === "downloading"
                  ? (t.intelligence.modelDownloading || "Downloading")
                  : modelStatus?.status === "verifying"
                  ? (t.intelligence.modelVerifying || "Verifying")
                  : modelStatus?.status === "error"
                  ? (t.intelligence.modelError || "Error")
                  : (t.intelligence.modelNotInstalled || "Not installed")}
              </span>
            </div>

            <p className="text-xs text-theme-muted">
              {t.intelligence.layaCardSubtitle || "基于本地语言模型对敏感操作提供实时风险评估与审批建议。"}
            </p>

            {intelSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{intelSuccessMsg}</span>
              </div>
            )}

            {intelErrorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{intelErrorMsg}</span>
              </div>
            )}

            {/* Model Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs space-y-0.5">
                <div className="text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                  {t.intelligence.modelNameLabel || "Model Repository"}
                </div>
                <div className="font-mono text-theme-primary font-medium truncate">
                  convaiinnovations/laya-multilingual
                </div>
              </div>
              <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs space-y-0.5">
                <div className="text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                  {t.intelligence.executionLabel || "Execution"}
                </div>
                <div className="font-mono text-emerald-500 dark:text-emerald-400 font-medium">
                  {t.intelligence.executionLocal || "Local · Private"}
                </div>
              </div>
              <div className="p-3 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs space-y-0.5">
                <div className="text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                  {t.intelligence.modelStatusLabel || "Status"}
                </div>
                <div className="font-mono text-theme-secondary font-medium">
                  {modelStatus?.installed || modelStatus?.status === "ready" ? "Installed" : "Needs Download"}
                </div>
              </div>
            </div>

            {/* Model Downloader & Progress Section */}
            <div className="p-4 bg-theme-card-muted rounded-xl border border-theme-subtle space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                    <span>Laya Multilingual Model Files</span>
                  </div>
                  <div className="text-[11px] text-theme-muted">
                    {modelStatus?.modelPath ? modelStatus.modelPath : "%LOCALAPPDATA%\\LocalBridge\\models\\laya-multilingual"}
                  </div>
                </div>

                {/* Download / Import Actions */}
                {modelStatus?.status === "downloading" ? (
                  <button
                    type="button"
                    onClick={handleCancelDownload}
                    disabled={downloadBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition disabled:opacity-50"
                  >
                    {t.intelligence.cancelDownload || "Cancel Download"}
                  </button>
                ) : modelStatus?.installed || modelStatus?.status === "ready" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400 font-mono font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.intelligence.modelReady || "Ready"}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStartDownload}
                      disabled={downloadBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm disabled:opacity-50"
                    >
                      {downloadBusy ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <DownloadCloud className="w-3.5 h-3.5" />
                      )}
                      <span>{t.intelligence.downloadModelBtn || "Download Model"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowImportModal(true);
                        setImportSourceDir("");
                        setImportValidation(null);
                        setImportError(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-sm"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t.intelligence.importExistingModelBtn || "Import Existing Model"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Proxy Settings Selector */}
              <div className="flex items-center gap-2 text-xs pt-1 flex-wrap">
                <span className="text-theme-muted font-medium">{t.intelligence.proxyLabel}:</span>
                <div className="inline-flex rounded-lg p-0.5 bg-theme-input border border-theme-subtle">
                  <button
                    type="button"
                    onClick={() => setDownloadProxyMode("system")}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                      downloadProxyMode === "system"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    {t.intelligence.proxySystem}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownloadProxyMode("direct")}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                      downloadProxyMode === "direct"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    {t.intelligence.proxyDirect}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownloadProxyMode("custom")}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                      downloadProxyMode === "custom"
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-theme-muted hover:text-theme-primary"
                    }`}
                  >
                    {t.intelligence.proxyCustom}
                  </button>
                </div>
                {downloadProxyMode === "custom" && (
                  <input
                    type="text"
                    value={downloadCustomProxyUrl}
                    onChange={(e) => setDownloadCustomProxyUrl(e.target.value)}
                    placeholder="http://127.0.0.1:10808"
                    className="px-2.5 py-1 rounded-lg bg-theme-input border border-theme-input text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500 w-48"
                  />
                )}
              </div>

              {/* Progress Bar (Visible while downloading) */}
              {modelStatus?.status === "downloading" && modelStatus.progress && (
                <div className="space-y-2 pt-2 border-t border-theme-subtle">
                  <div className="w-full bg-theme-input rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-purple-500 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, modelStatus.progress.percent))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-theme-muted">
                    <span>
                      {Math.round(modelStatus.progress.percent)}% &bull;{" "}
                      {((modelStatus.progress.downloadedBytes || 0) / 1024 / 1024).toFixed(1)} MB /{" "}
                      {((modelStatus.progress.totalBytes || 0) / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <span>
                      {((modelStatus.progress.speedBytesPerSec || 0) / 1024 / 1024).toFixed(2)} MB/s &bull;{" "}
                      {modelStatus.progress.currentFile}
                    </span>
                  </div>
                </div>
              )}

              {/* Verifying indicator */}
              {modelStatus?.status === "verifying" && (
                <div className="flex items-center gap-2 pt-2 text-xs text-purple-400 font-mono">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t.intelligence.verifyingModel || "Verifying model file integrity..."}</span>
                </div>
              )}
            </div>

            {/* Independent Laya Decisions Toggle Switch */}
            <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-theme-primary">
                  {t.intelligence.layaDecisionsToggle || "启用 Laya 建议 (Enable Laya Decisions)"}
                </div>
                <div className="text-[11px] text-theme-muted leading-relaxed">
                  {t.intelligence.layaDecisionsToggleDesc || "在审批卡片和活动日志中显示 Laya 的智能风险建议与置信度。"}
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleLayaDecisions}
                disabled={intelBusy}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  intelProvider === "laya" ? "bg-purple-600" : "bg-theme-card-muted border-theme-subtle"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    intelProvider === "laya" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Uninstalled Prompt Banner */}
            {showModelPrompt && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-theme-primary">
                      {t.intelligence.modelRequiredPrompt || "Laya Multilingual is required to enable decision intelligence."}
                    </div>
                    <div className="text-[11px] text-theme-muted">
                      Download or import the model to provide local risk assessment.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadAndEnable}
                    disabled={downloadBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t.intelligence.downloadAndEnableBtn || "Download & Enable"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(true);
                      setImportSourceDir("");
                      setImportValidation(null);
                      setImportError(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition shadow-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                    <span>{t.intelligence.importExistingModelBtn || "Import Existing Model"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModelPrompt(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-theme-muted hover:text-theme-primary transition"
                  >
                    {t.common?.cancel || "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {/* Advisory Authority Disclaimer Callout */}
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="text-amber-500 font-medium">{t.intelligence.advisoryNotice || "Advisory Notice"}: </strong>
                <span className="text-theme-secondary leading-relaxed">
                  {t.intelligence.layaAdvisoryDisclaimer || "Use the local Laya model to provide risk and approval advice. Laya is advisory only and cannot override Nexus security policies."}
                </span>
              </div>
            </div>

            {/* Benchmark Section (Available for both Standard & Advanced Mode) */}
            <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary">
                    {t.intelligence.testInference}
                  </div>
                  <div className="text-[11px] text-theme-muted">
                    {language.startsWith("zh")
                      ? "向本地 Laya 模型发送真实操作评估请求，验证端到端推理管线与延迟。"
                      : "Send a live operation request to the local Laya model to verify end-to-end inference and latency."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestBenchmark}
                  disabled={intelTesting}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {intelTesting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>{intelTesting ? t.intelligence.testing : t.intelligence.testInference}</span>
                </button>
              </div>

              {/* Benchmark Result Card */}
              {testAdvice && (() => {
                const isPass =
                  testAdvice.providerUsed === "laya" &&
                  testAdvice.workerReady === true &&
                  testAdvice.modelLoaded === true &&
                  testAdvice.inferenceExecuted === true &&
                  testAdvice.fallbackUsed === false;

                const testRisk = typeof testAdvice.risk === "object" ? testAdvice.risk?.label : (testAdvice as any).risk;
                const testConf = typeof testAdvice.risk === "object" ? testAdvice.risk?.confidence : (testAdvice as any).confidence;
                const testConfPercent = Math.round(Number(testConf ?? 0.85) * 100);
                const testRec = (testAdvice as any).recommendation || testAdvice.approval?.recommended;
                const testCat = testAdvice.category || "general";
                const testRationale =
                  testAdvice.reasoningTags && testAdvice.reasoningTags.length > 0
                    ? testAdvice.reasoningTags.map((tag) => mapReasoningTag(tag, language)).join(", ")
                    : null;

                if (isPass) {
                  return (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3 pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>{t.intelligence.benchmarkPass}</span>
                        </span>
                        <span className="font-mono text-[11px] text-emerald-300">
                          {formatLatency(testAdvice.latencyMs, true)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                        <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                          <div className="text-[10px] text-theme-muted">{t.intelligence.riskEvaluation}</div>
                          <div className="text-rose-400 font-bold mt-0.5">{mapRiskLabel(testRisk, language)}</div>
                        </div>
                        <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                          <div className="text-[10px] text-theme-muted">{t.intelligence.recommendedAction}</div>
                          <div className="text-theme-secondary font-bold mt-0.5">
                            {mapApprovalRecommendation(testRec, language)}
                          </div>
                        </div>
                        <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                          <div className="text-[10px] text-theme-muted">{t.intelligence.confidenceLabel}</div>
                          <div className="text-emerald-400 font-bold mt-0.5">
                            {testConfPercent}%
                          </div>
                        </div>
                        <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                          <div className="text-[10px] text-theme-muted">{t.intelligence.categoryLabel}</div>
                          <div className="text-theme-secondary mt-0.5 truncate">{mapCategory(testCat, language)}</div>
                        </div>
                      </div>
                      {testRationale && (
                        <div className="text-[11px] text-theme-secondary font-mono bg-theme-card p-2.5 rounded border border-theme-subtle">
                          <span className="text-theme-muted">{t.intelligence.rationale}: </span>
                          {testRationale}
                        </div>
                      )}
                    </div>
                  );
                }

                // Benchmark Not Executed or Fallback Used
                return (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>
                          {testAdvice.providerUsed === "disabled"
                            ? t.intelligence.testNotExecuted
                            : t.intelligence.testFailedFallback}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-amber-300">
                        {formatLatency(testAdvice.latencyMs, false)}
                      </span>
                    </div>
                    <div className="text-[11px] text-theme-secondary font-mono bg-theme-card p-2.5 rounded border border-theme-subtle space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-theme-muted">{t.intelligence.providerLabel}: </span>
                        <span className="text-theme-primary font-semibold">
                          {testAdvice.providerUsed === "disabled"
                            ? "DisabledDecisionProvider"
                            : "Fallback (Safe Heuristic)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-theme-muted">{t.intelligence.rationale}: </span>
                        <span>
                          {testRationale || (testAdvice.providerUsed === "disabled" ? mapReasoningTag("intelligence_disabled", language) : "—")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Recent Real MCP Inference Card */}
            <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-theme-primary flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isZh ? "最近一次真实 MCP 推理" : "Recent Real MCP Inference"}</span>
                  </div>
                  <div className="text-[11px] text-theme-muted">
                    {isZh
                      ? "实时记录 ChatGPT 通过 MCP 调用或系统触发的真实模型决策与风险评估。"
                      : "Telemetry of the latest model decision or risk assessment triggered via MCP or internal pipeline."}
                  </div>
                </div>
                {intelStatus?.recentInference && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {intelStatus.recentInference.source === "chatgpt" ? "ChatGPT MCP" : "Internal Pipeline"}
                  </span>
                )}
              </div>

              {intelStatus?.recentInference ? (
                <div className="p-3 bg-theme-card-muted/50 rounded-lg border border-theme-subtle space-y-2.5">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-theme-primary">
                        {intelStatus.recentInference.operation}
                      </span>
                      {intelStatus.recentInference.target && (
                        <span className="font-mono text-[11px] text-theme-muted truncate max-w-[200px]" title={intelStatus.recentInference.target}>
                          ({intelStatus.recentInference.target})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-theme-muted">
                        {new Date(intelStatus.recentInference.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-purple-400 font-semibold">
                        {intelStatus.recentInference.latencyMs} ms
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                      <div className="text-[10px] text-theme-muted">{isZh ? "风险级别" : "Risk Level"}</div>
                      <div className={`font-bold mt-0.5 ${
                        intelStatus.recentInference.risk === "low"
                          ? "text-emerald-400"
                          : intelStatus.recentInference.risk === "medium"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}>
                        {mapRiskLabel(intelStatus.recentInference.risk, language)}
                      </div>
                    </div>
                    <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                      <div className="text-[10px] text-theme-muted">{isZh ? "建议动作" : "Recommendation"}</div>
                      <div className="text-theme-secondary font-bold mt-0.5">
                        {mapApprovalRecommendation(intelStatus.recentInference.recommendation === "approve", language)}
                      </div>
                    </div>
                    <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                      <div className="text-[10px] text-theme-muted">{isZh ? "置信度" : "Confidence"}</div>
                      <div className="text-emerald-400 font-bold mt-0.5">
                        {Math.round(intelStatus.recentInference.confidence * 100)}%
                      </div>
                    </div>
                    <div className="p-2 bg-theme-card rounded border border-theme-subtle">
                      <div className="text-[10px] text-theme-muted">{isZh ? "推理执行" : "Execution"}</div>
                      <div className="text-theme-secondary mt-0.5 truncate text-[11px]">
                        {intelStatus.recentInference.inferenceExecuted
                          ? (isZh ? "PyTorch 真实推理" : "Real Neural")
                          : (intelStatus.recentInference.fallbackUsed ? (isZh ? "降级回退" : "Fallback") : "—")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-theme-muted pt-1">
                    <span>Provider: <strong className="text-theme-secondary">{intelStatus.recentInference.providerUsed}</strong></span>
                    <span>Status: <strong className={intelStatus.recentInference.fallbackUsed ? "text-amber-400" : "text-emerald-400"}>
                      {intelStatus.recentInference.fallbackUsed ? "Fallback" : "Verified Real Model"}
                    </strong></span>
                  </div>
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-mono text-theme-muted bg-theme-card-muted/30 rounded-lg border border-dashed border-theme-subtle">
                  {isZh ? "暂无 MCP 推理记录。当 ChatGPT 发起评估或执行高风险操作时将在此显示。" : "No MCP inference recorded yet. Will display when ChatGPT requests assessment or performs mutating operations."}
                </div>
              )}
            </div>

            {/* Advanced Developer Telemetry & Controls (Advanced Mode Only) */}
            {uxMode === "advanced" && (
              <div className="space-y-4 pt-4 border-t border-theme-subtle">
                <div className="text-xs font-semibold text-theme-primary uppercase tracking-wider font-mono">
                  {t.intelligence.advancedTelemetryTitle}
                </div>

                {/* Real Worker & Runtime Telemetry Cockpit */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.runtimeLabel}</div>
                    <div className="font-mono text-theme-primary font-semibold mt-0.5 truncate">
                      {intelStatus?.runtimeType === "developer-override"
                        ? t.intelligence.runtimeDevOverride
                        : t.intelligence.runtimeNexusManaged}
                    </div>
                  </div>

                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.workerLabel}</div>
                    <div className="font-mono font-semibold mt-0.5 truncate">
                      {intelStatus?.workerStatus === "running" ? (
                        <span className="text-emerald-400">{t.intelligence.workerRunning}</span>
                      ) : intelStatus?.workerStatus === "starting" ? (
                        <span className="text-purple-400">{t.intelligence.workerStarting}</span>
                      ) : intelStatus?.workerStatus === "error" ? (
                        <span className="text-rose-400">{t.intelligence.workerError}</span>
                      ) : (
                        <span className="text-theme-muted">{t.intelligence.workerStopped}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.modelLabel}</div>
                    <div className="font-mono font-semibold mt-0.5 truncate">
                      {intelStatus?.modelLoaded ? (
                        <span className="text-emerald-400">{t.intelligence.modelLoaded}</span>
                      ) : (
                        <span className="text-theme-muted">{t.intelligence.modelNotLoaded}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.providerLabel}</div>
                    <div className="font-mono text-theme-secondary font-semibold mt-0.5 truncate text-[11px]">
                      {intelStatus?.providerClass || (intelProvider === "laya" ? "LayaDecisionProvider" : "DisabledDecisionProvider")}
                    </div>
                  </div>

                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.inferenceLabel}</div>
                    <div className="font-mono font-semibold mt-0.5 truncate">
                      {intelStatus?.inferenceReady ? (
                        <span className="text-emerald-400">{t.intelligence.inferenceReady}</span>
                      ) : (
                        <span className="text-theme-muted">{t.intelligence.inferenceNotReady}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-theme-card-muted rounded-lg border border-theme-subtle text-xs">
                    <div className="text-[10px] text-theme-muted">{t.intelligence.recentWarmInference}</div>
                    <div className="font-mono text-emerald-400 font-semibold mt-0.5 truncate">
                      {intelStatus?.warmInferenceMs ? `${intelStatus.warmInferenceMs} ms` : t.intelligence.warmInferenceNotMeasured}
                    </div>
                  </div>
                </div>

                {/* Model Path Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-theme-secondary">
                    {t.intelligence.modelPath}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={intelModelPath}
                      onChange={(e) => setIntelModelPath(e.target.value)}
                      placeholder={t.intelligence.modelPathPlaceholder}
                      className="flex-1 px-3 py-2 rounded-lg bg-theme-input-bg border border-theme-input-border text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handleBrowseAdvancedModelPath}
                      className="px-3 py-2 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs text-theme-primary transition flex items-center gap-1.5 shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t.intelligence.browseBtn || "Browse..."}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-theme-muted">
                    {t.intelligence.customModelPathDesc}
                  </p>
                </div>

                {/* Developer Runtime Override Control */}
                <div className="p-3.5 bg-theme-card-muted/50 rounded-xl border border-theme-subtle space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-theme-primary">
                      <input
                        type="checkbox"
                        checked={intelDeveloperOverride}
                        onChange={(e) => setIntelDeveloperOverride(e.target.checked)}
                        className="rounded border-theme-subtle text-purple-600 focus:ring-purple-500"
                      />
                      <span>{t.intelligence.developerOverrideCheckbox}</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-theme-muted">
                    {t.intelligence.developerOverrideDesc}
                  </p>

                  {intelDeveloperOverride && (
                    <div className="space-y-1.5 pt-1 border-t border-theme-subtle">
                      <label className="text-xs font-medium text-theme-secondary">
                        {t.intelligence.pythonPath}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={intelPythonPath}
                          onChange={(e) => setIntelPythonPath(e.target.value)}
                          placeholder={t.intelligence.pythonPathPlaceholder}
                          className="flex-1 px-3 py-2 rounded-lg bg-theme-input-bg border border-theme-input-border text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          onClick={handleBrowsePythonPath}
                          className="px-3 py-2 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs text-theme-primary transition flex items-center gap-1.5 shrink-0"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                          <span>{t.intelligence.browseBtn}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-theme-muted">
                        {t.intelligence.pythonInterpreterHelp}
                      </p>
                    </div>
                  )}
                </div>

                {/* Timeouts Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-theme-secondary">
                      {t.intelligence.startupTimeoutLabel}
                    </label>
                    <input
                      type="number"
                      value={intelStartupTimeout}
                      onChange={(e) => setIntelStartupTimeout(Number(e.target.value) || 30000)}
                      min={5000}
                      max={120000}
                      step={1000}
                      className="w-full px-3 py-2 rounded-lg bg-theme-input-bg border border-theme-input-border text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-theme-secondary">
                      {t.intelligence.inferenceTimeoutLabel}
                    </label>
                    <input
                      type="number"
                      value={intelInferenceTimeout}
                      onChange={(e) => setIntelInferenceTimeout(Number(e.target.value) || 5000)}
                      min={500}
                      max={30000}
                      step={500}
                      className="w-full px-3 py-2 rounded-lg bg-theme-input-bg border border-theme-input-border text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Save and Apply Controls */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveIntelligence}
                    disabled={intelBusy}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {intelBusy ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{intelBusy ? t.intelligence.saving : t.intelligence.saveAndRestart}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Import Existing Model Modal */}
            {showImportModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-theme-card border border-theme-subtle rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-sky-400" />
                      <h3 className="font-semibold text-theme-primary text-sm">
                        {t.intelligence.importModalTitle}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="text-theme-muted hover:text-theme-primary transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-theme-muted">
                    {t.intelligence.importModalSubtitle}
                  </p>

                  {/* Folder path input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-theme-secondary">
                      {t.intelligence.modelPath}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={importSourceDir}
                        onChange={(e) => handleValidateImportDir(e.target.value)}
                        placeholder="E:\workspace\models\laya-multilingual"
                        className="flex-1 px-3 py-2 rounded-lg bg-theme-input border border-theme-input text-xs font-mono text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseImportFolder}
                        className="px-3 py-2 rounded-lg bg-theme-card-muted hover:bg-theme-card border border-theme-subtle text-xs text-theme-primary transition flex items-center gap-1.5 shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                        <span>{t.intelligence.browseBtn}</span>
                      </button>
                    </div>
                  </div>

                  {/* Live validation feedback */}
                  {importValidating && (
                    <div className="flex items-center gap-2 text-xs text-purple-400 font-mono">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating model files...</span>
                    </div>
                  )}

                  {importValidation && !importValidating && (
                    <div
                      className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                        importValidation.valid
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-red-500/10 border-red-500/30 text-red-400"
                      }`}
                    >
                      {importValidation.valid ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                      )}
                      <div className="space-y-0.5">
                        <div className="font-semibold">
                          {importValidation.valid
                            ? t.intelligence.modelValidSuccess
                            : t.intelligence.modelValidError}
                        </div>
                        {!importValidation.valid && importValidation.missingFiles?.length > 0 && (
                          <div className="text-[11px] text-red-300 font-mono">
                            Missing: {importValidation.missingFiles.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {importError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                      {importError}
                    </div>
                  )}

                  {/* Import Mode Radio Options */}
                  <div className="space-y-2 pt-1">
                    <div
                      onClick={() => setImportCopyToManaged(false)}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        !importCopyToManaged
                          ? "bg-purple-500/10 border-purple-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            !importCopyToManaged
                              ? "border-purple-500 bg-purple-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {!importCopyToManaged && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.intelligence.importOptionUseExisting}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          Points Nexus directly to this path. Zero file copy, instant ready.
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => setImportCopyToManaged(true)}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                        importCopyToManaged
                          ? "bg-purple-500/10 border-purple-500"
                          : "bg-theme-card-muted border-theme-subtle hover:border-theme-muted"
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            importCopyToManaged
                              ? "border-purple-500 bg-purple-500"
                              : "border-theme-muted"
                          }`}
                        >
                          {importCopyToManaged && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs text-theme-primary">
                          {t.intelligence.importOptionCopyToManaged}
                        </div>
                        <div className="text-[11px] text-theme-muted mt-0.5">
                          Fast local copy into managed model directory with zero network download.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-theme-subtle">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-theme-muted hover:text-theme-primary transition"
                    >
                      {t.common?.cancel || "Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={!importValidation?.valid || importBusy}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm disabled:opacity-50"
                    >
                      {importBusy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{t.intelligence.confirmImportBtn}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: General (Language & Experience Mode) */}
      {activeTab === "general" && (
        <div className="max-w-4xl space-y-6">
          {/* Experience: Standard vs Advanced Mode */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Sliders className="w-4 h-4 text-sky-500" />
              <span>{t.settings.experienceGroup || "使用体验 (Experience)"}</span>
            </div>
            <p className="text-xs text-theme-muted">
              {t.settings.experienceDesc || "选择适合您的界面复杂度模式。"}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Standard Mode Card */}
              <label
                onClick={() => onChangeUxMode?.("standard")}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-start gap-3.5 ${
                  uxMode === "standard"
                    ? "bg-sky-500/10 border-sky-500/40 text-theme-primary shadow-sm"
                    : "bg-theme-card-muted border-theme-subtle text-theme-secondary hover:border-theme-primary/30"
                }`}
              >
                <input
                  type="radio"
                  name="uxModeSelector"
                  checked={uxMode === "standard"}
                  onChange={() => onChangeUxMode?.("standard")}
                  className="mt-1 text-sky-500 focus:ring-sky-500"
                />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-theme-primary flex items-center gap-2">
                    <span>{t.settings.standardMode || "普通模式"}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                      Default
                    </span>
                  </div>
                  <div className="text-xs text-theme-muted leading-relaxed">
                    {t.settings.standardModeDesc || "简洁界面，隐藏大部分开发者级控制项"}
                  </div>
                </div>
              </label>

              {/* Advanced Mode Card */}
              <label
                onClick={() => onChangeUxMode?.("advanced")}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-start gap-3.5 ${
                  uxMode === "advanced"
                    ? "bg-purple-500/10 border-purple-500/40 text-theme-primary shadow-sm"
                    : "bg-theme-card-muted border-theme-subtle text-theme-secondary hover:border-theme-primary/30"
                }`}
              >
                <input
                  type="radio"
                  name="uxModeSelector"
                  checked={uxMode === "advanced"}
                  onChange={() => onChangeUxMode?.("advanced")}
                  className="mt-1 text-purple-500 focus:ring-purple-500"
                />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-theme-primary flex items-center gap-2">
                    <span>{t.settings.advancedMode || "高级模式"}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      Cockpit
                    </span>
                  </div>
                  <div className="text-xs text-theme-muted leading-relaxed">
                    {t.settings.advancedModeDesc || "显示运行时、工作树、代码智能和高级安全控制"}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* General: Language */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Globe className="w-4 h-4 text-sky-500" />
              <span>{t.settings.generalGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.languageLabel}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("zh-CN")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "zh-CN"
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : "bg-theme-input-bg border-theme-input-border text-theme-secondary hover:border-sky-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageZh}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">zh-CN</div>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage("en-US")}
                  className={`p-3 rounded-lg border text-xs font-medium transition text-left ${
                    language === "en-US"
                      ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                      : "bg-theme-input-bg border-theme-input-border text-theme-secondary hover:border-sky-500"
                  }`}
                >
                  <div className="font-semibold">{t.settings.languageEn}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">en-US</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Appearance */}
      {activeTab === "appearance" && (
        <div className="max-w-4xl space-y-6">
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <SunMoon className="w-4 h-4 text-sky-500" />
              <span>{t.settings.appearanceGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-2">
                {t.settings.themeLabel}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(["system", "light", "dark"] as ThemeMode[]).map((mode) => {
                  const label =
                    mode === "system"
                      ? t.settings.themeSystem
                      : mode === "light"
                        ? t.settings.themeLight
                        : t.settings.themeDark;
                  const active = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setThemeMode(mode)}
                      className={`p-3 rounded-lg border text-xs font-medium transition text-center ${
                        active
                          ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                          : "bg-theme-input-bg border-theme-input-border text-theme-secondary hover:border-sky-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Advanced & Control Plane */}
      {activeTab === "advanced" && (
        <div className="max-w-4xl space-y-6">
          {/* Server Connection */}
          <form
            onSubmit={handleSaveServer}
            className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Server className="w-4 h-4 text-sky-500" />
              <span>{t.settings.serverConnectionGroup}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.settings.serverUrlLabel}
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-theme-input-bg border border-theme-input-border rounded-lg px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:border-sky-500"
              />
              <p className="text-[11px] text-theme-muted mt-1">{t.settings.serverUrlHelp}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition shadow-sm"
              >
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{t.common.saved}</span>
                  </>
                ) : (
                  <span>{t.settings.saveChanges}</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetServer}
                className="flex items-center gap-1 px-3 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium border border-theme-subtle transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.settings.resetDefault}</span>
              </button>
            </div>
          </form>

          {/* Local Operator Settings */}
          <form
            onSubmit={handleSaveOperator}
            className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 shadow-sm"
          >
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <User className="w-4 h-4 text-sky-500" />
              <span>{t.trust.operatorSettingsTitle}</span>
            </div>
            <p className="text-xs text-theme-muted">{t.trust.operatorSettingsDesc}</p>

            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1.5">
                {t.trust.operatorDisplayNameLabel}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={operatorDisplayName}
                  onChange={(e) => setOperatorDisplayName(e.target.value)}
                  placeholder="本机用户"
                  className="flex-1 bg-theme-input-bg border border-theme-input-border rounded-lg px-3 py-2 text-xs font-medium text-theme-primary focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition shrink-0 shadow-sm"
                >
                  {operatorSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>{t.common.saved}</span>
                    </>
                  ) : (
                    <span>{t.common.save}</span>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-theme-muted mt-1">{t.trust.operatorDisplayNameHelp}</p>
            </div>
          </form>
        </div>
      )}

      {/* Tab 5: About Nexus */}
      {activeTab === "about" && (
        <div className="max-w-4xl space-y-6">
          {/* About Section */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <Info className="w-4 h-4 text-sky-500" />
              <span>{t.settings.aboutGroup}</span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <img
                src={nexusLogo}
                alt="Nexus"
                className="w-12 h-12 rounded-xl object-cover shadow-sm border border-theme-subtle"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/nexus.png";
                }}
              />
              <div className="space-y-0.5">
                <div className="font-bold text-base text-theme-primary">
                  {t.settings.appName || "Nexus"}
                </div>
                <div className="text-theme-secondary font-mono text-[11px]">
                  {isZh
                    ? "ChatGPT 本地 AI 控制平面 · 让 ChatGPT 安全访问并操作你明确授权的本地开发环境。"
                    : "Local AI Control Plane for ChatGPT · Securely connect ChatGPT to your authorized local environment."}
                </div>
                <div className="text-[10px] font-mono text-theme-muted">
                  87 MCP Tools &bull; Nexus Skills v1 &bull; Secure MCP Tunnel &bull; Full Control &bull; Laya Decision Intelligence &bull; Code Intelligence &bull; Persistent Runtime
                </div>
              </div>
            </div>
          </div>

          {/* Security Architecture Summary */}
          <div className="p-6 bg-theme-card border border-theme-subtle rounded-xl space-y-4 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-theme-primary text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{t.settings.securityTitle}</span>
            </div>

            <ul className="space-y-3 text-theme-secondary list-disc list-inside font-mono text-[11px]">
              <li>
                <strong className="text-theme-primary">{t.settings.loopbackGuarantee}:</strong>{" "}
                {t.settings.loopbackGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.sandboxGuarantee}:</strong>{" "}
                {t.settings.sandboxGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.approvalGuarantee}:</strong>{" "}
                {t.settings.approvalGuaranteeDesc}
              </li>
              <li>
                <strong className="text-theme-primary">{t.settings.killswitchGuarantee}:</strong>{" "}
                {t.settings.killswitchGuaranteeDesc}
              </li>
            </ul>
          </div>
        </div>
      )}
      </div>

      {/* Full Project Trust Confirmation Modal */}
      {showFullTrustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-amber-500/50 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-amber-500 font-bold text-base">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>{t.trust.fullTrustWarningTitle}</span>
              </div>
              <button
                onClick={() => setShowFullTrustModal(false)}
                className="text-amber-500 hover:text-amber-600 p-1 rounded-lg hover:bg-amber-500/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-xs text-theme-secondary whitespace-pre-line leading-relaxed">
                {t.trust.fullTrustWarningBody}
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowFullTrustModal(false)}
                  className="px-4 py-2 bg-theme-card-muted hover:bg-theme-card-hover text-theme-secondary rounded-lg text-xs font-medium transition"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={confirmFullProjectTrust}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t.trust.fullTrustConfirmBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
