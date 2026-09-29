import React, { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Save,
  Check,
  ToggleLeft,
  ToggleRight,
  FolderLock,
  Layers,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { Project } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

export type PromptCategory = "system" | "project" | "user" | "tool";

export interface PromptItem {
  id: string;
  category: PromptCategory;
  name: string;
  description: string;
  content: string;
  projectId?: string;
  projectName?: string;
  enabled: boolean;
  updatedAt: string;
}

const STORAGE_KEY = "nexus_prompts_v2";

const INITIAL_PROMPTS: PromptItem[] = [
  {
    id: "prompt-sys-1",
    category: "system",
    name: "Nexus Core System Directives / 核心系统指令",
    description: "全局执行边界、角色分工与本地 MCP 规范",
    content: `You are connected to Nexus, a Universal MCP Execution Bridge running locally on Windows.
- Role: Deterministic local tool execution and system bridging.
- Safety: Strictly verify approval IDs and avoid modifying unauthorized directory trees.
- Output: Provide concise evidence after executing actions.`,
    enabled: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prompt-user-1",
    category: "user",
    name: "User Engineering Standard / 用户工程偏好",
    description: "针对干净输出、验证留痕的自定义偏好",
    content: `Always run verification after making changes.
Never output verbose excuses or disclaimers.
Keep terminal commands non-destructive.`,
    enabled: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prompt-tool-1",
    category: "tool",
    name: "Tool Execution Safety Rules / 工具执行安全规范",
    description: "文件写操作、进程启动与浏览器自动化的约束",
    content: `Before writing files, verify the parent folder exists.
Before starting persistent background processes, ensure timeouts and logs are tracked.
When running browser automation, prefer headless mode unless explicit visual inspection is requested.`,
    enabled: true,
    updatedAt: new Date().toISOString(),
  },
];

interface PromptPageProps {
  projects: Project[];
}

export const PromptPage: React.FC<PromptPageProps> = ({ projects }) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<PromptCategory>("system");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id || "default"
  );
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load prompts on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPrompts(parsed);
          return;
        }
      }
    } catch {}
    setPrompts(INITIAL_PROMPTS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PROMPTS));
    } catch {}
  }, []);

  // Filter prompts by active category and project
  const visiblePrompts = prompts.filter((p) => {
    if (p.category !== activeCategory) return false;
    if (activeCategory === "project") {
      return p.projectId === selectedProjectId;
    }
    return true;
  });

  // Select initial prompt when category or project changes
  useEffect(() => {
    if (visiblePrompts.length > 0) {
      const active = visiblePrompts.find((p) => p.id === selectedPromptId) || visiblePrompts[0];
      setSelectedPromptId(active.id);
      setEditName(active.name);
      setEditDescription(active.description);
      setEditContent(active.content);
      setEditEnabled(active.enabled);
    } else {
      setSelectedPromptId(null);
      setEditName("");
      setEditDescription("");
      setEditContent("");
      setEditEnabled(true);
    }
  }, [activeCategory, selectedProjectId, visiblePrompts.length]);

  const handleSelectPrompt = (prompt: PromptItem) => {
    setSelectedPromptId(prompt.id);
    setEditName(prompt.name);
    setEditDescription(prompt.description);
    setEditContent(prompt.content);
    setEditEnabled(prompt.enabled);
    setSaveSuccess(false);
  };

  const handleSave = () => {
    if (!editName.trim()) return;

    let updated: PromptItem[];
    const now = new Date().toISOString();

    if (selectedPromptId) {
      updated = prompts.map((p) =>
        p.id === selectedPromptId
          ? {
              ...p,
              name: editName.trim(),
              description: editDescription.trim(),
              content: editContent,
              enabled: editEnabled,
              updatedAt: now,
            }
          : p
      );
    } else {
      const newPrompt: PromptItem = {
        id: `prompt-${Date.now()}`,
        category: activeCategory,
        name: editName.trim(),
        description: editDescription.trim(),
        content: editContent,
        projectId: activeCategory === "project" ? selectedProjectId : undefined,
        projectName:
          activeCategory === "project"
            ? projects.find((pr) => pr.id === selectedProjectId)?.name || "Project"
            : undefined,
        enabled: editEnabled,
        updatedAt: now,
      };
      updated = [newPrompt, ...prompts];
      setSelectedPromptId(newPrompt.id);
    }

    setPrompts(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleCreateNew = () => {
    const targetProject = projects.find((pr) => pr.id === selectedProjectId);
    const newName = isZh
      ? activeCategory === "project"
        ? `${targetProject?.name || "项目"} 提示词`
        : activeCategory === "system"
        ? "新建系统提示词"
        : activeCategory === "user"
        ? "新建用户提示词"
        : "新建工具执行提示词"
      : activeCategory === "project"
      ? `${targetProject?.name || "Project"} Directives`
      : activeCategory === "system"
      ? "New System Prompt"
      : activeCategory === "user"
      ? "New User Prompt"
      : "New Execution Prompt";

    const newPrompt: PromptItem = {
      id: `prompt-${Date.now()}`,
      category: activeCategory,
      name: newName,
      description: isZh ? "自定义提示词说明" : "Custom prompt instructions",
      content: "",
      projectId: activeCategory === "project" ? selectedProjectId : undefined,
      projectName: targetProject?.name,
      enabled: true,
      updatedAt: new Date().toISOString(),
    };

    const updated = [newPrompt, ...prompts];
    setPrompts(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    handleSelectPrompt(newPrompt);
  };

  const handleDelete = (id: string) => {
    const updated = prompts.filter((p) => p.id !== id);
    setPrompts(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    if (selectedPromptId === id) {
      setSelectedPromptId(null);
    }
  };

  const handleToggleEnable = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = prompts.map((p) =>
      p.id === id ? { ...p, enabled: !p.enabled, updatedAt: new Date().toISOString() } : p
    );
    setPrompts(updated);
    if (selectedPromptId === id) {
      setEditEnabled(!editEnabled);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* Top Category Tabs & Filter Header */}
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {(
            [
              { id: "system", label: isZh ? "系统提示词" : "System Prompt", icon: Layers },
              { id: "project", label: isZh ? "项目提示词" : "Project Prompt", icon: FolderLock },
              { id: "user", label: isZh ? "用户提示词" : "User Prompt", icon: Sparkles },
              { id: "tool", label: isZh ? "工具/执行提示词" : "Tool / Execution Prompt", icon: Terminal },
            ] as const
          ).map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? "bg-theme-card-hover text-theme-primary border border-theme-strong shadow-sm font-semibold"
                    : "text-theme-muted hover:text-theme-primary hover:bg-theme-card/60 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-sky-500" : "text-theme-muted"}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {activeCategory === "project" && projects.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-muted">{isZh ? "目标项目:" : "Project:"}</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-theme-card text-theme-primary text-xs px-2.5 py-1.5 rounded-lg border border-theme-subtle focus:outline-none focus:border-sky-500 font-mono"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-hover hover:bg-theme-card text-theme-primary border border-theme-subtle hover:border-theme-strong rounded-lg text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5 text-sky-500" />
            <span>{isZh ? "新建提示词" : "New Prompt"}</span>
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Prompt List */}
        <div className="w-72 border-r border-theme-subtle bg-theme-base/60 flex flex-col shrink-0 overflow-y-auto">
          {visiblePrompts.length === 0 ? (
            <div className="p-6 text-center text-xs text-theme-muted space-y-3">
              <FileText className="w-8 h-8 mx-auto text-theme-muted/40" />
              <div>{isZh ? "此分类下暂无提示词" : "No prompts found in this category."}</div>
              <button
                type="button"
                onClick={handleCreateNew}
                className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/30 rounded-lg text-xs font-medium transition"
              >
                {isZh ? "创建第一条提示词" : "Create First Prompt"}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-theme-subtle">
              {visiblePrompts.map((p) => {
                const isSelected = p.id === selectedPromptId;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPrompt(p)}
                    className={`p-3.5 cursor-pointer transition flex items-start justify-between gap-2 ${
                      isSelected
                        ? "bg-theme-card border-l-2 border-l-sky-500 text-theme-primary"
                        : "hover:bg-theme-card/40 text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs truncate">{p.name}</span>
                      </div>
                      {p.description && (
                        <div className="text-[11px] text-theme-muted line-clamp-1">
                          {p.description}
                        </div>
                      )}
                      <div className="text-[10px] text-theme-muted/70 font-mono">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => handleToggleEnable(p.id, e)}
                        title={p.enabled ? (isZh ? "已启用" : "Enabled") : (isZh ? "已禁用" : "Disabled")}
                        className="text-theme-muted hover:text-theme-primary transition"
                      >
                        {p.enabled ? (
                          <ToggleRight className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-theme-muted" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        title={isZh ? "删除提示词" : "Delete Prompt"}
                        className="text-theme-muted hover:text-red-500 transition p-0.5"
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

        {/* Right: Prompt Editor Pane */}
        <div className="flex-1 flex flex-col bg-theme-card/10 overflow-y-auto">
          {selectedPromptId ? (
            <div className="p-6 max-w-4xl space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider font-mono text-sky-500 font-semibold">
                    {activeCategory} {isZh ? "提示词配置" : "Prompt Configuration"}
                  </div>
                  <div className="text-sm font-semibold text-theme-primary">
                    {editName || (isZh ? "未命名提示词" : "Untitled Prompt")}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditEnabled(!editEnabled)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition ${
                      editEnabled
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        : "bg-theme-card-muted text-theme-muted border-theme-subtle"
                    }`}
                  >
                    {editEnabled ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>{isZh ? "生效中" : "Active"}</span>
                      </>
                    ) : (
                      <span>{isZh ? "已禁用" : "Disabled"}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium shadow-sm transition"
                  >
                    {saveSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{isZh ? "已保存" : "Saved"}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>{isZh ? "保存" : "Save"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-4 bg-theme-card p-5 rounded-xl border border-theme-subtle">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-theme-muted">{isZh ? "提示词名称" : "Prompt Name"}</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={isZh ? "例如：本地工程开发指令 / 前端代码规范" : "e.g. Hexo Blog Engineering Directives"}
                    className="w-full px-3 py-2 bg-theme-base text-theme-primary border border-theme-subtle rounded-lg text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-theme-muted">{isZh ? "功能描述" : "Description"}</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={isZh ? "简述该提示词的使用场景或触发条件" : "Short description of when this prompt is applied"}
                    className="w-full px-3 py-2 bg-theme-base text-theme-primary border border-theme-subtle rounded-lg text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-theme-muted">{isZh ? "提示词内容 / 执行指令" : "Prompt Content"}</label>
                    <span className="text-[10px] font-mono text-theme-muted">
                      {editContent.length} {isZh ? "字" : "chars"}
                    </span>
                  </div>
                  <textarea
                    rows={16}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder={isZh ? "在此输入具体的指令规范、安全约束或行为准则..." : "Enter instructions, constraints, or behavioral guidelines..."}
                    className="w-full p-3.5 bg-theme-base text-theme-primary font-mono text-xs border border-theme-subtle rounded-lg focus:outline-none focus:border-sky-500 leading-relaxed resize-y"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-theme-muted">
              {isZh ? "在左侧选择或新建一条提示词以开始编辑" : "Select or create a prompt on the left to begin editing."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
