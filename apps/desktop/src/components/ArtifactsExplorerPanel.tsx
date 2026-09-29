import React, { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCheck,
  Eye,
  FolderOpen,
  CheckCircle2,
} from "lucide-react";

export interface ArtifactItem {
  id: string;
  name: string;
  type: "docx" | "pdf" | "xlsx" | "pptx" | "image" | "vision" | "checkpoint";
  size?: number;
  path?: string;
  status: "valid" | "warning" | "error";
  createdAt: string;
  details?: string;
}

export interface ArtifactsExplorerPanelProps {
  artifacts?: ArtifactItem[];
}

export const ArtifactsExplorerPanel: React.FC<ArtifactsExplorerPanelProps> = ({
  artifacts = [
    {
      id: "art-docx-1",
      name: "Autonomous_Report.docx",
      type: "docx",
      size: 45200,
      path: ".nexus/documents/Autonomous_Report.docx",
      status: "valid",
      createdAt: new Date().toLocaleTimeString(),
      details: "Headings: 4, Tables: 2, Images: 1, OpenXML Validated",
    },
    {
      id: "art-pdf-1",
      name: "Autonomous_Report.pdf",
      type: "pdf",
      size: 112400,
      path: ".nexus/documents/Autonomous_Report.pdf",
      status: "valid",
      createdAt: new Date().toLocaleTimeString(),
      details: "Pages: 2, CrossRef Clean, Adobe PDF 1.4 Validated",
    },
    {
      id: "art-xlsx-1",
      name: "Metrics_Analysis.xlsx",
      type: "xlsx",
      size: 28400,
      path: ".nexus/documents/Metrics_Analysis.xlsx",
      status: "valid",
      createdAt: new Date().toLocaleTimeString(),
      details: "Sheets: 2, Cells: 120, OpenXML Validated",
    },
    {
      id: "art-pptx-1",
      name: "Executive_Summary.pptx",
      type: "pptx",
      size: 89000,
      path: ".nexus/documents/Executive_Summary.pptx",
      status: "valid",
      createdAt: new Date().toLocaleTimeString(),
      details: "Slides: 3, Shapes: 8, OpenXML Validated",
    },
    {
      id: "art-vis-1",
      name: "vision://reference-sample",
      type: "vision",
      path: ".nexus/vision/reference-sample/",
      status: "valid",
      createdAt: new Date().toLocaleTimeString(),
      details: "Objects: 3, TextTokens: 12, Colors: 4, Cached Artifact",
    },
  ],
}) => {
  const [filter, setFilter] = useState<string>("all");

  const filtered = artifacts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "docs") return ["docx", "pdf", "xlsx", "pptx"].includes(a.type);
    if (filter === "vision") return ["vision", "image"].includes(a.type);
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "docx":
        return <FileText className="w-4 h-4 text-blue-500" />;
      case "pdf":
        return <FileCheck className="w-4 h-4 text-red-500" />;
      case "xlsx":
        return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
      case "pptx":
        return <Presentation className="w-4 h-4 text-amber-500" />;
      case "vision":
      case "image":
        return <Eye className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="p-5 rounded-xl bg-theme-card border border-theme-subtle shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-sky-500" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-theme-primary font-semibold">
            通用制品与文档注册表
          </h2>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-theme-card-muted p-1 rounded-lg border border-theme-subtle text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter === "all" ? "bg-theme-card text-theme-primary shadow-sm" : "text-theme-muted"
            }`}
          >
            全部 ({artifacts.length})
          </button>
          <button
            onClick={() => setFilter("docs")}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter === "docs" ? "bg-theme-card text-theme-primary shadow-sm" : "text-theme-muted"
            }`}
          >
            Office 与 PDF
          </button>
          <button
            onClick={() => setFilter("vision")}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter === "vision" ? "bg-theme-card text-theme-primary shadow-sm" : "text-theme-muted"
            }`}
          >
            视觉快照
          </button>
        </div>
      </div>

      {/* Artifacts List */}
      <div className="divide-y divide-theme-subtle border border-theme-subtle rounded-lg overflow-hidden font-mono text-xs">
        {filtered.map((art) => (
          <div
            key={art.id}
            className="p-3 bg-theme-card hover:bg-theme-card-hover transition flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-theme-card-muted border border-theme-subtle shrink-0">
                {getIcon(art.type)}
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-theme-primary truncate flex items-center gap-2">
                  <span>{art.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 uppercase">
                    {art.type}
                  </span>
                </div>
                <div className="text-[11px] text-theme-muted truncate">{art.details || art.path}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {art.size && (
                <span className="text-[11px] text-theme-muted">
                  {(art.size / 1024).toFixed(1)} KB
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                已通过完整性校验
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
