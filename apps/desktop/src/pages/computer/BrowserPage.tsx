import React, { useState } from "react";
import { Globe } from "lucide-react";

import { useTranslation } from "../../i18n/useTranslation.js";

export const BrowserPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [headless, setHeadless] = useState(true);
  const [currentUrl, setCurrentUrl] = useState("http://127.0.0.1:18080/mcp");
  const [activeSession] = useState<string | null>("session-browser-default");

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "浏览器自动化" : "Browser Automation"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "Chromium CDP 确定性网页自动化 • 页面导航、DOM 检索与表单填写"
              : "Deterministic Chromium & CDP Automation • Page Navigation, DOM Query & Form Input"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHeadless(!headless)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
              headless
                ? "bg-sky-500/10 text-sky-500 border-sky-500/30"
                : "bg-amber-500/10 text-amber-500 border-amber-500/30"
            }`}
          >
            {headless
              ? isZh ? "无头模式：开启" : "Headless Mode: ON"
              : isZh ? "无头模式：关闭 (可见窗口)" : "Headless Mode: OFF (Visual)"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-6 max-w-4xl">
        {/* Active Browser Target */}
        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4 shadow-sm">
          <div className="text-xs font-mono text-sky-500 uppercase tracking-wider font-semibold">
            Active Navigation Target
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              className="flex-1 px-3 py-2 bg-theme-base text-theme-primary border border-theme-subtle rounded-lg text-xs font-mono focus:outline-none focus:border-sky-500"
            />
            <span className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              CDP Ready
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
            <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
              <div className="text-theme-muted text-[11px]">Engine</div>
              <div className="font-mono font-medium text-theme-primary mt-1">Chromium CDP</div>
            </div>
            <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
              <div className="text-theme-muted text-[11px]">Viewport</div>
              <div className="font-mono font-medium text-theme-primary mt-1">1280 &times; 800</div>
            </div>
            <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
              <div className="text-theme-muted text-[11px]">Session ID</div>
              <div className="font-mono font-medium text-theme-primary mt-1 truncate">
                {activeSession}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-theme-base/60 border border-theme-subtle/60">
              <div className="text-theme-muted text-[11px]">Evidence Capture</div>
              <div className="font-mono font-medium text-emerald-500 mt-1">DOM / Snapshot</div>
            </div>
          </div>
        </div>

        {/* Verification & MCP Support */}
        <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
          <div className="text-xs font-mono text-theme-muted uppercase tracking-wider font-semibold">
            Supported MCP Browser Primitives
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-theme-secondary py-1 border-b border-theme-subtle/40">
              <span>browser_open (url, headless)</span>
              <span className="text-emerald-500">✓ Enabled</span>
            </div>
            <div className="flex items-center justify-between text-theme-secondary py-1 border-b border-theme-subtle/40">
              <span>browser_navigate (url)</span>
              <span className="text-emerald-500">✓ Enabled</span>
            </div>
            <div className="flex items-center justify-between text-theme-secondary py-1 border-b border-theme-subtle/40">
              <span>browser_click (selector)</span>
              <span className="text-emerald-500">✓ Enabled</span>
            </div>
            <div className="flex items-center justify-between text-theme-secondary py-1">
              <span>browser_screenshot ()</span>
              <span className="text-emerald-500">✓ Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
