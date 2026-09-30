import {
  JsonRpcStandardErrorCode,
  LocalBridgeErrorCode,
  MAX_RPC_MESSAGE_SIZE,
  RunnerRpcSchemas,
  type RunnerRpcMethodName,
  type JsonRpcResponse,
} from "@localbridge/protocol";
import { validateWindowsPathSecurity } from "@localbridge/security";
import type { Logger } from "@localbridge/shared";

export type RpcHandler<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult> | TResult;

export type RpcInterceptor = (
  method: string,
  rawParams: any,
  next: (cleanParams: any) => Promise<any>
) => Promise<any>;

export class RpcRouter {
  private readonly handlers = new Map<string, RpcHandler>();
  private readonly activeRequestIds = new Set<string>();
  private interceptor?: RpcInterceptor;
  private safetyLayerDisabled: boolean = false;

  constructor(private readonly logger?: Logger) {}

  setSafetyLayerDisabled(disabled: boolean): void {
    this.safetyLayerDisabled = disabled;
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  setInterceptor(interceptor: RpcInterceptor): void {
    this.interceptor = interceptor;
  }

  register<TParams, TResult>(
    method: string,
    handler: RpcHandler<TParams, TResult>
  ): void {
    this.handlers.set(method, handler as RpcHandler);
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }

  async handle(data: string | Buffer): Promise<JsonRpcResponse | null> {
    const rawLen = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
    if (rawLen > MAX_RPC_MESSAGE_SIZE) {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "message_too_large", size: rawLen },
        `RPC message exceeds maximum allowed size (${MAX_RPC_MESSAGE_SIZE} bytes)`
      );
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JsonRpcStandardErrorCode.InvalidRequest,
          message: "Request exceeds maximum allowed size",
        },
      };
    }

    let parsed: Record<string, unknown>;
    try {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "parse_error" },
        "Failed to parse incoming RPC JSON message"
      );
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JsonRpcStandardErrorCode.ParseError,
          message: "Parse error",
        },
      };
    }

    // Check JSON-RPC 2.0 structure
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.jsonrpc !== "2.0" ||
      !("id" in parsed) ||
      (typeof parsed.id !== "string" && typeof parsed.id !== "number") ||
      typeof parsed.method !== "string"
    ) {
      this.logger?.warn(
        { event: "rpc_invalid_message", reason: "invalid_jsonrpc_structure" },
        "Invalid JSON-RPC request structure"
      );
      const safeId = (typeof parsed?.id === "string" || typeof parsed?.id === "number") ? parsed.id : null;
      return {
        jsonrpc: "2.0",
        id: safeId,
        error: {
          code: JsonRpcStandardErrorCode.InvalidRequest,
          message: "Invalid Request",
        },
      };
    }

    const { id, method } = parsed;
    const strId = String(id);

    // Duplicate in-flight ID check
    if (this.activeRequestIds.has(strId)) {
      this.logger?.warn(
        { event: "rpc_duplicate_request_id", request_id: id },
        `Duplicate in-flight request ID "${id}" detected`
      );
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.DuplicateRequestId,
          message: "Duplicate request ID",
        },
      };
    }

    const handler = this.handlers.get(method);
    if (!handler) {
      this.logger?.warn(
        { event: "rpc_unknown_method", method, request_id: id },
        `Received unknown RPC method: "${method}"`
      );
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.MethodNotFound,
          message: "Method not found",
        },
      };
    }

    let validatedParams = parsed.params ?? {};
    
    // Phase 1: Schema Validation (P0-1: Must happen BEFORE ActionLedger)
    const methodSchema = RunnerRpcSchemas[method as RunnerRpcMethodName];
    if (methodSchema?.params) {
      let paramsToValidate = parsed.params ?? {};
      if (paramsToValidate && typeof paramsToValidate === "object") {
        const copy = { ...(paramsToValidate as Record<string, unknown>) };
        delete copy._executionContext;
        delete copy._toolName;
        delete copy.failVerification;
        delete copy.requireScreenChange;
        delete copy.testScreenHash;
        delete copy.testPostScreenHash;
        if (
          !method.startsWith("agentTask.") &&
          !method.startsWith("agent_task.") &&
          !method.startsWith("safetyLayer.") &&
          !method.startsWith("safety_layer.") &&
          !method.startsWith("checkpoint.")
        ) {
          delete copy.taskId;
          delete copy.executionId;
          delete copy.sessionId;
          delete copy.idempotencyKey;
          delete copy.callerPurpose;
        }
        paramsToValidate = copy;
      }
      const val = methodSchema.params.safeParse(paramsToValidate);
      if (!val.success) {
        this.logger?.warn(
          {
            event: "rpc_invalid_params",
            method,
            request_id: id,
            errors: val.error.flatten(),
          },
          `Invalid parameters for method "${method}"`
        );
        this.activeRequestIds.delete(strId);
        return {
          jsonrpc: "2.0" as const,
          id,
          error: {
            code: JsonRpcStandardErrorCode.InvalidParams,
            message: "Invalid params",
            data: val.error.flatten(),
          },
        };
      }
      validatedParams = val.data;

      // Phase 2: Centralized Security Gate (P0-1: Must happen BEFORE ActionLedger)
      // We dynamically load validateWindowsPathSecurity to prevent early requirement issues
      try {
        const allowAbsolutePath =
          this.safetyLayerDisabled ||
          method === "project.authorize" ||
          method === "project.validate";
        for (const [k, v] of Object.entries(validatedParams as Record<string, unknown>)) {
          if (typeof v === "string" && ["path", "relativePath", "target", "source", "destination", "dir", "directory", "scriptPath"].includes(k)) {
            validateWindowsPathSecurity(v, { unrestricted: allowAbsolutePath });
          }
        }
      } catch (err: any) {
        this.logger?.warn(
          { event: "rpc_security_rejected", method, request_id: id, message: err.message },
          `Security gate rejected request: ${err.message}`
        );
        this.activeRequestIds.delete(strId);
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: err.code || "PATH_TRAVERSAL",
            message: err.message || "Security validation failed",
          },
        };
      }
    }

    const callHandler = async (params: any) => {
      // Schema validation and Security Gate are now executed upstream.
      // We pass the raw params to handler so executionContext etc are preserved.
      return handler(params ?? {});
    };

    const start = Date.now();

    try {
      let result: any;
      if (this.interceptor) {
        result = await this.interceptor(method, parsed.params ?? {}, async (cleanParams) => {
          const res = await callHandler(cleanParams);
          if (res && typeof res === "object" && "jsonrpc" in res && "error" in res) {
            throw res;
          }
          return res;
        });
      } else {
        const res = await callHandler(parsed.params ?? {});
        if (res && typeof res === "object" && "jsonrpc" in res && "error" in res) {
          return res as JsonRpcResponse;
        }
        result = res;
      }
      const duration = Date.now() - start;

      this.logger?.info(
        {
          event: "rpc_request_executed",
          method,
          request_id: id,
          duration_ms: duration,
          result_status: "success",
        },
        `Executed RPC method "${method}" successfully (${duration}ms)`
      );

      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } catch (err) {
      if (err && typeof err === "object" && (err as any).jsonrpc === "2.0") {
        return err as JsonRpcResponse;
      }
      const duration = Date.now() - start;
      // Log complete details locally, never leak stack trace or paths to remote
      this.logger?.error(
        {
          err,
          method,
          request_id: id,
          duration_ms: duration,
          result_status: "error",
        },
        `RPC handler failed for method "${method}"`
      );

      const errObj = err as Record<string, unknown> | null;
      const isKnownLocalBridgeError =
        errObj !== null &&
        typeof errObj === "object" &&
        typeof errObj["code"] === "string" &&
        Object.values(LocalBridgeErrorCode).includes(
          errObj["code"] as LocalBridgeErrorCode
        );

      const errCode = isKnownLocalBridgeError
        ? (errObj["code"] as LocalBridgeErrorCode)
        : undefined;

      const errMsg =
        isKnownLocalBridgeError && typeof errObj["message"] === "string"
          ? errObj["message"]
          : (err instanceof Error ? err.message : "Internal error");

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcStandardErrorCode.InternalError,
          message: errMsg,
          ...(errCode ? { data: { code: errCode } } : {}),
        },
      };
    } finally {
      this.activeRequestIds.delete(strId);
    }
  }
}

