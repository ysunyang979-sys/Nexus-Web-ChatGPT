import {
  CANONICAL_TOOL_DEFINITIONS,
  CanonicalToolRegistry,
  type CanonicalToolDefinition,
  type UnifiedToolDefinition,
  type ErrorCategory,
  type RecoveryStrategy,
  type RecoveryPlan,
  type ProviderHealthStatus,
} from "@localbridge/protocol";

export class ToolRegistryService {
  private readonly canonicalRegistry: CanonicalToolRegistry;

  constructor(initialTools: CanonicalToolDefinition[] = CANONICAL_TOOL_DEFINITIONS) {
    this.canonicalRegistry = new CanonicalToolRegistry(initialTools);
  }

  register(tool: UnifiedToolDefinition | CanonicalToolDefinition): CanonicalToolDefinition {
    const def: CanonicalToolDefinition = {
      id: (tool as CanonicalToolDefinition).id || tool.name,
      name: tool.name,
      version: (tool as CanonicalToolDefinition).version || "1.0.0",
      schemaVersion: (tool as CanonicalToolDefinition).schemaVersion || "2026-07-28",
      providerVersion: (tool as CanonicalToolDefinition).providerVersion || "1.0.0",
      namespace: (tool as CanonicalToolDefinition).namespace || tool.name.split(/[._]/)[0] || "general",
      category: (tool as CanonicalToolDefinition).category || "general",
      description: tool.description,
      inputSchema: tool.inputSchema as any,
      outputSchema: (tool.outputSchema as any) || { type: "object", additionalProperties: true },
      providerId: (tool as CanonicalToolDefinition).providerId || "provider.custom",
      providerImplementation:
        (tool as CanonicalToolDefinition).providerImplementation || "CustomToolProvider",
      runnerAdapter: (tool as CanonicalToolDefinition).runnerAdapter || "CustomRunnerAdapter",
      rpcMethod: (tool as CanonicalToolDefinition).rpcMethod || tool.name,
      executionMode: (tool as CanonicalToolDefinition).executionMode || "system",
      riskLevel: (tool.riskLevel === "critical" ? "destructive" : tool.riskLevel) as any,
      safetyClassification:
        (tool as CanonicalToolDefinition).safetyClassification || "SAFE_WRITE_SANDBOX",
      permissionModel: (tool as CanonicalToolDefinition).permissionModel || "EXECUTE",
      mcpScope: (tool as CanonicalToolDefinition).mcpScope || "execute",
      permissions: tool.permissions || [],
      supportsDryRun: tool.supportsDryRun ?? false,
      supportsIdempotency: (tool as CanonicalToolDefinition).supportsIdempotency ?? false,
      supportsCancellation: (tool as CanonicalToolDefinition).supportsCancellation ?? false,
      supportsCheckpoint: (tool as CanonicalToolDefinition).supportsCheckpoint ?? true,
      supportsRecovery: tool.supportsRecovery ?? true,
      supportsObservation: tool.supportsObservation ?? true,
      timeoutMs: (tool as CanonicalToolDefinition).timeoutMs ?? tool.timeout ?? 30000,
      timeout: tool.timeout ?? (tool as CanonicalToolDefinition).timeoutMs ?? 30000,
      enabled: (tool as CanonicalToolDefinition).enabled ?? true,
      aliases: (tool as CanonicalToolDefinition).aliases,
    };
    return this.canonicalRegistry.register(def);
  }

  unregister(nameOrId: string): boolean {
    return this.canonicalRegistry.unregister(nameOrId);
  }

  enable(nameOrId: string): boolean {
    return this.canonicalRegistry.enable(nameOrId);
  }

  disable(nameOrId: string): boolean {
    return this.canonicalRegistry.disable(nameOrId);
  }

  reload(newDefinitions: CanonicalToolDefinition[] = CANONICAL_TOOL_DEFINITIONS): {
    generation: number;
    totalCount: number;
    inFlightProtectedTasks: number;
  } {
    return this.canonicalRegistry.reload(newDefinitions);
  }

  acquireTaskSnapshot(taskId: string): void {
    this.canonicalRegistry.acquireTaskSnapshot(taskId);
  }

  releaseTaskSnapshot(taskId: string): void {
    this.canonicalRegistry.releaseTaskSnapshot(taskId);
  }

  get(
    name: string,
    options?: { version?: string; taskId?: string; includeDisabled?: boolean }
  ): CanonicalToolDefinition | undefined {
    return this.canonicalRegistry.get(name, options);
  }

  list(filter?: {
    category?: string;
    riskLevel?: string;
    executionMode?: string;
    providerId?: string;
    includeDisabled?: boolean;
  }): CanonicalToolDefinition[] {
    return this.canonicalRegistry.list(filter);
  }

