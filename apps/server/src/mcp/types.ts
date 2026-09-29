export interface McpPrincipal {
  id: string;
  authType: "localbridge-token" | "oauth";
  scopes: string[];
  tokenId: string;
}

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MAX_MCP_BODY_BYTES = 16 * 1024 * 1024; // 16 MiB (16,777,216 bytes)
export const MAX_MCP_RESULT_BYTES = 16 * 1024 * 1024; // 16 MiB (16,777,216 bytes)
export const MCP_MAX_REQUESTS_PER_MINUTE = 1200;
export const MCP_MAX_CONCURRENT_REQUESTS = 50;

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolTextContent {
  type: "text";
  text: string;
}

export interface McpToolResponse {
  [key: string]: unknown;
  content: McpToolTextContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}
