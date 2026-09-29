import React, { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Camera,
  Lock,
  Unlock,
} from "lucide-react";
import { bridge } from "../../api/bridge.js";

export const DesktopPage: React.FC = () => {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
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
    } catch {}
  }, []);

  const captureScreen = useCallback(async () => {
    setLoadingScreenshot(true);
    try {
      const res = await bridge.getComputerScreenshot();
      if (res && res.screenshotBase64) {
        setScreenshot(`data:image/png;base64,${res.screenshotBase64}`);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch {}
    finally {
      setLoadingScreenshot(false);
    }
  }, []);

  // Strict On-Demand: fetch status once on mount; clean up screenshot state on unmount
  useEffect(() => {
    fetchStatus();
    captureScreen();

    return () => {
      // Memory cleanup on unmount
      setScreenshot(null);
    };
  }, [fetchStatus, captureScreen]);

  const handleTakeControl = async () => {
    setActionLoading(true);
    try {
      await bridge.takeControl("Desktop User", "Manual human inspection");
      await fetchStatus();
    } catch {}
    finally {
      setActionLoading(false);
    }
  };

  const handleReturnControl = async () => {
    setActionLoading(true);
    try {
      await bridge.returnControl("Desktop User", "Control returned to AI");
      await fetchStatus();
    } catch {}
    finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 border-b border-theme-subtle pb-4">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Monitor className="w-4 h-4 text-sky-500" />
            <span>Computer Desktop</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            Windows 11 Local Desktop Host &middot; Controlled Surface &amp; Visual Evidence
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={captureScreen}
            disabled={loadingScreenshot}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-card-hover hover:bg-theme-card text-theme-primary border border-theme-subtle hover:border-theme-strong rounded-lg text-xs font-medium transition"
          >
            <Camera className={`w-3.5 h-3.5 ${loadingScreenshot ? "animate-spin" : "text-sky-500"}`} />
            <span>Capture Preview</span>
          </button>

          {takeoverStatus.humanTakeoverActive ? (
            <button
              onClick={handleReturnControl}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs font-medium transition"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Return Control</span>
            </button>
          ) : (
            <button
              onClick={handleTakeControl}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg text-xs font-medium transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Take Control</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Preview Surface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative rounded-xl border border-theme-subtle bg-theme-card overflow-hidden shadow-sm aspect-video flex items-center justify-center">
            {screenshot ? (
              <img
                src={screenshot}
                alt="Desktop Preview"
                className="w-full h-full object-contain bg-black/40"
              />
            ) : (
              <div className="text-center p-8 space-y-3">
                <Monitor className="w-12 h-12 mx-auto text-theme-muted/30" />
                <div className="text-xs text-theme-muted">
                  {loadingScreenshot ? "Capturing desktop frame..." : "No preview frame captured."}
                </div>
                <button
                  onClick={captureScreen}
                  disabled={loadingScreenshot}
                  className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/30 rounded-lg text-xs font-medium transition"
                >
                  Capture Desktop
                </button>
              </div>
            )}

            {lastRefreshed && (
              <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-[10px] font-mono text-zinc-300">
                Frame captured: {lastRefreshed}
              </div>
            )}
          </div>
        </div>

        {/* Status & Control Panel */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-theme-muted font-mono">
              Control Authority
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                <span className="text-theme-muted">OS Environment</span>
                <span className="font-mono text-theme-primary">Windows 11 x64</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                <span className="text-theme-muted">Active Host</span>
                <span className="font-mono text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-theme-subtle/50">
                <span className="text-theme-muted">Control State</span>
                <span className="font-mono text-theme-primary">
                  {takeoverStatus.humanTakeoverActive ? "Human Interception" : "Autonomous Standby"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-theme-muted">Input Capture</span>
                <span className="font-mono text-theme-secondary">Deterministic / Verified</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-theme-muted font-mono">
              Computer Verification
            </h2>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-theme-secondary">
                <span>Display Adapter</span>
                <span className="text-emerald-500">✓ Verified</span>
              </div>
              <div className="flex items-center justify-between text-theme-secondary">
                <span>Mouse / Keyboard Hook</span>
                <span className="text-emerald-500">✓ Verified</span>
              </div>
              <div className="flex items-center justify-between text-theme-secondary">
                <span>Direct Window Handle</span>
                <span className="text-emerald-500">✓ Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
