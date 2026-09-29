import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Wrench,
  Workflow,
  Copy,
  Check,
  FolderOpen,
  RotateCw,
  Trash2,
  Tag,
  ArrowDown,
  ArrowLeft,
  Loader2,
  FileText,
  Code2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import type {
  SkillDefinition,
  SkillRawContentResult,
  UserExperienceMode,
} from "../../types.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { bridge } from "../../api/bridge.js";

export interface SkillDetailDrawerProps {
  skillId: string | null;
  projectId?: string;
  projectRoot?: string;
  onClose: () => void;
  onReload?: () => void;
  initialMode?: UserExperienceMode;
  collectionContext?: { id: string; name?: string };
  onBack?: () => void;
}

type TabType = "overview" | "workflow" | "tools" | "skillMd" | "rawConfig";

const WORKFLOW_STEP_TITLE_MAP: Record<string, { zh: string; en: string }> = {
  confirm_project: { zh: "确认项目与边界", en: "Confirm Project & Boundary" },
  reproduce_build_failure: { zh: "安全复现构建失败", en: "Reproduce Build Failure" },
  collect_error_diagnostics: { zh: "收集错误诊断信息", en: "Collect Error Diagnostics" },
  locate_root_cause: { zh: "定位异常代码根因", en: "Locate Root Cause" },
  formulate_patch_plan: { zh: "制定精准修复方案", en: "Formulate Patch Plan" },
  apply_code_patch: { zh: "应用代码修复补丁", en: "Apply Code Patch" },
  verify_build_fix: { zh: "回归验证构建结果", en: "Verify Build Fix" },
  inspect_architecture: { zh: "探查顶层项目架构", en: "Inspect Architecture" },
  map_project_structure: { zh: "梳理目录模块结构", en: "Map Project Structure" },
  analyze_dependencies: { zh: "分析工程依赖配置", en: "Analyze Dependencies" },
  identify_entrypoints: { zh: "识别应用核心入口", en: "Identify Core Entrypoints" },
  summarize_findings: { zh: "总结架构探查发现", en: "Summarize Findings" },
  run_test_suite: { zh: "运行受控测试套件", en: "Run Test Suite" },
  collect_test_failures: { zh: "提取失败测试堆栈", en: "Collect Test Failures" },
  diagnose_test_errors: { zh: "诊断断言失败源头", en: "Diagnose Test Errors" },
  fix_test_code: { zh: "修复业务与测试代码", en: "Fix Code & Tests" },
  verify_tests_pass: { zh: "确认全部测试通过", en: "Verify Tests Pass" },
  review_changes: { zh: "比对代码变更差异", en: "Review Code Changes" },
  check_git_diff: { zh: "核验 Git 工作区变更", en: "Check Git Diff" },
  audit_security_impact: { zh: "审计安全与权限影响", en: "Audit Security Impact" },
};

