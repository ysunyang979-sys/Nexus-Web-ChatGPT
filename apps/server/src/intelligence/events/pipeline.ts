import type { EventEmitter } from "node:events";
import type { LocalBridgeEvent } from "@localbridge/protocol";
import type { MemoryRuntime } from "../memory/runtime.js";
import type { Logger } from "@localbridge/shared";

export class IntelligenceEventPipeline {
  private attached = false;

  constructor(
    private readonly memoryRuntime: MemoryRuntime,
    private readonly logger?: Logger
  ) {}

  /**
   * Attach non-blocking event listeners to the EventBus.
   * HARD DURABILITY BOUNDARY: Any memory extraction or persistence error is caught and logged,
   * guaranteeing that action execution and commit are NEVER blocked or rolled back.
   */
  attach(eventBus: EventEmitter): void {
    if (this.attached) return;
    this.attached = true;

    // Listen to action lifecycle events
    eventBus.on("agent.action.committed", (event: LocalBridgeEvent) => {
      void this.handleActionCommitted(event).catch((err) => {
        this.logger?.warn({ err: err?.message, actionId: event.actionId }, "Non-blocking memory candidate extraction failed");
      });
    });

    eventBus.on("agent.action.failed", (event: LocalBridgeEvent) => {
      void this.handleActionFailed(event).catch((err) => {
        this.logger?.warn({ err: err?.message, actionId: event.actionId }, "Non-blocking failure memory extraction failed");
      });
    });

    this.logger?.info("IntelligenceEventPipeline successfully attached to EventBus");
  }

  private async handleActionCommitted(event: LocalBridgeEvent): Promise<void> {
    const payload = event.payload || {};
    const toolName = payload.toolName || event.actionId || "unknown_tool";
    const taskId = event.taskId || payload.taskId;
    const actionId = event.actionId || payload.actionId;
    const executionId = event.executionId || payload.executionId;
    const stateHash = event.stateHash || payload.stateHash;

    // Determine if this action was a recovery / solution or standard experience
    const isSolution = payload.wasRecovered || payload.recoveryAction || (payload.verificationStatus === "verified" && payload.retryCount > 0);
    const memoryType = isSolution ? "SOLUTION" : "EXPERIENCE";
    const importance = isSolution ? 8 : 5;

    const content = isSolution
      ? `Recovery action succeeded for tool '${toolName}'. Verified state hash: ${stateHash || "ok"}.`
      : `Action '${toolName}' executed and verified successfully in Task '${taskId || "standalone"}'.`;

    this.memoryRuntime.proposeCandidate({
      key: `exp_${toolName}_${Date.now()}`,
      content,
      type: memoryType,
      scope: taskId ? "TASK" : "PROJECT",
      scopeId: taskId,
      importance,
      confidence: 0.9,
      source: payload.skillId ? "SKILL" : "ACTION",
      provenance: {
        source: payload.skillId ? "SKILL" : "ACTION",
        skillId: payload.skillId,
        taskId,
        sessionId: event.sessionId,
        actionIds: actionId ? [actionId] : [],
        executionId,
        result: "SUCCESS",
        evidence: `Verified at ${new Date(event.timestamp || Date.now()).toISOString()}`,
      },
      tags: [toolName, memoryType.toLowerCase(), "auto-extracted"],
    });
  }

  private async handleActionFailed(event: LocalBridgeEvent): Promise<void> {
    const payload = event.payload || {};
    const toolName = payload.toolName || "unknown_tool";
    const taskId = event.taskId || payload.taskId;
    const actionId = event.actionId || payload.actionId;
    const errorMsg = payload.error || "Unknown action failure";

    this.memoryRuntime.proposeCandidate({
      key: `err_${toolName}_${Date.now()}`,
      content: `Action '${toolName}' failed: ${errorMsg}.`,
      type: "ERROR",
      scope: taskId ? "TASK" : "PROJECT",
      scopeId: taskId,
      importance: 7,
      confidence: 0.85,
      source: "ACTION",
      provenance: {
        source: "ACTION",
        taskId,
        sessionId: event.sessionId,
        actionIds: actionId ? [actionId] : [],
        result: "FAILURE",
        evidence: errorMsg,
      },
      tags: [toolName, "error", "auto-extracted"],
    });
  }
}
