import type {
  RealtimeComputerMode,
  TakeControlParams,
  TakeControlResult,
  ReturnControlParams,
  ReturnControlResult,
  TakeoverStatusResult,
  ComputerState,
  ComputerExecutionContract,
} from "@localbridge/protocol";
import type { LocalBridgeEventBus } from "../events/event-bus-service.js";
import type { ComputerStateEngine } from "./computer-state-engine.js";
import type { Logger } from "@localbridge/shared";

export class RealtimeComputerService {
  private mode: RealtimeComputerMode = {
    enabled: true,
    streamFps: 1,
    detectDelta: true,
    broadcastMouseKeyboard: true,
  };

  private humanTakeoverActive = false;
  private takeoverReason = "";
  private takeoverTime: number | null = null;
  private streamingInterval?: NodeJS.Timeout;

  constructor(
    private readonly stateEngine: ComputerStateEngine,
    private readonly eventBus?: LocalBridgeEventBus,
    private readonly logger?: Logger
  ) {}

  setMode(mode: Partial<RealtimeComputerMode>): RealtimeComputerMode {
    this.mode = { ...this.mode, ...mode };
    this.logger?.info({ mode: this.mode }, "Realtime computer mode updated");
    return this.mode;
  }

  getMode(): RealtimeComputerMode {
    return this.mode;
  }

  /**
   * Broadcast an action lifecycle event to Event Bus (WebSocket / SSE subscriber stream)
   */
  async broadcastAction(contract: ComputerExecutionContract): Promise<void> {
    if (!this.eventBus) return;
    try {
      await this.eventBus.publish({
        topic: "computer.action",
        source: "nexus.computer_use",
        payload: {
          actionId: contract.actionId,
          tool: contract.action.tool,
          params: contract.action.params,
          success: contract.execution.success,
          status: contract.verification.status,
          duration: contract.duration,
          activeWindow: contract.after?.activeWindow?.title || contract.before?.activeWindow?.title,
          error: contract.error?.message,
        },
      });
    } catch {}
  }

  /**
   * Broadcast mouse / keyboard physical event
   */
  async broadcastInput(type: "mouse_move" | "mouse_click" | "keyboard_input" | "hotkey", details: Record<string, any>): Promise<void> {
    if (!this.eventBus || !this.mode.broadcastMouseKeyboard) return;
    try {
      await this.eventBus.publish({
        topic: `computer.input.${type}`,
        source: "nexus.computer_use",
        payload: {
          type,
          ...details,
          timestamp: Date.now(),
        },
      });
    } catch {}
  }

  /**
   * Broadcast screen delta or state update
   */
  async broadcastScreenDelta(details: Record<string, any>): Promise<void> {
    if (!this.eventBus) return;
    try {
      await this.eventBus.publish({
        topic: "computer.screen.delta",
        source: "nexus.computer_use",
        payload: {
          ...details,
          timestamp: Date.now(),
        },
      });
    } catch {}
  }

  // Human Takeover Control
  async takeControl(params?: TakeControlParams): Promise<TakeControlResult> {
    this.humanTakeoverActive = true;
    this.takeoverReason = params?.reason || "Human operator took over desktop control";
    this.takeoverTime = Date.now();
    this.logger?.info({ reason: this.takeoverReason }, "Human takeover activated: AI input locked");

    if (this.eventBus) {
      await this.eventBus.publish({
        topic: "computer.takeover",
        source: "nexus.computer_use",
        payload: {
          activeControl: "human",
          reason: this.takeoverReason,
          timestamp: this.takeoverTime,
        },
      });
    }

    return {
      success: true,
      mode: "human",
      message: `Human takeover active: AI input is locked. Reason: ${this.takeoverReason}`,
      takenAt: this.takeoverTime,
    };
  }

  async returnControl(params?: ReturnControlParams): Promise<ReturnControlResult> {
    this.humanTakeoverActive = false;
    const returnedAt = Date.now();
    this.logger?.info({ returnedAt }, "Human returned control to AI: reconciling state");

    let reconciledState: ComputerState | undefined;
    if (params?.reconcileScreenshot !== false) {
      try {
        reconciledState = await this.stateEngine.captureState({ includeScreenshot: true, saveArtifact: true });
      } catch (e: any) {
        this.logger?.warn({ e }, "Reconciliation observation warning");
      }
    }

    if (this.eventBus) {
      await this.eventBus.publish({
        topic: "computer.takeover",
        source: "nexus.computer_use",
        payload: {
          activeControl: "ai",
          notes: params?.notes,
          timestamp: returnedAt,
        },
      });
    }

    return {
      success: true,
      mode: "ai",
      message: "Control returned to AI. Current desktop state reconciled.",
      returnedAt,
      reconciledObservation: reconciledState ? {
        activeWindow: reconciledState.activeWindow,
        screenSize: reconciledState.resolution,
        cursorPosition: reconciledState.cursor,
      } : undefined,
    };
  }

  getTakeoverStatus(): TakeoverStatusResult {
    return {
      activeControl: this.humanTakeoverActive ? "human" : "ai",
      inputLockedForAi: this.humanTakeoverActive,
      takenAt: this.takeoverTime,
      reason: this.takeoverReason || null,
    };
  }

  isInputLocked(): boolean {
    return this.humanTakeoverActive;
  }
}