const WORKFLOW_STEP_DESC_MAP: Record<string, { zh: string; en: string }> = {
  confirm_project: {
    zh: "确认当前授权项目以及允许的操作范围与执行边界。",
    en: "Confirm active authorized project and allowable execution boundary.",
  },
  reproduce_build_failure: {
    zh: "使用构建任务安全复现构建问题并捕获输出。",
    en: "Safely reproduce the build issue and capture compiler outputs.",
  },
  collect_error_diagnostics: {
    zh: "收集 LSP 语法错误、编译日志和警告诊断信息。",
    en: "Collect LSP diagnostics, compilation logs, and compiler warnings.",
  },
  locate_root_cause: {
    zh: "深入代码定位导致构建或运行异常的根本原因。",
    en: "Pinpoint the root cause of the build or runtime failure in code.",
  },
  formulate_patch_plan: {
    zh: "制定精准最小化的代码修改方案，避免非必要破坏。",
    en: "Formulate a minimal patch plan to fix the error without side effects.",
  },
  apply_code_patch: {
    zh: "通过受控文件修改工具应用针对性的代码修复补丁。",
    en: "Apply targeted code patch via controlled file editing tools.",
  },
  verify_build_fix: {
    zh: "再次触发构建任务，验证修复是否彻底且无二次回归。",
    en: "Re-run the build task to verify the fix resolves all issues cleanly.",
  },
  inspect_architecture: {
    zh: "梳理项目整体技术栈、依赖项以及顶层架构拓扑。",
    en: "Inspect overall technology stack, dependencies, and architecture.",
  },
  map_project_structure: {
    zh: "遍历关键目录树，建立清晰的模块与包结构映射图。",
    en: "Traverse directory tree to map packages and module relationships.",
  },
  analyze_dependencies: {
    zh: "检查 package.json、Cargo.toml 等配置文件与依赖关系。",
    en: "Analyze manifests, direct dependencies, and external frameworks.",
  },
  identify_entrypoints: {
    zh: "定位主入口文件、路由定义及服务启动核心逻辑。",
    en: "Identify application entrypoints, routers, and startup logic.",
  },
  summarize_findings: {
    zh: "综合架构分析发现，输出高可读性的项目结构总结。",
    en: "Summarize architectural findings into actionable project overview.",
  },
  run_test_suite: {
    zh: "在受控沙箱内运行测试套件，收集执行结果与退出状态。",
    en: "Execute test suite within controlled runner and capture outputs.",
  },
  collect_test_failures: {
    zh: "提取失败测试用例堆栈、断言错误与环境上下文。",
    en: "Extract failing test assertions, error traces, and runtime context.",
  },
  diagnose_test_errors: {
    zh: "比对预期与实际输出，定位断言失败或用例异常的代码源头。",
    en: "Diagnose discrepancy between expected and actual test results.",
  },
  fix_test_code: {
    zh: "修复业务实现或测试用例，确保断言符合规范预期。",
    en: "Fix underlying implementation or tests to satisfy assertions.",
  },
  verify_tests_pass: {
    zh: "全量回归测试套件，确认全部用例通过且无新测试失败。",
    en: "Re-run all tests to guarantee 100% pass rate without regressions.",
  },
  review_changes: {
    zh: "比对修改前后差异，核验功能实现与编码风格一致性。",
    en: "Review changes against codebase conventions and styling guidelines.",
  },
  check_git_diff: {
    zh: "审查 Git 工作区变更列表，防止误改无关文件或泄漏配置。",
    en: "Inspect Git diff carefully to prevent accidental modifications.",
  },
  audit_security_impact: {
    zh: "评估变更涉及的权限、网络请求与敏感数据安全影响。",
    en: "Audit changes for permission elevation, network calls, and data risks.",
  },
};

function getToolScopeBadge(toolName: string): "READ" | "WRITE" | "EXECUTE" {
  if (
    toolName.includes("exec") ||
    toolName.includes("run") ||
    toolName.includes("start") ||
    toolName.includes("build") ||
    toolName.includes("test")
  ) {
    return "EXECUTE";
  }
  if (
    toolName.includes("write") ||
    toolName.includes("patch") ||
    toolName.includes("delete") ||
    toolName.includes("create") ||
    toolName.includes("apply") ||
    toolName.includes("set")
  ) {
    return "WRITE";
  }
  return "READ";
}

