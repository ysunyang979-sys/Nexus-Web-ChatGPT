import type {
  MemorySetParams,
  MemorySetResult,
  MemoryGetParams,
  MemoryGetResult,
  MemorySearchParams,
  MemorySearchResult,
  MemoryDeleteParams,
  MemoryDeleteResult,
  MemoryPurgeParams,
  MemoryPurgeResult,
} from "@localbridge/protocol";
import type { AgentMemoryService } from "../../memory/memory-service.js";

export function createMemorySetHandler(service: AgentMemoryService) {
  return async (params: MemorySetParams): Promise<MemorySetResult> => {
    return service.set(params);
  };
}

export function createMemoryGetHandler(service: AgentMemoryService) {
  return async (params: MemoryGetParams): Promise<MemoryGetResult> => {
    return service.get(params);
  };
}

export function createMemorySearchHandler(service: AgentMemoryService) {
  return async (params: MemorySearchParams): Promise<MemorySearchResult> => {
    return service.search(params);
  };
}

export function createMemoryDeleteHandler(service: AgentMemoryService) {
  return async (params: MemoryDeleteParams): Promise<MemoryDeleteResult> => {
    return service.delete(params);
  };
}

export function createMemoryPurgeHandler(service: AgentMemoryService) {
  return async (params: MemoryPurgeParams): Promise<MemoryPurgeResult> => {
    return service.purge(params);
  };
}
