import type {
  ComputerState,
  ComputerExecutionContract,
  DurableContextState,
} from "@localbridge/protocol";

export type ContextTier =
  | "RAW"
  | "RECENT"
  | "SUMMARY"
  | "CHECKPOINT"
  | "IMPORTANT"
  | "RAW_CONTEXT"
  | "SUMMARY_CONTEXT"
  | "CRITICAL_CONTEXT"
  | "EXECUTION_CONTEXT"
  | "RECOVERY_CONTEXT";

export interface ConfirmedUILocation {
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  lastConfirmedAt: number;
}

export interface ExecutionMemorySnapshot {
  taskGoal?: string;
  currentPhase?: string;
  completedActions: string[];
  failedApproaches: Array<{ method: string; reason: string; timestamp: number }>;
  confirmedUILocations: Record<string, ConfirmedUILocation>;
  createdFiles: string[];
  openedWindows: string[];
  artifacts: string[];
  lastSuccessfulAction?: string;
  lastFailureReason?: string;
  totalActions: number;
}

export class ExecutionContextManager {
  private rawContracts: ComputerExecutionContract[] = [];
  private criticalContext: Record<string, any> = {};
  private summaryContext: string = "";
  private executionHistory: Array<{ actionId: string; tool: string; status: string; timestamp: number }> = [];
  private failureHistory: Array<{ actionId?: string; tool?: string; error: string; timestamp: number }> = [];
  private verificationHistory: Array<{ actionId?: string; check: string; passed: boolean; timestamp: number }> = [];
  private memory: ExecutionMemorySnapshot = {
    completedActions: [],
    failedApproaches: [],
    confirmedUILocations: {},
    createdFiles: [],
    openedWindows: [],
    artifacts: [],
    totalActions: 0,
  };

  private readonly recentWindowSize = 10;

  recordAction(contract: ComputerExecutionContract): void {
    this.rawContracts.push(contract);
    this.memory.totalActions++;

    if (contract.execution.success && contract.verification.passed) {
      this.memory.completedActions.push(contract.action.tool);
      this.memory.lastSuccessfulAction = contract.action.tool;
    } else if (contract.error) {
      this.memory.failedApproaches.push({
        method: contract.action.tool,
        reason: contract.error.message,
        timestamp: Date.now(),
      });
      this.memory.lastFailureReason = contract.error.message;
    }

    if (contract.artifacts && contract.artifacts.length > 0) {
      for (const a of contract.artifacts) {
        if (!this.memory.artifacts.includes(a)) {
          this.memory.artifacts.push(a);
        }
      }
    }
  }

  recordUILocation(target: string, x: number, y: number, w: number, h: number, level: number): void {
    this.memory.confirmedUILocations[target] = {
      target,
      x,
      y,
      width: w,
      height: h,
      level,
      lastConfirmedAt: Date.now(),
    };
  }

  recordCreatedFile(filePath: string): void {
    if (!this.memory.createdFiles.includes(filePath)) {
      this.memory.createdFiles.push(filePath);
    }
  }

