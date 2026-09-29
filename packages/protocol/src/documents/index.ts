import { z } from "zod";

export const DocumentFormatSchema = z.enum([
  "docx",
  "pdf",
  "xlsx",
  "pptx",
  "md",
  "txt",
  "csv",
  "rtf",
  "odt",
  "ods",
  "odp",
]);
export type DocumentFormat = z.infer<typeof DocumentFormatSchema>;

export const DocumentCreateParamsSchema = z.object({
  format: DocumentFormatSchema.default("docx"),
  path: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  author: z.string().optional(),
  templateId: z.string().optional(),
  elements: z
    .array(
      z.object({
        type: z.enum([
          "heading",
          "paragraph",
          "table",
          "image",
          "bullet_list",
          "numbered_list",
          "page_break",
          "sheet",
          "slide",
        ]),
        text: z.string().optional(),
        level: z.number().int().min(1).max(6).optional(),
        headers: z.array(z.string()).optional(),
        rows: z.array(z.array(z.any())).optional(),
        imagePath: z.string().optional(),
        caption: z.string().optional(),
        items: z.array(z.string()).optional(),
        sheetName: z.string().optional(),
        cells: z.array(z.array(z.any())).optional(),
        slideTitle: z.string().optional(),
        slideContent: z.array(z.string()).optional(),
      })
    )
    .optional(),
});
export type DocumentCreateParams = z.infer<typeof DocumentCreateParamsSchema>;

export const DocumentCreateResultSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  format: DocumentFormatSchema,
  sizeBytes: z.number().int().nonnegative(),
  message: z.string(),
});
export type DocumentCreateResult = z.infer<typeof DocumentCreateResultSchema>;

export const DocumentReadParamsSchema = z.object({
  path: z.string(),
  format: DocumentFormatSchema.optional(),
  maxChars: z.number().int().positive().default(50000).optional(),
});
export type DocumentReadParams = z.infer<typeof DocumentReadParamsSchema>;

export const DocumentReadResultSchema = z.object({
  path: z.string(),
  format: DocumentFormatSchema,
  content: z.string(),
  metadata: z.record(z.any()).default({}),
  pageCount: z.number().int().nonnegative().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  elementsCount: z.number().int().nonnegative().optional(),
});
export type DocumentReadResult = z.infer<typeof DocumentReadResultSchema>;

export const DocumentEditParamsSchema = z.object({
  path: z.string(),
  action: z.enum([
    "append",
    "replace",
    "insert_heading",
    "insert_paragraph",
    "insert_table",
    "insert_image",
    "insert_page_break",
  ]),
  text: z.string().optional(),
  target: z.string().optional(),
  replacement: z.string().optional(),
  level: z.number().int().optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.any())).optional(),
  imagePath: z.string().optional(),
  caption: z.string().optional(),
});
export type DocumentEditParams = z.infer<typeof DocumentEditParamsSchema>;

export const DocumentEditResultSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  message: z.string(),
});
export type DocumentEditResult = z.infer<typeof DocumentEditResultSchema>;

export const DocumentAppendParamsSchema = z.object({
  path: z.string(),
  text: z.string(),
  type: z.enum(["paragraph", "heading", "bullet"]).default("paragraph"),
  level: z.number().int().optional(),
});
export type DocumentAppendParams = z.infer<typeof DocumentAppendParamsSchema>;

export const DocumentReplaceParamsSchema = z.object({
  path: z.string(),
  target: z.string(),
  replacement: z.string(),
});
export type DocumentReplaceParams = z.infer<typeof DocumentReplaceParamsSchema>;

export const DocumentInsertImageParamsSchema = z.object({
  path: z.string(),
  imagePath: z.string(),
  caption: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type DocumentInsertImageParams = z.infer<
  typeof DocumentInsertImageParamsSchema
>;

export const DocumentInsertTableParamsSchema = z.object({
  path: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.any())),
});
export type DocumentInsertTableParams = z.infer<
  typeof DocumentInsertTableParamsSchema
>;

export const DocumentInsertHeadingParamsSchema = z.object({
  path: z.string(),
  text: z.string(),
  level: z.number().int().min(1).max(6).default(1),
});
export type DocumentInsertHeadingParams = z.infer<
  typeof DocumentInsertHeadingParamsSchema
>;

export const DocumentInsertPageBreakParamsSchema = z.object({
  path: z.string(),
});
export type DocumentInsertPageBreakParams = z.infer<
  typeof DocumentInsertPageBreakParamsSchema
>;

export const DocumentExportPdfParamsSchema = z.object({
  sourcePath: z.string(),
  targetPdfPath: z.string().optional(),
});
export type DocumentExportPdfParams = z.infer<
  typeof DocumentExportPdfParamsSchema
>;

export const DocumentExportPdfResultSchema = z.object({
  success: z.boolean(),
  sourcePath: z.string(),
  targetPdfPath: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().default(1),
});
export type DocumentExportPdfResult = z.infer<
  typeof DocumentExportPdfResultSchema
