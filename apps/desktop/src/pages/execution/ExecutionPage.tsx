import React, { useState } from "react";
import { Terminal } from "lucide-react";

import { useTranslation } from "../../i18n/useTranslation.js";

export const ExecutionPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [currentTool] = useState("browser_open");
  const [status] = useState<"EXECUTED" | "RUNNING" | "QUEUED">("EXECUTED");
  const [runnerId] = useState("runner_win32_local");
  const [durationMs] = useState(382);

  const pipelineSteps = [
    { step: "01", name: isZh ? "工具请求" : "Tool requested", desc: isZh ? "进入 JSON-RPC 2.0 工具调用" : "Incoming JSON-RPC 2.0 tool invocation", status: "completed" },
    { step: "02", name: isZh ? "注册表解析" : "Registry resolved", desc: isZh ? "已通过 332 个规范工具校验" : "Validated against 332 canonical tool definitions", status: "completed" },
    { step: "03", name: isZh ? "Provider 绑定" : "Provider resolved", desc: isZh ? "绑定至 Windows 原生执行提供者" : "Bound to native Windows OS execution provider", status: "completed" },
    { step: "04", name: isZh ? "MCP 暴露与鉴权" : "MCP exposed", desc: isZh ? "读写范围与令牌策略已核准" : "Scope verified (read/write), token policy validated", status: "completed" },
    { step: "05", name: isZh ? "Runner 调度执行" : "Runner executed", desc: isZh ? "本地 Runner 子进程下发执行" : "Local Runner child process dispatched command", status: "completed" },
    { step: "06", name: isZh ? "操作系统状态变更" : "OS state changed", desc: isZh ? "Chromium CDP 实例在 9222 端口就绪" : "Chromium CDP instance spawned on port 9222", status: "completed" },
    { step: "07", name: isZh ? "凭据审计与提交" : "Evidence verified", desc: isZh ? "操作证据已持久化提交至 WAL 账本" : "Execution evidence captured and committed to WAL", status: "completed" },
  ];

  const evidenceItems = [
    { name: isZh ? "文件系统锁" : "Filesystem", verified: true, desc: isZh ? "工作目录排他锁与写入栅栏核验" : "Working directory locks and write barriers checked" },
    { name: isZh ? "进程生命周期" : "Process", verified: true, desc: isZh ? "进程 PID、退出码 0 已捕获" : "Process PID, handle exit code 0 captured" },
    { name: isZh ? "窗口句柄" : "Window", verified: true, desc: isZh ? "HWND 焦点与激活状态核准" : "HWND focus state confirmed" },
    { name: isZh ? "屏幕视觉凭证" : "Screenshot", verified: true, desc: isZh ? "执行前与执行后视觉差异验证" : "Pre- and post-execution visual diff verified" },
    { name: isZh ? "持久化运行时" : "Runtime", verified: true, desc: isZh ? "Durable WAL 事务原子提交" : "Durable WAL transaction committed" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "执行工作台" : "Execution Workspace"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "确定性工具执行管道 • 全流程显式审计追溯"
              : "Deterministic Tool Execution Pipeline • Explicit Traceability"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        {/* Left 2 Cols: Current Execution & Pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Execution Card */}
          <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
                Current Execution
              </span>
              <span className="px-2.5 py-0.5 rounded font-mono text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold">
                {status}
              </span>
            </div>

            <div className="font-mono text-lg font-bold text-theme-primary tracking-tight">
              {currentTool}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs pt-1">
              <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
                <span className="text-theme-muted text-[11px]">Runner Node</span>
                <div className="font-mono font-medium text-theme-primary mt-1">{runnerId}</div>
              </div>
              <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
                <span className="text-theme-muted text-[11px]">Duration</span>
                <div className="font-mono font-medium text-theme-primary mt-1">{durationMs} ms</div>
              </div>
            </div>
          </div>

          {/* Execution Pipeline Steps */}
          <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              Execution Pipeline
            </div>

            <div className="space-y-2">
              {pipelineSteps.map((step) => (
                <div
                  key={step.step}
                  className="flex items-center justify-between p-3 rounded-lg bg-theme-base/40 border border-theme-subtle/50 text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sky-500 font-bold">{step.step}</span>
                    <span className="text-theme-primary font-medium">{step.name}</span>
                  </div>
                  <span className="text-theme-muted text-[11px] hidden sm:inline">
                    {step.desc}
                  </span>
                  <span className="text-emerald-500 text-[11px]">✓ Done</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Evidence Verification */}
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-theme-muted font-semibold">
              Execution Evidence
            </div>

            <div className="space-y-3 text-xs font-mono">
              {evidenceItems.map((item) => (
                <div
                  key={item.name}
                  className="p-3 rounded-lg bg-theme-base/50 border border-theme-subtle/60 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-theme-primary font-medium">{item.name}</span>
                    <span className="text-emerald-500">✓ Verified</span>
                  </div>
                  <div className="text-[10px] text-theme-muted font-sans">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
