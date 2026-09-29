import type { WebSocket } from "ws";
import type { Logger } from "@localbridge/shared";

export interface HeartbeatMonitorOptions {
  heartbeatIntervalMs?: number;
  maxMissedHeartbeats?: number;
  onDeadConnection: () => void;
  logger?: Logger;
}

export class HeartbeatMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private lastActivity = Date.now();
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: HeartbeatMonitorOptions) {
    this.intervalMs = options.heartbeatIntervalMs ?? 15000;
    const maxMissed = options.maxMissedHeartbeats ?? 3;
    this.timeoutMs = this.intervalMs * maxMissed;
  }

  /**
   * Start tracking heartbeats on an active WebSocket.
   */
  start(socket: WebSocket, serverIntervalMs?: number): void {
    this.stop();
    this.lastActivity = Date.now();
    const effectiveInterval = serverIntervalMs || this.intervalMs;
    const maxMissed = this.options.maxMissedHeartbeats ?? 3;
    const effectiveTimeout = effectiveInterval * maxMissed;

    // Server sends ping -> ws automatically replies with pong.
    socket.on("ping", () => {
      this.lastActivity = Date.now();
    });

    socket.on("message", () => {
      this.lastActivity = Date.now();
    });

    this.checkInterval = setInterval(() => {
      const elapsed = Date.now() - this.lastActivity;
      if (elapsed > effectiveTimeout) {
        this.options.logger?.warn(
          { elapsedMs: elapsed, timeoutMs: effectiveTimeout },
          "No heartbeat ping received from server within timeout, connection considered dead"
        );
        this.stop();
        this.options.onDeadConnection();
      }
    }, effectiveInterval);
  }

  /**
   * Stop tracking.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
  }
}
