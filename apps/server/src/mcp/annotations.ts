import { CANONICAL_TOOL_DEFINITIONS } from "@localbridge/protocol";
import type { ToolAnnotations } from "./types.js";

/**
 * Single Source of Truth: Derived directly from CANONICAL_TOOL_DEFINITIONS (332 Tools).
 * Do NOT maintain a separate hardcoded tool annotations map here.
 */
const derivedAnnotations: Record<string, ToolAnnotations> = {};
for (const tool of CANONICAL_TOOL_DEFINITIONS) {
  const isReadOnly = tool.mcpScope === "read" && tool.executionMode === "read";
  if (isReadOnly) {
    derivedAnnotations[tool.name] = { readOnlyHint: true };
  } else {
    const annotation: ToolAnnotations = {
      readOnlyHint: tool.mcpScope === "read",
      idempotentHint: tool.supportsIdempotency,
      destructiveHint:
        tool.riskLevel === "destructive" || tool.safetyClassification === "DESTRUCTIVE",
    };
    if (
      tool.executionMode === "network" ||
      tool.executionMode === "browser" ||
      tool.executionMode === "process"
    ) {
      annotation.openWorldHint = true;
    }
    derivedAnnotations[tool.name] = annotation;
  }
}

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = derivedAnnotations;
