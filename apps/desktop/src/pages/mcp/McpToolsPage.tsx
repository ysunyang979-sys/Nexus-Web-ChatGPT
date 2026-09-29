import React, { useState, useMemo } from "react";
import {
  Wrench,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CANONICAL_TOOL_DEFINITIONS, type UnifiedToolDefinition } from "@localbridge/protocol";

import { useTranslation } from "../../i18n/useTranslation.js";

export const McpToolsPage: React.FC = () => {
  const { language } = useTranslation();
  const isZh = language.startsWith("zh");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedTool, setSelectedTool] = useState<UnifiedToolDefinition | null>(
    CANONICAL_TOOL_DEFINITIONS[0] || null
  );
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const categories = useMemo(() => {
    const set = new Set<string>();
    CANONICAL_TOOL_DEFINITIONS.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return ["ALL", ...Array.from(set).sort()];
  }, []);

  const filteredTools = useMemo(() => {
    const q = search.toLowerCase();
    return CANONICAL_TOOL_DEFINITIONS.filter((t) => {
      if (selectedCategory !== "ALL" && t.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q))
      );
    });
  }, [search, selectedCategory]);

  const totalPages = Math.ceil(filteredTools.length / pageSize) || 1;
  const paginatedTools = useMemo(() => {
    return filteredTools.slice(page * pageSize, (page + 1) * pageSize);
  }, [filteredTools, page]);

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* Search & Filter Header */}
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary flex items-center gap-2">
            <Wrench className="w-4 h-4 text-sky-500" />
            <span>{isZh ? "MCP 工具库" : "MCP Tool Registry"}</span>
          </h1>
          <p className="text-xs text-theme-muted mt-0.5">
            {isZh
              ? "332 个经权威验证的规范执行工具 • 零模糊匹配确定性契约"
              : "332 Verified Canonical Tools • High-Performance Virtualized Table"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(0);
            }}
            className="bg-theme-card text-theme-primary text-xs px-2.5 py-1.5 rounded-lg border border-theme-subtle focus:outline-none focus:border-sky-500 font-mono"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-theme-muted" />
            <input
              type="text"
              placeholder="Search 332 tools..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-8 pr-3 py-1.5 bg-theme-card text-theme-primary border border-theme-subtle rounded-lg text-xs w-64 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Main Dual Pane: Table on Left, Details on Right */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Table Column */}
        <div className="flex-1 flex flex-col border-r border-theme-subtle bg-theme-base/60 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 bg-theme-card border-b border-theme-subtle text-theme-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Tool Name</th>
                  <th className="py-2.5 px-4 font-semibold">Category</th>
                  <th className="py-2.5 px-4 font-semibold">Risk Level</th>
                  <th className="py-2.5 px-4 font-semibold">Scope</th>
                  <th className="py-2.5 px-4 font-semibold">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-subtle/50">
                {paginatedTools.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-theme-muted font-sans">
                      No tools match query.
                    </td>
                  </tr>
                ) : (
                  paginatedTools.map((tool) => {
                    const isSelected = selectedTool?.name === tool.name;
                    return (
                      <tr
                        key={tool.name}
                        onClick={() => setSelectedTool(tool)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? "bg-theme-card-hover text-theme-primary font-medium border-l-2 border-l-sky-500"
                            : "hover:bg-theme-card/40 text-theme-secondary hover:text-theme-primary"
                        }`}
                      >
                        <td className="py-2.5 px-4 font-semibold text-theme-primary truncate max-w-xs">
                          {tool.name}
                        </td>
                        <td className="py-2.5 px-4 text-theme-muted">{tool.category || "general"}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              tool.riskLevel === "safe" || tool.riskLevel === "low"
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : tool.riskLevel === "medium"
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : "bg-red-500/10 text-red-500 border border-red-500/20"
                            }`}
                          >
                            {tool.riskLevel}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-theme-muted">
                          {tool.mcpScope || (tool.riskLevel === "safe" ? "read" : "write")}
                        </td>
                        <td className="py-2.5 px-4 text-emerald-500 text-[11px]">
                          ✓ Deterministic
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="px-4 py-2.5 border-t border-theme-subtle bg-theme-card/30 flex items-center justify-between text-xs text-theme-muted font-mono shrink-0">
            <span>
              Showing {paginatedTools.length} of {filteredTools.length} tools (Total: {CANONICAL_TOOL_DEFINITIONS.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-1 rounded hover:bg-theme-card disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                {page + 1} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="p-1 rounded hover:bg-theme-card disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Details Pane */}
        <div className="w-96 border-l border-theme-subtle bg-theme-card/10 p-5 overflow-y-auto space-y-5">
          {selectedTool ? (
            <div className="space-y-4">
              <div className="text-xs font-mono uppercase tracking-wider text-sky-500 font-semibold">
                Tool Specification
              </div>

              <div>
                <div className="font-mono text-sm font-bold text-theme-primary break-all">
                  {selectedTool.name}
                </div>
                <div className="text-xs text-theme-muted mt-1 leading-relaxed">
                  {selectedTool.description}
                </div>
              </div>

              <div className="space-y-2.5 text-xs pt-2 border-t border-theme-subtle/60">
                <div className="flex justify-between py-1 border-b border-theme-subtle/40">
                  <span className="text-theme-muted">Category</span>
                  <span className="font-mono text-theme-primary">{selectedTool.category || "general"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-theme-subtle/40">
                  <span className="text-theme-muted">Risk Classification</span>
                  <span className="font-mono text-theme-primary">{selectedTool.riskLevel}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-theme-subtle/40">
                  <span className="text-theme-muted">Timeout Constraint</span>
                  <span className="font-mono text-theme-primary">{selectedTool.timeout} ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-theme-subtle/40">
                  <span className="text-theme-muted">Idempotency Supported</span>
                  <span className="font-mono text-theme-primary">
                    {selectedTool.supportsIdempotency ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-theme-muted">Execution Mode</span>
                  <span className="font-mono text-emerald-500">Local Native Worker</span>
                </div>
              </div>

              <div className="pt-2">
                <div className="text-[11px] font-mono text-theme-muted uppercase tracking-wider font-semibold mb-1">
                  Input Parameters Schema
                </div>
                <pre className="p-3 rounded-lg bg-theme-base font-mono text-[11px] text-theme-secondary border border-theme-subtle overflow-x-auto max-h-60">
                  {JSON.stringify(selectedTool.inputSchema, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-xs text-theme-muted text-center py-10">
              Select a tool to view specification.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
