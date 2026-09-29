import React from "react";
import { Server } from "lucide-react";
import type { McpStatus, TunnelStatusDto } from "../../types.js";

interface McpServersPageProps {
  mcpStatus: McpStatus | null;
  tunnelStatus: TunnelStatusDto | null;
}

import { useTranslation } from "../../i18n/useTranslation.js";

export const McpServersPage: React.FC<McpServersPageProps> = ({
  mcpStatus,
  tunnelStatus,
}) => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const isTunnelConnected =
    tunnelStatus?.status === "Connected" ||
    tunnelStatus?.control_plane_connected === true;

  const servers = [
    {
      id: "srv-core",
      name: isZh ? "Nexus 核心 MCP 服务" : "Nexus Core MCP Server",
      description: isZh ? "运行在 18080 端口的标准模型上下文协议回环服务" : "Local Model Context Protocol loopback server on standard port 18080",
      endpoint: "http://127.0.0.1:18080/mcp",
      protocol: "2026-07-28",
      toolsCount: mcpStatus?.toolsCount || 332,
      transport: "HTTP POST / SSE Stream",
      status: mcpStatus && !mcpStatus.paused ? (isZh ? "已连接" : "Connected") : (isZh ? "待命" : "Standby"),
    },
    {
      id: "srv-windows",
      name: isZh ? "Windows 原生执行服务" : "Windows Native Execution Server",
      description: isZh ? "提供 Win32 API、文件系统与进程控制的本地原生 Provider" : "Direct local OS provider for Win32 API, filesystem, and process controls",
      endpoint: "ipc://nexus-win32-runner",
      protocol: "Native RPC",
      toolsCount: 332,
      transport: "Local Windows JobObject / Named Pipe",
      status: isZh ? "已连接" : "Connected",
    },
    {
      id: "srv-bridge",
      name: isZh ? "Nexus OAuth 与 MCP 桥接网关" : "Nexus OAuth & MCP Bridge",
      description: isZh ? "面向 Gemini Spark 与 Claude Desktop 的受保护反向代理桥接" : "Protected OAuth 2.0 reverse bridge for Gemini Spark and Claude Desktop",
      endpoint: "http://127.0.0.1:0/mcp",
      protocol: "OAuth 2.0 / Bearer RFC 6749",
      toolsCount: 8,
      transport: "Reverse Proxy Loopback",
      status: isTunnelConnected ? (isZh ? "已连接" : "Connected") : (isZh ? "待命" : "Standby"),
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "MCP 服务节点" : "MCP Servers"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "模型上下文协议端点、传输层与鉴权连接状态"
              : "Model Context Protocol Endpoints, Transport Layers & Authentication Status"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
        {servers.map((srv) => (
          <div
            key={srv.id}
            className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
                Endpoint Node
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                  srv.status === "Connected"
                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                    : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                }`}
              >
                ● {srv.status}
              </span>
            </div>

            <div>
              <div className="text-sm font-semibold text-theme-primary">{srv.name}</div>
              <div className="text-xs text-theme-muted mt-1 leading-relaxed">
                {srv.description}
              </div>
            </div>

            <div className="space-y-2 text-xs pt-2 border-t border-theme-subtle/50">
              <div className="flex justify-between py-1">
                <span className="text-theme-muted">Endpoint</span>
                <span className="font-mono text-theme-primary truncate max-w-[140px]">
                  {srv.endpoint}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-theme-muted">Protocol</span>
                <span className="font-mono text-theme-secondary">{srv.protocol}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-theme-muted">Exposed Tools</span>
                <span className="font-mono text-sky-500 font-semibold">{srv.toolsCount} Tools</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
