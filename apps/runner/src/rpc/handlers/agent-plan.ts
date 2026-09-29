import type { AgentPlanService } from "../../agent-plan/plan-service.js";

export function createAgentPlanHandlers(service: AgentPlanService) {
  return {
    createPlan: (params: any) => service.createPlan(params),
    getPlan: (params: any) => service.getPlan(params),
    updatePlan: (params: any) => service.updatePlan(params),
    deletePlan: (params: any) => service.deletePlan(params),
    completePlan: (params: any) => service.completePlan(params),
    listPlans: (params: any) => service.listPlans(params),

    createTodo: (params: any) => service.createTodo(params),
    updateTodo: (params: any) => service.updateTodo(params),
    completeTodo: (params: any) => service.completeTodo(params),
    listTodos: (params: any) => service.listTodos(params),

    delegate: (params: any) => service.delegate(params),
    fork: (params: any) => service.fork(params),
    join: (params: any) => service.join(params),
    supervise: (params: any) => service.supervise(params),

    createDependency: (params: any) => service.createDependency(params),
    listDependencies: (params: any) => service.listDependencies(params),
    removeDependency: (params: any) => service.removeDependency(params),

    setBudget: (params: any) => service.setBudget(params),
    getBudget: (params: any) => service.getBudget(params),
    checkBudget: (params: any) => service.checkBudget(params),
  };
}
