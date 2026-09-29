import { LocalBridgeError, RemoteRpcError } from "@localbridge/protocol";
import { MAX_MCP_RESULT_BYTES, type McpToolResponse } from "./types.js";

/**
 * Format successful tool execution result and enforce MAX_MCP_RESULT_BYTES limit.
 */
export function formatToolSuccess(data: unknown): McpToolResponse {
  const jsonStr = JSON.stringify(data, null, 2);
  const byteLength = Buffer.byteLength(jsonStr, "utf-8");
  if (byteLength > MAX_MCP_RESULT_BYTES) {
    return {
      content: [
        {
          type: "text",
          text: `Result size of ${byteLength} bytes exceeds the maximum allowed limit of ${MAX_MCP_RESULT_BYTES} bytes.`,
        },
      ],
      isError: true,
      structuredContent: {
        code: "MCP_RESULT_TOO_LARGE",
        bytes: byteLength,
        maxBytes: MAX_MCP_RESULT_BYTES,
      },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: jsonStr,
      },
    ],
    structuredContent:
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Sanitize text to remove sensitive physical path details or potential secrets.
 */
export function sanitizeMcpOutput(text: string): string {
  if (!text) return "";
  // Strip absolute Windows paths (e.g. C:\Users\... or E:\workspace\...)
  let sanitized = text.replace(/[a-zA-Z]:\\[^"'\n\r<>|?*]+/g, "<path>");
  // Strip Unix style absolute paths (/home/... or /Users/...)
  sanitized = sanitized.replace(/\/(Users|home|root|var|etc)\/[^"'\n\r<>|?*]+/g, "<path>");
  return sanitized;
}

export class McpErrorMapper {
  /**
   * Alias for toMcpToolError for backward and module compatibility.
   */
  static toToolError(error: unknown): McpToolResponse {
    return McpErrorMapper.toMcpToolError(error);
  }

  /**
   * Map any caught error to a compliant MCP Tool error response.
   * Prevents internal server details, stack traces, and sensitive paths from leaking.
   */
  static toMcpToolError(error: unknown): McpToolResponse {
    if (error instanceof LocalBridgeError) {
      return {
        content: [
          {
            type: "text",
            text: sanitizeMcpOutput(error.message),
          },
        ],
        isError: true,
        structuredContent: {
          code: error.code,
          details: error.details,
        },
      };
    }

    if (error instanceof RemoteRpcError) {
      return {
        content: [
          {
            type: "text",
            text: sanitizeMcpOutput(error.message),
          },
        ],
        isError: true,
        structuredContent: {
          code: "RPC_REMOTE_ERROR",
          remoteCode: error.code,
          data: error.data,
        },
      };
    }

    if (error instanceof Error) {
      return {
        content: [
          {
            type: "text",
            text: sanitizeMcpOutput(error.message),
          },
        ],
        isError: true,
        structuredContent: {
          code: "INTERNAL_ERROR",
        },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: "An unknown error occurred while executing the tool",
        },
      ],
      isError: true,
      structuredContent: {
        code: "INTERNAL_ERROR",
      },
    };
  }
}
