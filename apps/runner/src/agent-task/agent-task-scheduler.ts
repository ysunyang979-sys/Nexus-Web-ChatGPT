import type { Logger } from "@localbridge/shared";
import type { AgentTaskManager } from "./agent-task-manager.js";
import type { AgentExecutor } from "./agent-executor.js";

export class AgentTaskScheduler {
  private timer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    private readonly taskManager: AgentTaskManager,
    private readonly executor: AgentExecutor,
    private readonly logger?: Logger
  ) {}

  start(): void {
    if (this.timer) return;
    this.logger?.info("Starting AgentTaskScheduler background loop");
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger?.warn({ err }, "Error in AgentTaskScheduler tick");
      });
    }, 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      delete this.timer;
      this.logger?.info("Stopped AgentTaskScheduler background loop");
    }
  }

  async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const activeTasks = this.taskManager.getActiveTasks();
      const promises = activeTasks.map(async (task) => {
        // If a task is marked running and has pending execution work, drive execution!
        const hasPendingWork = task.actionCount === 0 || this.executor.hasPendingGoalSteps(task);
        const isSyntheticEvidence = task.executionInstruction?.startsWith("Real tool execution evidence verified:");
        if (task.state === "running" && task.executionInstruction && !isSyntheticEvidence && hasPendingWork) {
          this.logger?.info(
            { taskId: task.id, actionCount: task.actionCount, iteration: task.iteration, instruction: task.executionInstruction },
            "AgentTaskScheduler driving parallel execution loop for running task"
          );
          await this.executor.runCodingRun({
            agentTaskId: task.id,
            instruction: task.executionInstruction,
            targetFiles: task.modifiedFiles,
            autoTest: false,
          });
        }
      });
      await Promise.all(promises);
    } catch (err) {
      this.logger?.warn({ err }, "Unhandled error in AgentTaskScheduler execution loop");
    } finally {
      this.isProcessing = false;
    }
  }
}
