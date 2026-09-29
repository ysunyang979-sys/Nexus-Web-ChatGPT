import React from "react";
import { Layers } from "lucide-react";

import { useTranslation } from "../../i18n/useTranslation.js";

export const ToolRegistryPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const capabilities = [
    {
      provider: "Windows OS Native Provider",
      toolsRange: "localbridge_windows_*",
      target: "Win32 C++ / Koffi FFI",
      scope: "read / write / system",
      ledger: "Required (WAL)",
      evidence: "HWND, Process ID, Screenshot",
    },
    {
      provider: "Filesystem Provider",
      toolsRange: "localbridge_fs_*",
      target: "Node.js Native fs/promises",
      scope: "read / write",
      ledger: "Required (WAL)",
      evidence: "File Barrier Sync, SHA-256 Digest",
    },
    {
      provider: "Process & Terminal Provider",
      toolsRange: "localbridge_process_*, localbridge_command_*",
      target: "Windows JobObject / node-pty",
      scope: "write / admin",
      ledger: "Required (WAL)",
      evidence: "Exit Code, Stdout/Stderr Hash, PID",
    },
    {
      provider: "Chromium Browser Provider",
      toolsRange: "localbridge_browser_*",
      target: "Chrome DevTools Protocol (CDP)",
      scope: "read / write",
      ledger: "Required (WAL)",
      evidence: "DOM State, Viewport Frame Diff",
    },
    {
      provider: "Language Server & Code Provider",
      toolsRange: "localbridge_code_*, localbridge_session_*",
      target: "typescript-language-server / Git",
      scope: "read / write",
      ledger: "Required (WAL)",
      evidence: "Git Commit SHA, LSP Diagnostic Set",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "能力注册表矩阵" : "Capability Registry Matrix"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "工具到 Provider 映射绑定 • 执行目标与核验凭证契约"
              : "Tool-to-Provider Binding • Execution Targets & Verification Evidence Models"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-theme-subtle bg-theme-card overflow-hidden shadow-sm max-w-5xl">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-theme-card-muted border-b border-theme-subtle text-theme-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 font-semibold">Provider Engine</th>
              <th className="py-3 px-4 font-semibold">Tool Pattern</th>
              <th className="py-3 px-4 font-semibold">Execution Target</th>
              <th className="py-3 px-4 font-semibold">Scope</th>
              <th className="py-3 px-4 font-semibold">Ledger Requirement</th>
              <th className="py-3 px-4 font-semibold">Evidence Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-subtle/50">
            {capabilities.map((c) => (
              <tr key={c.provider} className="hover:bg-theme-card-hover/40 transition">
                <td className="py-3 px-4 font-semibold text-theme-primary">{c.provider}</td>
                <td className="py-3 px-4 text-sky-500">{c.toolsRange}</td>
                <td className="py-3 px-4 text-theme-muted">{c.target}</td>
                <td className="py-3 px-4 text-theme-secondary">{c.scope}</td>
                <td className="py-3 px-4 text-emerald-500">{c.ledger}</td>
                <td className="py-3 px-4 text-theme-muted text-[11px]">{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
