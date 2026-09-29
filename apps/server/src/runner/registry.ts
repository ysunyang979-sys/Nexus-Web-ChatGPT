import type { WebSocket } from "ws";
import {
  RunnerCapabilities,
  RunnerPublic,
  RunnerSystemInfo,
  RunnerRpcMap,
  RunnerRpcMethodName,
  RunnerRpcMethods,
  RunnerRpcSchemas,
  RpcRequestOptions,
  LocalBridgeError,
  LocalBridgeErrorCode,
  RemoteRpcError,
  generateRequestId,
  MAX_RPC_MESSAGE_SIZE,
  MAX_PENDING_REQUESTS,
  MIN_RPC_TIMEOUT,
  MAX_RPC_TIMEOUT,
  DEFAULT_RPC_TIMEOUT,
  SYSTEM_PING_TIMEOUT,
  SYSTEM_INFO_TIMEOUT,
} from "@localbridge/protocol";
import type { TokenRow } from "../db/schema.js";
import type { Logger } from "@localbridge/shared";
import type { FastifyBaseLogger } from "fastify";

export type CompatibleLogger = Logger | FastifyBaseLogger;

export interface PendingRequest {
  id: string;
  method: string;
  createdAt: number;
  timeoutAt: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
  cleanup: () => void;
}

export interface RunnerConnectionMetrics {
  requestsSent: number;
  responsesReceived: number;
  timeouts: number;
  errors: number;
}

export interface RunnerConnectionOptions {
  runnerId: string;
  name: string;
  socket: WebSocket;
  tokenRecord: TokenRow;
  platform: string;
  arch: string;
  version: string;
  protocolVersion: string;
  capabilities: RunnerCapabilities;
  systemInfo: RunnerSystemInfo;
  connectedAt?: number;
  lastSeenAt?: number;
  missedPings?: number;
  logger?: CompatibleLogger;
  isTokenActive?: () => boolean;
}

export interface RunnerConnection {
  readonly runnerId: string;
  readonly name: string;
  readonly socket: WebSocket;
  readonly tokenRecord: TokenRow;
  readonly platform: string;
  readonly arch: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: RunnerCapabilities;
  readonly systemInfo: RunnerSystemInfo;
  connectedAt: number;
  lastSeenAt: number;
  missedPings: number;

  readonly pendingRequests: Map<string, PendingRequest>;
  readonly metrics: RunnerConnectionMetrics;

  request<M extends keyof RunnerRpcMap>(
    method: M,
    params: RunnerRpcMap[M]["params"],
    options?: RpcRequestOptions
  ): Promise<RunnerRpcMap[M]["result"]>;

  handleIncomingMessage(data: string | Buffer): void;
  dispose(): void;
}

export class ActiveRunnerConnection implements RunnerConnection {
  readonly runnerId: string;
  readonly name: string;
  readonly socket: WebSocket;
  readonly tokenRecord: TokenRow;
  readonly platform: string;
  readonly arch: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: RunnerCapabilities;
  readonly systemInfo: RunnerSystemInfo;
  connectedAt: number;
  lastSeenAt: number;
  missedPings: number;

  readonly pendingRequests = new Map<string, PendingRequest>();
  readonly metrics: RunnerConnectionMetrics = {
    requestsSent: 0,
    responsesReceived: 0,
    timeouts: 0,
    errors: 0,
  };

  private readonly logger?: CompatibleLogger;
  private readonly isTokenActive?: () => boolean;

  constructor(options: RunnerConnectionOptions) {
    this.runnerId = options.runnerId;
    this.name = options.name;
    this.socket = options.socket;
    this.tokenRecord = options.tokenRecord;
    this.platform = options.platform;
    this.arch = options.arch;
    this.version = options.version;
    this.protocolVersion = options.protocolVersion;
    this.capabilities = options.capabilities;
    this.systemInfo = options.systemInfo;
    this.connectedAt = options.connectedAt ?? Date.now();
    this.lastSeenAt = options.lastSeenAt ?? Date.now();
    this.missedPings = options.missedPings ?? 0;
    this.logger = options.logger;
    this.isTokenActive = options.isTokenActive;
  }

