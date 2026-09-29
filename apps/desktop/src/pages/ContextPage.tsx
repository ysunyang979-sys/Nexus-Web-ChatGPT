import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  RefreshCw,
  Cpu,
  Minimize2,
  Shield,
  Brain,
  Sparkles,
  Hash,
  Activity,
  Trash2,
  Eye,
  Code,
  FileText,
  Clock,
  Folder,
  Terminal,
  Archive,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

export const ContextPage: React.FC = () => {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [savedSnapshots, setSavedSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [targetTokenLimit, setTargetTokenLimit] = useState(4000);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [generatingContext, setGeneratingContext] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "task"
    | "session"
    | "project"
    | "actions"
    | "rules"
    | "files"
    | "skills"
    | "snapshots"
  >("overview");
  const [inspectSourceJson, setInspectSourceJson] = useState<any | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const [contextRes, snapshotsRes] = await Promise.allSettled([
        bridge.buildIntelligenceContext({
          goal: "Nexus Desktop Workspace Management & Durability",
          recentActions: [
            { actionId: "act_boot", toolName: "localbridge_environment_detect", status: "COMMITTED" },
            { actionId: "act_init", toolName: "localbridge_project_list", status: "COMMITTED" },
          ],
          files: ["package.json", "apps/server/src/app.ts"],
        }),
        bridge.listIntelligenceContextSnapshots(50),
      ]);

      if (contextRes.status === "fulfilled") {
        setSnapshot(contextRes.value);
      }
      if (snapshotsRes.status === "fulfilled") {
        setSavedSnapshots(snapshotsRes.value.snapshots || []);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "构建上下文失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const handleAiGenerateContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiGoal.trim()) return;
    setGeneratingContext(true);
    try {
      const newSnap = await bridge.buildIntelligenceContext({
        goal: aiGoal.trim(),
        taskId: `task_ctx_${Date.now()}`,
        recentActions: [
          { toolName: "localbridge_context_build", actionName: "generate_context", status: "COMMITTED" },
        ],
      });
      setSnapshot(newSnap);
      setIsAiModalOpen(false);
      setAiGoal("");
      setMessage({
        text: `GPT 已成功根据目标「${aiGoal.slice(0, 20)}」自动生成最新上下文快照 (${newSnap.tokenEstimate || 0} tokens)`,
        type: "success",
      });
      const updatedList = await bridge.listIntelligenceContextSnapshots(50);
      setSavedSnapshots(updatedList.snapshots || []);
    } catch (err: any) {
      setMessage({ text: err.message || "GPT 自动生成上下文失败", type: "error" });
    } finally {
      setGeneratingContext(false);
    }
  };

  const handleCompact = async () => {
    if (!snapshot) return;
    setCompacting(true);
    try {
      const res = await bridge.compactIntelligenceContext({
        snapshot,
        targetTokenLimit,
      });
      const compactedSnap = res?.compactedSnapshot || res;
      setSnapshot(compactedSnap);
      setMessage({
        text: `${t.context?.compactSuccess || "上下文已确定性压缩"}: ${snapshot.tokenEstimate || 0} -> ${compactedSnap.tokenEstimate || 0} tokens`,
        type: "success",
      });
      // refresh snapshots list
      const updatedList = await bridge.listIntelligenceContextSnapshots(50);
      setSavedSnapshots(updatedList.snapshots || []);
    } catch (err: any) {
      setMessage({ text: err.message || "上下文压缩失败", type: "error" });
    } finally {
      setCompacting(false);
    }
  };

  const handleDeleteSnapshot = async (contextId: string) => {
    if (!contextId) return;
    // Optimistic UI update
    setSavedSnapshots((prev) => prev.filter((s) => (s.contextId || s.id) !== contextId));
    try {
      await bridge.deleteIntelligenceContextSnapshot(contextId);
      setMessage({ text: "上下文快照已安全删除并在本地落盘标记", type: "success" });
      const updatedList = await bridge.listIntelligenceContextSnapshots(50);
      setSavedSnapshots(updatedList.snapshots || []);
      if (snapshot?.contextId === contextId) {
        setSnapshot(null);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "删除快照失败", type: "error" });
      const updatedList = await bridge.listIntelligenceContextSnapshots(50);
      setSavedSnapshots(updatedList.snapshots || []);
    }
  };

  const handleViewSnapshot = (snap: any) => {
    setSnapshot(snap);
    setActiveTab("overview");
    setMessage({ text: `正在查看快照: ${snap.contextId}`, type: "success" });
  };

  const tokens = snapshot?.tokenEstimate || 0;
  const tokenMax = 8000;
  const tokenPercent = Math.min(100, Math.round((tokens / tokenMax) * 100));

  const subpanelTabs = [
    { id: "overview", label: "概览", icon: Layers },
    { id: "task", label: "当前任务", icon: Terminal },
    { id: "session", label: "当前会话", icon: Clock },
    { id: "project", label: "项目上下文", icon: Folder },
    { id: "actions", label: "近期操作", icon: Activity, count: snapshot?.recentActions?.length },
    { id: "rules", label: "全局规则", icon: Shield, count: snapshot?.rules?.length },
    { id: "files", label: "关联文件", icon: FileText, count: snapshot?.files?.length },
    { id: "skills", label: "生效技能", icon: Sparkles, count: snapshot?.skills?.length },
    { id: "snapshots", label: "快照归档", icon: Archive, count: savedSnapshots.length },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-subtle pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shadow-sm">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">{t.context?.title || "上下文运行时"}</h1>
            <p className="text-xs text-theme-muted">
              {t.context?.headerDesc || "动态聚合 • 确定性 Token 预算 • 零 LLM 确定性压缩"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition shadow-sm"
            title="让 GPT 自动按需分析并构建上下文快照"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>GPT 自动生成上下文</span>
          </button>
          <button
            onClick={() => setInspectSourceJson(inspectSourceJson ? null : snapshot)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary flex items-center gap-1.5 transition"
          >
            <Code className="w-3.5 h-3.5" />
            <span>{inspectSourceJson ? "隐藏 JSON" : "查看 JSON"}</span>
          </button>
          <button
            onClick={fetchContext}
            disabled={loading}
            className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted transition"
            title="刷新上下文"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleCompact}
            disabled={compacting || !snapshot}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition shadow-sm"
          >
            <Minimize2 className={`w-3.5 h-3.5 ${compacting ? "animate-spin" : ""}`} />
            <span>{t.context?.deterministicCompact || "确定性压缩"}</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between shadow-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-theme-muted hover:text-theme-primary font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Token Meter Banner */}
      <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-theme-primary">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>{t.context?.tokenBudget || "Token 预算与上下文大小"}</span>
          </div>
          <span className="text-xs font-mono font-medium text-theme-secondary">
            {tokens.toLocaleString()} / {tokenMax.toLocaleString()} tokens ({tokenPercent}%)
          </span>
        </div>

        <div className="w-full bg-theme-sidebar h-2 rounded-full overflow-hidden border border-theme-subtle">
          <div
            className={`h-full transition-all duration-300 ${
              tokenPercent > 80 ? "bg-red-500" : tokenPercent > 50 ? "bg-amber-500" : "bg-indigo-500"
            }`}
            style={{ width: `${tokenPercent}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-theme-muted pt-1 gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono">
              <Hash className="w-3 h-3 text-indigo-500" />
              ID: <span className="text-theme-secondary">{snapshot?.contextId || "live_feed"}</span>
            </span>
            {snapshot?.compactionState && (
              <span className="text-emerald-500 font-medium">
                已压缩 (截断边界: 步骤 {snapshot.compactionState.compactionBoundaryStep})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>目标 Token 限制:</span>
            <input
              type="number"
              value={targetTokenLimit}
              onChange={(e) => setTargetTokenLimit(parseInt(e.target.value, 10) || 4000)}
              className="w-20 bg-theme-sidebar border border-theme-subtle rounded px-2 py-0.5 text-xs text-theme-primary text-right font-mono"
            />
          </div>
        </div>
      </div>

      {/* Subpanels Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-theme-subtle pb-2">
        {subpanelTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition whitespace-nowrap ${
                active
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold"
                  : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-theme-sidebar text-theme-secondary font-mono">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Raw JSON Inspection Drawer */}
      {inspectSourceJson && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
            <span className="text-xs font-bold font-mono text-theme-primary flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-indigo-500" />
              权威上下文快照原始数据 (Raw Payload)
            </span>
            <button
              onClick={() => setInspectSourceJson(null)}
              className="text-xs text-theme-muted hover:text-theme-primary"
            >
              关闭
            </button>
          </div>
          <pre className="text-xs font-mono text-theme-secondary bg-theme-sidebar p-3 rounded-lg overflow-x-auto max-h-96">
            {JSON.stringify(inspectSourceJson, null, 2)}
          </pre>
        </div>
      )}

      {/* Subpanels Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rules Card */}
          <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
              <span className="text-xs font-bold text-theme-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                生效全局规则 ({snapshot?.rules?.length || 0})
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(snapshot?.rules || []).map((r: any) => (
                <div key={r.ruleId} className="p-2.5 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-theme-primary">{r.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 font-mono">
                      {r.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-muted line-clamp-2">{r.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Memories Card */}
          <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
              <span className="text-xs font-bold text-theme-primary flex items-center gap-2">
                <Brain className="w-4 h-4 text-sky-500" />
                已召回记忆 ({snapshot?.memories?.length || 0})
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(snapshot?.memories || []).map((m: any) => (
                <div key={m.id} className="p-2.5 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold font-mono text-theme-primary">{m.key}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20 font-mono">
                      {m.scope}
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-muted line-clamp-2">{m.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Active Skills Card */}
          <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
              <span className="text-xs font-bold text-theme-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                生效技能 ({snapshot?.skills?.length || 0})
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(snapshot?.skills || []).map((s: any) => (
                <div key={s.skillId} className="p-2.5 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-theme-primary">{s.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
                      v{s.version}
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-muted">{s.stepsCount || 0} 项配置步骤</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Actions Card */}
          <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
              <span className="text-xs font-bold text-theme-primary flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                近期操作 ({snapshot?.recentActions?.length || 0})
              </span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(snapshot?.recentActions || []).map((a: any) => (
                <div key={a.actionId} className="p-2 rounded bg-theme-sidebar border border-theme-subtle text-xs flex items-center justify-between">
                  <span className="font-mono text-theme-primary text-[11px]">{a.toolName}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono">
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "task" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-500" />
            当前任务目标与生命周期
          </h3>
          <div className="bg-theme-sidebar border border-theme-subtle rounded-lg p-3 space-y-2 text-xs">
            <div>
              <span className="text-theme-muted font-medium">任务 ID:</span>{" "}
              <span className="font-mono text-theme-primary">{snapshot?.taskId || "无 (交互式提示)"}</span>
            </div>
            <div>
              <span className="text-theme-muted font-medium">目标规范：</span>
              <p className="text-theme-primary mt-1 font-mono leading-relaxed bg-theme-base p-2.5 rounded border border-theme-subtle">
                {snapshot?.goal || "默认自主工作区发现与持续后台索引"}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "session" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            当前会话上下文
          </h3>
          <div className="bg-theme-sidebar border border-theme-subtle rounded-lg p-3 space-y-2 text-xs">
            <div>
              <span className="text-theme-muted font-medium">会话 ID:</span>{" "}
              <span className="font-mono text-theme-primary">{snapshot?.sessionId || "sess_active_default"}</span>
            </div>
            <div>
              <span className="text-theme-muted font-medium">时间戳：</span>{" "}
              <span className="font-mono text-theme-secondary">
                {snapshot?.createdAt ? new Date(snapshot.createdAt).toLocaleString() : "实时"}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "project" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-500" />
            项目边界上下文
          </h3>
          <div className="bg-theme-sidebar border border-theme-subtle rounded-lg p-3 space-y-2 text-xs">
            <div>
              <span className="text-theme-muted font-medium">项目 ID:</span>{" "}
              <span className="font-mono text-theme-primary">{snapshot?.projectId || "GLOBAL"}</span>
            </div>
            <div>
              <span className="text-theme-muted font-medium">强制安全模式：</span>{" "}
              <span className="text-emerald-500 font-mono">DURABLE_FULL_ACCESS</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            上下文中的近期操作执行
          </h3>
          <div className="space-y-2">
            {(snapshot?.recentActions || []).map((a: any) => (
              <div key={a.actionId} className="p-3 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-theme-primary">{a.toolName}</span>
                  {a.actionId && <span className="text-theme-muted font-mono ml-2">({a.actionId})</span>}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono">
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            上下文中的全局规则
          </h3>
          <div className="space-y-2">
            {(snapshot?.rules || []).map((r: any) => (
              <div key={r.ruleId} className="p-3 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-theme-primary">{r.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 font-mono">
                    {r.priority}
                  </span>
                </div>
                <p className="text-theme-secondary font-mono text-[11px]">{r.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "files" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-500" />
            上下文中附加的关联文件
          </h3>
          <div className="space-y-2">
            {(snapshot?.files || []).map((f: string, idx: number) => (
              <div key={idx} className="p-2.5 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs font-mono text-theme-primary flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-teal-500" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "skills" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-3 shadow-sm">
          <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            上下文中加载的生效技能
          </h3>
          <div className="space-y-2">
            {(snapshot?.skills || []).map((s: any) => (
              <div key={s.skillId} className="p-3 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-theme-primary">{s.name}</span>
                  <span className="text-theme-muted ml-2 font-mono text-[11px]">v{s.version}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-mono">
                  {s.stepsCount || 0} 项配置步骤
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "snapshots" && (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-theme-primary">已持久化上下文快照 ({savedSnapshots.length})</h3>
            </div>
            <span className="text-[11px] text-theme-muted font-mono">
              存储目录: context/snapshots/YYYY/MM/*.jsonl
            </span>
          </div>

          {savedSnapshots.length === 0 ? (
            <div className="text-center py-12 text-theme-muted text-xs">
              暂无保存的上下文快照。点击“确定性压缩”即可生成不可变快照。
            </div>
          ) : (
            <div className="space-y-3">
              {savedSnapshots.map((snap, idx) => {
                const snapId = snap.contextId || snap.id || `snapshot_${idx + 1}`;
                const tokenCount = snap.tokenEstimate !== undefined ? snap.tokenEstimate : (snap.tokens || 0);
                return (
                  <div
                    key={snapId}
                    className="bg-theme-sidebar border border-theme-subtle rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-theme-muted transition"
                  >
                    <div className="space-y-1 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-xs text-theme-primary">{snapId}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-mono">
                          {tokenCount} tokens
                        </span>
                        {snap.compactionState && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono">
                            已压缩
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-theme-muted line-clamp-1">{snap.goal || "Nexus Desktop 工作区管理与持久化"}</p>
                      <span className="text-[10px] text-theme-muted">
                        {snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "未知日期"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewSnapshot(snap)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card text-theme-primary flex items-center gap-1 transition"
                        title="载入当前视图"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                        <span>查看</span>
                      </button>
                      <button
                        onClick={() => setInspectSourceJson(snap)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card text-theme-secondary flex items-center gap-1 transition"
                        title="查看 JSON 源码"
                      >
                        <Code className="w-3.5 h-3.5 text-purple-500" />
                        <span>源码</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snapId)}
                        className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-theme-card transition"
                        title="永久删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GPT Auto-generate Context Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-theme-card border border-theme-subtle rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-theme-primary">GPT 自动生成上下文快照</h3>
                  <p className="text-xs text-theme-muted">
                    输入当前任务或工作区目标，AI 将结合全局规则、关联文件、活跃技能和执行账本，自动组装精准的确定性上下文并落盘保存。
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="text-theme-muted hover:text-theme-primary p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAiGenerateContext} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-theme-secondary mb-1.5">
                  任务目标 / 上下文需求描述
                </label>
                <textarea
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  placeholder="例如：分析当前 Nexus 项目代码结构，排查 MCP 客户端连接与执行超时问题并制定修复方案..."
                  rows={4}
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-xl p-3 text-xs text-theme-primary focus:outline-none focus:border-amber-500 transition resize-none font-sans"
                  required
                />
              </div>

              <div>
                <span className="text-[11px] text-theme-muted block mb-1.5">快速填充参考建议：</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "构建项目当前全量工程治理与安全规则上下文",
                    "聚合 Windows 桌面原生桥接与 MCP 执行链上下文",
                    "分析执行账本 ActionLedger 与持久化 WAL 恢复状态",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAiGoal(preset)}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-theme-sidebar border border-theme-subtle hover:border-amber-500/50 text-theme-secondary transition"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-theme-subtle">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  disabled={generatingContext}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-theme-subtle hover:bg-theme-sidebar text-theme-secondary transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={generatingContext || !aiGoal.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generatingContext ? "animate-spin" : ""}`} />
                  <span>{generatingContext ? "GPT 正在组装上下文..." : "生成并持久化快照"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