  listTools(filter?: {
    category?: string;
    riskLevel?: string;
    executionMode?: string;
    providerId?: string;
    includeDisabled?: boolean;
  }): CanonicalToolDefinition[] {
    return this.list(filter);
  }

  version(): {
    registryVersion: string;
    schemaVersion: string;
    generation: number;
    totalTools: number;
    enabledTools: number;
  } {
    return this.canonicalRegistry.version();
  }

  health(): {
    healthy: boolean;
    status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
    totalTools: number;
    enabledTools: number;
    providers: ProviderHealthStatus[];
  } {
    return this.canonicalRegistry.health();
  }

  /**
   * Section 9: Error Classification System (14 Categories)
   */
  classifyError(err: Error | string | unknown): ErrorCategory {
    const msg = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (/econnrefused|etimedout|enotfound|fetch failed|network|socket/i.test(lower)) {
      return "NETWORK_ERROR";
    }
    if (/timed out|timeout|exceeded limit of \d+ms/i.test(lower)) {
      return "TIMEOUT";
    }
    if (/enoent|file not found|no such file|path does not exist/i.test(lower)) {
      return "FILE_NOT_FOUND";
    }
    if (/eacces|eperm|permission denied|unauthorized|forbidden|requires elevated/i.test(lower)) {
      return "PERMISSION_DENIED";
    }
    if (/process not found|pid \d+ not found|no process/i.test(lower)) {
      return "PROCESS_NOT_FOUND";
    }
    if (/window not found|hwnd not found|no active window/i.test(lower)) {
      return "WINDOW_NOT_FOUND";
    }
    if (/invalid argument|invalid input|validation failed|missing required/i.test(lower)) {
      return "INVALID_INPUT";
    }
    if (/ocr failed|image decode|dimension error|vision/i.test(lower)) {
      return "VISION_ERROR";
    }
    if (/document corrupt|openxml error|pdf stream error|sheet not found/i.test(lower)) {
      return "DOCUMENT_ERROR";
    }
    if (/rate limit|too many requests|429/i.test(lower)) {
      return "RATE_LIMIT";
    }
    if (/out of memory|quota exceeded|disk full/i.test(lower)) {
      return "RESOURCE_LIMIT";
    }
    if (/app crash|application error|terminated with code/i.test(lower)) {
      return "APPLICATION_ERROR";
    }
    if (/tool execution failed|unknown tool/i.test(lower)) {
      return "TOOL_ERROR";
    }
    return "UNKNOWN_ERROR";
  }

  /**
   * Section 8: Unified Recovery Engine
   */
  createRecoveryPlan(
    errorCategory: ErrorCategory,
    errorMsg: string,
    retryCount = 0,
    maxRetries = 3
  ): RecoveryPlan {
    const fingerprint = `${errorCategory}:${errorMsg.slice(0, 50)}`;

    let strategy: RecoveryStrategy = "replan";
    let fallbackTool: string | undefined;
    let rationale = "";

    switch (errorCategory) {
      case "NETWORK_ERROR":
      case "TIMEOUT":
      case "RATE_LIMIT":
        if (retryCount < maxRetries) {
          strategy = "retry";
          rationale = `Transient ${errorCategory} detected; retrying attempt ${retryCount + 1}/${maxRetries}.`;
        } else {
          strategy = "fallback";
          rationale = `Retries exhausted for ${errorCategory}; switching to local fallback.`;
        }
        break;

      case "FILE_NOT_FOUND":
        strategy = "replan";
        fallbackTool = "localbridge_file_stat";
        rationale = "Target file not found; replanning with filesystem discovery.";
        break;

      case "VISION_ERROR":
        strategy = "fallback";
        fallbackTool = "localbridge_vision_ocr";
        rationale = "Full vision analysis degraded; falling back to local OCR extraction.";
        break;

      case "DOCUMENT_ERROR":
        strategy = "fallback";
        fallbackTool = "localbridge_document_validate";
        rationale = "Document structure issue detected; applying auto-repair regeneration.";
        break;

      case "WINDOW_NOT_FOUND":
      case "PROCESS_NOT_FOUND":
        strategy = "replan";
        fallbackTool = "localbridge_computer_launch";
        rationale = "Target window/process missing; relaunching target desktop application.";
        break;

      case "PERMISSION_DENIED":
        strategy = "ask_user";
        rationale = "Operation requires elevated permission or user confirmation.";
        break;

      default:
        strategy = "replan";
        rationale = `Recovering from ${errorCategory} via adaptive execution replan.`;
        break;
    }

    return {
      errorCategory,
      fingerprint,
      strategy,
      fallbackTool,
      retryCount,
      maxRetries,
      rationale,
    };
  }
}
