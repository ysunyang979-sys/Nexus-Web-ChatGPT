import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Tag,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

const PRIORITY_BADGES: Record<string, { label: string; color: string; rank: number }> = {
  SYSTEM: { label: "系统级 (100)", color: "bg-red-500/10 text-red-500 border-red-500/20", rank: 100 },
  CORE_GLOBAL: { label: "核心全局 (80)", color: "bg-purple-500/10 text-purple-500 border-purple-500/20", rank: 80 },
  USER_GLOBAL: { label: "用户全局 (60)", color: "bg-sky-500/10 text-sky-500 border-sky-500/20", rank: 60 },
  PROJECT: { label: "项目级 (40)", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", rank: 40 },
  TASK: { label: "任务级 (20)", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", rank: 20 },
  SKILL: { label: "技能级 (10)", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", rank: 10 },
};

export const GlobalRulesPage: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedScope, setSelectedScope] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newPriority, setNewPriority] = useState("USER_GLOBAL");
  const [newScope, setNewScope] = useState("GLOBAL");
  const [newTags, setNewTags] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bridge.getIntelligenceRules({
        scope: selectedScope !== "ALL" ? selectedScope : undefined,
        activeOnly: true,
      });
      // Sort by priority rank descending
      const sorted = (res.rules || []).sort(
        (a: any, b: any) => (b.priorityRank || 0) - (a.priorityRank || 0)
      );
      setRules(sorted);
    } catch (err: any) {
      setMessage({ text: err.message || "加载规则失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [selectedScope]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newContent.trim()) return;
    try {
      await bridge.createIntelligenceRule({
        name: newName.trim(),
        content: newContent.trim(),
        priority: newPriority,
        scope: newScope,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setIsAddModalOpen(false);
      setNewName("");
      setNewContent("");
      setNewTags("");
      setMessage({ text: t.rules?.createdSuccess || "规则创建成功，已生效优先级校验", type: "success" });
      loadRules();
    } catch (err: any) {
      setMessage({ text: err.message || "创建规则失败", type: "error" });
    }
  };

  const handleDeleteRule = async (ruleId: string, priority: string) => {
    if (priority === "SYSTEM") {
      setMessage({ text: t.rules?.protectedWarning || "系统级保护规则不可删除", type: "error" });
      return;
    }
    setRules((prev) => prev.filter((r) => (r.id || r.ruleId) !== ruleId));
    try {
      await bridge.deleteIntelligenceRule(ruleId);
      setMessage({ text: t.rules?.deletedSuccess || "规则已成功删除", type: "success" });
      loadRules();
    } catch (err: any) {
      setMessage({ text: err.message || "删除规则失败", type: "error" });
      loadRules();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-subtle pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">{t.rules?.title || "全局规则注册中心"}</h1>
            <p className="text-xs text-theme-muted">
              {t.rules?.headerDesc || "严格优先级阶梯: 系统级 (100) > 核心全局 (80) > 用户全局 (60) > 项目级 (40) > 任务级 (20) > 技能级 (10)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value)}
            className="bg-theme-card border border-theme-subtle rounded-lg px-2.5 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">{t.rules?.allScopes || "所有作用域"}</option>
            <option value="GLOBAL">全局 (GLOBAL)</option>
            <option value="USER_GLOBAL">用户全局 (USER_GLOBAL)</option>
            <option value="PROJECT">项目级 (PROJECT)</option>
            <option value="TASK">任务级 (TASK)</option>
            <option value="SKILL">技能级 (SKILL)</option>
          </select>
          <button
            onClick={loadRules}
            disabled={loading}
            className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted"
            title="刷新规则"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.rules?.addRule || "添加规则"}</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-theme-muted hover:text-theme-primary">
            ✕
          </button>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-12 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t.rules?.noRulesFound || "暂无生效规则"}</p>
          </div>
        ) : (
          rules.map((rule) => {
            const badge = PRIORITY_BADGES[rule.priority] || {
              label: rule.priority,
              color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
              rank: 0,
            };
            const isProtected = rule.priority === "SYSTEM" || rule.priority === "CORE_GLOBAL";

            return (
              <div
                key={rule.ruleId}
                className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:border-theme-muted transition shadow-sm"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-theme-primary">{rule.name}</span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-theme-muted px-2 py-0.5 rounded bg-theme-sidebar border border-theme-subtle">
                      作用域: {rule.scope}
                    </span>
                    {isProtected && (
                      <span className="text-[10px] text-amber-500 flex items-center gap-1 font-medium">
                        <Lock className="w-3 h-3" />
                        受保护系统规则
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-theme-secondary leading-relaxed whitespace-pre-wrap font-mono bg-theme-sidebar/50 p-2.5 rounded-lg border border-theme-subtle">
                    {rule.content}
                  </p>

                  {rule.tags && rule.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {rule.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-theme-sidebar text-theme-muted flex items-center gap-0.5"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {!isProtected && (
                  <button
                    onClick={() => handleDeleteRule(rule.ruleId, rule.priority)}
                    className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-theme-card-hover transition shrink-0"
                    title="删除规则"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Rule Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-theme-subtle rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-theme-primary">{t.rules?.createRuleTitle || "新建全局 / 项目规则"}</h2>
            <form onSubmit={handleCreateRule} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.rules?.ruleName || "规则名称"}</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如: enforce_action_ledger_verification"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1">{t.rules?.rulePriority || "优先级"}</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-purple-500"
                  >
                    <option value="USER_GLOBAL">用户全局 (60)</option>
                    <option value="PROJECT">项目级 (40)</option>
                    <option value="TASK">任务级 (20)</option>
                    <option value="SKILL">技能级 (10)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-theme-muted mb-1">{t.rules?.ruleScope || "作用域"}</label>
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value)}
                    className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-purple-500"
                  >
                    <option value="GLOBAL">全局 (GLOBAL)</option>
                    <option value="USER_GLOBAL">用户全局 (USER_GLOBAL)</option>
                    <option value="PROJECT">项目级 (PROJECT)</option>
                    <option value="TASK">任务级 (TASK)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.rules?.ruleContent || "规则内容"}</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="详细定义行为约束、系统策略或安全要求..."
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">{t.rules?.ruleTags || "标签 (逗号分隔)"}</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="安全, 文件系统, 验证"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-theme-muted hover:bg-theme-card-hover"
                >
                  {t.common.cancel || "取消"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white"
                >
                  {t.rules?.addRule || "确认创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
