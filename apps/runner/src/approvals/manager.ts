import crypto from "node:crypto";
import {
  LocalBridgeError,
  LocalBridgeErrorCode,
  type ApprovalRequest,
  type ApprovalCreateParams,
  type ApprovalResolveParams,
  type ApprovalListParams,
  type ApprovalBulkResolveParams,
  type ApprovalBulkResolveResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import {
  type ApprovalProvider,
  type ApprovalRoutingMode,
  ChatHostApprovalProvider,
  AutoApprovalProvider,
  DesktopApprovalProvider,
  HybridApprovalProvider,
} from "./providers.js";

export interface OperationApprovalContext {
  projectId: string;
  operation: string;
  risk: "SAFE" | "CAUTION" | "DANGEROUS";
  summary: string;
  payloadHash: string;
  approvalId?: string;
  timeoutMs?: number;
  isProtectedFile?: boolean;
  decisionSource?: string;
  callerPurpose?: string;
  isBuildDefinition?: boolean;
  commandCategory?: string;
  isPackageInstall?: boolean;
}

export class ApprovalManager {
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly consumedIds = new Set<string>();
  private routingMode: ApprovalRoutingMode = "chat";
  private readonly providers = new Map<ApprovalRoutingMode, ApprovalProvider>();

  constructor(private readonly logger?: Logger, defaultMode: ApprovalRoutingMode = "desktop") {
    this.providers.set("chat", new ChatHostApprovalProvider());
    this.providers.set("auto-trusted", new AutoApprovalProvider());
    this.providers.set("desktop", new DesktopApprovalProvider());
    this.providers.set("hybrid", new HybridApprovalProvider());
    this.routingMode = defaultMode;
  }

  private safetyLayerDisabled: boolean = false;

  getRoutingMode(): ApprovalRoutingMode {
    return this.routingMode;
  }

  setRoutingMode(mode: ApprovalRoutingMode): void {
    this.routingMode = mode;
    this.logger?.info({ mode }, "Approval routing mode updated");
  }

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
    this.logger?.info({ disabled }, "Safety layer status updated in ApprovalManager");
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  getProvider(mode?: ApprovalRoutingMode): ApprovalProvider {
    const targetMode = mode ?? this.routingMode;
    return this.providers.get(targetMode) ?? this.providers.get("chat")!;
  }

  /**
   * Delegate operation approval evaluation to the active ApprovalProvider.
   * Handles chat host action verification, auto-trusted immediate execution,
   * or Desktop fallback without leaking pending requests in non-desktop modes.
   */
  handleOperationApproval(context: OperationApprovalContext): void {
    // 1. If Command Safety Layer is permanently disabled, auto-approve immediately with zero confirmation prompts
    if (this.safetyLayerDisabled) {
      this.createImmediateResolved({
        projectId: context.projectId,
        operation: context.operation,
        risk: context.risk,
        summary: context.summary,
        payloadHash: context.payloadHash,
        decisionSource: "safety-layer-disabled",
        approvalMode: "auto-unrestricted",
        resolvedBy: "auto-unrestricted",
      });
      return;
    }

    const provider = this.getProvider();
    provider.handleOperation(context, this);
  }

  /**
   * Helper to ensure expired pending requests are updated to "expired".
   */
  private checkExpiry(req: ApprovalRequest): ApprovalRequest {
    if ((req.status === "pending" || req.status === "approved") && Date.now() > req.expiresAt) {
      req.status = "expired";
      this.logger?.debug(
        { approvalId: req.id, projectId: req.projectId },
        "Approval request expired"
      );
    }
    return req;
  }

  /**
   * Create a new approval request in the format approval_<UUIDv4>.
   * Default timeout: 5 minutes (300,000 ms).
   */
  create(params: ApprovalCreateParams): ApprovalRequest {
    const id = `approval_${crypto.randomUUID()}`;
    const now = Date.now();
    const timeoutMs = params.timeoutMs ?? 300000;
    const expiresAt = now + timeoutMs;
    const provider = this.getProvider();
    const decisionSource = params.decisionSource ?? provider.name;

    const request: ApprovalRequest = {
      id,
      projectId: params.projectId,
      operation: params.operation,
      risk: params.risk,
      summary: params.summary,
      payloadHash: params.payloadHash,
      createdAt: now,
      expiresAt,
      status: "pending",
      resolvedAt: null,
      resolvedBy: null,
      decisionSource,
      approvalMode: this.routingMode,
    };

    this.approvals.set(id, request);
    this.logger?.info(
      {
        approvalId: id,
        projectId: params.projectId,
        operation: params.operation,
        risk: params.risk,
      },
      "Approval request created"
    );

    // Limit in-memory retention to 1000 items
    if (this.approvals.size > 1000) {
      const oldestKey = this.approvals.keys().next().value;
      if (oldestKey) this.approvals.delete(oldestKey);
    }

    return { ...request };
  }

  /**
   * Record and immediately consume an approval (used by ChatHost and Auto-Trusted providers).
   * Ensures anti-tamper, payload hash tracking, and audit trail without creating pending desktop items.
   */
  createImmediateResolved(params: {
    projectId: string;
    operation: string;
    risk: "SAFE" | "CAUTION" | "DANGEROUS";
    summary: string;
    payloadHash: string;
    decisionSource: string;
    approvalMode: string;
    resolvedBy: string;
  }): ApprovalRequest {
    const id = `approval_${crypto.randomUUID()}`;
    const now = Date.now();
    const request: ApprovalRequest = {
      id,
      projectId: params.projectId,
      operation: params.operation,
      risk: params.risk === "SAFE" ? "CAUTION" : params.risk,
      summary: params.summary,
      payloadHash: params.payloadHash,
      createdAt: now,
      expiresAt: now + 300000,
      status: "consumed",
      resolvedAt: now,
      resolvedBy: params.resolvedBy,
      decisionSource: params.decisionSource,
      approvalMode: params.approvalMode,
    };

    this.approvals.set(id, request);
    this.consumedIds.add(id);

    this.logger?.info(
      {
        approvalId: id,
        projectId: params.projectId,
        operation: params.operation,
        decisionSource: params.decisionSource,
        approvalMode: params.approvalMode,
      },
      `Operation approved and consumed via ${params.approvalMode}`
    );

    if (this.approvals.size > 1000) {
      const oldestKey = this.approvals.keys().next().value;
      if (oldestKey) this.approvals.delete(oldestKey);
    }

    return { ...request };
  }

  /**
   * Resolve an approval request. Only local human users can resolve.
   */
  resolve(params: ApprovalResolveParams): ApprovalRequest {
    const req = this.approvals.get(params.approvalId);
    if (!req) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
        `Approval request "${params.approvalId}" not found`
      );
    }

    this.checkExpiry(req);

    if (req.status === "expired") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_EXPIRED,
        `Approval request "${params.approvalId}" has expired`
      );
    }

    if (req.status !== "pending") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval request "${params.approvalId}" is already ${req.status}`
      );
    }

    req.status = params.action === "approve" ? "approved" : "denied";
    req.resolvedAt = Date.now();
    req.resolvedBy = params.resolvedBy || "local-user";
    if (params.decisionSource) {
      req.decisionSource = params.decisionSource;
    } else if (!req.decisionSource) {
      req.decisionSource = "desktop";
    }

    this.logger?.info(
      {
        approvalId: req.id,
        status: req.status,
        resolvedBy: req.resolvedBy,
        decisionSource: req.decisionSource,
      },
      `Approval request ${req.status}`
    );

    return { ...req };
  }

  /**
   * Bulk resolve multiple approval requests.
   */
  bulkResolve(params: ApprovalBulkResolveParams): ApprovalBulkResolveResult & {
    resolvedCount: number;
    failedCount: number;
    results: Array<{ approvalId: string; success: boolean; error?: string }>;
  } {
    const resolved: ApprovalRequest[] = [];
    const failedIds: string[] = [];
    const results: Array<{ approvalId: string; success: boolean; error?: string }> = [];

    for (const approvalId of params.approvalIds) {
      try {
        const res = this.resolve({
          approvalId,
          action: params.action,
          resolvedBy: params.resolvedBy,
        });
        resolved.push(res);
        results.push({ approvalId, success: true });
      } catch (err: any) {
        failedIds.push(approvalId);
        results.push({ approvalId, success: false, error: err?.message || String(err) });
      }
    }

    return {
      resolved,
      failedIds,
      resolvedCount: resolved.length,
      failedCount: failedIds.length,
      results,
    };
  }

  /**
   * Verify an approval and consume it for one-time execution.
   * Returns true if valid and consumed; throws error or returns false otherwise.
   */
  verifyAndConsume(
    approvalId: string,
    projectId: string,
    operation: string,
    payloadHash: string
  ): boolean {
    const req = this.approvals.get(approvalId);
    if (!req) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_NOT_FOUND,
        `Approval request "${approvalId}" not found`
      );
    }

    this.checkExpiry(req);

    if (req.status === "expired") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_EXPIRED,
        `Approval request "${approvalId}" has expired`
      );
    }

    if (this.consumedIds.has(approvalId)) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval "${approvalId}" has already been consumed (one-time approval)`
      );
    }

    if (req.status !== "approved") {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_ALREADY_RESOLVED,
        `Approval request "${approvalId}" is not approved (current status: ${req.status})`
      );
    }

    if (req.projectId !== projectId) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        `Approval project mismatch: expected "${req.projectId}", got "${projectId}"`
      );
    }

    if (req.operation !== operation) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        `Approval operation mismatch: expected "${req.operation}", got "${operation}"`
      );
    }

    if (req.payloadHash !== payloadHash) {
      throw new LocalBridgeError(
        LocalBridgeErrorCode.APPROVAL_PAYLOAD_MISMATCH,
        "Approval payload hash mismatch. Operation parameters have changed."
      );
    }

    // Consume approval so it cannot be reused
    this.consumedIds.add(approvalId);
    this.logger?.info(
      { approvalId, projectId, operation },
      "Approval consumed for one-time execution"
    );

    return true;
  }

  /**
   * List approvals matching optional filter.
   */
  list(filter?: ApprovalListParams): ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    for (const req of this.approvals.values()) {
      this.checkExpiry(req);
      const currentStatus = this.consumedIds.has(req.id) ? "consumed" : req.status;
      if (filter?.projectId && req.projectId !== filter.projectId) {
        continue;
      }
      if (filter?.status && currentStatus !== filter.status) {
        continue;
      }
      results.push({ ...req, status: currentStatus });
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get an approval request by ID.
   */
  get(approvalId: string): ApprovalRequest | undefined {
    const req = this.approvals.get(approvalId);
    if (!req) return undefined;
    this.checkExpiry(req);
    const status = this.consumedIds.has(approvalId) ? "consumed" : req.status;
    return { ...req, status };
  }

  /**
   * Transition all pending approvals to expired (called on restart/reboot).
   */
  expireAll(): void {
    for (const req of this.approvals.values()) {
      if (req.status === "pending") {
        req.status = "expired";
      }
    }
  }
}
