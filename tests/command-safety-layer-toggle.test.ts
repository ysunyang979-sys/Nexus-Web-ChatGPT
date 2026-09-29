import { describe, expect, it, beforeEach } from "vitest";
import { ApprovalManager } from "../apps/runner/src/approvals/index.js";
import { CommandExecutionService } from "../apps/runner/src/process/index.js";
import { FilesystemService } from "../apps/runner/src/filesystem/index.js";
import { ProjectRegistry } from "../apps/runner/src/projects/index.js";
import { resolveProjectPath } from "@localbridge/security";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

describe("Nexus Command Safety Layer Toggle E2E Verification", () => {
  const tempDir = path.join(os.tmpdir(), "nexus-safety-layer-test-" + Date.now());
  const projectRoot = path.join(tempDir, "project-a");
  const outsideRoot = path.join(tempDir, "outside-dir");
  const outsideFile = path.join(outsideRoot, "secret.txt");

  beforeEach(() => {
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "app.js"), "console.log('hello');");
    fs.writeFileSync(outsideFile, "confidential data");
  });

  describe("Requirement 2 & 3: Path Resolution across modes", () => {
    it("when safety layer is enabled (restricted mode): blocks outside files", () => {
      expect(() => {
        resolveProjectPath(projectRoot, outsideFile, {
          mustExist: true,
          unrestricted: false,
        });
      }).toThrow();
    });

    it("when safety layer is disabled (unrestricted mode): allows access to any directory/file on computer", () => {
      const resolved = resolveProjectPath(projectRoot, outsideFile, {
        mustExist: true,
        unrestricted: true,
      });
      expect(resolved.canonicalPath).toBe(path.resolve(outsideFile));
    });
  });

  describe("Requirement 2 & 4: Approval Manager across modes", () => {
    it("when safety layer is disabled: auto-approves immediately with zero approval prompts", () => {
      const manager = new ApprovalManager();
      manager.setSafetyLayerDisabled(true);

      expect(manager.isSafetyLayerDisabled()).toBe(true);

      // Even dangerous operation is auto-approved immediately without throwing APPROVAL_REQUIRED
      expect(() => {
        manager.handleOperationApproval({
          projectId: "proj_test",
          operation: "command.run",
          risk: "DANGEROUS",
          summary: "Execute system-wide command",
          payloadHash: "hash_abc",
          timeoutMs: 300000,
        });
      }).not.toThrow();

      const list = manager.list();
      expect(list.length).toBe(1);
      expect(list[0].status).toBe("consumed");
      expect(list[0].decisionSource).toBe("safety-layer-disabled");
      expect(list[0].approvalMode).toBe("auto-unrestricted");
    });

    it("when safety layer is restored: restores normal provider policy without breaking standard modes", () => {
      const manager = new ApprovalManager();
      manager.setSafetyLayerDisabled(true);
      expect(manager.isSafetyLayerDisabled()).toBe(true);

      // Re-enable safety layer
      manager.setSafetyLayerDisabled(false);
      expect(manager.isSafetyLayerDisabled()).toBe(false);

      // In chat mode with valid purpose, it auto-resolves with chat-user
      manager.setRoutingMode("chat");
      manager.handleOperationApproval({
        projectId: "proj_test",
        operation: "command.run",
        risk: "CAUTION",
        summary: "Execute routine command",
        payloadHash: "hash_xyz",
        timeoutMs: 300000,
        callerPurpose: "chatgpt",
      });

      const list = manager.list();
      expect(list.length).toBe(1);
      expect(list[0].decisionSource).toBe("chat");
      expect(list[0].approvalMode).toBe("chat");
      expect(list[0].resolvedBy).toBe("chat-user");
    });
  });

  describe("Filesystem Service across modes", () => {
    it("toggles unrestricted mode on FilesystemService cleanly", async () => {
      const fsService = new FilesystemService();
      expect(fsService.isSafetyLayerDisabled()).toBe(false);

      fsService.setSafetyLayerDisabled(true);
      expect(fsService.isSafetyLayerDisabled()).toBe(true);

      fsService.setSafetyLayerDisabled(false);
      expect(fsService.isSafetyLayerDisabled()).toBe(false);
    });
  });
});