export const SkillDetailDrawer: React.FC<SkillDetailDrawerProps> = ({
  skillId,
  projectId,
  projectRoot,
  onClose,
  onReload,
  initialMode = "standard",
  collectionContext,
  onBack,
}) => {
  const { t, language } = useTranslation();

  const [skill, setSkill] = useState<SkillDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode: standard vs advanced
  const [mode, setMode] = useState<UserExperienceMode>(initialMode);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Raw Content
  const [rawContent, setRawContent] = useState<SkillRawContentResult | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);

  // Copy states
  const [copiedId, setCopiedId] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedYaml, setCopiedYaml] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Triggers expander
  const [isTriggersExpanded, setIsTriggersExpanded] = useState(false);

  // Load skill definition
  useEffect(() => {
    if (!skillId) {
      setSkill(null);
      setRawContent(null);
      setActiveTab("overview");
      setIsTriggersExpanded(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setIsTriggersExpanded(false);

    bridge
      .getSkill(skillId, projectId)
      .then((data) => {
        if (active) {
          setSkill(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || "Failed to load skill details");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [skillId, projectId]);

  // Load raw content when rawConfig tab is active
  useEffect(() => {
    if (activeTab === "rawConfig" && skillId && !rawContent) {
      setLoadingRaw(true);
      bridge
        .getSkillRawContent(skillId, projectId)
        .then((res) => setRawContent(res))
        .catch(() => {})
        .finally(() => setLoadingRaw(false));
    }
  }, [activeTab, skillId, projectId, rawContent]);

  // Reset active tab if switching from advanced to standard
  useEffect(() => {
    if (mode === "standard" && (activeTab === "tools" || activeTab === "rawConfig")) {
      setActiveTab("overview");
    }
  }, [mode, activeTab]);

  if (!skillId) return null;

  const handleCopyId = () => {
    if (skill) {
      navigator.clipboard.writeText(skill.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyMd = () => {
    if (skill?.instructions) {
      navigator.clipboard.writeText(skill.instructions);
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    }
  };

  const handleCopyYaml = () => {
    if (rawContent?.rawYaml) {
      navigator.clipboard.writeText(rawContent.rawYaml);
      setCopiedYaml(true);
      setTimeout(() => setCopiedYaml(false), 2000);
    }
  };

  const handleToggle = async () => {
    if (!skill) return;
    try {
      const res = await bridge.toggleSkill(skill.id, !skill.enabled);
      if (res.success) {
        setSkill({ ...skill, enabled: !skill.enabled });
        onReload?.();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to toggle skill");
    }
  };

  const handleOpenFolder = async () => {
    if (skill?.sourcePath) {
      try {
        await bridge.openSkillSourceFolder(skill.sourcePath);
      } catch (err: any) {
        alert(err?.message || "Failed to open folder");
      }
    }
  };

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      const res = await bridge.deleteSkill(skill.id, skill.source as any, projectId, projectRoot);
      try {
        await bridge.deleteIntelligenceSkill(skill.id);
      } catch {}
      if (res?.success || res?.removedPath) {
        onReload?.();
        onClose();
      } else {
        alert(res?.error || (language === "zh-CN" ? "删除技能失败" : "Failed to delete skill"));
      }
    } catch (err: any) {
      try {
        await bridge.deleteIntelligenceSkill(skill.id);
      } catch {}
      alert(err?.message || (language === "zh-CN" ? "删除技能失败" : "Failed to delete skill"));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60";
      case "high":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "inspection":
        return t.skills.categoryInspection;
      case "debugging":
        return t.skills.categoryDebugging;
      case "testing":
        return t.skills.categoryTesting;
      case "refactoring":
        return t.skills.categoryRefactoring;
      case "review":
        return t.skills.categoryReview;
      case "runtime":
        return t.skills.categoryRuntime;
      case "maintenance":
        return t.skills.categoryMaintenance;
      default:
        return t.skills.categoryGeneral;
    }
  };

  const displayName = skill
    ? skill.name[language] || skill.name["zh-CN"] || skill.name["en-US"] || skill.id
    : "";

  const displayDesc = skill
    ? skill.description[language] ||
      skill.description["zh-CN"] ||
      skill.description["en-US"] ||
      ""
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40 dark:bg-black/65 backdrop-blur-sm transition-opacity animate-in fade-in duration-150">
      <div
        className="w-full sm:w-[46vw] sm:min-w-[720px] sm:max-w-[920px] bg-white dark:bg-[#0d1320] border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Sticky Solid Header */}
        <div className="sticky top-0 z-20 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1320]">
          {onBack && (
            <div className="flex items-center justify-between gap-4 mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 transition group shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span>返回集合{collectionContext?.name ? `「${collectionContext.name}」` : ""}</span>
              </button>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {displayName}
                  </h2>
                  {skill && (
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-semibold ${getRiskBadge(
                        skill.risk
                      )}`}
                    >
                      {skill.risk} {t.skills?.riskLow?.split(" ")[1] || "Risk"}
                    </span>
                  )}
                  {skill?.source === "builtin" ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60 font-semibold">
                      {t.skills.sourceBuiltin}
                    </span>
                  ) : skill?.source === "project" ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60 font-semibold">
                      {t.skills.sourceProject}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60 font-semibold">
                      {t.skills.sourceUser}
                    </span>
                  )}
                  {skill && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium">
                      v{skill.version}
                    </span>
                  )}
                  {skill && (
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                        skill.enabled
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${skill.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                      <span>{skill.enabled ? "ChatGPT 可自动使用" : "ChatGPT 不会自动使用"}</span>
                    </span>
                  )}
                  {skill?.collectionName && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60 font-semibold">
                      Collection: {skill.collectionName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <span className="truncate">{skillId}</span>
                  <button
                    onClick={handleCopyId}
                    className="hover:text-slate-900 dark:hover:text-slate-200 transition p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Copy ID"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Controls: Mode Switch, Enable Toggle, Delete, Close */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Standard vs Advanced Mode Switch */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMode("standard")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    mode === "standard"
                      ? "bg-white dark:bg-[#121a2c] text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {t.skills.standardMode}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("advanced")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    mode === "advanced"
                      ? "bg-white dark:bg-[#121a2c] text-sky-600 dark:text-sky-400 font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {t.skills.advancedMode}
                </button>
              </div>

              {/* Enabled Switch */}
              {skill && (
                <button
                  onClick={handleToggle}
                  disabled={skill.validationStatus === "invalid" || skill.validationStatus === "conflict"}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:cursor-not-allowed ${
                    skill.enabled ? "bg-sky-600 dark:bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
                  }`}
                  title={skill.enabled ? t.common.disable : t.common.enable}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      skill.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              )}

              {/* Delete Button in Header for non-builtin */}
              {skill && skill.source !== "builtin" && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-slate-200/60 dark:border-slate-700/60 hover:border-rose-200 dark:hover:border-rose-800/60 transition shadow-2xs"
                  title={t.skills.deleteButton}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title={t.common.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Fixed Sticky Tabs */}
          <div className="flex items-center gap-1.5 mt-4 pt-2.5 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "overview"
                  ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800/60 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
              }`}
            >
              {t.skills.tabOverview}
            </button>

            <button
              onClick={() => setActiveTab("workflow")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                activeTab === "workflow"
                  ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800/60 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
              }`}
            >
              <span>{t.skills.tabWorkflow}</span>
              {skill && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    activeTab === "workflow"
                      ? "bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {skill.workflow.length}
                </span>
              )}
            </button>

            {mode === "advanced" && (
              <button
                onClick={() => setActiveTab("tools")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeTab === "tools"
                    ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800/60 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <span>{t.skills.tabTools}</span>
                {skill && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      activeTab === "tools"
                        ? "bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {skill.tools.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab("skillMd")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === "skillMd"
                  ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800/60 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
              }`}
            >
              {t.skills.tabSkillMd}
            </button>

            {mode === "advanced" && (
              <button
                onClick={() => setActiveTab("rawConfig")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === "rawConfig"
                    ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800/60 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                }`}
              >
                {t.skills.tabRawConfig}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-20 text-center text-sm text-slate-500 dark:text-slate-400">
              {t.common.loading}...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {skill && !loading && (
            <>
              {/* Security Warning Alert */}
              {skill.securityWarning && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-xs uppercase tracking-wider mb-1">
                      {t.skills.securityWarningTitle}
                    </h4>
                    <p className="text-xs leading-relaxed">{skill.securityWarning}</p>
                  </div>
                </div>
              )}

              {/* Validation Errors Alert */}
              {skill.validationErrors && skill.validationErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs">
                  <h4 className="font-semibold text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    {t.skills.validationErrorsTitle}
                  </h4>
                  <ul className="list-disc list-inside space-y-1">
                    {skill.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Description Card */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                      {language === "zh-CN" ? "技能概述" : "Description"}
                    </h3>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200 leading-relaxed shadow-2xs">
                      {displayDesc || "No description provided."}
                    </div>
                  </div>

                  {/* Metadata Grid (6 Cards) */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
                      {language === "zh-CN" ? "配置属性" : "Attributes"}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {language === "zh-CN" ? "来源" : "Source"}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {skill.source === "builtin"
                            ? t.skills.sourceBuiltin
                            : skill.source === "project"
                            ? t.skills.sourceProject
                            : t.skills.sourceUser}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {language === "zh-CN" ? "版本" : "Version"}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                          v{skill.version}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {language === "zh-CN" ? "分类" : "Category"}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {getCategoryLabel(skill.category)}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {language === "zh-CN" ? "风险级别" : "Risk"}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">
                          {skill.risk}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {language === "zh-CN" ? "状态" : "Status"}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              skill.enabled ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          <span>
                            {skill.enabled
                              ? language === "zh-CN"
                                ? "已启用"
                                : "Enabled"
                              : language === "zh-CN"
                              ? "已禁用"
                              : "Disabled"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {skill.type === "raw"
                            ? (language === "zh-CN" ? "主文档" : "Primary Doc")
                            : (language === "zh-CN" ? "工作流步数" : "Workflow")}
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {skill.type === "raw"
                            ? (skill.primaryDocument || "SKILL.md")
                            : `${skill.workflow.length} ${t.skills.workflowSteps}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Mode: Source Path */}
                  {mode === "advanced" && skill.sourcePath && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 font-semibold uppercase tracking-wider">
                        {language === "zh-CN" ? "安装路径" : "Source Path"}
                      </div>
                      <div className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all select-text">
                        {skill.sourcePath}
                      </div>
                    </div>
                  )}

                  {/* Trigger Phrases Chips with +N expander */}
                  {skill.triggers && skill.triggers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Tag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {t.skills.triggers} ({skill.triggers.length})
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(isTriggersExpanded
                          ? skill.triggers
                          : skill.triggers.slice(0, 6)
                        ).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-2xs"
                          >
                            {trigger}
                          </span>
                        ))}

                        {skill.triggers.length > 6 && (
                          <button
                            type="button"
                            onClick={() => setIsTriggersExpanded(!isTriggersExpanded)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-100 transition shadow-2xs"
                          >
                            <span>
                              {isTriggersExpanded
                                ? language === "zh-CN"
                                  ? "收起"
                                  : "Show less"
                                : `+${skill.triggers.length - 6} ${
                                    language === "zh-CN" ? "展开" : "more"
                                  }`}
                            </span>
                            {isTriggersExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Security Policy Information */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-3 shadow-2xs">
                    <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {language === "zh-CN" ? "安全与执行约束：" : "Security & Scope Policy: "}
                      </span>
                      <span>
                        {language === "zh-CN"
                          ? "本 Skill 仅通过 LocalBridge 注册的受控 MCP 工具与项目执行交互，严格遵循客户端授权范围（Read / Write / Execute）与安全审批策略。"
                          : "This Skill operates solely through controlled MCP tools, bounded by client scope permissions (Read / Write / Execute) and security policies."}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: WORKFLOW TIMELINE */}
              {activeTab === "workflow" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>
                        {t.skills.workflowPipeline} ({skill.workflow.length}{" "}
                        {t.skills.workflowSteps})
                      </span>
                    </h3>
                  </div>

                  {/* Vertical Timeline container */}
                  <div className="relative pl-8 space-y-4 before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                    {skill.workflow.map((stepId, idx) => {
                      const titleMapping = WORKFLOW_STEP_TITLE_MAP[stepId];
                      const title = titleMapping
                        ? language === "zh-CN"
                          ? titleMapping.zh
                          : titleMapping.en
                        : stepId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                      const descMapping = WORKFLOW_STEP_DESC_MAP[stepId];
                      const description = descMapping
                        ? language === "zh-CN"
                          ? descMapping.zh
                          : descMapping.en
                        : language === "zh-CN"
                        ? "执行此阶段指定的受控工作流步骤。"
                        : "Execute the prescribed workflow step in sequence.";

                      const isLast = idx === skill.workflow.length - 1;
                      const stepNum = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;

                      return (
                        <div key={idx} className="relative group">
                          {/* Step Index Circle on timeline axis */}
                          <div className="absolute -left-8 top-2 w-7 h-7 rounded-full bg-white dark:bg-[#0d1320] border-2 border-sky-500 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xs font-bold font-mono shadow-xs">
                            {stepNum}
                          </div>

                          {/* Step Card */}
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-sky-500/40 transition shadow-2xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {title}
                              </h4>
                              <span className="text-[11px] font-mono font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800/50">
                                Step {stepNum}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                              {stepId}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {description}
                            </p>
                          </div>

                          {/* Down Arrow connector */}
                          {!isLast && (
                            <div className="flex justify-center -mb-2 py-1.5">
                              <ArrowDown className="w-3.5 h-3.5 text-sky-500/50" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: TOOLS (ADVANCED MODE) */}
              {activeTab === "tools" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>{t.skills.allowedTools}</span>
                    </h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800/50">
                      {skill.tools.length} {t.skills.toolsCount}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 overflow-hidden shadow-2xs">
                    {skill.tools.map((toolName) => {
                      const scope = getToolScopeBadge(toolName);
                      const badgeClass =
                        scope === "READ"
                          ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60"
                          : scope === "WRITE"
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60"
                          : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60";

                      return (
                        <div
                          key={toolName}
                          className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 truncate select-text">
                              {toolName}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${badgeClass}`}
                          >
                            {scope}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: SKILL.md READER */}
              {activeTab === "skillMd" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>{t.skills.instructionsTitle}</span>
                    </h3>

                    <button
                      type="button"
                      onClick={handleCopyMd}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs transition"
                    >
                      {copiedMd ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {language === "zh-CN" ? "已复制" : "Copied"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.skills.copyMarkdown}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Markdown Typography Container */}
                  <div className="max-w-[760px] mx-auto p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-[1.7] space-y-4 font-sans select-text shadow-sm overflow-x-auto">
                    {skill.instructions ? (
                      skill.instructions.split("\n\n").map((block, idx) => {
                        const trimmed = block.trim();
                        if (!trimmed) return null;

                        // H3 Heading
                        if (trimmed.startsWith("### ")) {
                          return (
                            <h4
                              key={idx}
                              className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-slate-800"
                            >
                              {trimmed.slice(4)}
                            </h4>
                          );
                        }

                        // H2 Heading
                        if (trimmed.startsWith("## ")) {
                          return (
                            <h3
                              key={idx}
                              className="text-base font-bold text-slate-900 dark:text-slate-100 mt-6 mb-2 pb-1 border-b border-slate-200 dark:border-slate-800"
                            >
                              {trimmed.slice(3)}
                            </h3>
                          );
                        }

                        // H1 Heading
                        if (trimmed.startsWith("# ")) {
                          return (
                            <h2
                              key={idx}
                              className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-2 mb-3 pb-2 border-b-2 border-slate-200 dark:border-slate-800"
                            >
                              {trimmed.slice(2)}
                            </h2>
                          );
                        }

                        // Code Block
                        if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
                          const lines = trimmed.split("\n");
                          const lang = lines[0]?.slice(3).trim();
                          const code = lines.slice(1, -1).join("\n");
                          return (
                            <div
                              key={idx}
                              className="rounded-xl bg-slate-900 text-slate-100 dark:bg-[#05070d] dark:text-slate-200 border border-slate-700/60 p-4 font-mono text-[11px] overflow-x-auto my-3 shadow-xs"
                            >
                              {lang && (
                                <div className="text-[10px] uppercase text-slate-400 mb-1.5 font-semibold">
                                  {lang}
                                </div>
                              )}
                              <pre className="whitespace-pre">{code}</pre>
                            </div>
                          );
                        }

                        // Blockquote
                        if (trimmed.startsWith("> ")) {
                          return (
                            <blockquote
                              key={idx}
                              className="pl-4 border-l-4 border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 py-2.5 my-3 rounded-r-lg text-slate-700 dark:text-slate-300 italic"
                            >
                              {trimmed.slice(2)}
                            </blockquote>
                          );
                        }

                        // Unordered List
                        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                          const items = trimmed.split("\n").filter((l) => l.trim());
                          return (
                            <ul key={idx} className="list-disc list-outside ml-5 space-y-1.5 my-2.5 text-slate-700 dark:text-slate-300">
                              {items.map((item, itemIdx) => (
                                <li key={itemIdx} className="leading-relaxed">
                                  {item.replace(/^[-*]\s+/, "")}
                                </li>
                              ))}
                            </ul>
                          );
                        }

                        // Ordered List
                        if (/^\d+\.\s+/.test(trimmed)) {
                          const items = trimmed.split("\n").filter((l) => l.trim());
                          return (
                            <ol key={idx} className="list-decimal list-outside ml-5 space-y-1.5 my-2.5 text-slate-700 dark:text-slate-300">
                              {items.map((item, itemIdx) => (
                                <li key={itemIdx} className="leading-relaxed">
                                  {item.replace(/^\d+\.\s+/, "")}
                                </li>
                              ))}
                            </ol>
                          );
                        }

                        // Standard Paragraph
                        return (
                          <p key={idx} className="leading-relaxed text-slate-700 dark:text-slate-300">
                            {trimmed}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-slate-500 italic">No instructions available.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: RAW CONFIG (ADVANCED MODE) */}
              {activeTab === "rawConfig" && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>skill.yaml</span>
                    </h3>

                    <button
                      type="button"
                      onClick={handleCopyYaml}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs transition"
                    >
                      {copiedYaml ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {language === "zh-CN" ? "已复制" : "Copied"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.skills.copyYaml}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {loadingRaw ? (
                    <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                      {t.common.loading}...
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-900 text-slate-100 dark:bg-[#05070d] border border-slate-700/60 p-5 font-mono text-xs text-slate-100 leading-relaxed whitespace-pre overflow-x-auto select-text shadow-sm">
                      {rawContent?.rawYaml || "skill.yaml content not available"}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Sticky Solid Footer */}
        {skill && (
          <div className="sticky bottom-0 z-20 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1320] flex items-center justify-between gap-3">
            {/* Source Tag or Read-only info */}
            <div>
              {skill.source === "builtin" ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>
                    {language === "zh-CN" ? "官方内置 · 规范受保护" : "Built-in · Read-only"}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {skill.source === "user" ? t.skills.sourceUser : t.skills.sourceProject}
                </span>
              )}
            </div>

            {/* Actions for User or Project skills */}
            {skill.source !== "builtin" && (
              <div className="flex items-center gap-2.5">
                {skill.sourcePath && (
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    <span>{t.skills.openFolder}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onReload?.()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs transition"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>{t.skills.reloadButton}</span>
                </button>

              {showDeleteConfirm ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-xs"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{language === "zh-CN" ? "确认删除" : "Confirm Delete"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-medium text-rose-700 dark:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.skills.deleteButton}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Centered High-Priority Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white dark:bg-[#0f172a] border border-rose-200 dark:border-rose-900/60 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              确定删除该技能？
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              将永久删除技能「<span className="font-semibold text-slate-900 dark:text-slate-100">{displayName}</span>」及其配置文件，此操作无法撤销。
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1.5 shadow-sm"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{language === "zh-CN" ? "确认删除" : "Confirm Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
};
