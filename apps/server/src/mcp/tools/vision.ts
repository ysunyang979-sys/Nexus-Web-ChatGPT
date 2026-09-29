import {
  VisionAnalyzeParamsSchema,
  VisionDescribeParamsSchema,
  VisionOcrParamsSchema,
  VisionCompareParamsSchema,
  VisionCacheParamsSchema,
  VisionGetParamsSchema,
  VisionDeleteParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerVisionTools(server: McpServer, context: McpContext): void {
  // 1. localbridge_vision_analyze
  const analyzeHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await (context as any).request(runnerId, RunnerRpcMethods.VisionAnalyze, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_analyze",
    {
      description: "Analyze image to extract structured objects, functional regions, geometry, color palette, OCR text, and spatial relationships.",
      inputSchema: toMcpSchema(VisionAnalyzeParamsSchema),
    },
    analyzeHandler
  );
  server.registerTool(
    "vision_analyze",
    {
      description: "Alias for localbridge_vision_analyze.",
      inputSchema: toMcpSchema(VisionAnalyzeParamsSchema),
    },
    analyzeHandler
  );

  // 2. localbridge_vision_describe
  const describeHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await (context as any).request(runnerId, RunnerRpcMethods.VisionDescribe, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_describe",
    {
      description: "Provide high-level visual description and semantic tags of an image.",
      inputSchema: toMcpSchema(VisionDescribeParamsSchema),
    },
    describeHandler
  );
  server.registerTool(
    "vision_describe",
    {
      description: "Alias for localbridge_vision_describe.",
      inputSchema: toMcpSchema(VisionDescribeParamsSchema),
    },
    describeHandler
  );

  // 3. localbridge_vision_ocr
  const ocrHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result: any = await (context as any).request(runnerId, RunnerRpcMethods.VisionOcr, args);

      const lines: any[] = Array.isArray(result?.lines) ? result.lines : [];
      const fullText: string = (result?.fullText || "").trim();

      const outputSections: string[] = [];
      outputSections.push("### 逐字转写 (Verbatim Transcription):");
      if (fullText) {
        outputSections.push(fullText);
      } else {
        outputSections.push("(未检测到有效文本 / No text detected)");
      }

      outputSections.push("");
      outputSections.push(`### 坐标定位与排版 (Layout & Coordinates, 共 ${lines.length} 行):`);
      if (lines.length > 0) {
        const layoutText = lines
          .map((l: any, i: number) => {
            const b = l.boundingBox || {};
            const boxStr = b.x !== undefined ? `[x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height}]` : "[no-box]";
            return `${i + 1}. ${boxStr} "${l.text}"`;
          })
          .join("\n");
        outputSections.push(layoutText);
      } else {
        outputSections.push("(无坐标数据)");
      }

      return formatToolSuccess({
        ...result,
        formattedTranscription: outputSections.join("\n"),
      });
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_ocr",
    {
      description: "Extract text lines and bounding boxes from image using local Windows OCR or visual inspection.",
      inputSchema: toMcpSchema(VisionOcrParamsSchema),
    },
    ocrHandler
  );
  server.registerTool(
    "vision_ocr",
    {
      description: "Alias for localbridge_vision_ocr.",
      inputSchema: toMcpSchema(VisionOcrParamsSchema),
    },
    ocrHandler
  );

  // 4. localbridge_vision_compare
  const compareHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await (context as any).request(runnerId, RunnerRpcMethods.VisionCompare, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_compare",
    {
      description: "Compare two visual scenes to detect differences, similarities, missing elements, and unexpected elements.",
      inputSchema: toMcpSchema(VisionCompareParamsSchema),
    },
    compareHandler
  );
  server.registerTool(
    "vision_compare",
    {
      description: "Alias for localbridge_vision_compare.",
      inputSchema: toMcpSchema(VisionCompareParamsSchema),
    },
    compareHandler
  );

  // 5. localbridge_vision_cache
  const cacheHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await (context as any).request(runnerId, RunnerRpcMethods.VisionCache, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_cache",
    {
      description: "Persist structured vision artifact into .nexus/vision/<refId>/ cache.",
      inputSchema: toMcpSchema(VisionCacheParamsSchema),
    },
    cacheHandler
  );
  server.registerTool(
    "vision_cache",
    {
      description: "Alias for localbridge_vision_cache.",
      inputSchema: toMcpSchema(VisionCacheParamsSchema),
    },
    cacheHandler
  );

  // 6. localbridge_vision_get
  const getHandler = async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await (context as any).request(runnerId, RunnerRpcMethods.VisionGet, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_get",
    {
      description: "Retrieve cached structured vision artifact without re-running vision model (avoids quota exhaustion).",
      inputSchema: toMcpSchema(VisionGetParamsSchema),
    },
    getHandler
  );
  server.registerTool(
    "vision_get",
    {
      description: "Alias for localbridge_vision_get.",
      inputSchema: toMcpSchema(VisionGetParamsSchema),
    },
    getHandler
  );

  // 7. localbridge_vision_delete
  const deleteHandler = async (args: any) => {
    const startTime = Date.now();
    const { referenceId } = args || {};

    try {
      context.logAudit("mcp_tool_started", {
        toolName: "localbridge_vision_delete",
        referenceId,
      });

      if (!referenceId || typeof referenceId !== "string") {
        throw new Error("Missing or invalid 'referenceId' parameter.");
      }

      const runnerId = context.resolveAnyRunner();

      // Verify reference exists before deleting
      const checkResult = await context.request(runnerId, RunnerRpcMethods.VisionGet, { referenceId });
      if (!checkResult || !checkResult.found) {
        const err = new Error(`Vision reference not found: ${referenceId}`);
        (err as any).code = "NOT_FOUND";
        throw err;
      }

      const result = await context.request(runnerId, RunnerRpcMethods.VisionDelete, args);

      context.logAudit("mcp_tool_completed", {
        toolName: "localbridge_vision_delete",
        referenceId,
        runnerId,
        durationMs: Date.now() - startTime,
        resultStatus: "success",
      });

      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", {
        toolName: "localbridge_vision_delete",
        referenceId,
        durationMs: Date.now() - startTime,
        resultStatus: "error",
        errorCode: (err as any)?.code ?? "ERROR",
      });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_vision_delete",
    {
      description: "Delete cached vision artifact from disk and memory.",
      inputSchema: toMcpSchema(VisionDeleteParamsSchema),
    },
    deleteHandler
  );
  server.registerTool(
    "vision_delete",
    {
      description: "Alias for localbridge_vision_delete.",
      inputSchema: toMcpSchema(VisionDeleteParamsSchema),
    },
    deleteHandler
  );
}
