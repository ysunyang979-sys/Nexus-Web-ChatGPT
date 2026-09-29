import React from "react";
import { Cpu } from "lucide-react";
import type { ServerStatus } from "../../types.js";

import { useTranslation } from "../../i18n/useTranslation.js";

interface RuntimePageProps {
  serverStatus: ServerStatus | null;
}

export const RuntimePage: React.FC<RuntimePageProps> = ({ serverStatus }) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "运行时基础设施" : "Runtime & Infrastructure"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "本地 Node.js 引擎、Runner 工作进程与语言服务协议状态"
              : "Local Node.js Engine, Worker Processes & Language Server Protocol Status"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
        {/* Core Server Node */}
        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              Nexus Core Server
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              {serverStatus ? "ONLINE" : "STANDBY"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">Node.js Engine</span>
              <span className="font-mono text-theme-primary">v24.21.0</span>
            </div>
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">HTTP / Fastify Port</span>
              <span className="font-mono text-theme-primary">18080</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-theme-muted">Server Version</span>
              <span className="font-mono text-theme-secondary">
                {serverStatus?.version || "1.2.0"}
              </span>
            </div>
          </div>
        </div>

        {/* Local Runner Worker */}
        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              Execution Runner
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              CONNECTED
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">Target Architecture</span>
              <span className="font-mono text-theme-primary">win32-x64</span>
            </div>
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">Worker Process</span>
              <span className="font-mono text-theme-primary">JobObject Isolated</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-theme-muted">Active Runners</span>
              <span className="font-mono text-emerald-500">
                {serverStatus?.runners_connected || 1} Registered
              </span>
            </div>
          </div>
        </div>

        {/* LSP Language Server */}
        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              Language Server (LSP)
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-500 border border-sky-500/20">
              READY
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">Protocol Provider</span>
              <span className="font-mono text-theme-primary">typescript-language-server</span>
            </div>
            <div className="flex justify-between py-1 border-b border-theme-subtle/50">
              <span className="text-theme-muted">LSP Version</span>
              <span className="font-mono text-theme-primary">6.0.0</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-theme-muted">Diagnostics Mode</span>
              <span className="font-mono text-theme-secondary">Lazy / On-Demand</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