>;

export const DocumentConvertParamsSchema = z.object({
  sourcePath: z.string(),
  targetPath: z.string(),
  targetFormat: DocumentFormatSchema,
});
export type DocumentConvertParams = z.infer<typeof DocumentConvertParamsSchema>;

export const DocumentConvertResultSchema = z.object({
  success: z.boolean(),
  sourcePath: z.string(),
  targetPath: z.string(),
  targetFormat: DocumentFormatSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export type DocumentConvertResult = z.infer<typeof DocumentConvertResultSchema>;

export const DocumentInspectParamsSchema = z.object({
  path: z.string(),
});
export type DocumentInspectParams = z.infer<typeof DocumentInspectParamsSchema>;

export const DocumentInspectResultSchema = z.object({
  path: z.string(),
  format: DocumentFormatSchema,
  sizeBytes: z.number().int().nonnegative(),
  exists: z.boolean(),
  pageCount: z.number().int().nonnegative().optional(),
  paragraphCount: z.number().int().nonnegative().optional(),
  headingCount: z.number().int().nonnegative().optional(),
  tableCount: z.number().int().nonnegative().optional(),
  imageCount: z.number().int().nonnegative().optional(),
  sheetCount: z.number().int().nonnegative().optional(),
  slideCount: z.number().int().nonnegative().optional(),
  structure: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});
export type DocumentInspectResult = z.infer<typeof DocumentInspectResultSchema>;

export const DocumentValidateParamsSchema = z.object({
  path: z.string(),
  expectedFormat: DocumentFormatSchema.optional(),
  minPages: z.number().int().optional(),
  requireImages: z.boolean().optional(),
  requireTables: z.boolean().optional(),
  autoRepair: z.boolean().default(true),
});
export type DocumentValidateParams = z.infer<
  typeof DocumentValidateParamsSchema
>;

export const DocumentValidateResultSchema = z.object({
  valid: z.boolean(),
  path: z.string(),
  format: DocumentFormatSchema,
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative().optional(),
  checks: z.record(z.boolean()),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  repaired: z.boolean().default(false),
  repairActions: z.array(z.string()).default([]),
});
export type DocumentValidateResult = z.infer<
  typeof DocumentValidateResultSchema
>;

export const DocumentRenderParamsSchema = z.object({
  path: z.string(),
  pageIndex: z.number().int().nonnegative().default(0),
});
export type DocumentRenderParams = z.infer<typeof DocumentRenderParamsSchema>;

export const DocumentRenderResultSchema = z.object({
  path: z.string(),
  htmlPreview: z.string().optional(),
  plainText: z.string().optional(),
  totalPages: z.number().int().nonnegative().default(1),
});
export type DocumentRenderResult = z.infer<typeof DocumentRenderResultSchema>;

export const DocumentCompareParamsSchema = z.object({
  pathA: z.string(),
  pathB: z.string(),
});
export type DocumentCompareParams = z.infer<typeof DocumentCompareParamsSchema>;

export const DocumentCompareResultSchema = z.object({
  pathA: z.string(),
  pathB: z.string(),
  identical: z.boolean(),
  differences: z.array(z.string()).default([]),
  addedElements: z.array(z.string()).default([]),
  removedElements: z.array(z.string()).default([]),
  modifiedElements: z.array(z.string()).default([]),
});
export type DocumentCompareResult = z.infer<typeof DocumentCompareResultSchema>;

export const DocumentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    "report",
    "resume",
    "contract",
    "project_doc",
    "meeting_minutes",
    "analysis",
    "presentation",
    "spreadsheet",
  ]),
  format: DocumentFormatSchema,
  defaultStructure: z.array(z.record(z.any())),
});
export type DocumentTemplate = z.infer<typeof DocumentTemplateSchema>;

export const DocumentTemplateCreateParamsSchema = z.object({
  template: DocumentTemplateSchema,
});
export type DocumentTemplateCreateParams = z.infer<
  typeof DocumentTemplateCreateParamsSchema
>;

export const DocumentTemplateListParamsSchema = z.object({
  category: z.string().optional(),
  format: DocumentFormatSchema.optional(),
});
export type DocumentTemplateListParams = z.infer<
  typeof DocumentTemplateListParamsSchema
>;

export const DocumentTemplateListResultSchema = z.object({
  templates: z.array(DocumentTemplateSchema),
});
export type DocumentTemplateListResult = z.infer<
  typeof DocumentTemplateListResultSchema
>;

export const DocumentTemplateApplyParamsSchema = z.object({
  templateId: z.string(),
  targetPath: z.string(),
  variables: z.record(z.any()).default({}),
});
export type DocumentTemplateApplyParams = z.infer<
  typeof DocumentTemplateApplyParamsSchema
>;

export const DocumentTemplateApplyResultSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  templateId: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type DocumentTemplateApplyResult = z.infer<
  typeof DocumentTemplateApplyResultSchema
>;
