import crypto from "node:crypto";
import type { LoopDetectionResult, ComputerState } from "@localbridge/protocol";

export interface ActionRecord {
  actionId: string;
  tool: string;
  paramsHash: string;
  screenHash?: string;
  windowHandle?: string;
  success: boolean;
  timestamp: number;
}

export class ExecutionLoopDetector {
  private history: ActionRecord[] = [];
  private readonly maxHistorySize = 50;

  /**
   * Record an action execution and evaluate whether a loop / no-progress pattern exists
   */
  recordAndCheck(
    actionId: string,
    tool: string,
    params: any,
    stateBefore?: ComputerState,
    stateAfter?: ComputerState,
    success = true
  ): LoopDetectionResult {
    const paramsStr = JSON.stringify(params || {});
    const paramsHash = crypto.createHash("md5").update(paramsStr).digest("hex").slice(0, 8);
    const screenHash = stateAfter?.screenHash || stateBefore?.screenHash;
    const windowHandle = stateAfter?.activeWindow?.handle || stateBefore?.activeWindow?.handle;

    const record: ActionRecord = {
      actionId,
      tool,
      paramsHash,
      screenHash,
      windowHandle,
      success,
      timestamp: Date.now(),
    };

    this.history.push(record);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    return this.detectPatterns();
  }

  checkCurrentState(): LoopDetectionResult {
    return this.detectPatterns();
  }

  /**
   * Analyze historical actions (e.g. from durable checkpoint or task history)
   */
  analyzeHistory(actions: Array<{ actionName?: string; tool?: string; params?: any; preStateHash?: string; postStateHash?: string; success?: boolean }>): LoopDetectionResult {
    if (!actions || actions.length < 3) {
      return {
        loopDetected: false,
        pattern: "none",
        repeatCount: 0,
        message: "Action pattern normal",
        suggestedAction: "Continue execution",
      };
    }

    const items = actions.map((a: any, i) => {
      const toolName = a.toolName || a.actionName || a.tool || "action";
      const paramsStr = JSON.stringify(a.params || a.args || {});
      const paramsHash = crypto.createHash("md5").update(paramsStr).digest("hex").slice(0, 8);
      return {
        tool: toolName,
        paramsHash,
        preHash: a.preStateHash,
        postHash: a.postStateHash,
      };
    });

    const len = items.length;
    const last = items[len - 1]!;

    // 1. Check Repeated Action (A A A)
    let repCount = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (items[i]!.tool === last.tool && items[i]!.paramsHash === last.paramsHash) {
        repCount++;
      } else {
        break;
      }
    }
    if (repCount >= 3) {
      return {
        loopDetected: true,
        pattern: "REPEATED_ACTION",
        repeatCount: repCount,
        message: `Action ${last.tool} repeated ${repCount} times with identical parameters.`,
        suggestedAction: "STOP repetition. Switch to an alternative action or investigate why previous attempts produced no advancement.",
      };
    }

    // 2. Check Oscillation Loop (A B A B A B)
    if (len >= 4) {
      const a1 = items[len - 4]!;
      const b1 = items[len - 3]!;
      const a2 = items[len - 2]!;
      const b2 = items[len - 1]!;
      if (
        a1.tool === a2.tool &&
        b1.tool === b2.tool &&
        a1.tool !== b1.tool &&
        a1.paramsHash === a2.paramsHash &&
        b1.paramsHash === b2.paramsHash
      ) {
        return {
          loopDetected: true,
          pattern: "OSCILLATION_LOOP",
          repeatCount: 2,
          message: `Oscillation loop detected between '${a1.tool}' and '${b1.tool}'.`,
          suggestedAction: "Break cycle. Re-evaluate strategy or perform verification before retrying either action.",
        };
      }
    }

    // 3. Check No-Effect Loop (action executed but postStateHash === preStateHash repeatedly)
    let noEffectCount = 0;
    for (let i = len - 1; i >= Math.max(0, len - 4); i--) {
      const it = items[i]!;
      if (it.preHash && it.postHash && it.preHash === it.postHash) {
        noEffectCount++;
      }
    }
    if (noEffectCount >= 3) {
      return {
        loopDetected: true,
        pattern: "NO_EFFECT_LOOP",
        repeatCount: noEffectCount,
        message: `Last ${noEffectCount} actions produced 0 state change (preStateHash === postStateHash).`,
        suggestedAction: "Investigate target UI element state, application focus, or modal lock before attempting further actions.",
      };
    }

    return {
      loopDetected: false,
      pattern: "none",
      repeatCount: 0,
      message: "Action pattern normal",
      suggestedAction: "Continue execution",
    };
  }

  private detectPatterns(): LoopDetectionResult {
    const len = this.history.length;
    if (len < 3) {
      return {
        loopDetected: false,
        pattern: "none",
        repeatCount: 0,
        message: "Action pattern normal",
        suggestedAction: "Continue execution",
      };
    }

    const last = this.history[len - 1]!;

    // 1. Check Same Action Repeated (identical tool + identical params 3+ times consecutively)
    let consecutiveIdentical = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (this.history[i]!.tool === last.tool && this.history[i]!.paramsHash === last.paramsHash) {
        consecutiveIdentical++;
      } else {
        break;
      }
    }

    if (consecutiveIdentical >= 3) {
      return {
        loopDetected: true,
        pattern: "REPEATED_ACTION",
        repeatCount: consecutiveIdentical,
        message: `Action ${last.tool} repeated ${consecutiveIdentical} times with identical inputs.`,
        suggestedAction: "STOP repetition. Switch to an alternative tool, shortcut, or different coordinate/selector.",
      };
    }

    // 2. Check Same Screen Repeated with No State Progress (screenHash identical across last 4 actions)
    if (len >= 4 && last.screenHash) {
      const recentScreens = this.history.slice(-4).map((h) => h.screenHash);
      const allSameScreen = recentScreens.every((s) => s === last.screenHash);
      if (allSameScreen) {
        return {
          loopDetected: true,
          pattern: "STATE_STAGNATION",
          repeatCount: 4,
          message: "Computer screen state has shown 0 visual progress across the last 4 tool invocations.",
          suggestedAction: "Observe active window focus and verify if target application is responsive or in modal lock.",
        };
      }
    }

    // 3. Check Oscillating Actions (A -> B -> A -> B)
    if (len >= 4) {
      const a1 = this.history[len - 4]!;
      const b1 = this.history[len - 3]!;
      const a2 = this.history[len - 2]!;
      const b2 = this.history[len - 1]!;

      if (
        a1.tool === a2.tool &&
        b1.tool === b2.tool &&
        a1.tool !== b1.tool &&
        a1.paramsHash === a2.paramsHash &&
        b1.paramsHash === b2.paramsHash
      ) {
        return {
          loopDetected: true,
          pattern: "OSCILLATION_LOOP",
          repeatCount: 2,
          message: `Oscillating loop detected between ${a1.tool} and ${b1.tool}.`,
          suggestedAction: "Break cycle. Re-evaluate strategy or perform verification before retrying either action.",
        };
      }
    }

    return {
      loopDetected: false,
      pattern: "none",
      repeatCount: 0,
      message: "Action pattern normal",
      suggestedAction: "Continue execution",
    };
  }

  reset(): void {
    this.history = [];
  }
}
