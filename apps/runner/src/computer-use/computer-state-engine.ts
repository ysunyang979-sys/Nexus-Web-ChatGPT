import crypto from "node:crypto";
import type { ComputerState, WindowItem, AppItem, ScreenSnapshotResult } from "@localbridge/protocol";
import type { WindowsNativeCore, NativeScreenCaptureResult } from "./windows-native-core.js";
import type { Logger } from "@localbridge/shared";

export interface StateDelta {
  changed: boolean;
  windowChanged: boolean;
  activeTitleBefore?: string | null;
  activeTitleAfter?: string | null;
  screenChanged: boolean;
  screenHashBefore?: string;
  screenHashAfter?: string;
  cursorMoved: boolean;
  details: string[];
}

export class ComputerStateEngine {
  private lastKnownState: ComputerState | null = null;
  private lastCaptureTime = 0;
  private cachedWindows: WindowItem[] = [];
  private lastWindowsCacheTime = 0;

  constructor(
    private readonly nativeCore: WindowsNativeCore,
    private readonly logger?: Logger
  ) {}

  /**
   * Capture a full or lightweight snapshot of the computer state
   */
  async captureState(options?: {
    includeScreenshot?: boolean;
    includeWindows?: boolean;
    saveArtifact?: boolean;
  }): Promise<ComputerState> {
    const now = Date.now();
    const shouldCaptureScreenshot = options?.includeScreenshot !== false;
    const shouldCaptureWindows = options?.includeWindows !== false;

    let activeWin: WindowItem | null = null;
    let windows: WindowItem[] = [];

    if (shouldCaptureWindows) {
      if (now - this.lastWindowsCacheTime > 1000 || !this.cachedWindows.length) {
        const winRes = await this.nativeCore.listWindows();
        this.cachedWindows = winRes.windows;
        this.lastWindowsCacheTime = now;
        activeWin = winRes.activeWindow;
      } else {
        windows = this.cachedWindows;
        activeWin = windows.find((w) => w.isForeground) || null;
      }
    }

    let screenCap: NativeScreenCaptureResult | null = null;
    if (shouldCaptureScreenshot) {
      try {
        screenCap = await this.nativeCore.captureScreen(options?.saveArtifact ?? false);
      } catch (e: any) {
        this.logger?.warn({ err: e?.message }, "Screen capture in state engine had soft warning");
      }
    }

    const state: ComputerState = {
      timestamp: now,
      displayId: "display_0",
      resolution: screenCap ? `${screenCap.width}x${screenCap.height}` : (this.lastKnownState?.resolution || "1920x1080"),
      activeWindow: activeWin || this.lastKnownState?.activeWindow || null,
      windows: shouldCaptureWindows ? this.cachedWindows : (this.lastKnownState?.windows || []),
      processes: [],
      cursor: { x: 0, y: 0 },
      screenHash: screenCap?.hash || this.lastKnownState?.screenHash,
      screenshotArtifact: screenCap?.savedPath || this.lastKnownState?.screenshotArtifact,
      ocrTextSnippet: this.lastKnownState?.ocrTextSnippet,
      lastActionId: this.lastKnownState?.lastActionId,
      lastVerificationStatus: this.lastKnownState?.lastVerificationStatus,
    };

    this.lastKnownState = state;
    this.lastCaptureTime = now;
    return state;
  }

