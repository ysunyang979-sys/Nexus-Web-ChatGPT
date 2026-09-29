import type {
  ExecutionErrorDetail,
  ComputerState,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export type ErrorType =
  | "WINDOW_NOT_READY"
  | "FOCUS_LOST"
  | "TIMEOUT"
  | "TARGET_NOT_FOUND"
  | "FILE_LOCKED"
  | "APPLICATION_CRASH"
  | "INPUT_REJECTED"
  | "PERMISSION_DENIED"
  | "LOOP_DETECTED"
  | "UNKNOWN_ERROR";

export interface RetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 300,
  maxBackoffMs: 2000,
  backoffMultiplier: 1.5,
  retryableErrors: [
    "WINDOW_NOT_READY",
    "FOCUS_LOST",
    "TIMEOUT",
    "TARGET_NOT_FOUND",
    "FILE_LOCKED",
  ],
};

export class ExecutionRetryEngine {
  constructor(private readonly logger?: Logger) {}

  /**
   * Classify an exception or execution failure into a standard error type,
   * possible root causes, and recommended recovery signals for the external Agent.
   */
  classifyError(
    err: unknown,
    tool: string,
    params: any,
    state?: ComputerState
  ): ExecutionErrorDetail {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = rawMsg.toLowerCase();

    let type: ErrorType = "UNKNOWN_ERROR";
    const possibleCauses: string[] = [];
    const suggestedRecoverySignals: string[] = [];

    if (lower.includes("not ready") || lower.includes("not visible") || lower.includes("window not found")) {
      type = "WINDOW_NOT_READY";
      possibleCauses.push("Target application is still launching or loading UI components.");
      possibleCauses.push("Window was minimized or opened under a different title/PID.");
      suggestedRecoverySignals.push("Wait 1000-2000ms using computer.wait.");
      suggestedRecoverySignals.push("Re-query computer.window_list to inspect active windows.");
      suggestedRecoverySignals.push("Call computer.window_activate with process name instead of exact title.");
    } else if (lower.includes("focus") || lower.includes("not in foreground") || lower.includes("foreground")) {
      type = "FOCUS_LOST";
      possibleCauses.push("Another desktop window stole focus (e.g. browser, notification, modal).");
      possibleCauses.push("Application requires explicit click to focus editor canvas.");
      suggestedRecoverySignals.push("Call computer.window_activate to re-focus target application.");
      suggestedRecoverySignals.push("Perform a click inside the main window area before typing.");
    } else if (lower.includes("target not found") || lower.includes("element not found") || lower.includes("missed")) {
      type = "TARGET_NOT_FOUND";
      possibleCauses.push("UI element has different text or label than expected.");
      possibleCauses.push("UI is scrolled out of current view.");
      possibleCauses.push("Application changed layout or uses non-standard canvas rendering.");
      suggestedRecoverySignals.push("Call computer.screen_snapshot + vision_ocr to inspect visible text on screen.");
      suggestedRecoverySignals.push("Try broader semantic terms or keyboard shortcuts (e.g. Ctrl+S instead of clicking Save button).");
    } else if (lower.includes("locked") || lower.includes("being used by another process") || lower.includes("busy")) {
      type = "FILE_LOCKED";
      possibleCauses.push("Target file is currently open with exclusive write lock by another application.");
      suggestedRecoverySignals.push("Wait 500ms and retry.");
      suggestedRecoverySignals.push("Close the application holding the file lock.");
    } else if (lower.includes("timeout") || lower.includes("timed out")) {
      type = "TIMEOUT";
      possibleCauses.push("OS command or UI operation took longer than expected.");
      suggestedRecoverySignals.push("Check if application is frozen via process_list.");
    } else if (lower.includes("crash") || lower.includes("terminated") || lower.includes("died")) {
      type = "APPLICATION_CRASH";
      possibleCauses.push("Process exited unexpectedly.");
      suggestedRecoverySignals.push("Check process exit code and relaunch application.");
    } else if (lower.includes("loop") || lower.includes("repeated")) {
      type = "LOOP_DETECTED";
      possibleCauses.push("Repeated action with identical parameters produced zero state progress.");
      suggestedRecoverySignals.push("Switch strategy: use hotkeys, different UI selectors, or alternative tools.");
    }

    return {
      type,
      code: `ERR_${type}`,
      message: rawMsg,
      possibleCauses,
      suggestedRecoverySignals,
      attemptHistory: [],
    };
  }

  /**
   * Execute an operation with automatic retry, exponential backoff, and attempt logging
   */
  async executeWithRetry<T>(
    operationName: string,
    fn: (attempt: number) => Promise<T>,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): Promise<{ result: T; attempts: number }> {
    let lastError: any = null;
    let delay = policy.initialBackoffMs;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      try {
        const result = await fn(attempt);
        return { result, attempts: attempt };
      } catch (err: any) {
        lastError = err;
        const classified = this.classifyError(err, operationName, {});

        if (attempt >= policy.maxAttempts || !policy.retryableErrors.includes(classified.type)) {
          throw err;
        }

        this.logger?.info(
          { attempt, maxAttempts: policy.maxAttempts, errorType: classified.type, delayMs: delay },
          `Retrying ${operationName} after transient error`
        );

        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * policy.backoffMultiplier, policy.maxBackoffMs);
      }
    }

    throw lastError;
  }
}
