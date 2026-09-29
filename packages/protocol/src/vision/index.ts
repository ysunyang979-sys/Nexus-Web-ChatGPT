import { z } from "zod";

export const VisionBoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  confidence: z.number().optional(),
});
export type VisionBoundingBox = z.infer<typeof VisionBoundingBoxSchema>;

export const VisionObjectSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number(),
  boundingBox: VisionBoundingBoxSchema,
  attributes: z.record(z.any()).optional(),
});
export type VisionObject = z.infer<typeof VisionObjectSchema>;

export const VisionRegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  boundingBox: VisionBoundingBoxSchema,
  type: z.string().optional(),
});
export type VisionRegion = z.infer<typeof VisionRegionSchema>;

export const VisionPartSchema = z.object({
  id: z.string(),
  parentObjectId: z.string().optional(),
  name: z.string(),
  boundingBox: VisionBoundingBoxSchema,
});
export type VisionPart = z.infer<typeof VisionPartSchema>;

export const VisionTextLineSchema = z.object({
  text: z.string(),
  confidence: z.number().optional(),
  boundingBox: VisionBoundingBoxSchema.optional(),
});
export type VisionTextLine = z.infer<typeof VisionTextLineSchema>;

export const VisionGeometrySchema = z.object({
  shapes: z.array(
    z.object({
      type: z.string(),
      bounds: VisionBoundingBoxSchema,
      area: z.number().optional(),
    })
  ).default([]),
  dominantAspect: z.string().optional(),
});
export type VisionGeometry = z.infer<typeof VisionGeometrySchema>;

export const VisionMaterialSchema = z.object({
  label: z.string(),
  region: VisionBoundingBoxSchema.optional(),
  texture: z.string().optional(),
  confidence: z.number().optional(),
});
export type VisionMaterial = z.infer<typeof VisionMaterialSchema>;

export const VisionColorSchema = z.object({
  hex: z.string(),
  rgb: z.array(z.number()),
  percentage: z.number(),
  name: z.string().optional(),
});
export type VisionColor = z.infer<typeof VisionColorSchema>;

export const VisionSpatialRelationshipSchema = z.object({
  subjectId: z.string(),
  relation: z.enum([
    "above",
    "below",
    "left_of",
    "right_of",
    "inside",
    "contains",
    "adjacent_to",
    "overlapping",
  ]),
  objectId: z.string(),
  distance: z.number().optional(),
});
export type VisionSpatialRelationship = z.infer<
  typeof VisionSpatialRelationshipSchema
>;

export const VisionAnalyzeResultSchema = z.object({
  referenceId: z.string(),
  image: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    format: z.string().optional(),
    path: z.string().optional(),
  }),
  objects: z.array(VisionObjectSchema).default([]),
  regions: z.array(VisionRegionSchema).default([]),
  parts: z.array(VisionPartSchema).default([]),
  text: z.array(VisionTextLineSchema).default([]),
  geometry: VisionGeometrySchema.optional(),
  materials: z.array(VisionMaterialSchema).default([]),
  colors: z.array(VisionColorSchema).default([]),
  spatialRelationships: z.array(VisionSpatialRelationshipSchema).default([]),
  style: z.string().default(""),
  summary: z.string().default(""),
});
export type VisionAnalyzeResult = z.infer<typeof VisionAnalyzeResultSchema>;

export const VisionAnalyzeParamsSchema = z.object({
  imagePath: z.string().optional(),
  base64Data: z.string().optional(),
  referenceId: z.string().optional(),
  saveToCache: z.boolean().default(true),
  detectText: z.boolean().default(true),
});
export type VisionAnalyzeParams = z.infer<typeof VisionAnalyzeParamsSchema>;

export const VisionDescribeParamsSchema = z.object({
  imagePath: z.string().optional(),
  base64Data: z.string().optional(),
  referenceId: z.string().optional(),
});
export type VisionDescribeParams = z.infer<typeof VisionDescribeParamsSchema>;

