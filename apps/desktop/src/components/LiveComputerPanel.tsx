import React, { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Camera,
  Bot,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { bridge } from "../api/bridge.js";

export interface LiveComputerPanelProps {
  currentAgent?: string;
  currentApp?: string;
  currentAction?: string;
  taskStatus?: string;
}

export const LiveComputerPanel: React.FC<LiveComputerPanelProps> = ({
  currentAgent = "Autonomous Worker",
  currentApp = "Windows Desktop",
  currentAction = "Idle / Standby",
  taskStatus = "ready",
}) => {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [autoStream, setAutoStream] = useState(false);
  const [takeoverStatus, setTakeoverStatus] = useState<{
    humanTakeoverActive: boolean;
    aiLocked: boolean;
    takenBy?: string;
    reason?: string;
  }>({ humanTakeoverActive: false, aiLocked: false });
  const [actionLoading, setActionLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await bridge.getTakeoverStatus();
      if (status) {
        setTakeoverStatus(status);
      }
    } catch {
      // Quiet fallback
    }
  }, []);

  const captureScreen = useCallback(async () => {
    setLoadingScreenshot(true);
    try {
      const res = await bridge.getComputerScreenshot();
      if (res && res.screenshotBase64) {
        setScreenshot(`data:image/png;base64,${res.screenshotBase64}`);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoadingScreenshot(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoStream) return;
    captureScreen();
    const streamInterval = setInterval(captureScreen, 5000);
    return () => clearInterval(streamInterval);
  }, [autoStream, captureScreen]);

  const handleTakeControl = async () => {
    setActionLoading(true);
    try {
      await bridge.takeControl("Desktop User", "Human intervention via Live Computer Panel");
      await fetchStatus();
    } catch (e: any) {
      alert(`Take Control failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnControl = async () => {
    setActionLoading(true);
    try {
      await bridge.returnControl("Desktop User", "Human finished work, returning control to AI");
      await fetchStatus();
      await captureScreen();
    } catch (e: any) {
      alert(`Return Control failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-sky-500" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
            实机画面与智能体控制台
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {takeoverStatus.humanTakeoverActive ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Lock className="w-3 h-3" />
              人工接管中（AI 输入已锁定）
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Bot className="w-3 h-3" />
              AI 自主控制中
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Screen View on Left, Control & Context on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Screen Preview Container */}
        <div className="lg:col-span-2 relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-theme-subtle flex flex-col items-center justify-center text-slate-400">
          {screenshot ? (
            <img
              src={screenshot}
              alt="Windows 桌面实时画面"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center p-6 space-y-2">
              <Camera className="w-8 h-8 mx-auto opacity-40" />
              <div className="text-xs font-mono text-slate-400">暂无桌面捕获帧</div>
              <p className="text-[11px] text-slate-500 max-w-xs">
                点击“捕获单帧”可观察当前 Windows 桌面实时状态。
              </p>
            </div>
          )}

          {/* Action overlay bar */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-300">
            {lastRefreshed && <span>更新于: {lastRefreshed}</span>}
            <button
              onClick={() => setAutoStream(!autoStream)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                autoStream ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"
              }`}
            >
              实时流: {autoStream ? "已开启" : "已暂停"}
            </button>
            <button
              onClick={captureScreen}
              disabled={loadingScreenshot}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loadingScreenshot ? "animate-spin" : ""}`} />
              <span>捕获单帧</span>
            </button>
          </div>
        </div>

        {/* Cockpit Status & Takeover Controls */}
        <div className="space-y-3 flex flex-col justify-between">
          <div className="space-y-2.5 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[10px] text-theme-muted uppercase">当前执行智能体</div>
              <div className="font-semibold text-theme-primary truncate flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-sky-500" />
                {currentAgent}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[10px] text-theme-muted uppercase">当前活跃应用 / 窗口</div>
              <div className="font-semibold text-theme-primary truncate flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-emerald-500" />
                {currentApp}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[10px] text-theme-muted uppercase">当前动作 / 工具</div>
              <div className="text-theme-primary truncate font-medium">
                {currentAction}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-theme-card-muted border border-theme-subtle space-y-1">
              <div className="text-[10px] text-theme-muted uppercase">任务状态</div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {taskStatus.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Takeover Control Buttons */}
          <div className="pt-2 border-t border-theme-subtle space-y-2">
            {takeoverStatus.humanTakeoverActive ? (
              <button
                onClick={handleReturnControl}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm disabled:opacity-50"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>交还控制权给 AI</span>
              </button>
            ) : (
              <button
                onClick={handleTakeControl}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>人工接管控制</span>
              </button>
            )}
            <div className="text-[10px] text-theme-muted text-center leading-tight">
              {takeoverStatus.humanTakeoverActive
                ? "已严格锁定 AI 输入，您可以自由操作桌面。"
                : "立即暂停 AI 执行，由人工接管鼠标与键盘控制。"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
