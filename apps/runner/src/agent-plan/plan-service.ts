import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Logger } from "@localbridge/shared";
import type { LocalBridgeEventBus } from "../events/event-bus-service.js";
import type { AgentTaskManager } from "../agent-task/agent-task-manager.js";
import type {
  AgentPlan,
  PlanStep,
  AgentPlanCreateParams,
  AgentPlanCreateResult,
  AgentPlanGetParams,
  AgentPlanGetResult,
  AgentPlanUpdateParams,
  AgentPlanUpdateResult,
  AgentPlanDeleteParams,
  AgentPlanDeleteResult,
  AgentPlanCompleteParams,
  AgentPlanCompleteResult,
  AgentPlanListParams,
  AgentPlanListResult,
  AgentTodo,
  AgentTodoCreateParams,
  AgentTodoCreateResult,
  AgentTodoUpdateParams,
  AgentTodoUpdateResult,
  AgentTodoCompleteParams,
  AgentTodoCompleteResult,
  AgentTodoListParams,
  AgentTodoListResult,
  AgentDelegateParams,
  AgentDelegateResult,
  AgentForkParams,
  AgentForkResult,
  AgentJoinParams,
  AgentJoinResult,
  AgentSuperviseParams,
  AgentSuperviseResult,
  AgentDependency,
  AgentDependencyCreateParams,
  AgentDependencyCreateResult,
  AgentDependencyListParams,
  AgentDependencyListResult,
  AgentDependencyRemoveParams,
  AgentDependencyRemoveResult,
  AgentBudget,
  AgentBudgetSetParams,
  AgentBudgetSetResult,
  AgentBudgetGetParams,
  AgentBudgetGetResult,
  AgentBudgetCheckParams,
  AgentBudgetCheckResult,
} from "@localbridge/protocol";

export class AgentPlanService {
  private readonly plans = new Map<string, AgentPlan>();
  private readonly todos = new Map<string, AgentTodo>();
  private readonly dependencies = new Map<string, AgentDependency>();
  private readonly budgets = new Map<string, AgentBudget>();
  private readonly agentHeartbeats = new Map<string, number>();

