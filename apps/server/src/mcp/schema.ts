import { fromJsonSchema } from "@modelcontextprotocol/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

const strictSchemaCache = new WeakMap<z.ZodTypeAny, ReturnType<typeof fromJsonSchema>>();
const standardSchemaCache = new WeakMap<z.ZodTypeAny, ReturnType<typeof fromJsonSchema>>();

/**
 * Convert a Zod schema into an MCP-compliant Standard Schema using JSON Schema.
 * Strips $schema to ensure compatibility across all MCP client tooling.
 */
export function toMcpSchema<T extends z.ZodTypeAny>(
  zodSchema: T,
  options?: { preserveStrict?: boolean }
) {
  const cache = options?.preserveStrict ? strictSchemaCache : standardSchemaCache;
  const cached = cache.get(zodSchema);
  if (cached) {
    return cached;
  }

  const jsonSchema = zodToJsonSchema(zodSchema) as Record<string, unknown>;
  delete jsonSchema["$schema"];

  if (options?.preserveStrict) {
    const compiled = fromJsonSchema(jsonSchema);
    cache.set(zodSchema, compiled);
    return compiled;
  }

  delete (jsonSchema as any).additionalProperties;

  if (jsonSchema.type === "object" && jsonSchema.properties && typeof jsonSchema.properties === "object") {
    const props = jsonSchema.properties as Record<string, any>;
    if (!props.taskId) {
      props.taskId = { type: "string", description: "Optional Agent Task ID to associate this execution with" };
    }
    if (!props.executionId) {
      props.executionId = { type: "string", description: "Optional Execution ID" };
    }
    if (!props.idempotencyKey) {
      props.idempotencyKey = { type: "string", description: "Optional idempotency key for durable execution" };
    }
    if (!props.failVerification) {
      props.failVerification = { type: "boolean", description: "Simulate verification failure" };
    }
    if (!props.requireScreenChange) {
      props.requireScreenChange = { type: "boolean", description: "Require screen visual delta" };
    }
    if (!props.testScreenHash) {
      props.testScreenHash = { type: "string", description: "Test pre-state screen hash" };
    }
    if (!props.testPostScreenHash) {
      props.testPostScreenHash = { type: "string", description: "Test post-state screen hash" };
    }
  }

  const compiled = fromJsonSchema(jsonSchema);
  cache.set(zodSchema, compiled);
  return compiled;
}
