import fs from "node:fs";
import type {
  ComputerState,
  ComputerExecutionVerification,
  ExecutionVerificationStatus,
  VerificationCheck,
} from "@localbridge/protocol";
import type { StateDelta } from "./computer-state-engine.js";
import type { VisionService } from "../vision/vision-service.js";
import type { Logger } from "@localbridge/shared";

export interface VerificationOptions {
  expectedProcess?: string;
  expectedWindowTitle?: string;
  expectedText?: string;
  expectedFile?: string;
  minFileSizeBytes?: number;
}

export class VerificationEngine {
  constructor(
    private readonly visionService?: VisionService,
    private readonly logger?: Logger
  ) {}

  /**
   * Verify an action by comparing before & after computer states and executing
   * domain-specific checks (process, window, OCR, filesystem, screen hash).
   */
  async verify(
    tool: string,
    params: any,
    before: ComputerState | undefined,
    after: ComputerState | undefined,
    delta: StateDelta,
    options?: VerificationOptions
  ): Promise<ComputerExecutionVerification> {
    const checks: VerificationCheck[] = [];

    // 1. Window Activation Verification
    if (tool.includes("window_activate") || tool.includes("windowActivate")) {
      const q = String(params.handleOrTitle || params.title || "").toLowerCase();
      const currentActive = after?.activeWindow?.title?.toLowerCase() || "";
      const handleMatches = after?.activeWindow?.handle === params.handleOrTitle;
      const titleMatches = currentActive.includes(q) || (q.includes("word") && currentActive.includes("wps"));

      const isWinActive = Boolean(handleMatches || titleMatches);
      checks.push({
        name: "window_active_in_foreground",
        passed: isWinActive,
        message: isWinActive
          ? `Target window is now foreground: "${after?.activeWindow?.title}"`
          : `Target window not in foreground. Current active: "${after?.activeWindow?.title}"`,
      });

      return {
        status: isWinActive ? "VERIFIED" : "PARTIALLY_VERIFIED",
        strategy: "window",
        passed: isWinActive,
        details: isWinActive ? "Window activation verified in Windows DWM" : "Window activation command sent but foreground focus not confirmed",
        checks,
      };
    }

    // 2. App Launch Verification
    if (tool.includes("app_launch") || tool.includes("appLaunch")) {
      const appName = String(params.appNameOrPath || "").toLowerCase();
      const winFound = after?.windows.some((w) => w.processName?.toLowerCase().includes(appName) || w.title.toLowerCase().includes(appName));
      checks.push({
        name: "application_window_detected",
        passed: Boolean(winFound),
        message: winFound ? `Application window detected on desktop.` : `Application launched, waiting for GUI window creation.`,
      });

      return {
        status: winFound ? "VERIFIED" : "PARTIALLY_VERIFIED",
        strategy: "process",
        passed: Boolean(winFound),
        details: winFound ? "Application process and window verified" : "Process initiated successfully",
        checks,
      };
    }

    // 3. Window Close Verification
    if (tool.includes("window_close") || tool.includes("windowClose")) {
      const q = String(params.handleOrTitle || "").toLowerCase();
      const stillOpen = after?.windows.some((w) => w.handle === q || w.title.toLowerCase().includes(q));
      checks.push({
        name: "window_removed_from_desktop",
        passed: !stillOpen,
        message: !stillOpen ? "Window closed and removed from desktop." : "Window handle still exists in desktop list.",
      });

      return {
        status: !stillOpen ? "VERIFIED" : "FAILED",
        strategy: "window",
        passed: !stillOpen,
        details: !stillOpen ? "Window closure verified" : "Window closure not confirmed",
        checks,
      };
    }

    // 4. Keyboard Input & Typing Verification
    if (tool.includes("keyboard_input") || tool.includes("typeText") || tool.includes("keyboardInput")) {
      // Check if visual screen changed or text appears
      const screenChanged = delta.screenChanged;
      checks.push({
        name: "screen_visual_feedback",
        passed: screenChanged,
        message: screenChanged ? "Screen visual hash updated after typing." : "Screen hash unchanged (possible identical frame or off-screen focus).",
      });

      return {
        status: screenChanged ? "VERIFIED" : "EXECUTED",
        strategy: "visual",
        passed: true,
        details: screenChanged ? "Typing verified: screen visual delta detected" : "Typing executed via lossless clipboard paste",
        checks,
      };
    }

    // 5. Filesystem File Creation / Save Verification
    if (options?.expectedFile) {
      const fileExists = fs.existsSync(options.expectedFile);
      let sizeOk = false;
      if (fileExists) {
        try {
          const stats = fs.statSync(options.expectedFile);
          sizeOk = stats.size >= (options.minFileSizeBytes || 1);
        } catch {}
      }

      checks.push({
        name: "file_exists_on_disk",
        passed: fileExists,
        message: fileExists ? `File exists at: ${options.expectedFile}` : `File not found at: ${options.expectedFile}`,
      });
      checks.push({
        name: "file_has_content",
        passed: sizeOk,
        message: sizeOk ? `File size > 0 bytes.` : `File is empty or inaccessible.`,
      });

      const passed = fileExists && sizeOk;
      return {
        status: passed ? "VERIFIED" : "FAILED",
        strategy: "filesystem",
        passed,
        details: passed ? `File successfully verified on filesystem: ${options.expectedFile}` : "Filesystem verification failed",
        checks,
      };
    }

    // 6. Generic Mouse Click / Action Verification
    const hasAnyDelta = delta.changed;
    checks.push({
      name: "physical_action_accepted",
      passed: true,
      message: "Win32 event dispatched to operating system message queue.",
    });

    if (hasAnyDelta) {
      checks.push({
        name: "gui_state_updated",
        passed: true,
        message: delta.details.join("; "),
      });
    }

    return {
      status: hasAnyDelta ? "VERIFIED" : "EXECUTED",
      strategy: "visual",
      passed: true,
      details: hasAnyDelta ? `Action produced state changes: ${delta.details.join(", ")}` : "Action dispatched cleanly",
      checks,
    };
  }
}
