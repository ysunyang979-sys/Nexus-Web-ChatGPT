import WebSocket from "ws";
import { EventEmitter } from "node:events";

export interface CdpResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: string;
  };
}

export class CdpSession extends EventEmitter {
  private ws?: WebSocket;
  private nextId = 1;
  private readonly pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  constructor(public readonly wsUrl: string) {
    super();
  }

  async connect(timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP connection to ${this.wsUrl} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          clearTimeout(timer);
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.id !== undefined) {
              const pending = this.pendingRequests.get(msg.id);
              if (pending) {
                this.pendingRequests.delete(msg.id);
                if (msg.error) {
                  pending.reject(new Error(`CDP Error ${msg.error.code}: ${msg.error.message}`));
                } else {
                  pending.resolve(msg.result);
                }
              }
            } else if (msg.method) {
              this.emit(msg.method, msg.params);
              this.emit("event", msg.method, msg.params);
            }
          } catch (err) {
            this.emit("error", err);
          }
        });

        this.ws.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });

        this.ws.on("close", () => {
          this.emit("close");
          for (const [, p] of this.pendingRequests) {
            p.reject(new Error("CDP session closed"));
          }
          this.pendingRequests.clear();
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async send(method: string, params: Record<string, any> = {}, timeoutMs = 30000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`CDP session is not open (readyState=${this.ws?.readyState})`);
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`CDP request ${method} (id=${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws!.send(message);
    });
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = undefined;
    }
  }

  isConnected(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
  }
}
