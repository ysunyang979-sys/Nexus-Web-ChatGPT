import type {
  VisionAnalyzeParams,
  VisionAnalyzeResult,
  VisionDescribeParams,
  VisionDescribeResult,
  VisionOcrParams,
  VisionOcrResult,
  VisionCompareParams,
  VisionCompareResult,
  VisionCacheParams,
  VisionCacheResult,
  VisionGetParams,
  VisionGetResult,
  VisionDeleteParams,
  VisionDeleteResult,
} from "@localbridge/protocol";
import type { VisionService } from "../../vision/vision-service.js";

export function createVisionAnalyzeHandler(service: VisionService) {
  return async (params: VisionAnalyzeParams): Promise<VisionAnalyzeResult> => {
    return service.analyze(params);
  };
}

export function createVisionDescribeHandler(service: VisionService) {
  return async (params: VisionDescribeParams): Promise<VisionDescribeResult> => {
    return service.describe(params);
  };
}

export function createVisionOcrHandler(service: VisionService) {
  return async (params: VisionOcrParams): Promise<VisionOcrResult> => {
    return service.ocr(params);
  };
}

export function createVisionDetectObjectsHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { objects: res.objects };
  };
}

export function createVisionDetectRegionsHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { regions: res.regions };
  };
}

export function createVisionDetectPartsHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { parts: res.parts };
  };
}

export function createVisionGeometryHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return res.geometry || { shapes: [], dominantAspect: "landscape" };
  };
}

export function createVisionColorHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { colors: res.colors };
  };
}

export function createVisionMaterialHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { materials: res.materials };
  };
}

export function createVisionSpatialHandler(service: VisionService) {
  return async (params: any): Promise<any> => {
    const res = await service.analyze(params);
    return { spatialRelationships: res.spatialRelationships };
  };
}

export function createVisionCompareHandler(service: VisionService) {
  return async (params: VisionCompareParams): Promise<VisionCompareResult> => {
    return service.compare(params);
  };
}

export function createVisionExtractTextHandler(service: VisionService) {
  return async (params: VisionOcrParams): Promise<any> => {
    const res = await service.ocr(params);
    return { text: res.fullText, lines: res.lines };
  };
}

export function createVisionCacheHandler(service: VisionService) {
  return async (params: VisionCacheParams): Promise<VisionCacheResult> => {
    return service.cache(params);
  };
}

export function createVisionGetHandler(service: VisionService) {
  return async (params: VisionGetParams): Promise<VisionGetResult> => {
    return service.get(params);
  };
}

export function createVisionDeleteHandler(service: VisionService) {
  return async (params: VisionDeleteParams): Promise<VisionDeleteResult> => {
    return service.delete(params);
  };
}