  private readonly plansFile?: string;
  private readonly todosFile?: string;
  private readonly budgetsFile?: string;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly logger?: Logger,
    private readonly agentTaskManager?: AgentTaskManager
  ) {
    if (this.runnerStateDir) {
      this.plansFile = path.join(this.runnerStateDir, "agent-plans.json");
      this.todosFile = path.join(this.runnerStateDir, "agent-todos.json");
      this.budgetsFile = path.join(this.runnerStateDir, "agent-budgets.json");
      this.loadFromDisk();
    }
  }

  public attachEventBus(eventBus: LocalBridgeEventBus): void {
    eventBus.on("agent.action.started", (evt: any) => {
      this.handleActionStarted(evt);
    });
    eventBus.on("agent.action.committed", (evt: any) => {
      this.handleActionCommitted(evt);
    });
    eventBus.on("agent.action.failed", (evt: any) => {
      this.handleActionFailed(evt);
    });
  }

  private handleActionStarted(evt: any): void {
    const taskId = evt.taskId || evt.payload?.taskId;
    if (!taskId) return;

    for (const plan of this.plans.values()) {
      if (plan.agentTaskId === taskId && plan.status === "active") {
        const step = plan.steps.find(
          (s) => s.stepId === plan.currentStep || s.status === "ready" || s.status === "pending"
        );
        if (step && step.status !== "completed") {
          step.status = "running";
          plan.currentStep = step.stepId;
          plan.updatedAt = Date.now();
          this.saveToDisk();
          break;
        }
      }
    }
  }

  private handleActionCommitted(evt: any): void {
    const taskId = evt.taskId || evt.payload?.taskId;
    if (!taskId) return;

    for (const plan of this.plans.values()) {
      if (plan.agentTaskId === taskId && plan.status === "active") {
        const step = plan.steps.find(
          (s) =>
            (s.stepId === plan.currentStep && s.status !== "completed") ||
            s.status === "running" ||
            s.status === "ready"
        );
        if (step) {
          step.status = "completed";
          step.completedAt = Date.now();
          if (!plan.completedSteps.includes(step.stepId)) {
            plan.completedSteps.push(step.stepId);
          }

          // Advance to next step
          const nextStep = plan.steps.find((s) => s.status === "pending" || s.status === "ready");
          if (nextStep) {
            const depsOk = (nextStep.dependencies || []).every((d) =>
              plan.completedSteps.includes(d)
            );
            nextStep.status = depsOk ? "ready" : "pending";
            plan.currentStep = nextStep.stepId;
          } else {
            plan.status = "completed";
            plan.currentStep = undefined;
          }
          plan.updatedAt = Date.now();
          this.saveToDisk();
        }
      }
    }

    // Also update any pending todos for this task
    for (const todo of this.todos.values()) {
      if (todo.agentTaskId === taskId && (todo.status === "pending" || todo.status === "in_progress")) {
        todo.status = "completed";
        todo.completedAt = Date.now();
        this.saveToDisk();
        break; // complete one todo per committed action
      }
    }
  }

  private handleActionFailed(evt: any): void {
    const taskId = evt.taskId || evt.payload?.taskId;
    if (!taskId) return;

    for (const plan of this.plans.values()) {
      if (plan.agentTaskId === taskId && plan.status === "active") {
        const step = plan.steps.find(
          (s) => s.stepId === plan.currentStep || s.status === "running"
        );
        if (step) {
          step.status = "failed";
          if (!plan.failedSteps.includes(step.stepId)) {
            plan.failedSteps.push(step.stepId);
          }
          plan.updatedAt = Date.now();
          this.saveToDisk();
        }
      }
    }
  }

  // --- Plan CRUD & Execution ---

  async createPlan(params: AgentPlanCreateParams): Promise<AgentPlanCreateResult> {
    const planId = `plan_${crypto.randomUUID()}`;
    const now = Date.now();

    const steps: PlanStep[] = params.steps.map((s, idx) => ({
      stepId: `step_${idx + 1}_${crypto.randomUUID().slice(0, 6)}`,
      title: s.title,
      description: s.description,
      status: idx === 0 && (!s.dependencies || s.dependencies.length === 0) ? "ready" : "pending",
      priority: s.priority || "medium",
      dependencies: s.dependencies || [],
      assignedAgent: s.assignedAgent,
      attempts: 0,
      artifacts: [],
    }));

    const plan: AgentPlan = {
      planId,
      agentTaskId: params.agentTaskId,
      sessionId: params.sessionId,
      title: params.title,
      goal: params.goal,
      status: "active",
      steps,
      dependencies: params.dependencies || [],
      currentStep: steps[0]?.stepId,
      completedSteps: [],
      failedSteps: [],
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    };

    this.plans.set(planId, plan);
    this.saveToDisk();
    this.logger?.info({ planId, title: params.title, stepsCount: steps.length }, "Created agent plan");

    return { plan };
  }

  async getPlan(params: AgentPlanGetParams): Promise<AgentPlanGetResult> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Agent plan '${params.planId}' not found`);
    }
    return { plan };
  }

  async updatePlan(params: AgentPlanUpdateParams): Promise<AgentPlanUpdateResult> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Agent plan '${params.planId}' not found`);
    }

    if (params.status) plan.status = params.status;
    if (params.currentStep) plan.currentStep = params.currentStep;
    if (params.steps) plan.steps = params.steps;
    if (params.metadata) plan.metadata = { ...plan.metadata, ...params.metadata };
    plan.updatedAt = Date.now();

    // Recompute ready steps
    for (const step of plan.steps) {
      if (step.status === "pending") {
        const depsSatisfied = step.dependencies.every((depId) =>
          plan.completedSteps.includes(depId)
        );
        if (depsSatisfied) {
          step.status = "ready";
        }
      }
    }

    this.saveToDisk();
    return { plan };
  }

  async deletePlan(params: AgentPlanDeleteParams): Promise<AgentPlanDeleteResult> {
    const existed = this.plans.delete(params.planId);
    this.saveToDisk();
    return { planId: params.planId, deleted: existed };
  }

  async completePlan(params: AgentPlanCompleteParams): Promise<AgentPlanCompleteResult> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Agent plan '${params.planId}' not found`);
    }

    plan.status = "completed";
    plan.updatedAt = Date.now();
    for (const step of plan.steps) {
      if (step.status !== "failed" && step.status !== "cancelled") {
        step.status = "completed";
        step.completedAt = Date.now();
      }
      if (!plan.completedSteps.includes(step.stepId)) {
        plan.completedSteps.push(step.stepId);
      }
    }

    if (params.artifacts) {
      for (const art of params.artifacts) {
        if (!plan.steps[plan.steps.length - 1]?.artifacts.includes(art)) {
          plan.steps[plan.steps.length - 1]?.artifacts.push(art);
        }
      }
    }

    this.saveToDisk();
    return { plan };
  }

  async listPlans(params: AgentPlanListParams): Promise<AgentPlanListResult> {
    let list = Array.from(this.plans.values());
    if (params.agentTaskId) {
      list = list.filter((p) => p.agentTaskId === params.agentTaskId);
    }
    if (params.sessionId) {
      list = list.filter((p) => p.sessionId === params.sessionId);
    }
    if (params.status) {
      list = list.filter((p) => p.status === params.status);
    }

    list.sort((a, b) => b.updatedAt - a.updatedAt);
    const paginated = list.slice(0, params.limit || 50);

    return {
      plans: paginated,
      total: list.length,
    };
  }

  // --- Todo CRUD ---

  async createTodo(params: AgentTodoCreateParams): Promise<AgentTodoCreateResult> {
    const todoId = `todo_${crypto.randomUUID()}`;
    const now = Date.now();

    const todo: AgentTodo = {
      todoId,
      agentTaskId: params.agentTaskId,
      planId: params.planId,
      stepId: params.stepId,
      sessionId: params.sessionId,
      agentId: params.agentId,
      title: params.title,
      status: "pending",
      priority: params.priority || "medium",
      notes: params.notes,
      createdAt: now,
    };

    this.todos.set(todoId, todo);
    this.saveToDisk();
    return { todo };
  }

  async updateTodo(params: AgentTodoUpdateParams): Promise<AgentTodoUpdateResult> {
    const todo = this.todos.get(params.todoId);
    if (!todo) {
      throw new Error(`Agent todo '${params.todoId}' not found`);
    }

    if (params.title) todo.title = params.title;
    if (params.status) todo.status = params.status;
    if (params.priority) todo.priority = params.priority;
    if (params.notes) todo.notes = params.notes;

    if (params.status === "completed") {
      todo.completedAt = Date.now();
    }

    this.saveToDisk();
    return { todo };
  }

  async completeTodo(params: AgentTodoCompleteParams): Promise<AgentTodoCompleteResult> {
    const todo = this.todos.get(params.todoId);
    if (!todo) {
      throw new Error(`Agent todo '${params.todoId}' not found`);
    }

    todo.status = "completed";
    todo.completedAt = Date.now();
    if (params.notes) todo.notes = params.notes;

    this.saveToDisk();
    return { todo };
  }

  async listTodos(params: AgentTodoListParams): Promise<AgentTodoListResult> {
    let list = Array.from(this.todos.values());
    if (params.agentTaskId) {
      list = list.filter((t) => t.agentTaskId === params.agentTaskId);
    }
    if (params.planId) {
      list = list.filter((t) => t.planId === params.planId);
    }
    if (params.sessionId) {
      list = list.filter((t) => t.sessionId === params.sessionId);
    }
    if (params.agentId) {
      list = list.filter((t) => t.agentId === params.agentId);
    }
    if (params.status) {
      list = list.filter((t) => t.status === params.status);
    }

    list.sort((a, b) => b.createdAt - a.createdAt);

    return {
      todos: list,
      total: list.length,
    };
  }

  // --- Delegation & Fork & Join & Supervise ---

  async delegate(params: AgentDelegateParams): Promise<AgentDelegateResult> {
    const delegationId = `del_${crypto.randomUUID()}`;
    const childAgentId = `agent_${params.childAgentRole.toLowerCase()}_${crypto.randomUUID().slice(0, 6)}`;
    const taskId = `task_del_${crypto.randomUUID().slice(0, 8)}`;

    this.logger?.info(
      { delegationId, parent: params.parentAgentId, child: childAgentId, role: params.childAgentRole },
      "Delegated sub-agent task"
    );

    return {
      delegationId,
      childAgentId,
      taskId,
      status: "assigned",
    };
  }

  async fork(params: AgentForkParams): Promise<AgentForkResult> {
    const forkedAgentId = `agent_fork_${crypto.randomUUID().slice(0, 8)}`;
    const forkedSessionId = `session_fork_${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();

    // Isolated budget for fork
    if (params.quota) {
      this.budgets.set(forkedAgentId, {
        targetId: forkedAgentId,
        targetType: "agent",
        quota: {
          maxRuntimeMs: 1800000,
          maxToolCalls: 200,
          maxProcesses: 5,
          maxMemoryMb: 1024,
          maxCpuPercent: 60,
          maxArtifacts: 20,
          maxArtifactSizeBytes: 52428800,
          maxBrowserSessions: 1,
          maxConcurrentAgents: 1,
          ...params.quota,
        },
        usage: {
          runtimeMs: 0,
          toolCalls: 0,
          processes: 0,
          memoryMb: 0,
          cpuPercent: 0,
          artifacts: 0,
          artifactSizeBytes: 0,
          browserSessions: 0,
          concurrentAgents: 0,
        },
        status: "normal",
        lastCheckedAt: now,
      });
    }

    return {
      forkedAgentId,
      forkedSessionId,
      parentAgentId: params.parentAgentId,
      createdAt: now,
    };
  }

  async join(params: AgentJoinParams): Promise<AgentJoinResult> {
    const results: Record<string, any> = {};
    const deadline = Date.now() + params.timeoutMs;

    if (!this.agentTaskManager) {
      throw new Error("Agent Join requires AgentTaskManager state source");
    }

    while (true) {
      const matched = new Map<string, any>();
      for (const id of params.childAgentIds) {
        const task = this.agentTaskManager.getTaskByAssignedAgentId(id);
        if (task) matched.set(id, task);
      }

      let activeChildrenCount = 0;
      let allTerminal = true;
      for (const id of params.childAgentIds) {
        const task = matched.get(id);
        if (!task) {
          allTerminal = false;
          activeChildrenCount++;
          results[id] = { status: "waiting", result: null, reason: "No assigned Agent Task found" };
          continue;
        }
        results[id] = {
          status: task.state,
          result: task.state === "completed" ? {
            iteration: task.iteration,
            actionCount: task.actionCount,
            actionsExecuted: task.actionsExecuted,
            executionEvidence: (task as any).executionEvidence,
            lastToolResult: (task as any).lastToolResult,
          } : null,
        };
        if (!["completed", "failed", "cancelled", "timed_out", "resource_limited"].includes(task.state)) {
          allTerminal = false;
          activeChildrenCount++;
        }
      }

      if (allTerminal) {
        return { allJoined: true, results, activeChildrenCount: 0 };
      }
      if (Date.now() >= deadline) {
        return { allJoined: false, results, activeChildrenCount };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async supervise(params: AgentSuperviseParams): Promise<AgentSuperviseResult> {
    const targetIds = params.targetAgentIds || Array.from(this.agentHeartbeats.keys());
    const now = Date.now();
    const supervised: any[] = [];
    let degraded = false;
    let critical = false;

    for (const agentId of targetIds) {
      const lastBeat = this.agentHeartbeats.get(agentId) || (now - 5000);
      const diff = now - lastBeat;
      const isHealthy = diff < 60000;

      let actionTaken = "none";
      if (!isHealthy) {
        if (params.action === "reconcile" || params.action === "retry") {
          actionTaken = "resumed_or_retried";
        } else if (params.action === "pause") {
          actionTaken = "paused";
        } else {
          actionTaken = "flagged_unhealthy";
        }
        degraded = true;
        if (diff > 120000) critical = true;
      }

      supervised.push({
        agentId,
        status: isHealthy ? "healthy" : "stalled",
        lastHeartbeatAgoMs: diff,
        healthy: isHealthy,
        actionTaken,
      });
    }

    return {
      action: params.action,
      supervisedAgents: supervised,
      overallHealth: critical ? "critical" : degraded ? "degraded" : "healthy",
    };
  }

  recordHeartbeat(agentId: string): void {
    this.agentHeartbeats.set(agentId, Date.now());
  }

  // --- Agent Dependency Management ---

  async createDependency(params: AgentDependencyCreateParams): Promise<AgentDependencyCreateResult> {
    const dependencyId = `dep_${crypto.randomUUID()}`;
    const dep: AgentDependency = {
      dependencyId,
      agentId: params.agentId,
      dependsOnAgentId: params.dependsOnAgentId,
      reason: params.reason,
      status: "waiting",
      createdAt: Date.now(),
    };

    this.dependencies.set(dependencyId, dep);
    return { dependency: dep };
  }

  async listDependencies(params: AgentDependencyListParams): Promise<AgentDependencyListResult> {
    let list = Array.from(this.dependencies.values());
    if (params.agentId) {
      list = list.filter((d) => d.agentId === params.agentId);
    }
    if (params.dependsOnAgentId) {
      list = list.filter((d) => d.dependsOnAgentId === params.dependsOnAgentId);
    }

    return {
      dependencies: list,
      total: list.length,
    };
  }

  async removeDependency(params: AgentDependencyRemoveParams): Promise<AgentDependencyRemoveResult> {
    const existed = this.dependencies.delete(params.dependencyId);
    return { dependencyId: params.dependencyId, removed: existed };
  }

  // --- Agent Budget & Quota Management ---

  async setBudget(params: AgentBudgetSetParams): Promise<AgentBudgetSetResult> {
    const existing = this.budgets.get(params.targetId);
    const now = Date.now();

    const budget: AgentBudget = {
      targetId: params.targetId,
      targetType: params.targetType || "agent",
      quota: {
        maxRuntimeMs: params.quota.maxRuntimeMs ?? existing?.quota.maxRuntimeMs ?? 3600000,
        maxToolCalls: params.quota.maxToolCalls ?? existing?.quota.maxToolCalls ?? 500,
        maxProcesses: params.quota.maxProcesses ?? existing?.quota.maxProcesses ?? 10,
        maxMemoryMb: params.quota.maxMemoryMb ?? existing?.quota.maxMemoryMb ?? 2048,
        maxCpuPercent: params.quota.maxCpuPercent ?? existing?.quota.maxCpuPercent ?? 80,
        maxArtifacts: params.quota.maxArtifacts ?? existing?.quota.maxArtifacts ?? 50,
        maxArtifactSizeBytes: params.quota.maxArtifactSizeBytes ?? existing?.quota.maxArtifactSizeBytes ?? 104857600,
        maxBrowserSessions: params.quota.maxBrowserSessions ?? existing?.quota.maxBrowserSessions ?? 3,
        maxConcurrentAgents: params.quota.maxConcurrentAgents ?? existing?.quota.maxConcurrentAgents ?? 5,
      },
      usage: existing?.usage ?? {
        runtimeMs: 0,
        toolCalls: 0,
        processes: 0,
        memoryMb: 0,
        cpuPercent: 0,
        artifacts: 0,
        artifactSizeBytes: 0,
        browserSessions: 0,
        concurrentAgents: 0,
      },
      status: "normal",
      lastCheckedAt: now,
    };

    this.budgets.set(params.targetId, budget);
    this.saveToDisk();
    return { budget };
  }

  async getBudget(params: AgentBudgetGetParams): Promise<AgentBudgetGetResult> {
    let budget = this.budgets.get(params.targetId);
    if (!budget) {
      // Return default budget
      budget = {
        targetId: params.targetId,
        targetType: "agent",
        quota: {
          maxRuntimeMs: 3600000,
          maxToolCalls: 500,
          maxProcesses: 10,
          maxMemoryMb: 2048,
          maxCpuPercent: 80,
          maxArtifacts: 50,
          maxArtifactSizeBytes: 104857600,
          maxBrowserSessions: 3,
          maxConcurrentAgents: 5,
        },
        usage: {
          runtimeMs: 0,
          toolCalls: 0,
          processes: 0,
          memoryMb: 0,
          cpuPercent: 0,
          artifacts: 0,
          artifactSizeBytes: 0,
          browserSessions: 0,
          concurrentAgents: 0,
        },
        status: "normal",
        lastCheckedAt: Date.now(),
      };
      this.budgets.set(params.targetId, budget);
    }
    return { budget };
  }

  async checkBudget(params: AgentBudgetCheckParams): Promise<AgentBudgetCheckResult> {
    const { budget } = await this.getBudget({ targetId: params.targetId });

    if (params.increment) {
      if (params.increment.toolCalls) budget.usage.toolCalls += params.increment.toolCalls;
      if (params.increment.runtimeMs) budget.usage.runtimeMs += params.increment.runtimeMs;
      if (params.increment.processes) budget.usage.processes += params.increment.processes;
      if (params.increment.memoryMb) budget.usage.memoryMb = params.increment.memoryMb;
      if (params.increment.cpuPercent) budget.usage.cpuPercent = params.increment.cpuPercent;
      if (params.increment.artifacts) budget.usage.artifacts += params.increment.artifacts;
      if (params.increment.artifactSizeBytes) budget.usage.artifactSizeBytes += params.increment.artifactSizeBytes;
      if (params.increment.browserSessions) budget.usage.browserSessions += params.increment.browserSessions;
      if (params.increment.concurrentAgents) budget.usage.concurrentAgents += params.increment.concurrentAgents;
    }

    budget.lastCheckedAt = Date.now();

    const exceeded: string[] = [];
    if (budget.usage.toolCalls > budget.quota.maxToolCalls) exceeded.push("maxToolCalls");
    if (budget.usage.runtimeMs > budget.quota.maxRuntimeMs) exceeded.push("maxRuntimeMs");
    if (budget.usage.processes > budget.quota.maxProcesses) exceeded.push("maxProcesses");
    if (budget.usage.memoryMb > budget.quota.maxMemoryMb) exceeded.push("maxMemoryMb");
    if (budget.usage.artifacts > budget.quota.maxArtifacts) exceeded.push("maxArtifacts");
    if (budget.usage.artifactSizeBytes > budget.quota.maxArtifactSizeBytes) exceeded.push("maxArtifactSizeBytes");
    if (budget.usage.browserSessions > budget.quota.maxBrowserSessions) exceeded.push("maxBrowserSessions");

    const isExceeded = exceeded.length > 0;
    budget.status = isExceeded ? "exceeded" : "normal";
    this.saveToDisk();

    return {
      targetId: params.targetId,
      allowed: !isExceeded,
      status: budget.status,
      exceededFields: exceeded,
      actionRequired: isExceeded ? "approval_required" : "none",
    };
  }

  // --- Persistence ---

  private loadFromDisk(): void {
    if (this.plansFile && fs.existsSync(this.plansFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.plansFile, "utf-8"));
        for (const p of list) this.plans.set(p.planId, p);
      } catch {}
    }
    if (this.todosFile && fs.existsSync(this.todosFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.todosFile, "utf-8"));
        for (const t of list) this.todos.set(t.todoId, t);
      } catch {}
    }
    if (this.budgetsFile && fs.existsSync(this.budgetsFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.budgetsFile, "utf-8"));
        for (const b of list) this.budgets.set(b.targetId, b);
      } catch {}
    }
  }

  private saveToDisk(): void {
    if (this.plansFile) {
      try {
        fs.writeFileSync(this.plansFile, JSON.stringify(Array.from(this.plans.values()), null, 2));
      } catch {}
    }
    if (this.todosFile) {
      try {
        fs.writeFileSync(this.todosFile, JSON.stringify(Array.from(this.todos.values()), null, 2));
      } catch {}
    }
    if (this.budgetsFile) {
      try {
        fs.writeFileSync(this.budgetsFile, JSON.stringify(Array.from(this.budgets.values()), null, 2));
      } catch {}
    }
  }
}
