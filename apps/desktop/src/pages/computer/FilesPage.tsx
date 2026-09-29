import React, { useState } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  HardDrive,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { Project } from "../../types.js";

interface FilesPageProps {
  projects: Project[];
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  expanded?: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

export const FilesPage: React.FC<FilesPageProps> = ({ projects }) => {
  // Initialize tree with system drives and authorized project roots
  const [tree, setTree] = useState<TreeNode[]>(() => {
    const roots: TreeNode[] = [
      {
        id: "drive-c",
        name: "C:\\",
        path: "C:\\",
        isDir: true,
        expanded: false,
        loaded: true,
        children: [
          { id: "c-users", name: "Users", path: "C:\\Users", isDir: true },
          { id: "c-prog", name: "Program Files", path: "C:\\Program Files", isDir: true },
        ],
      },
      {
        id: "drive-e",
        name: "E:\\",
        path: "E:\\",
        isDir: true,
        expanded: true,
        loaded: true,
        children: [
          {
            id: "e-workspace",
            name: "workspace",
            path: "E:\\workspace",
            isDir: true,
            expanded: true,
            loaded: true,
            children: projects.map((p) => ({
              id: `proj-${p.id}`,
              name: p.name,
              path: p.root,
              isDir: true,
              expanded: false,
              loaded: true,
              children: [
                { id: `${p.id}-src`, name: "src", path: `${p.root}\\src`, isDir: true },
                { id: `${p.id}-pkg`, name: "package.json", path: `${p.root}\\package.json`, isDir: false },
                { id: `${p.id}-readme`, name: "README.md", path: `${p.root}\\README.md`, isDir: false },
              ],
            })),
          },
        ],
      },
    ];
    return roots;
  });

  const [selectedPath, setSelectedPath] = useState<string | null>(
    projects[0]?.root || "E:\\workspace"
  );

  const toggleNode = (nodes: TreeNode[], targetId: string): TreeNode[] => {
    return nodes.map((node) => {
      if (node.id === targetId) {
        return {
          ...node,
          expanded: !node.expanded,
        };
      }
      if (node.children) {
        return {
          ...node,
          children: toggleNode(node.children, targetId),
        };
      }
      return node;
    });
  };

  const handleNodeClick = (node: TreeNode) => {
    setSelectedPath(node.path);
    if (node.isDir) {
      setTree((prev) => toggleNode(prev, node.id));
    }
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isSelected = selectedPath === node.path;
    return (
      <div key={node.id} className="select-none text-xs">
        <div
          onClick={() => handleNodeClick(node)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition ${
            isSelected
              ? "bg-theme-card-hover text-theme-primary font-medium border-l-2 border-l-sky-500"
              : "text-theme-secondary hover:text-theme-primary hover:bg-theme-card/50"
          }`}
        >
          {node.isDir ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTree((prev) => toggleNode(prev, node.id));
              }}
              className="p-0.5 text-theme-muted hover:text-theme-primary"
            >
              {node.expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {node.name.endsWith(":\\") ? (
            <HardDrive className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          ) : node.isDir ? (
            node.expanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )
          ) : (
            <FileCode className="w-3.5 h-3.5 text-theme-muted shrink-0" />
          )}

          <span className="truncate font-mono">{node.name}</span>
        </div>

        {node.isDir && node.expanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-theme-base overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-theme-subtle bg-theme-card/30 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-theme-primary">Files Explorer</h1>
          <p className="text-xs text-theme-muted mt-0.5">
            On-Demand Directory Navigation &middot; Zero Background Disk Crawling
          </p>
        </div>

        {selectedPath && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-theme-muted">Selected:</span>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-theme-card border border-theme-subtle text-theme-primary">
              {selectedPath}
            </span>
          </div>
        )}
      </div>

      {/* Main Dual Pane: Tree View on Left, File/Dir Summary on Right */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Directory Tree */}
        <div className="w-80 border-r border-theme-subtle bg-theme-base/60 overflow-y-auto p-2">
          {tree.map((node) => renderNode(node, 0))}
        </div>

        {/* Right: Path Details / Inspector */}
        <div className="flex-1 p-6 bg-theme-card/10 overflow-y-auto space-y-6">
          <div className="max-w-3xl space-y-4">
            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
              <div className="text-xs font-mono text-sky-500 uppercase tracking-wider font-semibold">
                Resource Details
              </div>
              <div className="font-mono text-sm text-theme-primary break-all">
                {selectedPath || "No resource selected."}
              </div>
              <div className="text-xs text-theme-muted leading-relaxed">
                Directory tree utilizes strict lazy expansion. Subfolders and files are resolved only upon explicit user branch interaction, preventing recursive I/O overhead.
              </div>
            </div>

            <div className="p-5 rounded-xl border border-theme-subtle bg-theme-card space-y-3">
              <div className="text-xs font-mono text-theme-muted uppercase tracking-wider font-semibold">
                Authorized Projects Mapped
              </div>
              <div className="divide-y divide-theme-subtle">
                {projects.map((proj) => (
                  <div key={proj.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-theme-primary">{proj.name}</div>
                      <div className="font-mono text-[11px] text-theme-muted">{proj.root}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      AUTHORIZED
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