export const VisionDescribeResultSchema = z.object({
  referenceId: z.string().optional(),
  summary: z.string(),
  details: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type VisionDescribeResult = z.infer<typeof VisionDescribeResultSchema>;

export const VisionOcrParamsSchema = z.object({
  imagePath: z.string().optional(),
  base64Data: z.string().optional(),
  referenceId: z.string().optional(),
  language: z.string().default("en"),
});
export type VisionOcrParams = z.infer<typeof VisionOcrParamsSchema>;

export const VisionOcrResultSchema = z.object({
  referenceId: z.string().optional(),
  fullText: z.string(),
  lines: z.array(VisionTextLineSchema).default([]),
  wordCount: z.number().int().nonnegative().default(0),
  success: z.boolean().default(true),
  status: z.enum([
    "SUCCESS",
    "NO_TEXT_DETECTED",
    "IMAGE_READ_FAILED",
    "OCR_ENGINE_FAILED",
    "LANGUAGE_PACK_MISSING",
    "INVALID_IMAGE",
    "UNSUPPORTED_FORMAT",
    "OCR_TIMEOUT",
  ]).optional(),
  engine: z.string().optional(),
  engineUsed: z.string().optional(),
  fallbackLevel: z.number().int().optional(),
  confidence: z.number().optional(),
  image: z.object({
    path: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    sha256: z.string().optional(),
    fileSizeBytes: z.number().int().optional(),
  }).optional(),
  diagnostics: z.record(z.any()).optional(),
});
export type VisionOcrResult = z.infer<typeof VisionOcrResultSchema>;

export const VisionCompareParamsSchema = z.object({
  imageA: z.string().optional(), // image path or referenceId
  imageB: z.string().optional(), // image path or referenceId
  referenceIdA: z.string().optional(),
  referenceIdB: z.string().optional(),
  base64DataA: z.string().optional(),
  base64DataB: z.string().optional(),
  threshold: z.number().min(0).max(1).default(0.85),
});
export type VisionCompareParams = z.infer<typeof VisionCompareParamsSchema>;

export const VisionCompareResultSchema = z.object({
  similarity: z.number(),
  matched: z.boolean(),
  similarities: z.array(z.string()).default([]),
  differences: z.array(z.string()).default([]),
  missingElements: z.array(z.string()).default([]),
  unexpectedElements: z.array(z.string()).default([]),
  positionDifferences: z.array(z.string()).default([]),
  colorDifferences: z.array(z.string()).default([]),
  textDifferences: z.array(z.string()).default([]),
});
export type VisionCompareResult = z.infer<typeof VisionCompareResultSchema>;

export const VisionCacheParamsSchema = z.object({
  referenceId: z.string(),
  imagePath: z.string().optional(),
  artifactData: VisionAnalyzeResultSchema.optional(),
});
export type VisionCacheParams = z.infer<typeof VisionCacheParamsSchema>;

export const VisionCacheResultSchema = z.object({
  referenceId: z.string(),
  storedPath: z.string(),
  success: z.boolean(),
});
export type VisionCacheResult = z.infer<typeof VisionCacheResultSchema>;

export const VisionGetParamsSchema = z.object({
  referenceId: z.string(),
});
export type VisionGetParams = z.infer<typeof VisionGetParamsSchema>;

export const VisionGetResultSchema = z.object({
  found: z.boolean(),
  referenceId: z.string(),
  artifact: VisionAnalyzeResultSchema.nullable().optional(),
  summaryMarkdown: z.string().optional(),
});
export type VisionGetResult = z.infer<typeof VisionGetResultSchema>;

export const VisionDeleteParamsSchema = z.object({
  referenceId: z.string(),
});
export type VisionDeleteParams = z.infer<typeof VisionDeleteParamsSchema>;

export const VisionDeleteResultSchema = z.object({
  deleted: z.boolean(),
  referenceId: z.string(),
});
export type VisionDeleteResult = z.infer<typeof VisionDeleteResultSchema>;
