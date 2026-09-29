import {
  RunnerRpcMap,
  RpcRequestOptions,
  LocalBridgeError,
  LocalBridgeErrorCode,
} from "@localbridge/protocol";
import type { RunnerRegistry } from "./registry.js";

export class RunnerRpcService {
  constructor(private readonly registry: RunnerRegistry) {}

  /**
   * Send a strongly-typed RPC request to an active runner.
   * If the runner is not registered and active in memory, throws RUNNER_OFFLINE.
   */
  async request<M extends keyof RunnerRpcMap>(
    runnerId: string,
    method: M,
    params: RunnerRpcMap[M]["params"],
    options?: RpcRequestOptions
  ): Promise<RunnerRpcMap[M]["result"]>;
  async request(
    runnerId: string,
    method: string,
    params: any,
    options?: RpcRequestOptions
  ): Promise<any>;
  async request(
    runnerId: string,
    method: any,
    params: any,
    options?: RpcRequestOptions
  ): Promise<any> {
    const connection = this.registry.get(runnerId);
    if (!connection) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_OFFLINE,
        `Runner "${runnerId}" is not online`
      );
    }

    return connection.request(method, params, options);
  }
}
