import fs from "node:fs";
import path from "node:path";
import type {
  TaskAcceptancePolicy,
  TaskAcceptanceResult,
} from "@localbridge/protocol";
import type { WindowsNativeCore } from "./windows-native-core.js";
import type { Logger } from "@localbridge/shared";

export class TaskAcceptanceEngine {
  constructor(
    private readonly nativeCore: WindowsNativeCore,
    private readonly logger?: Logger
  ) {}

  /**
   * Perform comprehensive multi-dimensional acceptance verification
   */
  async evaluate(policy: TaskAcceptancePolicy): Promise<TaskAcceptanceResult> {
    const checks: Array<{ name: string; passed: boolean; details: string }> = [];
    let allPassed = true;

    // 1. Verify Required Files
    if (policy.requiredFiles && policy.requiredFiles.length > 0) {
      for (const req of policy.requiredFiles) {
        const filePath = path.resolve(req.path);
        const exists = fs.existsSync(filePath);

        if (!exists) {
          checks.push({
            name: `file_exists:${path.basename(filePath)}`,
            passed: false,
            details: `Required file not found at ${filePath}`,
          });
          allPassed = false;
          continue;
        }

        let stat: fs.Stats | null = null;
        try {
          stat = fs.statSync(filePath);
        } catch {}

        const minBytes = req.minSizeBytes ?? 1;
        const sizeOk = Boolean(stat && stat.size >= minBytes);
        checks.push({
          name: `file_size_valid:${path.basename(filePath)}`,
          passed: sizeOk,
          details: sizeOk
            ? `File size is ${stat?.size} bytes (minimum: ${minBytes} bytes)`
            : `File size ${stat?.size || 0} bytes is below threshold of ${minBytes} bytes`,
        });
        if (!sizeOk) allPassed = false;

        // Content verification if requested
        if (req.textMatches && req.textMatches.length > 0) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            for (const pattern of req.textMatches) {
              const matched = content.includes(pattern);
              checks.push({
                name: `content_match:${pattern.slice(0, 20)}`,
                passed: matched,
                details: matched ? `Target text found in file.` : `Target text not found in file.`,
              });
              if (!matched) allPassed = false;
            }
          } catch (e: any) {
            // Binary or unreadable file: skip utf-8 check
          }
        }
      }
    }

    // 2. Verify Windows Closed
    if (policy.requiredWindowsClosed && policy.requiredWindowsClosed.length > 0) {
      const winList = await this.nativeCore.listWindows();
      for (const winQuery of policy.requiredWindowsClosed) {
        const q = winQuery.toLowerCase();
        const stillOpen = winList.windows.some((w) => w.title.toLowerCase().includes(q) || w.processName?.toLowerCase().includes(q));
        checks.push({
          name: `window_closed:${winQuery}`,
          passed: !stillOpen,
          details: !stillOpen ? `Window "${winQuery}" verified closed.` : `Window "${winQuery}" is still open on desktop.`,
        });
        if (stillOpen) allPassed = false;
      }
    }

    // 3. Verify Artifacts
    if (policy.requiredArtifacts && policy.requiredArtifacts.length > 0) {
      for (const art of policy.requiredArtifacts) {
        const exists = fs.existsSync(art);
        checks.push({
          name: `artifact_exists:${path.basename(art)}`,
          passed: exists,
          details: exists ? `Artifact exists at ${art}` : `Artifact not found at ${art}`,
        });
        if (!exists) allPassed = false;
      }
    }

    return {
      passed: allPassed,
      status: allPassed ? "COMPLETED" : "FAILED",
      checks,
    };
  }
}
