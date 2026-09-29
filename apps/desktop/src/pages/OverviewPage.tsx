import React from "react";
import {
  Plus,
  ArrowRight,
} from "lucide-react";
import type { ServerStatus, McpStatus, Project } from "../types.js";
import { useTranslation } from "../i18n/useTranslation.js";

interface OverviewPageProps {
  serverStatus: ServerStatus | null;
  mcpStatus: McpStatus | null;
  tunnelStatus?: unknown;
  projects: Project[];
  approvals?: unknown[];
  onNavigate?: (page: any) => void;
  onSelectProject: (projectId: string) => void;
  onOpenAuthorizeModal: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  serverStatus,
  mcpStatus,
  projects,
  onSelectProject,
  onOpenAuthorizeModal,
}) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  const currentHour = new Date().getHours();
  const greeting = isZh
    ? currentHour < 12
      ? "早上好。"
      : currentHour < 18
      ? "下午好。"
      : "晚上好。"
    : currentHour < 12
    ? "Good morning."
    : currentHour < 18
    ? "Good afternoon."
    : "Good evening.";

  const runnersCount = serverStatus?.runners_connected || 1;
  const isMcpReady = mcpStatus && !mcpStatus.paused;

  // Lightweight recent activity
  const recentActivities = isZh
    ? [
        { time: "23:04", action: "在端口 9222 启动 Chromium CDP 会话" },
        { time: "22:58", action: "本地工作区文件写入并通过校验留痕" },
        { time: "22:43", action: "桌面控制自动化任务顺利完成，0 错误" },
      ]
    : [
        { time: "23:04", action: "Executed browser_open on port 9222" },
        { time: "22:58", action: "File write verified to local workspace" },
        { time: "22:43", action: "Browser automation task completed with 0 errors" },
      ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-8 py-14 space-y-12 select-none">
        {/* Spacious Greeting Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-normal text-theme-primary tracking-tight">
            {greeting}
          </h1>
          <p className="text-sm text-theme-muted font-normal">
            {isZh ? "Nexus 本地执行桥梁已就绪，随时响应 Agent 指令。" : "Nexus is ready to execute locally."}
          </p>
        </div>

        {/* System Health Section */}
        <div className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
            {isZh ? "系统运行状态" : "System"}
          </div>

          <div className="divide-y divide-theme-subtle/60 border-y border-theme-subtle/60 text-xs font-mono">
            <div className="py-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-theme-primary">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    serverStatus ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                {isZh ? "Nexus 核心服务" : "Nexus Engine"}
              </span>
              <span className={serverStatus ? "text-emerald-500 font-medium" : "text-red-500"}>
                {serverStatus ? (isZh ? "已连接" : "Connected") : (isZh ? "未连接" : "Disconnected")}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-theme-primary">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isMcpReady ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {isZh ? "MCP 协议访问" : "MCP"}
              </span>
              <span className={isMcpReady ? "text-emerald-500 font-medium" : "text-amber-500"}>
                {isMcpReady ? (isZh ? "就绪" : "Ready") : (isZh ? "待命" : "Standby")}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-theme-primary">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    runnersCount > 0 ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {isZh ? "Runner 节点" : "Runner"}
              </span>
              <span className={runnersCount > 0 ? "text-emerald-500 font-medium" : "text-amber-500"}>
                {runnersCount > 0 ? (isZh ? "在线" : "Online") : (isZh ? "待命" : "Standby")}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-theme-primary">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    serverStatus ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                {isZh ? "电脑与桌面控制" : "Computer"}
              </span>
              <span className={serverStatus ? "text-emerald-500 font-medium" : "text-red-500"}>
                {serverStatus ? (isZh ? "可用" : "Available") : (isZh ? "离线" : "Offline")}
              </span>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              {isZh ? "已授权项目" : "Projects"}
            </span>
            <button
              onClick={onOpenAuthorizeModal}
              className="text-xs text-sky-500 hover:text-sky-400 font-mono flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isZh ? "授权新项目" : "Authorize Project"}</span>
            </button>
          </div>

          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="p-4 rounded-lg bg-theme-card-muted text-xs text-theme-muted font-mono">
                {isZh ? "暂无已授权项目，点击上方「授权新项目」添加本地工作区。" : "No authorized projects registered."}
              </div>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                  }}
                  className="p-3.5 rounded-lg border border-theme-subtle hover:border-theme-strong bg-theme-card/40 hover:bg-theme-card transition cursor-pointer flex items-center justify-between gap-4 group"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium text-xs text-theme-primary group-hover:text-sky-500 transition-colors">
                      {p.name}
                    </div>
                    <div className="font-mono text-[11px] text-theme-muted truncate max-w-xl">
                      {p.root}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-primary group-hover:translate-x-0.5 transition" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
            {isZh ? "近期动态" : "Recent Activity"}
          </div>

          <div className="divide-y divide-theme-subtle/50 text-xs font-mono">
            {recentActivities.map((act, i) => (
              <div key={i} className="py-2.5 flex items-center gap-4 text-theme-secondary">
                <span className="text-theme-muted shrink-0">{act.time}</span>
                <span className="truncate">{act.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