  async request<M extends keyof RunnerRpcMap>(
    method: M,
    params: RunnerRpcMap[M]["params"],
    options?: RpcRequestOptions
  ): Promise<RunnerRpcMap[M]["result"]> {
    if (this.isTokenActive && !this.isTokenActive()) {
      try { this.socket.close(4003, "runner_token_inactive"); } catch {}
      throw new LocalBridgeError(
        LocalBridgeErrorCode.UNAUTHORIZED,
        `Runner "${this.runnerId}" token is revoked or expired`
      );
    }
    // 1. Validate params against schema
    const methodSchemas = RunnerRpcSchemas[method];
    if (methodSchemas?.params) {
      let paramsToValidate = params;
      if (params && typeof params === "object") {
        const copy = { ...(params as Record<string, unknown>) };
        delete copy._executionContext;
        delete copy._toolName;
        delete copy.failVerification;
        delete copy.requireScreenChange;
        delete copy.testScreenHash;
        delete copy.testPostScreenHash;
        if (
          !method.startsWith("agentTask.") &&
          !method.startsWith("agent_task.") &&
          !method.startsWith("safetyLayer.") &&
          !method.startsWith("safety_layer.") &&
          !method.startsWith("checkpoint.")
        ) {
          delete copy.taskId;
          delete copy.executionId;
          delete copy.sessionId;
          delete copy.idempotencyKey;
            delete copy.callerPurpose;
        }
        paramsToValidate = copy as any;
      }
      const validation = methodSchemas.params.safeParse(paramsToValidate);
      if (!validation.success) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.INVALID_REQUEST,
          `Invalid parameters for RPC method "${method}"`,
          validation.error.flatten()
        );
      }
    }

    // 2. Generate request ID & serialize request
    const requestId = generateRequestId();
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    });

    // 3. Validate payload size (byte-based check)
    if (Buffer.byteLength(payload, "utf8") > MAX_RPC_MESSAGE_SIZE) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RPC_MESSAGE_TOO_LARGE,
        `RPC request payload exceeds ${MAX_RPC_MESSAGE_SIZE} bytes`
      );
    }

    // 4. Verify socket is open
    if (this.socket.readyState !== 1 /* WebSocket.OPEN */) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_DISCONNECTED,
        `Runner "${this.runnerId}" socket is not open (state: ${this.socket.readyState})`
      );
    }

    // 5. Enforce MAX_PENDING_REQUESTS = 64
    if (this.pendingRequests.size >= MAX_PENDING_REQUESTS) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.RUNNER_BUSY,
        `Runner "${this.runnerId}" pending requests limit reached (${MAX_PENDING_REQUESTS})`
      );
    }

    // Check pre-aborted signal
    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new Error("RPC request aborted");
    }

    // 6. Determine and clamp timeout
    let timeoutMs = options?.timeoutMs;
    if (timeoutMs === undefined) {
      if (method === RunnerRpcMethods.SystemPing) {
        timeoutMs = SYSTEM_PING_TIMEOUT;
      } else if (method === RunnerRpcMethods.SystemInfo) {
        timeoutMs = SYSTEM_INFO_TIMEOUT;
      } else {
        timeoutMs = DEFAULT_RPC_TIMEOUT;
      }
    }
    timeoutMs = Math.max(MIN_RPC_TIMEOUT, Math.min(MAX_RPC_TIMEOUT, timeoutMs));

    return new Promise<RunnerRpcMap[M]["result"]>((resolve, reject) => {
      const createdAt = Date.now();
      const timeoutAt = createdAt + timeoutMs;
      let timer: NodeJS.Timeout | undefined;

      // Unified cleanup function across all 6 termination paths:
      // (1) success, (2) remote error, (3) timeout, (4) disconnect, (5) local abort, (6) send failure
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        this.pendingRequests.delete(requestId);
        if (options?.signal && onAbort) {
          options.signal.removeEventListener("abort", onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        reject(options?.signal?.reason ?? new Error("RPC request aborted"));
      };

      if (options?.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      timer = setTimeout(() => {
        cleanup();
        this.metrics.timeouts++;
        const duration = Date.now() - createdAt;

        this.logger?.warn(
          {
            event: "rpc_request_timeout",
            runner_id: this.runnerId,
            request_id: requestId,
            method,
            duration_ms: duration,
            result_status: "timeout",
          },
          `RPC request "${method}" (id: ${requestId}) timed out after ${timeoutMs}ms`
        );

        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.RPC_TIMEOUT,
            `RPC request "${method}" timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);

      const pending: PendingRequest = {
        id: requestId,
        method,
        createdAt,
        timeoutAt,
        resolve: (val: unknown) => {
          cleanup();
          resolve(val as RunnerRpcMap[M]["result"]);
        },
        reject: (err: Error) => {
          cleanup();
          reject(err);
        },
        timer,
        cleanup,
      };

      // 7. Register PendingRequest
      this.pendingRequests.set(requestId, pending);

      // 8. Send payload
      try {
        this.socket.send(payload, (err) => {
          if (err) {
            cleanup();
            this.metrics.errors++;
            reject(
              new LocalBridgeError(
                LocalBridgeErrorCode.RPC_REMOTE_ERROR,
                `Failed to send RPC request: ${err.message}`
              )
            );
          } else {
            this.metrics.requestsSent++;
            this.logger?.info(
              {
                event: "rpc_request_sent",
                runner_id: this.runnerId,
                request_id: requestId,
                method,
              },
              `RPC request "${method}" sent to runner "${this.runnerId}"`
            );
          }
        });
      } catch (err) {
        cleanup();
        this.metrics.errors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        reject(
          new LocalBridgeError(
            LocalBridgeErrorCode.RPC_REMOTE_ERROR,
            `Failed to send RPC request: ${errMsg}`
          )
        );
      }
    });
  }

  handleIncomingMessage(data: string | Buffer): void {
    const rawLen = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
    if (rawLen > MAX_RPC_MESSAGE_SIZE) {
      this.logger?.warn(
        {
          event: "rpc_invalid_message",
          runner_id: this.runnerId,
          reason: "message_too_large",
          size: rawLen,
        },
        `Incoming message exceeds ${MAX_RPC_MESSAGE_SIZE} bytes`
      );
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger?.warn(
        {
          event: "rpc_invalid_message",
          runner_id: this.runnerId,
          reason: "json_parse_error",
        },
        "Failed to parse incoming JSON message"
      );
      return;
    }

    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!id || !this.pendingRequests.has(id)) {
      this.logger?.warn(
        {
          event: "rpc_unknown_response_id",
          runner_id: this.runnerId,
          request_id: id,
        },
        `Received response for unknown or already completed request ID: ${id}`
      );
      return;
    }

    const pending = this.pendingRequests.get(id)!;
    const duration = Date.now() - pending.createdAt;

    // Check error
    if (parsed.error && typeof parsed.error === "object") {
      const errObj = parsed.error as { code?: unknown; message?: unknown; data?: unknown };
      const code = typeof errObj.code === "number" ? errObj.code : -32603;
      const message = typeof errObj.message === "string" ? errObj.message : "Remote RPC error";
      this.metrics.errors++;

      this.logger?.warn(
        {
          event: "rpc_remote_error",
          runner_id: this.runnerId,
          request_id: id,
          method: pending.method,
          duration_ms: duration,
          result_status: "error",
          error_code: code,
        },
        `Remote RPC error for "${pending.method}": [${code}] ${message}`
      );

      const dataObj =
        errObj.data && typeof errObj.data === "object"
          ? (errObj.data as Record<string, unknown>)
          : undefined;
      if (
        dataObj &&
        typeof dataObj.code === "string" &&
        Object.values(LocalBridgeErrorCode).includes(
          dataObj.code as LocalBridgeErrorCode
        )
      ) {
        pending.reject(
          new LocalBridgeError(
            dataObj.code as LocalBridgeErrorCode,
            message,
            dataObj
          )
        );
      } else {
        pending.reject(new RemoteRpcError(code, message, errObj.data));
      }
      return;
    }

    // Check result
    if ("result" in parsed) {
      const methodSchemas = RunnerRpcSchemas[pending.method as RunnerRpcMethodName];
      if (methodSchemas?.result) {
        const val = methodSchemas.result.safeParse(parsed.result);
        if (!val.success) {
          this.metrics.errors++;
          this.logger?.warn(
            {
              event: "rpc_invalid_message",
              runner_id: this.runnerId,
              request_id: id,
              method: pending.method,
              duration_ms: duration,
              errors: val.error.flatten(),
            },
            `Invalid response payload schema for method "${pending.method}"`
          );

          pending.reject(
            new LocalBridgeError(
              LocalBridgeErrorCode.RPC_INVALID_RESPONSE,
              `Invalid response format for method "${pending.method}"`,
              val.error.flatten()
            )
          );
          return;
        }

        this.metrics.responsesReceived++;
        this.logger?.info(
          {
            event: "rpc_response_received",
            runner_id: this.runnerId,
            request_id: id,
            method: pending.method,
            duration_ms: duration,
            result_status: "success",
          },
          `RPC response received for "${pending.method}" (${duration}ms)`
        );

        pending.resolve(val.data);
        return;
      }

      // If no schema registered, resolve as is
      this.metrics.responsesReceived++;
      pending.resolve(parsed.result);
      return;
    }

    // Neither error nor result
    this.metrics.errors++;
    pending.reject(
      new LocalBridgeError(
        LocalBridgeErrorCode.RPC_INVALID_RESPONSE,
        "Malformed JSON-RPC response missing both result and error"
      )
    );
  }

  dispose(): void {
    const count = this.pendingRequests.size;
    const requests = Array.from(this.pendingRequests.values());
    for (const pending of requests) {
      pending.reject(
        new LocalBridgeError(
          LocalBridgeErrorCode.RUNNER_DISCONNECTED,
          `Runner "${this.runnerId}" disconnected while request "${pending.method}" (id: ${pending.id}) was pending`
        )
      );
    }
    this.pendingRequests.clear();

    if (count > 0) {
      this.logger?.warn(
        {
          event: "rpc_runner_disconnected",
          runner_id: this.runnerId,
          pending_count: count,
        },
        `Rejected ${count} pending requests due to runner disconnect`
      );
    }
  }
}

export class RunnerRegistry {
  private readonly connections = new Map<string, RunnerConnection>();
  private readonly disconnectListeners: Array<(runnerId: string) => void> = [];

  constructor(private readonly logger?: CompatibleLogger) {}

  onDisconnect(listener: (runnerId: string) => void): () => void {
    this.disconnectListeners.push(listener);
    return () => {
      const idx = this.disconnectListeners.indexOf(listener);
      if (idx !== -1) this.disconnectListeners.splice(idx, 1);
    };
  }

  private notifyDisconnect(runnerId: string): void {
    for (const listener of this.disconnectListeners) {
      try {
        listener(runnerId);
      } catch (err) {
        this.logger?.error({ err, runnerId }, "Error in runner disconnect listener");
      }
    }
  }

  /**
   * Register a newly handshaked runner connection.
   * If a runner with the same runnerId is already connected, the existing connection
   * is replaced and closed gracefully.
   */
  register(connection: RunnerConnection): void {
    const existing = this.connections.get(connection.runnerId);
    if (existing) {
      this.logger?.warn(
        {
          event: "runner_session_replaced",
          runnerId: connection.runnerId,
          tokenId: connection.tokenRecord.id,
        },
        `Runner session for "${connection.runnerId}" replaced by a new connection`
      );

      existing.dispose?.();
      try {
        existing.socket.close(4000, "runner_session_replaced");
      } catch {
        // Socket may already be closed
      }
    }

    this.connections.set(connection.runnerId, connection);

    this.logger?.info(
      {
        event: "runner_registered",
        runnerId: connection.runnerId,
        name: connection.name,
        platform: connection.platform,
        arch: connection.arch,
        version: connection.version,
        activeRunners: this.connections.size,
      },
      `Runner "${connection.name}" (${connection.runnerId}) registered successfully`
    );
  }

  /**
   * Unregister a runner connection.
   * Only unregisters if the socket matches the current active socket for this runnerId.
   */
  unregister(runnerId: string, socket?: WebSocket): boolean {
    const existing = this.connections.get(runnerId);
    if (!existing) return false;

    if (socket && existing.socket !== socket) {
      // Different socket (e.g. older replaced session closing)
      return false;
    }

    this.connections.delete(runnerId);
    existing.dispose?.();

    this.logger?.info(
      {
        event: "runner_disconnected",
        runnerId,
        activeRunners: this.connections.size,
      },
      `Runner "${runnerId}" unregistered`
    );

    this.notifyDisconnect(runnerId);

    return true;
  }

  /**
   * Check if a runner is active.
   */
  has(runnerId: string): boolean {
    return this.connections.has(runnerId);
  }

  /**
   * Find an active runner by ID.
   */
  get(runnerId: string): RunnerConnection | undefined {
    return this.connections.get(runnerId);
  }

  /**
   * Number of active online runners.
   */
  count(): number {
    return this.connections.size;
  }

  /**
   * Iterable of connected runner IDs.
   */
  keys(): IterableIterator<string> {
    return this.connections.keys();
  }

  /**
   * Get public metadata for all active runners (redacting tokens, roots, and internal state).
   */
  list(): RunnerPublic[] {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.runnerId,
      name: conn.name,
      status: "online",
      platform: conn.platform,
      arch: conn.arch,
      version: conn.version,
      capabilities: conn.capabilities,
      connectedAt: conn.connectedAt,
      lastSeenAt: conn.lastSeenAt,
    }));
  }

  /**
   * Close all active runner connections during server shutdown.
   */
  closeAll(): void {
    const ids = Array.from(this.connections.keys());
    for (const conn of this.connections.values()) {
      conn.dispose?.();
      try {
        conn.socket.close(1001, "server_shutdown");
      } catch {
        // Ignore
      }
    }
    this.connections.clear();
    for (const runnerId of ids) {
      this.notifyDisconnect(runnerId);
    }
  }

  closeByTokenId(tokenId: string): number {
    let closed = 0;
    for (const [runnerId, conn] of Array.from(this.connections.entries())) {
      if (conn.tokenRecord.id !== tokenId) continue;
      this.connections.delete(runnerId);
      conn.dispose();
      try { conn.socket.close(4003, "runner_token_revoked"); } catch {}
      this.notifyDisconnect(runnerId);
      closed++;
    }
    return closed;
  }
}
