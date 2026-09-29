import React, { useState, useEffect, useCallback } from "react";
import {
  UploadCloud,
  FileText,
  RefreshCw,
  Tag,
  Hash,
  BookOpen,
  Trash2,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

export const KnowledgeImportPage: React.FC = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [explicitType, setExplicitType] = useState<string>("AUTO");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bridge.getIntelligenceKnowledge({ limit: 100 });
      setDocuments(res.documents || []);
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to load knowledge documents", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await bridge.deleteIntelligenceKnowledgeDoc(documentId);
      setMessage({ text: "Document permanently deleted from store and archived on disk", type: "success" });
      loadDocuments();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to delete document", type: "error" });
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent((event.target?.result as string) || "");
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filename.trim() || !fileContent) {
      setMessage({ text: t.knowledge?.provideBothError || "Please provide both filename and file content", type: "error" });
      return;
    }
    setImporting(true);
    try {
      const res = await bridge.importIntelligenceKnowledge({
        filename: filename.trim(),
        content: fileContent,
        explicitType: explicitType !== "AUTO" ? explicitType : undefined,
      });

      if (res.result === "duplicate") {
        setMessage({
          text: `${t.knowledge?.skippedDuplicate || "Skipped: Duplicate file with identical SHA-256 hash"} (${res.fileHash.slice(0, 12)}...)`,
          type: "success",
        });
      } else {
        setMessage({
          text: `${t.knowledge?.importSuccess || "Successfully imported file"} '${res.filename}' [${res.detectedType}] (SHA-256: ${res.fileHash.slice(0, 10)}...)`,
          type: "success",
        });
      }
      setFilename("");
      setFileContent("");
      loadDocuments();
    } catch (err: any) {
      setMessage({ text: err.message || t.knowledge?.importFailed || "Import failed", type: "error" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-subtle pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-500 border border-teal-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">{t.knowledge?.title || "Knowledge Import & Documents"}</h1>
            <p className="text-xs text-theme-muted">
              {t.knowledge?.headerDesc || "Auto-Classification (Memory / Rule / Skill / Doc) • SHA-256 Deduplication • Traversal Defense"}
            </p>
          </div>
        </div>

        <button
          onClick={loadDocuments}
          disabled={loading}
          className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-theme-muted hover:text-theme-primary">
            ✕
          </button>
        </div>
      )}

      {/* Import Form */}
      <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-theme-primary flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-teal-500" />
          <span>{t.knowledge?.importBoxTitle || "Import Knowledge File"}</span>
        </h2>

        <form onSubmit={handleImport} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-theme-muted mb-1">
                {t.knowledge?.uploadFileLabel || "Upload File (Markdown, JSON, YAML, TXT)"}
              </label>
              <input
                type="file"
                accept=".md,.txt,.json,.yaml,.yml"
                onChange={handleFileUpload}
                className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-1.5 text-xs text-theme-primary focus:outline-none focus:border-teal-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-teal-500/10 file:text-teal-600 hover:file:bg-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-muted mb-1">
                {t.knowledge?.targetClassification || "Target Classification"}
              </label>
              <select
                value={explicitType}
                onChange={(e) => setExplicitType(e.target.value)}
                className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-teal-500"
              >
                <option value="AUTO">{t.knowledge?.autoDetect || "Auto-Detect"}</option>
                <option value="MEMORY">{t.knowledge?.targetMemory || "MEMORY (Stored in MemoryStore)"}</option>
                <option value="RULE">{t.knowledge?.targetRule || "RULE (Stored in RuleRegistry)"}</option>
                <option value="SKILL">{t.knowledge?.targetSkill || "SKILL (Stored in SkillRegistry)"}</option>
                <option value="DOCUMENT">{t.knowledge?.targetDocument || "DOCUMENT (Referenced document)"}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1">
              {t.knowledge?.filenameLabel || "Filename / Identifier"}
            </label>
            <input
              type="text"
              required
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={t.knowledge?.filenamePlaceholder || "e.g. project_standards.md"}
              className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-muted mb-1">
              {t.knowledge?.fileContentLabel || "Content Preview / Text"}
            </label>
            <textarea
              rows={4}
              required
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder={t.knowledge?.fileContentPlaceholder || "Paste or edit document content here..."}
              className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={importing}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1.5 transition shadow-sm"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{importing ? (t.knowledge?.importing || "Importing & Classifying...") : (t.knowledge?.importButton || "Import Knowledge")}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Imported Documents List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-theme-primary">
          {t.knowledge?.documentsTitle || "Persisted Knowledge Documents"} ({documents.length})
        </h2>

        {documents.length === 0 ? (
          <div className="text-center py-12 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t.knowledge?.noDocsFound || "No knowledge documents stored"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.documentId}
                className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between hover:border-theme-muted transition shadow-sm space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-xs text-theme-primary truncate">{doc.filename}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                      {doc.mimeType?.split("/")[1] || "doc"}
                    </span>
                  </div>
                  <p className="text-xs text-theme-secondary line-clamp-3 leading-relaxed">
                    {doc.textSummary || doc.filename}
                  </p>
                </div>

                <div className="pt-2 border-t border-theme-subtle space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-theme-muted">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {(doc.fileHash || "").slice(0, 10)}...
                    </span>
                    <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                  {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.map((t: string) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-theme-sidebar text-theme-muted flex items-center gap-0.5"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-theme-muted">{doc.source || "upload"}</span>
                    <button
                      onClick={() => handleDeleteDocument(doc.documentId)}
                      className="p-1 rounded text-theme-muted hover:text-red-500 transition"
                      title="Delete Document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
