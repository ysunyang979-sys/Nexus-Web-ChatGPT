import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { Logger } from "@localbridge/shared";
import type {
  LocalBridgeEvent,
  EventSubscription,
  EventPublishParams,
  EventPublishResult,
  EventSubscribeParams,
  EventSubscribeResult,
  EventUnsubscribeParams,
  EventUnsubscribeResult,
  EventPollParams,
  EventPollResult,
  EventHistoryParams,
  EventHistoryResult,
  EventReplayParams,
  EventReplayResult,
} from "@localbridge/protocol";

interface ActiveSubscription {
  record: EventSubscription;
  queue: LocalBridgeEvent[];
}

export class LocalBridgeEventBus extends EventEmitter {
  private readonly events: LocalBridgeEvent[] = [];
  private readonly subscriptions = new Map<string, ActiveSubscription>();
  private readonly logFilePath?: string;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly logger?: Logger
  ) {
    super();
    if (this.runnerStateDir) {
      this.logFilePath = path.join(this.runnerStateDir, "event-bus-store.jsonl");
      this.loadFromDisk();
    }
  }

  // --- Publish ---

  async publish(params: EventPublishParams): Promise<EventPublishResult> {
    const eventId = `evt_${crypto.randomUUID()}`;
    const timestamp = Date.now();

    const event: LocalBridgeEvent = {
      eventId,
      topic: params.topic,
      payload: params.payload,
      timestamp,
      source: params.source || "localbridge",
      runner: "windows",
      taskId: params.taskId || (typeof params.payload === "object" && params.payload !== null ? (params.payload as any).taskId : undefined),
      executionId: params.executionId || (typeof params.payload === "object" && params.payload !== null ? (params.payload as any).executionId : undefined),
      actionId: params.actionId || (typeof params.payload === "object" && params.payload !== null ? (params.payload as any).actionId : undefined),
      checkpointId: params.checkpointId || (typeof params.payload === "object" && params.payload !== null ? (params.payload as any).checkpointId : undefined),
      stateHash: params.stateHash,
      sessionId: params.sessionId,
      type: params.type,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
    };

    this.events.push(event);
    if (this.events.length > 5000) {
      this.events.shift();
    }

    this.appendToFile(event);

    // Dispatch to subscriptions
    let recipientCount = 0;
    for (const [, sub] of this.subscriptions) {
      if (this.matchesPattern(params.topic, sub.record.topicPattern)) {
        sub.queue.push(event);
        if (sub.queue.length > sub.record.maxBufferSize) {
          sub.queue.shift();
        }
        recipientCount++;
      }
    }

    this.emit(params.topic, event);
    this.emit("*", event);

    return {
      eventId,
      topic: params.topic,
      published: true,
      timestamp,
      recipientCount,
    };
  }

  // --- Subscribe ---

  async subscribe(params: EventSubscribeParams): Promise<EventSubscribeResult> {
    const subscriptionId = `sub_${crypto.randomUUID().slice(0, 8)}`;
    const subRecord: EventSubscription = {
      subscriptionId,
      subscriberId: params.subscriberId,
      topicPattern: params.topicPattern || "*",
      createdAt: Date.now(),
      maxBufferSize: params.maxBufferSize || 100,
      active: true,
    };

    this.subscriptions.set(subscriptionId, {
      record: subRecord,
      queue: [],
    });

    return { subscription: subRecord };
  }

  // --- Unsubscribe ---

  async unsubscribe(params: EventUnsubscribeParams): Promise<EventUnsubscribeResult> {
    const existed = this.subscriptions.delete(params.subscriptionId);
    return {
      subscriptionId: params.subscriptionId,
      unsubscribed: existed,
    };
  }

  // --- Poll ---

  async poll(params: EventPollParams): Promise<EventPollResult> {
    const sub = this.subscriptions.get(params.subscriptionId);
    if (!sub) {
      throw new Error(`Subscription '${params.subscriptionId}' not found`);
    }

    const limit = params.limit || 20;
    const retrieved = sub.queue.splice(0, limit);

    return {
      subscriptionId: params.subscriptionId,
      events: retrieved,
      totalRetrieved: retrieved.length,
      remainingCount: sub.queue.length,
    };
  }

  // --- History ---

  async history(params: EventHistoryParams): Promise<EventHistoryResult> {
    let list = this.events;

    if (params.topicPattern) {
      list = list.filter((e) => this.matchesPattern(e.topic, params.topicPattern!));
    }
    if (params.sinceTimestamp) {
      list = list.filter((e) => e.timestamp >= params.sinceTimestamp!);
    }
    if (params.correlationId) {
      list = list.filter((e) => e.correlationId === params.correlationId);
    }
    if (params.source) {
      list = list.filter((e) => e.source === params.source);
    }

    const paginated = list.slice(0, params.limit || 50);

    return {
      events: paginated,
      totalFound: list.length,
    };
  }

  // --- Replay ---

  async replay(params: EventReplayParams): Promise<EventReplayResult> {
    const fromTime = params.fromTimestamp;
    const toTime = params.toTimestamp || Date.now();

    let matched = this.events.filter((e) => e.timestamp >= fromTime && e.timestamp <= toTime);
    if (params.topicPattern) {
      matched = matched.filter((e) => this.matchesPattern(e.topic, params.topicPattern!));
    }

    if (params.targetSubscriptionId) {
      const sub = this.subscriptions.get(params.targetSubscriptionId);
      if (sub) {
        for (const evt of matched) {
          sub.queue.push(evt);
          if (sub.queue.length > sub.record.maxBufferSize) {
            sub.queue.shift();
          }
        }
      }
    } else {
      for (const evt of matched) {
        this.emit(evt.topic, evt);
      }
    }

    return {
      replayedCount: matched.length,
      fromTimestamp: fromTime,
      toTimestamp: toTime,
    };
  }

  // --- Internal Helpers ---

  private matchesPattern(topic: string, pattern: string): boolean {
    if (pattern === "*" || pattern === topic) return true;
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return topic === prefix || topic.startsWith(`${prefix}.`);
    }
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return topic.startsWith(prefix);
    }
    return false;
  }

  private loadFromDisk(): void {
    if (!this.logFilePath || !fs.existsSync(this.logFilePath)) return;
    try {
      const content = fs.readFileSync(this.logFilePath, "utf-8");
      const lines = content.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          this.events.push(JSON.parse(line));
        } catch {}
      }
    } catch {}
  }

  private appendToFile(event: LocalBridgeEvent): void {
    if (!this.logFilePath) return;
    try {
      fs.appendFileSync(this.logFilePath, JSON.stringify(event) + "\n", "utf-8");
    } catch {}
  }
}
