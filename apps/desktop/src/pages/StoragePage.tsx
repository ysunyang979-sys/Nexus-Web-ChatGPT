import React, { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Folder,
  FolderOpen,
  RefreshCw,
  CheckCircle,
  Database,
  ArrowRight,
  ShieldCheck,
  Archive,
  DownloadCloud,
  FileCheck,
  Copy,
  Layers,
  Sparkles,
  Brain,
  BookOpen,
  Shield,
  Clock,
} from "lucide-react";
import { bridge } from "../api/bridge.js";
import { useTranslation } from "../i18n/useTranslation.js";

export const StoragePage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [newRootDir, setNewRootDir] = useState("");
  const [migrateTargetDir, setMigrateTargetDir] = useState("");
  const [restoreArchivePath, setRestoreArchivePath] = useState("");
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanning, setScanning] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bridge.getIntelligenceStorageStats();
      setStats(res);
      if (res?.rootDir && !newRootDir) {
        setNewRootDir(res.rootDir);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "加载存储指标失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [newRootDir]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleOpenFolder = async () => {
    try {
      await bridge.openIntelligenceStorageFolder();
      setMessage({ text: "已在文件资源管理器中打开存储根目录", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "打开目录失败", type: "error" });
    }
  };

  const handleCopyPath = () => {
    if (!stats?.rootDir) return;
    navigator.clipboard.writeText(stats.rootDir);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRootDir.trim()) return;
    try {
      const res = await bridge.updateIntelligenceStorageConfig(newRootDir.trim());
      setStats(res.stats || res);
      setMessage({
        text: `存储根目录已成功更新为：${newRootDir.trim()}`,
        type: "success",
      });
      loadStats();
    } catch (err: any) {
      setMessage({ text: err.message || "更新存储根目录失败", type: "error" });
    }
  };

  const handleScanStorage = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await bridge.scanIntelligenceStorage();
      setScanResult(res);
      setMessage({
        text: `完整性扫描完毕：已验证 ${res.validItems} 项有效实体，检测到 ${res.corruptedFiles.length} 项异常`,
        type: res.corruptedFiles.length > 0 ? "error" : "success",
      });
    } catch (err: any) {
      setMessage({ text: err.message || "存储完整性校验失败", type: "error" });
    } finally {
      setScanning(false);
    }
  };

  const handleMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migrateTargetDir.trim()) return;
    setMigrating(true);
    try {
      const res = await bridge.migrateIntelligenceStorage(migrateTargetDir.trim());
      setMessage({
        text: `数据平滑迁移成功：已迁移 ${res.migratedFiles} 个文件至 ${res.targetDir}`,
        type: "success",
      });
      setMigrateTargetDir("");
      loadStats();
    } catch (err: any) {
      setMessage({ text: err.message || "迁移失败", type: "error" });
    } finally {
      setMigrating(false);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await bridge.backupIntelligenceStorage();
      setMessage({
        text: `备份归档已创建 (${(res.sizeBytes / 1024).toFixed(1)} KB)：${res.archiveFile}`,
        type: "success",
      });
    } catch (err: any) {
      setMessage({ text: err.message || "备份失败", type: "error" });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreArchivePath.trim()) return;
    setRestoring(true);
    try {
      const res = await bridge.restoreIntelligenceStorage(restoreArchivePath.trim());
      setMessage({
        text: `已成功从备份包恢复 ${res.restoredFiles} 个文件`,
        type: "success",
      });
      setRestoreArchivePath("");
      loadStats();
    } catch (err: any) {
      setMessage({ text: err.message || "恢复失败", type: "error" });
    } finally {
      setRestoring(false);
    }
  };

  const domainItems = [
    {
      title: t.storage?.memoryStoreTitle || "记忆数据库",
      count: stats?.domainCounts?.memory || 0,
      path: "memory/YYYY/MM/*.jsonl",
      desc: t.storage?.memoryStoreDesc || "时间分片事实、用户偏好与观察记录，配有本地领域 SQLite 索引。",
      icon: Brain,
      color: "text-sky-500",
      bg: "bg-sky-500/10",
      border: "border-sky-500/20",
    },
    {
      title: t.storage?.knowledgeDocsTitle || "知识文档库",
      count: stats?.domainCounts?.knowledge || 0,
      path: "knowledge/documents/YYYY/MM/*.jsonl",
      desc: t.storage?.knowledgeDocsDesc || "原始文档、文本摘要与 SHA-256 哈希去重附件。",
      icon: BookOpen,
      color: "text-teal-500",
      bg: "bg-teal-500/10",
      border: "border-teal-500/20",
    },
    {
      title: t.storage?.skillsWorkflowsTitle || "技能与工作流",
      count: stats?.domainCounts?.skills || 0,
      path: "skills/versions/{skillId}/*.json",
      desc: t.storage?.skillsWorkflowsDesc || "版本隔离不可变 JSON 定义，包含哈希校验与原子重命名保护。",
      icon: Sparkles,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: t.storage?.contextSnapshotsTitle || "上下文快照",
      count: stats?.domainCounts?.context || 0,
      path: "context/snapshots/YYYY/MM/*.jsonl",
      desc: t.storage?.contextSnapshotsDesc || "确定性 Token 预算、任务会话与紧凑轨迹状态。",
      icon: Layers,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
    },
    {
      title: t.storage?.globalRulesTitle || "全局规则库",
      count: stats?.domainCounts?.rules || 0,
      path: "system/rules.jsonl",
      desc: t.storage?.globalRulesDesc || "确定性安全规则、系统规范与边界执行规则。",
      icon: Shield,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      title: t.storage?.actionCandidatesTitle || "候选提案库",
      count: stats?.domainCounts?.candidates || 0,
      path: "memory/candidates/ & skills/candidates/",
      desc: t.storage?.actionCandidatesDesc || "AI 学习工作流与记忆候选提案，等待用户人工审核确认。",
      icon: Clock,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-subtle pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 shadow-sm">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">{t.storage?.title || "本地智能存储"}</h1>
            <p className="text-xs text-theme-muted">
              {t.storage?.headerDesc || "统一单一权威事实源 • 时间分片分片存储 • WAL 容灾持久化 • 原子临时文件重命名"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            disabled={loading}
            className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted transition"
            title={t.storage?.refresh || "刷新存储指标"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenFolder}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{t.storage?.openFolder || "打开存储目录"}</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between shadow-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-theme-muted hover:text-theme-primary font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Primary Storage Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Path Card */}
        <div className="md:col-span-2 bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-theme-muted flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-blue-500" />
              {t.storage?.rootDir || "根目录"}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {stats?.status === "HEALTHY" ? (t.storage?.statusHealthy || "正常运行") : (stats?.status || "HEALTHY")}
            </span>
          </div>

          <div className="bg-theme-sidebar border border-theme-subtle rounded-lg p-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-theme-primary truncate" title={stats?.rootDir}>
              {stats?.rootDir || "正在检测根目录..."}
            </span>
            <button
              onClick={handleCopyPath}
              className="p-1 text-theme-muted hover:text-theme-primary transition flex-shrink-0"
              title="复制路径"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="text-[11px] text-theme-muted flex items-center justify-between">
            <span>{t.storage?.lastSync || "上次同步"}: {stats?.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleTimeString() : "实时"}</span>
            <span className="text-theme-secondary font-medium">{t.storage?.authoritativeRoot || "单一权威事实源根目录"}</span>
          </div>
        </div>

        {/* Disk Usage Card */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm space-y-2">
          <span className="text-xs font-semibold text-theme-muted flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            {t.storage?.storageFootprint || "物理磁盘占用"}
          </span>
          <div>
            <div className="text-2xl font-bold text-theme-primary tracking-tight font-mono">
              {stats?.sizeFormatted || "0 B"}
            </div>
            <p className="text-[11px] text-theme-muted mt-0.5">{t.storage?.physicalSize || "磁盘真实占用大小"}</p>
          </div>
          <div className="text-[10px] text-theme-muted pt-2 border-t border-theme-subtle">
            {t.storage?.atomicProtection || "原子临时重命名写入保护"}
          </div>
        </div>

        {/* Items Count Card */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between shadow-sm space-y-2">
          <span className="text-xs font-semibold text-theme-muted flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-teal-500" />
            {t.storage?.indexedEntities || "已索引数据实体"}
          </span>
          <div>
            <div className="text-2xl font-bold text-theme-primary tracking-tight font-mono">
              {stats?.totalItems?.toLocaleString() || "0"}
            </div>
            <p className="text-[11px] text-theme-muted mt-0.5">{t.storage?.synchronizedItems || "各领域同步数据项总计"}</p>
          </div>
          <div className="text-[10px] text-theme-muted pt-2 border-t border-theme-subtle">
            {t.storage?.walProtected || "WAL 预写日志防灾保护"}
          </div>
        </div>
      </div>

      {/* Domain Breakdown Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-theme-primary flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-500" />
          {t.storage?.domainArchitecture || "标准领域目录架构"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domainItems.map((dom) => {
            const Icon = dom.icon;
            return (
              <div
                key={dom.title}
                className="bg-theme-card border border-theme-subtle rounded-xl p-4 flex flex-col justify-between hover:border-theme-muted transition shadow-sm space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${dom.bg} ${dom.color} border ${dom.border}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-theme-primary">{dom.title}</span>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-theme-sidebar text-theme-primary border border-theme-subtle">
                      {dom.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-secondary leading-relaxed">{dom.desc}</p>
                </div>

                <div className="pt-2 border-t border-theme-subtle">
                  <span className="text-[10px] font-mono text-theme-muted block truncate" title={dom.path}>
                    {dom.path}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Storage Operations & Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Switch Root Directory */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-theme-subtle pb-3">
            <Folder className="w-4 h-4 text-blue-500" />
            <h3 className="text-xs font-bold text-theme-primary">{t.storage?.customRootTitle || "选择自定义存储根目录"}</h3>
          </div>
          <p className="text-xs text-theme-muted leading-relaxed">
            {t.storage?.customRootDesc || "为 Nexus 智能层指定自定义持久化目录（例如 E:\\NexusData）。路径持久化存储在系统设置中，并在服务重启后自动生效。"}
          </p>
          <form onSubmit={handleUpdateConfig} className="space-y-3">
            <input
              type="text"
              value={newRootDir}
              onChange={(e) => setNewRootDir(e.target.value)}
              placeholder="例如 E:\NexusData 或 D:\AI\NexusData"
              className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary font-mono placeholder:text-theme-muted focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !newRootDir.trim() || newRootDir.trim() === stats?.rootDir}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition"
              >
                <span>{t.storage?.saveRootBtn || "保存并初始化根目录"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Verification & Integrity Scan */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold text-theme-primary">{t.storage?.integrityTitle || "完整性扫描与数据一致性检查"}</h3>
            </div>
            <button
              onClick={handleScanStorage}
              disabled={scanning}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
              <span>{scanning ? (t.storage?.scanningBtn || "正在扫描...") : (t.storage?.runScanBtn || "运行完整扫描")}</span>
            </button>
          </div>
          <p className="text-xs text-theme-muted leading-relaxed">
            {t.storage?.integrityDesc || "针对本地领域 SQLite 索引数据库校验所有 JSON 和 JSONL 记录，检验 JSON 语法一致性并检测归档墓碑。"}
          </p>

          {scanResult ? (
            <div className="bg-theme-sidebar border border-theme-subtle rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-theme-muted">{t.storage?.validItems || "已验证有效项："}</span>
                <span className="font-mono font-bold text-emerald-500">{scanResult.validItems}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-muted">{t.storage?.tombstones || "归档墓碑记录："}</span>
                <span className="font-mono text-theme-secondary">{scanResult.tombstones}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-theme-muted">{t.storage?.anomalies || "检测到异常项："}</span>
                <span className={`font-mono font-bold ${scanResult.corruptedFiles?.length > 0 ? "text-red-500" : "text-emerald-500"}`}>
                  {scanResult.corruptedFiles?.length || 0}
                </span>
              </div>
              {scanResult.corruptedFiles?.length > 0 && (
                <div className="pt-2 border-t border-theme-subtle text-[11px] text-red-400 font-mono">
                  {scanResult.corruptedFiles.join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-theme-sidebar/50 border border-theme-subtle text-center text-xs text-theme-muted">
              {t.storage?.scanPlaceholder || "点击“运行完整扫描”以核验物理文件完整性及 SQLite 索引。"}
            </div>
          )}
        </div>

        {/* Live Storage Migration */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-theme-subtle pb-3">
            <ArrowRight className="w-4 h-4 text-purple-500" />
            <h3 className="text-xs font-bold text-theme-primary">{t.storage?.migrateTitle || "迁移数据至新目录"}</h3>
          </div>
          <p className="text-xs text-theme-muted leading-relaxed">
            {t.storage?.migrateDesc || "将所有记忆、技能、知识文档、上下文快照及领域索引从当前存储平滑迁移至新目录，无缝无数据丢失。"}
          </p>
          <form onSubmit={handleMigrate} className="space-y-3">
            <input
              type="text"
              value={migrateTargetDir}
              onChange={(e) => setMigrateTargetDir(e.target.value)}
              placeholder="例如 F:\NexusIntelligenceData"
              className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary font-mono placeholder:text-theme-muted focus:outline-none focus:border-purple-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={migrating || !migrateTargetDir.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition"
              >
                <span>{migrating ? (t.storage?.migratingBtn || "正在迁移数据...") : (t.storage?.migrateBtn || "执行数据迁移")}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Backup & Disaster Recovery */}
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-theme-subtle pb-3">
            <Archive className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold text-theme-primary">{t.storage?.backupTitle || "备份与灾难恢复"}</h3>
          </div>
          <p className="text-xs text-theme-muted leading-relaxed">
            {t.storage?.backupDesc || "创建合并快照备份包，或将已有备份包恢复至权威存储引擎中。"}
          </p>
          <div className="space-y-3">
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="w-full py-2 px-3 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-primary flex items-center justify-center gap-2 transition"
            >
              <DownloadCloud className="w-3.5 h-3.5 text-amber-500" />
              <span>{backingUp ? (t.storage?.creatingBackupBtn || "正在创建快照...") : (t.storage?.backupBtn || "创建全量存储备份")}</span>
            </button>

            <form onSubmit={handleRestore} className="space-y-2 pt-2 border-t border-theme-subtle">
              <span className="text-[11px] font-medium text-theme-muted">{t.storage?.restoreFromArchive || "从归档备份包恢复："}</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={restoreArchivePath}
                  onChange={(e) => setRestoreArchivePath(e.target.value)}
                  placeholder="备份包路径，如 backup.json"
                  className="flex-1 bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-1.5 text-xs text-theme-primary font-mono placeholder:text-theme-muted focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={restoring || !restoreArchivePath.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition"
                >
                  <span>{restoring ? (t.storage?.restoringBtn || "正在恢复...") : (t.storage?.restoreBtn || "恢复数据")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
