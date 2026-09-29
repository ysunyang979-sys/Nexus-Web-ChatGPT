import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DurableActionLedgerEntry, DurableActionStatus } from "@localbridge/protocol";

export type WalEventType =
  | "ACTION_PLANNED"
  | "ACTION_PREPARED"
  | "ACTION_STARTED"
  | "ACTION_EXECUTED"
  | "ACTION_OBSERVED"
  | "ACTION_VERIFICATION_STARTED"
  | "ACTION_VERIFICATION_COMPLETED"
  | "ACTION_COMMITTED"
  | "ACTION_FAILED"
  | "ACTION_ROLLED_BACK"
  | "ACTION_RETRY_UNSAFE"
  | "ACTION_UNKNOWN"
  | "ACTION_RECOVERING";

export interface WalEventRecord {
  sequence?: number;
  actionId: string;
  taskId: string;
  event: WalEventType;
  timestamp: number;
  entry?: Partial<DurableActionLedgerEntry>;
  payloadHash?: string;
  checksum?: string;
}

export const STATUS_RANK: Record<DurableActionStatus, number> = {
  PLANNED: 0,
  PREPARED: 1,
  STARTED: 2,
  EXECUTED: 3,
  OBSERVED: 3,
  POST_STATE: 3,
  VERIFYING: 4,
  UNKNOWN: 4,
  VERIFIED: 5,
  RECOVERING: 5,
  COMMITTED: 6,
  FAILED: 6,
  ROLLED_BACK: 6,
  RETRY_UNSAFE: 6,
};

export function statusFromWalEvent(event: WalEventType): DurableActionStatus {
  switch (event) {
    case "ACTION_PLANNED":
      return "PLANNED";
    case "ACTION_PREPARED":
      return "PREPARED";
    case "ACTION_STARTED":
      return "STARTED";
    case "ACTION_EXECUTED":
      return "EXECUTED";
    case "ACTION_OBSERVED":
      return "OBSERVED";
    case "ACTION_VERIFICATION_STARTED":
      return "VERIFYING";
    case "ACTION_VERIFICATION_COMPLETED":
      return "VERIFIED";
    case "ACTION_COMMITTED":
      return "COMMITTED";
    case "ACTION_FAILED":
      return "FAILED";
    case "ACTION_ROLLED_BACK":
      return "ROLLED_BACK";
    case "ACTION_RETRY_UNSAFE":
      return "RETRY_UNSAFE";
    case "ACTION_UNKNOWN":
      return "UNKNOWN";
    case "ACTION_RECOVERING":
      return "RECOVERING";
    default:
      return "PREPARED";
  }
}

/**
 * Apply a WAL event to the in-memory entry map with monotonic state progression.
 * Ensures idempotent replay: older status events will not downgrade an already committed or verified entry.
 */
export function applyWalEventToMap(
  entries: Map<string, DurableActionLedgerEntry>,
  record: WalEventRecord
): void {
  const existing = entries.get(record.actionId);
  const targetStatus = record.entry?.status || statusFromWalEvent(record.event);
  const targetRank = STATUS_RANK[targetStatus] ?? 0;

  if (!existing) {
    if (record.entry) {
      const fullEntry = { ...record.entry } as DurableActionLedgerEntry;
      fullEntry.status = targetStatus;
      entries.set(record.actionId, fullEntry);
    }
    return;
  }

  const currentRank = STATUS_RANK[existing.status] ?? 0;
  if (targetRank >= currentRank) {
    Object.assign(existing, record.entry);
    existing.status = targetStatus;
  } else {
    // Already in a more advanced status; fill in any missing historical timestamps or metadata
    if (record.entry) {
      for (const [key, value] of Object.entries(record.entry)) {
        if ((existing as any)[key] === undefined && value !== undefined) {
          (existing as any)[key] = value;
        }
      }
    }
  }
}

export class ActionLedgerWal {
  private readonly taskWalCounts = new Map<string, number>();
  private readonly taskCumulativeWalEvents = new Map<string, number>();
  private readonly taskCumulativeWalBytes = new Map<string, number>();
  private readonly taskSnapshotCounts = new Map<string, number>();

  constructor(private readonly ledgerDir: string) {}

  public getWalPath(taskId: string): string {
    return path.join(this.ledgerDir, `${taskId}-ledger.wal`);
  }

