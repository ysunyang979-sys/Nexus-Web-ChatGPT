import WebSocket from "ws";
import type {
  JsonRpcRequest,
  JsonRpcId,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

export interface RunnerWsClientOptions {
  serverUrl: string;
  token: string;
  logger?: Logger;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: Error) => void;
  onMessage?: (data: WebSocket.Data) => void;
}

export class RunnerWsClient {
  private socket: WebSocket | null = null;
  private pendingRequests = new Map<
    JsonRpcId,
    {
      resolve: (result: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private reqCounter = 0;

  constructor(private readonly options: RunnerWsClientOptions) {}

  /**
   * Open WebSocket connection with Authorization Bearer header.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.options.token}`,
        };

        const ws = new WebSocket(this.options.serverUrl, {
          headers,
          handshakeTimeout: 10000,
          maxPayload: 32 * 1024 * 1024,
        });

        this.socket = ws;

        let opened = false;

        ws.on("open", () => {
          opened = true;
          this.options.onOpen?.();
          resolve();
        });

        ws.on("message", (data: WebSocket.Data) => {
          this.handleIncoming(data);
        });

        ws.on("close", (code: number, reason: Buffer) => {
          const reasonStr = reason.toString("utf-8");
          this.cleanupPending(new Error(`WebSocket closed (code: ${code}, reason: ${reasonStr})`));
          this.options.onClose?.(code, reasonStr);
          if (!opened) {
            reject(new Error(`Failed to connect (close code: ${code}, reason: ${reasonStr})`));
          }
        });

        ws.on("error", (err: Error) => {
          this.options.onError?.(err);
          if (!opened) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Send a typed JSON-RPC 2.0 Request and await response.
   */
  async call<TResult = unknown, TParams = Record<string, unknown>>(
    method: string,
    params?: TParams,
    timeoutMs: number = 10000
  ): Promise<TResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot call method: WebSocket is not open");
    }

    const id = `req_${++this.reqCounter}_${Date.now()}`;
    const request: JsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (res: unknown) => void,
        reject,
        timer,
      });

      this.socket!.send(JSON.stringify(request), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Send raw message string or object.
   */
  send(payload: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const str = typeof payload === "string" ? payload : JSON.stringify(payload);
      this.socket.send(str);
    }
  }

  /**
   * Close connection.
   */
  close(code: number = 1000, reason: string = "normal_closure"): void {
    if (this.socket) {
      try {
        this.socket.close(code, reason);
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    this.cleanupPending(new Error("WebSocket client closed"));
  }

  /**
   * Terminate socket immediately.
   */
  terminate(): void {
    if (this.socket) {
      try {
        this.socket.terminate();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    this.cleanupPending(new Error("WebSocket client terminated"));
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  get rawSocket(): WebSocket | null {
    return this.socket;
  }

  private handleIncoming(data: WebSocket.Data): void {
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      const parsed = JSON.parse(text) as Record<string, unknown>;

      if (parsed && typeof parsed === "object" && "id" in parsed && parsed.id !== null) {
        const pending = this.pendingRequests.get(parsed.id as JsonRpcId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(parsed.id as JsonRpcId);

          if ("error" in parsed && parsed.error) {
            const err = new Error((parsed.error as { message?: string }).message || "RPC Error");
            (err as Error & { code?: number; data?: unknown }).code = (parsed.error as { code?: number }).code;
            (err as Error & { code?: number; data?: unknown }).data = (parsed.error as { data?: unknown }).data;
            pending.reject(err);
          } else if ("result" in parsed) {
            pending.resolve(parsed.result);
          }
          return;
        }
      }

      // If not pending request response, forward to onMessage (e.g. Server-to-Runner RPC request)
      this.options.onMessage?.(data);
    } catch {
      // Pass raw data even if parse fails so router can return JSON-RPC parse error (-32700)
      this.options.onMessage?.(data);
    }
  }

  private cleanupPending(err: Error): void {
    for (const [, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }
}
