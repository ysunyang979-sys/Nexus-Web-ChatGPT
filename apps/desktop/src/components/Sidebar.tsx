import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LayoutDashboard,
  FolderLock,
  Sparkles,
  Brain,
  BookOpen,
  FileCode,
  Settings,
} from "lucide-react";
import nexusLogo from "../assets/nexus.png";
import type { ServerStatus, UserExperienceMode } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

export type NavPage =
  | "overview"
  | "projects"
  | "desktop"
  | "files"
  | "applications"
  | "browser"
  | "execution"
  | "ledger"
  | "runtime"
  | "mcp-servers"
  | "mcp-tools"
  | "mcp-registry"
  | "skills"
  | "memory"
  | "knowledge"
  | "prompts"
  | "settings"
  // Legacy compatibility aliases
  | "jobs"
  | "approvals"
  | "tokens"
  | "connections"
  | "activity"
  | "rules"
  | "storage";

interface NavItem {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  serverStatus: ServerStatus | null;
  runnersCount?: number;
  uxMode?: UserExperienceMode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  serverStatus,
  runnersCount,
  uxMode: _uxMode = "standard",
}) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [collapsed, setCollapsed] = useState(false);

  const effectiveRunners =
    runnersCount !== undefined && runnersCount > 0
      ? runnersCount
      : serverStatus?.runners_connected || 0;

  const isHealthy = serverStatus !== null && effectiveRunners > 0;

  // Primary user-facing navigation groups
  const primaryGroups: NavGroup[] = [
    {
      id: "workspace",
      label: isZh ? "工作区" : "WORKSPACE",
      items: [
        { id: "overview", label: isZh ? "工作台概览" : "Overview", icon: LayoutDashboard },
        { id: "projects", label: isZh ? "项目管理" : "Projects", icon: FolderLock },
      ],
    },
    {
      id: "intelligence",
      label: isZh ? "智能管理" : "INTELLIGENCE",
      items: [
        { id: "skills", label: isZh ? "技能中心" : "Skills", icon: Sparkles },
        { id: "memory", label: isZh ? "记忆库" : "Memory", icon: Brain },
        { id: "knowledge", label: isZh ? "知识库" : "Knowledge", icon: BookOpen },
        { id: "prompts", label: isZh ? "提示词管理" : "Prompt", icon: FileCode },
      ],
    },
  ];

  // Daily navigation groups strictly focused on Workspace & Intelligence.
  // Advanced tools (Computer, Execution, MCP) are accessible via Settings.
  const navGroups: NavGroup[] = primaryGroups;

  // Accordion state: default workspace and intelligence are expanded
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    workspace: true,
    intelligence: true,
  });

  // Auto-expand group when user visits a child page
  useEffect(() => {
    for (const grp of navGroups) {
      if (grp.items.some((item) => item.id === currentPage)) {
        setExpandedGroups((prev) => {
          if (!prev[grp.id]) {
            return { ...prev, [grp.id]: true };
          }
          return prev;
        });
        break;
      }
    }
  }, [currentPage]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <aside
      className={`h-screen bg-theme-sidebar border-r border-theme-subtle flex flex-col justify-between select-none shrink-0 z-20 transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[228px]"
      }`}
    >
      {/* Top Header & Brand */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          className={`h-14 border-b border-theme-subtle flex items-center transition-all shrink-0 ${
            collapsed ? "px-2 justify-center" : "px-3.5 justify-between"
          }`}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={nexusLogo}
                alt="Nexus"
                className="w-6 h-6 rounded-md shadow-sm object-cover border border-theme-subtle shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/nexus.png";
                }}
              />
              <span className="font-semibold text-xs tracking-wider text-theme-primary">
                NEXUS
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20">
                1.2.0
              </span>
            </div>
          ) : (
            <img
              src={nexusLogo}
              alt="Nexus"
              className="w-6 h-6 rounded-md shadow-sm object-cover border border-theme-subtle"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/nexus.png";
              }}
            />
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover transition"
            title={
              collapsed
                ? isZh
                  ? "展开侧边栏"
                  : "Expand Sidebar"
                : isZh
                ? "收起侧边栏"
                : "Collapse Sidebar"
            }
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Groups List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-2">
          {navGroups.map((group) => {
            const isExpanded = expandedGroups[group.id] ?? true;

            if (collapsed) {
              return (
                <div key={group.id} className="space-y-1 py-1 border-b border-theme-subtle/40 last:border-b-0">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectPage(item.id)}
                        title={item.label}
                        className={`w-full flex items-center justify-center p-2 rounded-lg transition ${
                          isActive
                            ? "bg-sky-500/10 text-sky-500 font-semibold shadow-xs border border-sky-500/20"
                            : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/60 border border-transparent"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={group.id} className="space-y-0.5">
                {/* 1st Level Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover/40 transition"
                >
                  <span className="font-semibold">{group.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-theme-muted/70" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-theme-muted/70" />
                  )}
                </button>

                {/* 2nd Level Items */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectPage(item.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition ${
                            isActive
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20 shadow-xs"
                              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/50 border border-transparent"
                          }`}
                        >
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? "text-sky-500" : "text-theme-muted"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: Settings & Status Strip */}
      <div className="p-2 border-t border-theme-subtle space-y-1.5 shrink-0 bg-theme-sidebar">
        <button
          type="button"
          onClick={() => onSelectPage("settings")}
          title={isZh ? "应用设置" : "Settings"}
          className={`w-full flex items-center rounded-md text-xs transition ${
            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2"
          } ${
            currentPage === "settings"
              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20 shadow-xs"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card-hover/50 border border-transparent"
          }`}
        >
          <Settings
            className={`w-3.5 h-3.5 ${
              currentPage === "settings" ? "text-sky-500" : "text-theme-muted"
            }`}
          />
          {!collapsed && <span>{isZh ? "应用设置" : "Settings"}</span>}
        </button>

        {!collapsed ? (
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-theme-muted">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isHealthy ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>{isZh ? (isHealthy ? "系统正常运行" : "服务异常") : (isHealthy ? "Engine Ready" : "Standby")}</span>
            </span>
            <span className="text-[10px]">v1.2.0</span>
          </div>
        ) : (
          <div
            className="py-1 flex justify-center"
            title={isZh ? (isHealthy ? "系统正常运行" : "服务异常") : (isHealthy ? "Engine Ready" : "Standby")}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
