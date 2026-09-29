import React, { useState } from "react";
import { AppWindow } from "lucide-react";

interface ManagedApp {
  id: string;
  name: string;
  processName: string;
  category: string;
  windowTitle: string;
  status: "Active" | "Standby" | "Available";
}

const APPS: ManagedApp[] = [
  {
    id: "app-blender",
    name: "Blender 3D",
    processName: "blender.exe",
    category: "Graphics / 3D DCC",
    windowTitle: "Blender [Default Scene]",
    status: "Available",
  },
  {
    id: "app-word",
    name: "Microsoft Word",
    processName: "winword.exe",
    category: "Office / Document Editing",
    windowTitle: "Document1 - Word",
    status: "Available",
  },
  {
    id: "app-vscode",
    name: "Visual Studio Code",
    processName: "code.exe",
    category: "Engineering / IDE",
    windowTitle: "Nexus-Web-ChatGPT - Visual Studio Code",
    status: "Active",
  },
  {
    id: "app-pwsh",
    name: "PowerShell Host",
    processName: "pwsh.exe",
    category: "System Execution",
    windowTitle: "Administrator: Windows PowerShell",
    status: "Active",
  },
  {
    id: "app-edge",
    name: "Microsoft Edge / Chrome",
    processName: "msedge.exe",
    category: "Browser Automation",
    windowTitle: "Nexus LocalBridge Control Plane",
    status: "Standby",
  },
];

import { useTranslation } from "../../i18n/useTranslation.js";

export const ApplicationsPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [selectedApp, setSelectedApp] = useState<ManagedApp>(APPS[0]);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <AppWindow className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "托管应用与窗口" : "Managed Applications"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "已注册的 Windows 桌面应用 • 原生进程与窗口句柄"
              : "Registered Windows Desktop Applications • Native Process & Window Hooks"}
          </p>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Apps List */}
        <div className="w-96 border-r border-theme-subtle bg-theme-base/60 overflow-y-auto divide-y divide-theme-subtle">
          {APPS.map((app) => {
            const isSelected = app.id === selectedApp.id;
            return (
              <div
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className={`p-4 cursor-pointer transition flex items-start justify-between gap-3 ${
                  isSelected
                    ? "bg-theme-card border-l-2 border-l-sky-500 text-theme-primary"
                    : "hover:bg-theme-card/40 text-theme-secondary hover:text-theme-primary"
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-xs truncate flex items-center gap-2">
                    <span>{app.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        app.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-theme-card-muted text-theme-muted border border-theme-subtle"
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-theme-muted font-mono">{app.processName}</div>
                  <div className="text-[10px] text-theme-muted/70">{app.category}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* App Inspector */}
        <div className="flex-1 p-6 bg-theme-card/10 overflow-y-auto space-y-6">
          <div className="max-w-2xl space-y-5">
            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-4">
              <div className="text-xs font-mono text-sky-500 uppercase tracking-wider font-semibold">
                Application Profile
              </div>

              <div className="text-base font-semibold text-theme-primary">{selectedApp.name}</div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                  <span className="text-theme-muted">Process Image</span>
                  <span className="font-mono text-theme-primary">{selectedApp.processName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                  <span className="text-theme-muted">Window Caption</span>
                  <span className="font-mono text-theme-secondary truncate max-w-xs">
                    {selectedApp.windowTitle}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                  <span className="text-theme-muted">Category</span>
                  <span className="text-theme-primary">{selectedApp.category}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-theme-muted">Automation Hooks</span>
                  <span className="font-mono text-emerald-500">Win32 API &middot; Verified</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
              <div className="text-xs font-mono text-theme-muted uppercase tracking-wider font-semibold">
                Execution Capabilities
              </div>
              <p className="text-xs text-theme-muted leading-relaxed">
                Nexus controls desktop applications deterministically via Win32 UI automation, process handles, window activation, and direct input synthesis. No external cloud agents required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