  /**
   * Get compressed execution context suitable for LLM prompt / Agent state without token explosion.
   */
  getCompressedContext(tier: ContextTier = "SUMMARY"): Record<string, any> {
    if (tier === "RAW" || tier === "RAW_CONTEXT") {
      return { contracts: this.rawContracts, memory: this.memory, critical: this.criticalContext };
    }

    if (tier === "CRITICAL_CONTEXT") {
      return {
        criticalContext: this.criticalContext,
        confirmedUILocations: this.memory.confirmedUILocations,
        createdFiles: this.memory.createdFiles,
        artifacts: this.memory.artifacts,
      };
    }

    if (tier === "EXECUTION_CONTEXT") {
      return {
        totalActionsExecuted: this.memory.totalActions,
        completedMilestones: this.memory.completedActions.slice(-20),
        executionHistory: this.executionHistory.slice(-20),
        lastSuccessfulAction: this.memory.lastSuccessfulAction,
      };
    }

    if (tier === "RECOVERY_CONTEXT") {
      return {
        criticalContext: this.criticalContext,
        summaryContext: this.summaryContext,
        failureHistory: this.failureHistory.slice(-10),
        lastFailureReason: this.memory.lastFailureReason,
        verificationHistory: this.verificationHistory.slice(-10),
      };
    }

    if (tier === "RECENT") {
      const recent = this.rawContracts.slice(-this.recentWindowSize).map((c) => ({
        actionId: c.actionId,
        tool: c.action.tool,
        success: c.execution.success,
        verification: c.verification.status,
        duration: c.duration,
        error: c.error?.message,
      }));
      return { recentActions: recent, memory: this.memory };
    }

    // SUMMARY / SUMMARY_CONTEXT (Default): Highly compact, structured representation
    const recent = this.rawContracts.slice(-5).map((c) => ({
      tool: c.action.tool,
      status: c.verification.status,
    }));

    return {
      summary: this.summaryContext || undefined,
      totalActionsExecuted: this.memory.totalActions,
      completedMilestones: this.memory.completedActions.slice(-10),
      recentActions: recent,
      knownUILocations: Object.keys(this.memory.confirmedUILocations),
      createdFiles: this.memory.createdFiles,
      artifacts: this.memory.artifacts,
      lastSuccessfulAction: this.memory.lastSuccessfulAction,
      lastFailureReason: this.memory.lastFailureReason,
      failedAttemptsCount: this.memory.failedApproaches.length,
    };
  }

  setCriticalContext(key: string, value: any): void {
    this.criticalContext[key] = value;
  }

  updateCriticalContext(data: Record<string, any>): void {
    Object.assign(this.criticalContext, data);
  }

  getCriticalContext(): Record<string, any> {
    return { ...this.criticalContext };
  }

  setSummaryContext(summary: string): void {
    this.summaryContext = summary;
  }

  getSummaryContext(): string {
    return this.summaryContext;
  }

  recordExecution(actionId: string, tool: string, status: string): void {
    this.executionHistory.push({ actionId, tool, status, timestamp: Date.now() });
    if (this.executionHistory.length > 500) {
      this.executionHistory.shift();
    }
  }

  recordFailure(actionId: string | undefined, tool: string | undefined, error: string): void {
    this.failureHistory.push({ actionId, tool, error, timestamp: Date.now() });
    if (this.failureHistory.length > 100) {
      this.failureHistory.shift();
    }
  }

  recordVerification(actionId: string | undefined, check: string, passed: boolean): void {
    this.verificationHistory.push({ actionId, check, passed, timestamp: Date.now() });
    if (this.verificationHistory.length > 200) {
      this.verificationHistory.shift();
    }
  }

  exportSnapshot(): DurableContextState {
    return {
      criticalContext: { ...this.criticalContext },
      summaryContext: this.summaryContext,
      executionHistory: this.executionHistory.slice(-50),
      failureHistory: this.failureHistory.slice(-20),
      verificationHistory: this.verificationHistory.slice(-30),
      rawContextSummary: `Total actions: ${this.memory.totalActions}, artifacts: ${this.memory.artifacts.length}`,
    };
  }

  importSnapshot(snapshot?: DurableContextState): void {
    if (!snapshot) return;
    this.criticalContext = { ...(snapshot.criticalContext || {}) };
    this.summaryContext = snapshot.summaryContext || "";
    if (snapshot.executionHistory) {
      this.executionHistory = [...snapshot.executionHistory];
    }
    if (snapshot.failureHistory) {
      this.failureHistory = [...snapshot.failureHistory];
    }
    if (snapshot.verificationHistory) {
      this.verificationHistory = [...snapshot.verificationHistory];
    }
  }

  getMemory(): ExecutionMemorySnapshot {
    return this.memory;
  }

  reset(): void {
    this.rawContracts = [];
    this.criticalContext = {};
    this.summaryContext = "";
    this.executionHistory = [];
    this.failureHistory = [];
    this.verificationHistory = [];
    this.memory = {
      completedActions: [],
      failedApproaches: [],
      confirmedUILocations: {},
      createdFiles: [],
      openedWindows: [],
      artifacts: [],
      totalActions: 0,
    };
  }
}
