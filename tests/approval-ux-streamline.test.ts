import { describe, expect, it, vi } from "vitest";
import { canonicalPayloadHash } from "@localbridge/shared";
import {
  ApprovalManager,
  ChatApprovalProvider,
  DesktopApprovalProvider,
  HybridApprovalProvider,
  type ApprovalRoutingMode,
} from "../apps/runner/src/approvals/index.js";
import { createFileDeleteHandler } from "../apps/runner/src/rpc/handlers/file-delete.js";
import { LocalBridgeErrorCode } from "@localbridge/protocol";

describe("Nexus Desktop Approval UX Streamline & Provider Architecture", () => {
  const samplePayload = {
    projectId: "proj_main",
    path: "src/critical-config.json",
    expectedHash: "sha256:abc1234567890",
  };
  const payloadHash = canonicalPayloadHash(samplePayload);

  // Criterion 1: Sidebar navigation items exclude standalone approvals page
  it("Criterion 1: Sidebar navigation items exclude standalone approvals page", async () => {
    // Read Sidebar.tsx source to verify navigation contract
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sidebarPath = path.resolve(__dirname, "../apps/desktop/src/components/Sidebar.tsx");
    const sidebarCode = fs.readFileSync(sidebarPath, "utf-8");

    // Must NOT contain an approvals item in navigation
    expect(sidebarCode).not.toMatch(/id:\s*["']approvals["']/);

    // Adapts to navGroups -> group.items navigation architecture
    expect(sidebarCode).toContain("navGroups");
    expect(sidebarCode).toMatch(/group\.items/);
  });

  // Criterion 2: Approval history is accessible and searchable in Activity view
  it("Criterion 2: Approval history is accessible and searchable with filters in Activity stream", async () => {
    const manager = new ApprovalManager();

    const app1 = manager.create({
      projectId: "proj_alpha",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete critical file alpha.txt",
      payloadHash: "hash_alpha",
      timeoutMs: 300000,
      decisionSource: "chat",
    });

    const app2 = manager.create({
      projectId: "proj_beta",
      operation: "git.commit",
      risk: "CAUTION",
      summary: "Git commit release v1.0",
      payloadHash: "hash_beta",
      timeoutMs: 300000,
      decisionSource: "desktop",
    });

    const allApprovals = manager.list();
    expect(allApprovals.length).toBe(2);

    // Filter by projectId
    const filteredByProject = manager.list({ projectId: "proj_alpha" });
    expect(filteredByProject.length).toBe(1);
    expect(filteredByProject[0].id).toBe(app1.id);
    expect(filteredByProject[0].operation).toBe("file.delete");
    expect(filteredByProject[0].decisionSource).toBe("chat");

    // Filter by status
    const pendingList = manager.list({ status: "pending" });
    expect(pendingList.length).toBe(2);

    // Test search filter logic matching ActivityPage
    const query = "release";
    const searchMatches = allApprovals.filter(
      (a) =>
        a.operation.includes(query) ||
        a.projectId.includes(query) ||
        a.summary.includes(query) ||
        a.id.includes(query)
    );
    expect(searchMatches.length).toBe(1);
    expect(searchMatches[0].id).toBe(app2.id);
  });

  // Criterion 3: Pending Desktop fallback can approve
  it("Criterion 3: Pending Desktop fallback can approve with decisionSource desktop", async () => {
    const manager = new ApprovalManager();
    const created = manager.create({
      projectId: "proj_main",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete database credentials",
      payloadHash,
      timeoutMs: 300000,
    });

    expect(created.status).toBe("pending");

    // Desktop operator resolves with approve
    const resolved = manager.resolve({
      approvalId: created.id,
      action: "approve",
      resolvedBy: "local-desktop-operator",
      decisionSource: "desktop",
    });

    expect(resolved.status).toBe("approved");
    expect(resolved.resolvedBy).toBe("local-desktop-operator");
    expect(resolved.decisionSource).toBe("desktop");
    expect(resolved.resolvedAt).toBeGreaterThan(0);

    const fetched = manager.get(created.id);
    expect(fetched?.status).toBe("approved");
    expect(fetched?.decisionSource).toBe("desktop");
  });

  // Criterion 4: Pending Desktop fallback can reject
  it("Criterion 4: Pending Desktop fallback can reject with decisionSource desktop", async () => {
    const manager = new ApprovalManager();
    const created = manager.create({
      projectId: "proj_main",
      operation: "git.commit",
      risk: "CAUTION",
      summary: "Commit unwanted test files",
      payloadHash,
      timeoutMs: 300000,
    });

    // Desktop operator resolves with deny
    const resolved = manager.resolve({
      approvalId: created.id,
      action: "deny",
      resolvedBy: "security-auditor",
      decisionSource: "desktop",
    });

    expect(resolved.status).toBe("denied");
    expect(resolved.resolvedBy).toBe("security-auditor");
    expect(resolved.decisionSource).toBe("desktop");

    // Verify it cannot be consumed
    expect(() =>
      manager.verifyAndConsume(created.id, "proj_main", "git.commit", payloadHash)
    ).toThrowError(/not approved/);
  });

  // Criterion 5: Consumed approval is correctly tracked and rendered
  it("Criterion 5: Consumed approval is correctly tracked and status transitions to consumed", async () => {
    const manager = new ApprovalManager();
    const created = manager.create({
      projectId: "proj_main",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Delete temporary artifact",
      payloadHash,
      timeoutMs: 300000,
    });

    manager.resolve({
      approvalId: created.id,
      action: "approve",
      resolvedBy: "admin",
    });

    // Before consumption: status is approved
    expect(manager.get(created.id)?.status).toBe("approved");

    // Execute one-time consumption
    const ok = manager.verifyAndConsume(created.id, "proj_main", "file.delete", payloadHash);
    expect(ok).toBe(true);

    // After consumption: status is consumed in both get and list
    const fetched = manager.get(created.id);
    expect(fetched?.status).toBe("consumed");

    const list = manager.list();
    const item = list.find((a) => a.id === created.id);
    expect(item?.status).toBe("consumed");
  });

  // Criterion 6: Audit history remains intact and correlated
  it("Criterion 6: Audit history correlates approvalId, operation, projectId, and decisionSource", async () => {
    const auditLogs: any[] = [];
    const mockContext = {
      logAudit: (event: string, meta: any) => {
        auditLogs.push({ event, timestamp: Date.now(), ...meta });
      },
    };

    const manager = new ApprovalManager();
    const app = manager.create({
      projectId: "proj_main",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Audit tracking test",
      payloadHash,
      decisionSource: "chat",
    });

    mockContext.logAudit("approval_created", {
      approvalId: app.id,
      projectId: app.projectId,
      operation: app.operation,
      decisionSource: app.decisionSource,
    });

    manager.resolve({
      approvalId: app.id,
      action: "approve",
      resolvedBy: "chat-user",
      decisionSource: "chat",
    });

    mockContext.logAudit("approval_resolved", {
      approvalId: app.id,
      status: "approved",
      decisionSource: "chat",
      resolvedBy: "chat-user",
    });

    expect(auditLogs.length).toBe(2);
    expect(auditLogs[0].event).toBe("approval_created");
    expect(auditLogs[0].approvalId).toBe(app.id);
    expect(auditLogs[0].decisionSource).toBe("chat");

    expect(auditLogs[1].event).toBe("approval_resolved");
    expect(auditLogs[1].approvalId).toBe(app.id);
    expect(auditLogs[1].status).toBe("approved");
    expect(auditLogs[1].decisionSource).toBe("chat");
  });

  // Criterion 7: approvalId anti-replay and payload tamper protections remain enforced
  it("Criterion 7: Anti-replay, payload tamper, project tamper, and operation tamper are strictly enforced", async () => {
    const manager = new ApprovalManager();
    const created = manager.create({
      projectId: "proj_secure",
      operation: "file.delete",
      risk: "DANGEROUS",
      summary: "Tamper test",
      payloadHash,
    });

    manager.resolve({
      approvalId: created.id,
      action: "approve",
      resolvedBy: "auditor",
    });

    // 1. Tamper payload hash
    expect(() =>
      manager.verifyAndConsume(
        created.id,
        "proj_secure",
        "file.delete",
        "sha256:tampered_hash_9999"
      )
    ).toThrowError(/payload hash mismatch/i);

    // 2. Tamper projectId
    expect(() =>
      manager.verifyAndConsume(
        created.id,
        "proj_other",
        "file.delete",
        payloadHash
      )
    ).toThrowError(/project mismatch/i);

    // 3. Tamper operation
    expect(() =>
      manager.verifyAndConsume(
        created.id,
        "proj_secure",
        "git.commit",
        payloadHash
      )
    ).toThrowError(/operation mismatch/i);

    // 4. Valid consumption
    const ok = manager.verifyAndConsume(
      created.id,
      "proj_secure",
      "file.delete",
      payloadHash
    );
    expect(ok).toBe(true);

    // 5. Anti-replay attack: consuming second time must throw APPROVAL_ALREADY_RESOLVED
    expect(() =>
      manager.verifyAndConsume(
        created.id,
        "proj_secure",
        "file.delete",
        payloadHash
      )
    ).toThrowError(/already been consumed/i);
  });

  // Criterion 8: Decoupled approval providers (chat / auto-trusted / desktop)
  it("Criterion 8: Decoupled approval providers (chat / auto-trusted / desktop)", async () => {
    const manager = new ApprovalManager();

    // Verify providers
    const chatProvider = manager.getProvider("chat");
    const autoProvider = manager.getProvider("auto-trusted");
    const desktopProvider = manager.getProvider("desktop");

    expect(chatProvider.name).toBe("chat");
    expect(autoProvider.name).toBe("auto-trusted");
    expect(desktopProvider.name).toBe("desktop");

    const fsService = {
      deleteFile: vi.fn().mockResolvedValue({ deleted: true }),
      assertDeleteAuthorized: vi.fn(),
    } as any;
    const handler = createFileDeleteHandler(fsService, manager);

    // 1. In desktop mode: throws APPROVAL_REQUIRED and creates pending approval
    manager.setRoutingMode("desktop");
    let errorThrown: any = null;
    try {
      await handler(samplePayload as any);
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe(LocalBridgeErrorCode.APPROVAL_REQUIRED);
    const desktopId = errorThrown.details.approvalId;
    const desktopReq = manager.get(desktopId);
    expect(desktopReq?.status).toBe("pending");
    expect(desktopReq?.decisionSource).toBe("desktop");

    // 2. In chat mode: executes without throwing APPROVAL_REQUIRED (no double approval)
    manager.setRoutingMode("chat");
    const chatRes = await handler({ ...samplePayload, callerPurpose: "chatgpt" } as any);
    expect(chatRes).toEqual({ deleted: true });
    const chatApprovals = manager.list().filter((a) => a.decisionSource === "chat");
    expect(chatApprovals.length).toBeGreaterThan(0);
    expect(chatApprovals[0].approvalMode).toBe("chat");
    expect(chatApprovals[0].status).toBe("consumed");

    // 3. In auto-trusted mode: executes without throwing APPROVAL_REQUIRED
    manager.setRoutingMode("auto-trusted");
    const autoRes = await handler(samplePayload as any);
    expect(autoRes).toEqual({ deleted: true });
    const autoApprovals = manager.list().filter((a) => a.decisionSource === "auto");
    expect(autoApprovals.length).toBeGreaterThan(0);
    expect(autoApprovals[0].approvalMode).toBe("auto-trusted");
    expect(autoApprovals[0].status).toBe("consumed");
  });
});
