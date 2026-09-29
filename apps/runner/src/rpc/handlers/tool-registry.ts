import type { ToolRegistryService } from "../../tools/tool-registry.js";

export function createToolRegistryListHandler(service: ToolRegistryService) {
  return async (params?: {
    category?: string;
    riskLevel?: string;
    executionMode?: string;
    providerId?: string;
    includeDisabled?: boolean;
  }): Promise<any> => {
    const tools = service.list(params);
    return {
      tools,
      totalCount: tools.length,
      version: service.version(),
    };
  };
}

export function createToolRegistryGetHandler(service: ToolRegistryService) {
  return async (params: { name: string; version?: string; taskId?: string }): Promise<any> => {
    const tool = service.get(params.name, {
      version: params.version,
      taskId: params.taskId,
    });
    return { tool: tool || null, found: Boolean(tool) };
  };
}
