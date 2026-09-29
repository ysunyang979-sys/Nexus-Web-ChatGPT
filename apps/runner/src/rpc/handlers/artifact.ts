import type {
  ArtifactCreateParams,
  ArtifactCreateResult,
  ArtifactWriteChunkParams,
  ArtifactWriteChunkResult,
  ArtifactReadChunkParams,
  ArtifactReadChunkResult,
  ArtifactGetParams,
  ArtifactGetResult,
  ArtifactListParams,
  ArtifactListResult,
  ArtifactImportParams,
  ArtifactImportResult,
  ArtifactExportParams,
  ArtifactExportResult,
  ArtifactDeleteParams,
  ArtifactDeleteResult,
  ArtifactAbortParams,
  ArtifactAbortResult,
} from "@localbridge/protocol";
import type { ArtifactService } from "../../artifacts/artifact-service.js";

export function createArtifactCreateHandler(service: ArtifactService) {
  return async (params: ArtifactCreateParams): Promise<ArtifactCreateResult> => {
    return service.create(params);
  };
}

export function createArtifactWriteChunkHandler(service: ArtifactService) {
  return async (params: ArtifactWriteChunkParams): Promise<ArtifactWriteChunkResult> => {
    return service.writeChunk(params);
  };
}

export function createArtifactReadChunkHandler(service: ArtifactService) {
  return async (params: ArtifactReadChunkParams): Promise<ArtifactReadChunkResult> => {
    return service.readChunk(params);
  };
}

export function createArtifactGetHandler(service: ArtifactService) {
  return async (params: ArtifactGetParams): Promise<ArtifactGetResult> => {
    return service.get(params);
  };
}

export function createArtifactListHandler(service: ArtifactService) {
  return async (params: ArtifactListParams): Promise<ArtifactListResult> => {
    return service.list(params);
  };
}

export function createArtifactImportHandler(service: ArtifactService) {
  return async (params: ArtifactImportParams): Promise<ArtifactImportResult> => {
    return service.importArtifact(params);
  };
}

export function createArtifactExportHandler(service: ArtifactService) {
  return async (params: ArtifactExportParams): Promise<ArtifactExportResult> => {
    return service.exportFile(params);
  };
}

export function createArtifactDeleteHandler(service: ArtifactService) {
  return async (params: ArtifactDeleteParams): Promise<ArtifactDeleteResult> => {
    return service.delete(params);
  };
}

export function createArtifactAbortHandler(service: ArtifactService) {
  return async (params: ArtifactAbortParams): Promise<ArtifactAbortResult> => {
    return service.abort(params);
  };
}