  public getSnapshotPath(taskId: string): string {
    return path.join(this.ledgerDir, `${taskId}-ledger.json`);
  }

  public append(taskId: string, record: WalEventRecord): void {
    const walPath = this.getWalPath(taskId);
    
    // 1. Generate Monotonic Sequence
    const nextSeq = (this.taskCumulativeWalEvents.get(taskId) || 0) + 1;
    record.sequence = nextSeq;

    // 2. Generate Payload Hash
    const payload = JSON.stringify({
      actionId: record.actionId,
      taskId: record.taskId,
      event: record.event,
      timestamp: record.timestamp,
      entry: record.entry
    });
    const payloadHash = crypto.createHash("sha256").update(payload).digest("hex");
    record.payloadHash = payloadHash;

    // 3. Generate Checksum
    const checksumString = `${record.sequence}:${payloadHash}`;
    const checksum = crypto.createHash("sha256").update(checksumString).digest("hex");
    record.checksum = checksum;

    // 4. Explicit Fsync
    const line = JSON.stringify(record) + "\n";
    const fd = fs.openSync(walPath, "a");
    try {
      fs.writeSync(fd, line, null, "utf-8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const lineBytes = Buffer.byteLength(line, "utf-8");
    this.taskWalCounts.set(taskId, (this.taskWalCounts.get(taskId) || 0) + 1);
    this.taskCumulativeWalEvents.set(taskId, nextSeq);
    this.taskCumulativeWalBytes.set(taskId, (this.taskCumulativeWalBytes.get(taskId) || 0) + lineBytes);
  }

  public replay(
    taskId: string,
    targetMap: Map<string, DurableActionLedgerEntry>
  ): { replayedEvents: number } {
    const walPath = this.getWalPath(taskId);
    if (!fs.existsSync(walPath)) return { replayedEvents: 0 };

    let replayedEvents = 0;
    let maxSeq = this.taskCumulativeWalEvents.get(taskId) || 0;
    try {
      const content = fs.readFileSync(walPath, "utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as WalEventRecord;
          
          if (record.checksum && record.payloadHash) {
            const expectedChecksum = crypto.createHash("sha256").update(`${record.sequence}:${record.payloadHash}`).digest("hex");
            if (record.checksum !== expectedChecksum) {
              throw new Error(`WAL Corruption detected: Checksum mismatch at sequence ${record.sequence}`);
            }
          }
          if (typeof record.sequence === "number" && record.sequence > maxSeq) {
            maxSeq = record.sequence;
          }
          
          applyWalEventToMap(targetMap, record);
          replayedEvents++;
        } catch {
          // Ignore corrupted or partially written trailing line
        }
      }
    } catch {
      // Ignore read errors during scanning
    }
    this.taskCumulativeWalEvents.set(taskId, Math.max(maxSeq, replayedEvents));
    return { replayedEvents };
  }

  public recordSnapshotTaken(taskId: string): void {
    this.taskWalCounts.set(taskId, 0);
    this.taskSnapshotCounts.set(taskId, (this.taskSnapshotCounts.get(taskId) || 0) + 1);
  }

  public getWalEventCount(taskId: string): number {
    return this.taskWalCounts.get(taskId) || 0;
  }

  public getSnapshotCount(taskId: string): number {
    return this.taskSnapshotCounts.get(taskId) || 0;
  }

  public getMetrics(
    taskId: string,
    currentActionCount: number
  ): {
    actionCount: number;
    walEventCount: number;
    snapshotCount: number;
    ledgerBytes: number;
    walBytes: number;
  } {
    const jsonPath = this.getSnapshotPath(taskId);
    const walPath = this.getWalPath(taskId);

    let ledgerBytes = 0;
    let walBytes = 0;
    try {
      if (fs.existsSync(jsonPath)) {
        ledgerBytes = fs.statSync(jsonPath).size;
      }
    } catch {}
    try {
      if (fs.existsSync(walPath)) {
        walBytes = fs.statSync(walPath).size;
      }
    } catch {}

    return {
      actionCount: currentActionCount,
      walEventCount: this.taskCumulativeWalEvents.get(taskId) || 0,
      snapshotCount: this.taskSnapshotCounts.get(taskId) || 0,
      ledgerBytes,
      walBytes: walBytes > 0 ? walBytes : (this.taskCumulativeWalBytes.get(taskId) || 0),
    };
  }
}
