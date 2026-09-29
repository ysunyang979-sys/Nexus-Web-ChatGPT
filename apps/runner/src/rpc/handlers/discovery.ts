import type {
  DiscoveryQueryParams,
  DiscoveryQueryResult,
  InspectResourceParams,
  InspectResourceResult,
  LaunchApplicationParams,
  LaunchApplicationResult,
  VerifyResourceParams,
  VerifyResourceResult,
  ContentIndexQueryParams,
  ContentIndexQueryResult,
  DiscoveryRefreshParams,
  DiscoveryRefreshResult,
} from "@localbridge/protocol";
import type { DiscoveryService } from "../../discovery/discovery-service.js";

export function createDiscoveryQueryHandler(service: DiscoveryService) {
  return async (params: DiscoveryQueryParams): Promise<DiscoveryQueryResult> => {
    return service.query(params);
  };
}

export function createDiscoveryInspectHandler(service: DiscoveryService) {
  return async (params: InspectResourceParams): Promise<InspectResourceResult> => {
    return service.inspect(params);
  };
}

export function createDiscoveryLaunchHandler(service: DiscoveryService) {
  return async (params: LaunchApplicationParams): Promise<LaunchApplicationResult> => {
    return service.launch(params);
  };
}

export function createDiscoveryVerifyHandler(service: DiscoveryService) {
  return async (params: VerifyResourceParams): Promise<VerifyResourceResult> => {
    return service.verify(params);
  };
}

export function createDiscoveryIndexSearchHandler(service: DiscoveryService) {
  return async (params: ContentIndexQueryParams): Promise<ContentIndexQueryResult> => {
    return service.searchContent(params);
  };
}

export function createDiscoveryRefreshHandler(service: DiscoveryService) {
  return async (params: DiscoveryRefreshParams): Promise<DiscoveryRefreshResult> => {
    return service.refresh(params);
  };
}
