import type {
  DocumentCreateParams,
  DocumentCreateResult,
  DocumentReadParams,
  DocumentReadResult,
  DocumentEditParams,
  DocumentEditResult,
  DocumentAppendParams,
  DocumentReplaceParams,
  DocumentInsertImageParams,
  DocumentInsertTableParams,
  DocumentInsertHeadingParams,
  DocumentInsertPageBreakParams,
  DocumentExportPdfParams,
  DocumentExportPdfResult,
  DocumentConvertParams,
  DocumentConvertResult,
  DocumentInspectParams,
  DocumentInspectResult,
  DocumentValidateParams,
  DocumentValidateResult,
  DocumentRenderParams,
  DocumentRenderResult,
  DocumentCompareParams,
  DocumentCompareResult,
  DocumentTemplateCreateParams,
  DocumentTemplateListParams,
  DocumentTemplateListResult,
  DocumentTemplateApplyParams,
  DocumentTemplateApplyResult,
} from "@localbridge/protocol";
import type { DocumentService } from "../../documents/document-service.js";

export function createDocumentCreateHandler(service: DocumentService) {
  return async (params: DocumentCreateParams): Promise<DocumentCreateResult> => {
    return service.create(params);
  };
}

export function createDocumentReadHandler(service: DocumentService) {
  return async (params: DocumentReadParams): Promise<DocumentReadResult> => {
    return service.read(params);
  };
}

export function createDocumentEditHandler(service: DocumentService) {
  return async (params: DocumentEditParams): Promise<DocumentEditResult> => {
    return service.edit(params);
  };
}

export function createDocumentAppendHandler(service: DocumentService) {
  return async (params: DocumentAppendParams): Promise<DocumentEditResult> => {
    return service.append(params);
  };
}

export function createDocumentReplaceHandler(service: DocumentService) {
  return async (params: DocumentReplaceParams): Promise<DocumentEditResult> => {
    return service.replace(params);
  };
}

export function createDocumentInsertImageHandler(service: DocumentService) {
  return async (params: DocumentInsertImageParams): Promise<DocumentEditResult> => {
    return service.insertImage(params);
  };
}

export function createDocumentInsertTableHandler(service: DocumentService) {
  return async (params: DocumentInsertTableParams): Promise<DocumentEditResult> => {
    return service.insertTable(params);
  };
}

export function createDocumentInsertHeadingHandler(service: DocumentService) {
  return async (params: DocumentInsertHeadingParams): Promise<DocumentEditResult> => {
    return service.insertHeading(params);
  };
}

export function createDocumentInsertPageBreakHandler(service: DocumentService) {
  return async (params: DocumentInsertPageBreakParams): Promise<DocumentEditResult> => {
    return service.insertPageBreak(params);
  };
}

export function createDocumentExportPdfHandler(service: DocumentService) {
  return async (params: DocumentExportPdfParams): Promise<DocumentExportPdfResult> => {
    return service.exportPdf(params);
  };
}

export function createDocumentConvertHandler(service: DocumentService) {
  return async (params: DocumentConvertParams): Promise<DocumentConvertResult> => {
    return service.convert(params);
  };
}

export function createDocumentInspectHandler(service: DocumentService) {
  return async (params: DocumentInspectParams): Promise<DocumentInspectResult> => {
    return service.inspect(params);
  };
}

export function createDocumentValidateHandler(service: DocumentService) {
  return async (params: DocumentValidateParams): Promise<DocumentValidateResult> => {
    return service.validate(params);
  };
}

export function createDocumentRenderHandler(service: DocumentService) {
  return async (params: DocumentRenderParams): Promise<DocumentRenderResult> => {
    return service.render(params);
  };
}

export function createDocumentCompareHandler(service: DocumentService) {
  return async (params: DocumentCompareParams): Promise<DocumentCompareResult> => {
    return service.compare(params);
  };
}

export function createDocumentTemplateCreateHandler(service: DocumentService) {
  return async (params: DocumentTemplateCreateParams): Promise<any> => {
    return service.templateCreate(params);
  };
}

export function createDocumentTemplateListHandler(service: DocumentService) {
  return async (params: DocumentTemplateListParams): Promise<DocumentTemplateListResult> => {
    return service.templateList(params);
  };
}

export function createDocumentTemplateApplyHandler(service: DocumentService) {
  return async (params: DocumentTemplateApplyParams): Promise<DocumentTemplateApplyResult> => {
    return service.templateApply(params);
  };
}