  /**
   * Compare two states to evaluate real-world physical and GUI delta
   */
  computeDelta(before?: ComputerState, after?: ComputerState): StateDelta {
    if (!before || !after) {
      return {
        changed: true,
        windowChanged: true,
        screenChanged: true,
        cursorMoved: false,
        details: ["Initial state recorded"],
      };
    }

    const details: string[] = [];
    const beforeTitle = before.activeWindow?.title;
    const afterTitle = after.activeWindow?.title;
    const windowChanged = beforeTitle !== afterTitle || before.activeWindow?.handle !== after.activeWindow?.handle;
    if (windowChanged) {
      details.push(`Active window changed from "${beforeTitle || 'None'}" to "${afterTitle || 'None'}"`);
    }

    const screenChanged = Boolean(before.screenHash && after.screenHash && before.screenHash !== after.screenHash);
    if (screenChanged) {
      details.push("Screen visual content changed (screenHash delta detected)");
    }

    const cursorMoved = before.cursor.x !== after.cursor.x || before.cursor.y !== after.cursor.y;
    if (cursorMoved) {
      details.push(`Cursor moved from (${before.cursor.x}, ${before.cursor.y}) to (${after.cursor.x}, ${after.cursor.y})`);
    }

    const changed = windowChanged || screenChanged || cursorMoved;

    return {
      changed,
      windowChanged,
      activeTitleBefore: beforeTitle,
      activeTitleAfter: afterTitle,
      screenChanged,
      screenHashBefore: before.screenHash,
      screenHashAfter: after.screenHash,
      cursorMoved,
      details,
    };
  }

  getLastKnownState(): ComputerState | null {
    return this.lastKnownState;
  }

  /**
   * Compare checkpoint computer state against live Windows computer state
   */
  async compareStateWithLive(checkpointState?: any): Promise<{
    status: "STATE_MATCH" | "STATE_MISMATCH" | "STATE_UNVERIFIED" | "NO_CHECKPOINT_STATE";
    stateDiff?: Record<string, any>;
    canResume: boolean;
    activeWindow?: any;
    checkpointState?: any;
    suggestedAction?: string;
  }> {
    if (!checkpointState) {
      return {
        status: "NO_CHECKPOINT_STATE",
        canResume: true,
        suggestedAction: "CONTINUE",
      };
    }

    try {
      const liveState = await this.captureState({ includeScreenshot: true, includeWindows: true });
      const mismatchedFields: string[] = [];

      const expectedWin = checkpointState.activeWindow;
      const actualWin = liveState.activeWindow;

      const windowTitleMatches =
        !expectedWin?.title ||
        !actualWin?.title ||
        actualWin.title.toLowerCase().includes(expectedWin.title.toLowerCase()) ||
        expectedWin.title.toLowerCase().includes(actualWin.title.toLowerCase());

      const processNameMatches =
        !expectedWin?.processName ||
        !actualWin?.processName ||
        actualWin.processName.toLowerCase() === expectedWin.processName.toLowerCase();

      const windowMatches = Boolean(windowTitleMatches && processNameMatches);
      if (!windowMatches) {
        mismatchedFields.push("activeWindow");
      }

      const screenMatches =
        !checkpointState.screenHash ||
        !liveState.screenHash ||
        checkpointState.screenHash === liveState.screenHash;
      if (!screenMatches) {
        mismatchedFields.push("screenHash");
      }

      const isMatch = windowMatches;
      const status = isMatch ? "STATE_MATCH" : "STATE_MISMATCH";

      return {
        status,
        canResume: isMatch,
        activeWindow: actualWin,
        checkpointState: expectedWin,
        suggestedAction: isMatch
          ? "CONTINUE"
          : actualWin
          ? `Target window was '${expectedWin?.title || expectedWin?.processName}', but live active window is '${actualWin.title}' (${actualWin.processName}). Reactivate target window before proceeding.`
          : "Target application window lost. Relaunch or reactivate application.",
        stateDiff: {
          activeWindow: {
            expected: expectedWin,
            actual: actualWin,
            matches: windowMatches,
          },
          screen: {
            expectedHash: checkpointState.screenHash,
            actualHash: liveState.screenHash,
            matches: screenMatches,
          },
          mismatchedFields,
        },
      };
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "Failed to capture live state for checkpoint comparison");
      return {
        status: "STATE_UNVERIFIED",
        canResume: true,
        suggestedAction: "CONTINUE_WITH_CAUTION",
        stateDiff: { error: err?.message },
      };
    }
  }
}
