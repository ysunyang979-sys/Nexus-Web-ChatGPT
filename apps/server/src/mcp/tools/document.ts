import {
  DocumentCreateParamsSchema,
  DocumentReadParamsSchema,
  DocumentEditParamsSchema,
  DocumentAppendParamsSchema,
  DocumentReplaceParamsSchema,
  DocumentInsertImageParamsSchema,
  DocumentInsertTableParamsSchema,
  DocumentExportPdfParamsSchema,
  DocumentConvertParamsSchema,
  DocumentInspectParamsSchema,
  DocumentValidateParamsSchema,
  DocumentRenderParamsSchema,
  DocumentCompareParamsSchema,
  DocumentTemplateApplyParamsSchema,
  RunnerRpcMethods,
} from "@localbridge/protocol";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpContext } from "../context.js";
import { formatToolSuccess, McpErrorMapper } from "../errors.js";
import { toMcpSchema } from "../schema.js";

export function registerDocumentTools(server: McpServer, context: McpContext): void {
  // Helper for generic tool dispatch
  const makeHandler = (method: string) => async (args: any) => {
    try {
      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, method, args);
      return formatToolSuccess(result);
    } catch (err) {
      return McpErrorMapper.toToolError(err);
    }
  };

  // 1. localbridge_document_create
  const createH = makeHandler(RunnerRpcMethods.DocumentCreate);
  server.registerTool(
    "localbridge_document_create",
    {
      description: "Create standard office documents (DOCX, PDF, XLSX, PPTX, MD, TXT, CSV, RTF) with structured headings, tables, and paragraphs.",
      inputSchema: toMcpSchema(DocumentCreateParamsSchema),
    },
    createH
  );
  server.registerTool(
    "document_create",
    {
      description: "Alias for localbridge_document_create.",
      inputSchema: toMcpSchema(DocumentCreateParamsSchema),
    },
    createH
  );

  // 2. localbridge_document_read
  const readH = makeHandler(RunnerRpcMethods.DocumentRead);
  server.registerTool(
    "localbridge_document_read",
    {
      description: "Read and extract structured content from DOCX, PDF, XLSX, PPTX, or text documents.",
      inputSchema: toMcpSchema(DocumentReadParamsSchema),
    },
    readH
  );
  server.registerTool(
    "document_read",
    {
      description: "Alias for localbridge_document_read.",
      inputSchema: toMcpSchema(DocumentReadParamsSchema),
    },
    readH
  );

  // 3. localbridge_document_edit
  const editH = makeHandler(RunnerRpcMethods.DocumentEdit);
  server.registerTool(
    "localbridge_document_edit",
    {
      description: "Edit existing document via appending text, replacing substrings, or inserting tables/headings.",
      inputSchema: toMcpSchema(DocumentEditParamsSchema),
    },
    editH
  );
  server.registerTool(
    "document_edit",
    {
      description: "Alias for localbridge_document_edit.",
      inputSchema: toMcpSchema(DocumentEditParamsSchema),
    },
    editH
  );

  // 4. localbridge_document_append
  const appendH = makeHandler(RunnerRpcMethods.DocumentAppend);
  server.registerTool(
    "localbridge_document_append",
    {
      description: "Append paragraph, heading, or bullet item to a document.",
      inputSchema: toMcpSchema(DocumentAppendParamsSchema),
    },
    appendH
  );
  server.registerTool(
    "document_append",
    {
      description: "Alias for localbridge_document_append.",
      inputSchema: toMcpSchema(DocumentAppendParamsSchema),
    },
    appendH
  );

  // 5. localbridge_document_replace
  const replaceH = makeHandler(RunnerRpcMethods.DocumentReplace);
  server.registerTool(
    "localbridge_document_replace",
    {
      description: "Replace target substring with replacement in document.",
      inputSchema: toMcpSchema(DocumentReplaceParamsSchema),
    },
    replaceH
  );
  server.registerTool(
    "document_replace",
    {
      description: "Alias for localbridge_document_replace.",
      inputSchema: toMcpSchema(DocumentReplaceParamsSchema),
    },
    replaceH
  );

  // 6. localbridge_document_insert_image
  const insertImageH = async (args: any) => {
    const startTime = Date.now();
    try {
      context.logAudit("mcp_tool_started", {
        toolName: "localbridge_document_insert_image",
        path: args?.path,
        imagePath: args?.imagePath,
      });

      const fs = await import("node:fs");
      if (!args || !args.imagePath || typeof args.imagePath !== "string") {
        throw new Error("Missing or invalid 'imagePath' parameter.");
      }
      if (!fs.existsSync(args.imagePath)) {
        const err = new Error(`Image file not found at path: ${args.imagePath}`);
        (err as any).code = "FILE_NOT_FOUND";
        throw err;
      }

      const runnerId = context.resolveAnyRunner();
      const result = await context.request(runnerId, RunnerRpcMethods.DocumentInsertImage, args);

      context.logAudit("mcp_tool_completed", {
        toolName: "localbridge_document_insert_image",
        path: args?.path,
        runnerId,
        durationMs: Date.now() - startTime,
        resultStatus: "success",
      });

      return formatToolSuccess(result);
    } catch (err) {
      context.logAudit("mcp_tool_failed", {
        toolName: "localbridge_document_insert_image",
        path: args?.path,
        durationMs: Date.now() - startTime,
        resultStatus: "error",
        errorCode: (err as any)?.code ?? "ERROR",
      });
      return McpErrorMapper.toToolError(err);
    }
  };

  server.registerTool(
    "localbridge_document_insert_image",
    {
      description: "Insert visual image artifact into document body with caption.",
      inputSchema: toMcpSchema(DocumentInsertImageParamsSchema),
    },
    insertImageH
  );
  server.registerTool(
    "document_insert_image",
    {
      description: "Alias for localbridge_document_insert_image.",
      inputSchema: toMcpSchema(DocumentInsertImageParamsSchema),
    },
    insertImageH
  );

  // 7. localbridge_document_insert_table
  const insertTableH = makeHandler(RunnerRpcMethods.DocumentInsertTable);
  server.registerTool(
    "localbridge_document_insert_table",
    {
      description: "Insert data table with headers and rows into document.",
      inputSchema: toMcpSchema(DocumentInsertTableParamsSchema),
    },
    insertTableH
  );
  server.registerTool(
    "document_insert_table",
    {
      description: "Alias for localbridge_document_insert_table.",
      inputSchema: toMcpSchema(DocumentInsertTableParamsSchema),
    },
    insertTableH
  );

  // 8. localbridge_document_export_pdf
  const exportPdfH = makeHandler(RunnerRpcMethods.DocumentExportPdf);
  server.registerTool(
    "localbridge_document_export_pdf",
    {
      description: "Export document (DOCX, Markdown, etc.) to standard Adobe PDF specification.",
      inputSchema: toMcpSchema(DocumentExportPdfParamsSchema),
    },
    exportPdfH
  );
  server.registerTool(
    "document_export_pdf",
    {
      description: "Alias for localbridge_document_export_pdf.",
      inputSchema: toMcpSchema(DocumentExportPdfParamsSchema),
    },
    exportPdfH
  );

  // 9. localbridge_document_convert
  const convertH = makeHandler(RunnerRpcMethods.DocumentConvert);
  server.registerTool(
    "localbridge_document_convert",
    {
      description: "Convert document between supported formats.",
      inputSchema: toMcpSchema(DocumentConvertParamsSchema),
    },
    convertH
  );
  server.registerTool(
    "document_convert",
    {
      description: "Alias for localbridge_document_convert.",
      inputSchema: toMcpSchema(DocumentConvertParamsSchema),
    },
    convertH
  );

  // 10. localbridge_document_inspect
  const inspectH = makeHandler(RunnerRpcMethods.DocumentInspect);
  server.registerTool(
    "localbridge_document_inspect",
    {
      description: "Inspect document structure, format, paragraph count, page count, and metadata.",
      inputSchema: toMcpSchema(DocumentInspectParamsSchema),
    },
    inspectH
  );
  server.registerTool(
    "document_inspect",
    {
      description: "Alias for localbridge_document_inspect.",
      inputSchema: toMcpSchema(DocumentInspectParamsSchema),
    },
    inspectH
  );

  // 11. localbridge_document_validate
  const validateH = makeHandler(RunnerRpcMethods.DocumentValidate);
  server.registerTool(
    "localbridge_document_validate",
    {
      description: "Validate document structural integrity and container signature; automatically repairs corrupt formatting if autoRepair is enabled.",
      inputSchema: toMcpSchema(DocumentValidateParamsSchema),
    },
    validateH
  );
  server.registerTool(
    "document_validate",
    {
      description: "Alias for localbridge_document_validate.",
      inputSchema: toMcpSchema(DocumentValidateParamsSchema),
    },
    validateH
  );

  // 12. localbridge_document_render
  const renderH = makeHandler(RunnerRpcMethods.DocumentRender);
  server.registerTool(
    "localbridge_document_render",
    {
      description: "Render document preview as HTML and plain text.",
      inputSchema: toMcpSchema(DocumentRenderParamsSchema),
    },
    renderH
  );
  server.registerTool(
    "document_render",
    {
      description: "Alias for localbridge_document_render.",
      inputSchema: toMcpSchema(DocumentRenderParamsSchema),
    },
    renderH
  );

  // 13. localbridge_document_compare
  const compareH = makeHandler(RunnerRpcMethods.DocumentCompare);
  server.registerTool(
    "localbridge_document_compare",
    {
      description: "Compare two documents to identify additions, removals, and structural modifications.",
      inputSchema: toMcpSchema(DocumentCompareParamsSchema),
    },
    compareH
  );
  server.registerTool(
    "document_compare",
    {
      description: "Alias for localbridge_document_compare.",
      inputSchema: toMcpSchema(DocumentCompareParamsSchema),
    },
    compareH
  );

  // 14. localbridge_document_template_apply
  const templateApplyH = makeHandler(RunnerRpcMethods.DocumentTemplateApply);
  server.registerTool(
    "localbridge_document_template_apply",
    {
      description: "Apply pre-built document template (report, resume, contract, meeting minutes, presentation, spreadsheet).",
      inputSchema: toMcpSchema(DocumentTemplateApplyParamsSchema),
    },
    templateApplyH
  );
  server.registerTool(
    "document_template_apply",
    {
      description: "Alias for localbridge_document_template_apply.",
      inputSchema: toMcpSchema(DocumentTemplateApplyParamsSchema),
    },
    templateApplyH
  );
}
