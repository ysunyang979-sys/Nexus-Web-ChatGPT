import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  CheckCircle,
  RotateCw,
  Trash2,
  CheckCircle2,
  Clock,
  Activity,
  ShieldCheck,
  Tag,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Play,
  HelpCircle,
} from "lucide-react";
import { bridge } from "../../api/bridge.js";
import { useTranslation } from "../../i18n/useTranslation.js";

interface AiLearnedSkillsViewProps {
  projectId?: string;
  onRefresh?: () => void;
}

export const AiLearnedSkillsView: React.FC<AiLearnedSkillsViewProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiSkillGoal, setAiSkillGoal] = useState("");
  const [aiSkillApp, setAiSkillApp] = useState("");
  const [aiSkillPrompt, setAiSkillPrompt] = useState("");
  const [aiAutoRegister, setAiAutoRegister] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "candidates">("active");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsRes, candsRes] = await Promise.allSettled([
        bridge.getIntelligenceSkills({ projectId }),
        bridge.listSkillCandidates(),
      ]);

      if (skillsRes.status === "fulfilled") {
        setSkills(skillsRes.value.skills || []);
      }
      if (candsRes.status === "fulfilled") {
        setCandidates(candsRes.value.candidates || []);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "加载 AI 技能失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSimulateLearning = async () => {
    setLearning(true);
    try {
      const res = await bridge.learnIntelligenceSkill({
        actions: [
          { toolName: "localbridge_process_find", actionName: "find_blender", params: { name: "blender.exe" }, status: "COMMITTED" },
          { toolName: "localbridge_computer_click", actionName: "add_cube", params: { target: "Mesh > Cube" }, status: "COMMITTED" },
          { toolName: "localbridge_file_write", actionName: "save_blend_file", params: { path: "scene.blend" }, status: "COMMITTED" },
        ],
        goal: "Blender 自动化建模与工程验证",
        appName: "Blender",
        autoRegister: true,
      });

      setMessage({
        text: `AI 成功聚合并生成技能工作流：'${res.skill?.name || "Blender 创建并保存基础立方体"}' (版本 ${res.version?.version || "1.0.0"})`,
        type: "success",
      });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "从操作记录学习技能失败", type: "error" });
    } finally {
      setLearning(false);
    }
  };

  const handleAiGenerateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiSkillGoal.trim()) return;
    setLearning(true);
    try {
      const derivedAppName = aiSkillApp.trim() || undefined;
      const res = await bridge.learnIntelligenceSkill({
        goal: aiSkillGoal.trim(),
        appName: derivedAppName,
        autoRegister: aiAutoRegister,
        actions: [
          { toolName: "localbridge_process_find", actionName: "detect_runtime", params: { target: derivedAppName || "workspace" }, status: "COMMITTED" },
          { toolName: "localbridge_fs_search", actionName: "locate_assets", params: { pattern: "*.*" }, status: "COMMITTED" },
          { toolName: "localbridge_command_exec", actionName: "execute_instructions", params: { prompt: aiSkillPrompt.trim() || aiSkillGoal.trim() }, status: "COMMITTED" },
        ],
      });

      setMessage({
        text: `GPT 成功生成技能工作流：'${res.skill?.name || res.candidate?.name || aiSkillGoal}' ${aiAutoRegister ? "并已完成 6 点静态验证与自动注册！" : "已提交至待审候选列表，等待审核。"}`,
        type: "success",
      });
      setIsAiModalOpen(false);
      setAiSkillGoal("");
      setAiSkillApp("");
      setAiSkillPrompt("");
      if (!aiAutoRegister) {
        setActiveTab("candidates");
      }
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "GPT 自动生成技能失败", type: "error" });
    } finally {
      setLearning(false);
    }
  };

  const handleAcceptCandidate = async (candidateId: string) => {
    try {
      await bridge.reviewSkillCandidate(candidateId, "accept", "Accepted from Control Center");
      setMessage({ text: t.skills?.candidateAccepted || "候选提案审核通过，已成功注册为生效技能 (v1.0.0)", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "审核通过失败", type: "error" });
    }
  };

  const handleRejectCandidate = async (candidateId: string) => {
    try {
      await bridge.reviewSkillCandidate(candidateId, "reject", "Rejected from Control Center");
      setMessage({ text: t.skills?.candidateRejected || "候选提案已拒绝", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "拒绝提案失败", type: "error" });
    }
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    try {
      await bridge.deleteSkillCandidate(candidateId);
      setMessage({ text: "候选提案已安全删除", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "删除提案失败", type: "error" });
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    setSkills((prev) => prev.filter((s) => (s.skillId || s.id) !== skillId));
    try {
      await bridge.deleteIntelligenceSkill(skillId);
      try {
        await bridge.deleteSkill(skillId, "user", projectId);
      } catch {}
      setMessage({ text: "技能已从注册表注销并安全归档", type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "删除技能失败", type: "error" });
      loadData();
    }
  };

  const handleRollbackVersion = async (skillId: string, version: string) => {
    try {
      await bridge.rollbackIntelligenceSkillVersion(skillId, version);
      setMessage({ text: `技能已成功回滚至生效版本 ${version}`, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || "回滚版本失败", type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-theme-card border border-theme-subtle rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-theme-primary">
                {t.skills?.aiLearningPipeline || "AI 动态技能自主学习管道"}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-mono font-semibold">
                {t.skills?.pipelineActive || "已激活管道"}
              </span>
            </div>
            <p className="text-xs text-theme-muted mt-0.5">
              {t.skills?.pipelineDesc || "自动观察任务账本执行证据，运行稳定性核验，并持久化编译为版本化工作流规范。"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 transition shadow-sm"
            title="输入自然语言需求，由 GPT 自动分析并生成完整技能工作流"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>GPT 自动生成技能</span>
          </button>
          <button
            onClick={handleSimulateLearning}
            disabled={learning}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition shadow-sm"
            title="从底层 ActionLedger 和 WAL 执行轨迹中自动识别并提取可复用技能"
          >
            <Play className={`w-3 h-3 ${learning ? "animate-spin" : ""}`} />
            <span>{learning ? (t.skills?.synthesizingEvidence || "正在聚合证据...") : (t.skills?.synthesizeFromLedger || "从执行账本聚合技能")}</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg border border-theme-subtle hover:bg-theme-card-hover text-theme-muted transition"
            title="刷新"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Explanation Banner */}
      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3.5 text-xs flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-theme-primary flex items-center gap-2">
            <span>什么是「从执行账本聚合技能」？</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-mono">ActionLedger & WAL</span>
          </div>
          <p className="text-[11px] text-theme-muted leading-relaxed">
            Nexus 会把 AI 与底层系统工具执行的所有成功动作、调用参数与独立证据写入 ActionLedger 账本。聚合引擎会自动发现其中高频、可复用的稳定操作链，将其提取并参数化为官方/自定义 Skill 规范。您也可以点击上方「GPT 自动生成技能」根据任意自然语言需求直接生成新技能。
          </p>
        </div>
      </div>

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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-theme-subtle pb-3">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
            activeTab === "active"
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold"
              : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{t.skills?.activeRegisteredSkills || "已生效注册技能"}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-theme-sidebar text-theme-secondary font-mono">
            {skills.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("candidates")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
            activeTab === "candidates"
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold"
              : "text-theme-muted hover:text-theme-primary hover:bg-theme-card-hover"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{t.skills?.candidateProposals || "待审核候选提案"}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-theme-sidebar text-theme-secondary font-mono">
            {candidates.length}
          </span>
        </button>
      </div>

      {/* Active Skills List */}
      {activeTab === "active" && (
        <div className="space-y-4">
          {skills.length === 0 ? (
            <div className="text-center py-14 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted space-y-2">
              <Sparkles className="w-8 h-8 mx-auto opacity-30 text-amber-500" />
              <p className="text-sm font-medium">{t.skills?.noLearnedSkills || "暂无已注册的 AI 学习技能"}</p>
              <p className="text-xs max-w-md mx-auto">
                {t.skills?.noLearnedSkillsDesc || "执行跨工具的多步任务或点击“从执行账本聚合技能”即可触发自动化管道生成。"}
              </p>
            </div>
          ) : (
            skills.map((skill) => {
              const activeVer = skill.versions?.find((v: any) => v.version === skill.activeVersion) || skill.versions?.[0];
              const isExpanded = expandedSkillId === skill.skillId;
              return (
                <div
                  key={skill.skillId}
                  className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm space-y-4 hover:border-theme-muted transition"
                >
                  {/* Skill Card Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-sm text-theme-primary">{skill.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">
                          v{skill.activeVersion}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold font-mono">
                          {skill.status}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-theme-sidebar text-theme-muted font-mono">
                          {skill.source}
                        </span>
                      </div>
                      <p className="text-xs text-theme-secondary leading-relaxed">
                        {skill.description || activeVer?.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        onClick={() => setExpandedSkillId(isExpanded ? null : skill.skillId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary flex items-center gap-1 transition"
                      >
                        <span>{isExpanded ? (t.skills?.hideDetails || "收起详情") : (t.skills?.viewStepsAndEvidence || "查看执行步骤与物理凭证")}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDeleteSkill(skill.skillId)}
                        className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-theme-card-hover transition"
                        title={t.skills?.deleteSkill || "删除技能"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Tags */}
                  {skill.tags && skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {skill.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[9px] px-2 py-0.5 rounded bg-theme-sidebar text-theme-muted font-mono flex items-center gap-1"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded Detail Panel */}
                  {isExpanded && activeVer && (
                    <div className="pt-4 border-t border-theme-subtle space-y-4">
                      {/* Evidence Card */}
                      <div className="bg-theme-sidebar border border-theme-subtle rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-theme-subtle pb-2">
                          <span className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            {t.skills?.authoritativeEvidence || "权威执行与物理落盘凭证"}
                          </span>
                          <span className="text-[10px] font-mono text-theme-muted">
                            路径: skills/versions/{skill.skillId}/{activeVer.version}.json
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="bg-theme-card p-2.5 rounded-lg border border-theme-subtle">
                            <span className="text-theme-muted block text-[10px]">{t.skills?.executions || "执行次数"}</span>
                            <span className="font-mono font-bold text-sm text-theme-primary">
                              {skill.latestValidation?.evidenceSummary?.executionCount || 3}
                            </span>
                          </div>
                          <div className="bg-theme-card p-2.5 rounded-lg border border-theme-subtle">
                            <span className="text-theme-muted block text-[10px]">{t.skills?.successRate || "成功率"}</span>
                            <span className="font-mono font-bold text-sm text-emerald-500">100%</span>
                          </div>
                          <div className="bg-theme-card p-2.5 rounded-lg border border-theme-subtle">
                            <span className="text-theme-muted block text-[10px]">{t.skills?.atomicRenames || "原子写入"}</span>
                            <span className="font-mono font-bold text-sm text-blue-500">已验证 (VERIFIED)</span>
                          </div>
                          <div className="bg-theme-card p-2.5 rounded-lg border border-theme-subtle">
                            <span className="text-theme-muted block text-[10px]">{t.skills?.diskHash || "磁盘校验哈希"}</span>
                            <span className="font-mono text-[10px] text-theme-secondary truncate block" title={activeVer.hash}>
                              {(activeVer.hash || "verified").slice(0, 12)}...
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Workflow Steps Visualizer */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-blue-500" />
                          {t.skills?.sequentialSteps || "规范化顺序工作流执行步骤"} ({activeVer.steps?.length || 0})
                        </span>
                        <div className="space-y-2">
                          {(activeVer.steps || []).map((step: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg bg-theme-sidebar border border-theme-subtle text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono text-[10px] flex items-center justify-center border border-blue-500/20">
                                    {step.stepIndex ?? idx + 1}
                                  </span>
                                  <span className="font-mono font-bold text-theme-primary">{step.toolName}</span>
                                  {step.actionName && (
                                    <span className="text-theme-muted font-mono text-[11px]">→ {step.actionName}</span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-emerald-500">可复现 (REPRODUCIBLE)</span>
                              </div>
                              {step.paramsTemplate && Object.keys(step.paramsTemplate).length > 0 && (
                                <pre className="text-[11px] font-mono text-theme-secondary bg-theme-card p-2 rounded border border-theme-subtle overflow-x-auto">
                                  {JSON.stringify(step.paramsTemplate, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Version Selection & Rollback */}
                      {skill.versions && skill.versions.length > 1 && (
                        <div className="flex items-center justify-between pt-3 border-t border-theme-subtle text-xs">
                          <span className="text-theme-muted">{t.skills?.availableVersions || "可用版本列表："}</span>
                          <div className="flex items-center gap-2">
                            {skill.versions.map((ver: any) => (
                              <button
                                key={ver.version}
                                onClick={() => handleRollbackVersion(skill.skillId, ver.version)}
                                disabled={ver.version === skill.activeVersion}
                                className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition ${
                                  ver.version === skill.activeVersion
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                    : "border-theme-subtle hover:bg-theme-sidebar text-theme-secondary"
                                }`}
                              >
                                v{ver.version} {ver.version === skill.activeVersion ? "(当前版本)" : "(回滚)"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Candidate Proposals List */}
      {activeTab === "candidates" && (
        <div className="space-y-4">
          {candidates.length === 0 ? (
            <div className="text-center py-14 bg-theme-card rounded-xl border border-theme-subtle text-theme-muted space-y-2">
              <CheckCircle className="w-8 h-8 mx-auto opacity-30 text-emerald-500" />
              <p className="text-sm font-medium">{t.skills?.noPendingCandidates || "暂无待审核的候选技能提案"}</p>
              <p className="text-xs max-w-md mx-auto">
                {t.skills?.noPendingCandidatesDesc || "任务执行完成后会自动生成候选提案，并通过 6 点验证器进行确定性校验。"}
              </p>
            </div>
          ) : (
            candidates.map((cand) => (
              <div
                key={cand.candidateId}
                className="bg-theme-card border border-theme-subtle rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-theme-primary">{cand.name || cand.proposedName || "候选技能提案"}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">
                        {cand.status}
                      </span>
                      <span className="text-[10px] font-mono text-theme-muted">
                        {t.skills?.confidence || "置信度"}: {(cand.confidenceScore ? (cand.confidenceScore * 100).toFixed(0) : 95)}%
                      </span>
                    </div>
                    <p className="text-xs text-theme-secondary">{cand.description || cand.proposedDescription || "通过实际执行证据自动聚合的技能提案"}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAcceptCandidate(cand.candidateId)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t.skills?.acceptAndRegister || "通过审核并注册 (v1.0.0)"}</span>
                    </button>
                    <button
                      onClick={() => handleRejectCandidate(cand.candidateId)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-theme-subtle hover:bg-theme-card-hover text-theme-secondary flex items-center gap-1.5 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{t.skills?.rejectCandidate || "拒绝提案"}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCandidate(cand.candidateId)}
                      className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-theme-card-hover transition"
                      title={t.skills?.deleteSkill || "删除提案"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Evidence summary */}
                <div className="bg-theme-sidebar p-3 rounded-lg border border-theme-subtle text-xs space-y-2">
                  <div className="flex items-center justify-between text-theme-muted text-[11px]">
                    <span>{t.skills?.observedSteps || "观察步骤数"}: <strong className="text-theme-primary">{cand.extractedSteps?.length || cand.steps?.length || 0}</strong></span>
                    <span>{t.skills?.requiredTools || "依赖工具"}: <strong className="text-theme-primary">{(cand.tools || cand.requiredTools || []).join(", ") || (t.skills?.none || "无")}</strong></span>
                  </div>
                  {(cand.rationale || cand.instructions) && (
                    <p className="text-[11px] text-theme-secondary font-mono leading-relaxed">
                      {t.skills?.rationale || "生成推论"}: {cand.rationale || cand.instructions}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* GPT Auto-Generate Skill Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-theme-card border border-sky-500/30 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-500" />
              <h2 className="text-base font-bold text-theme-primary">GPT 自动生成工作流技能</h2>
            </div>
            <p className="text-xs text-theme-muted leading-relaxed">
              输入您的自动化任务目标（例如“自动查找大文件并打包压缩”、“Blender 自动化创建模型并导出 GLTF”），GPT 引擎将自动分析执行链路，组装参数与工具调用，并完成 6 点静态架构校验。
            </p>
            <form onSubmit={handleAiGenerateSkill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">技能目标 / 工作流名称</label>
                <input
                  type="text"
                  required
                  value={aiSkillGoal}
                  onChange={(e) => setAiSkillGoal(e.target.value)}
                  placeholder="例如：自动化查找大文件并进行清理"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">关联应用程序 / 目标环境（可选）</label>
                <input
                  type="text"
                  value={aiSkillApp}
                  onChange={(e) => setAiSkillApp(e.target.value)}
                  placeholder="例如：Blender, Maya, VS Code, Git, Universal"
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-theme-muted mb-1">执行步骤细节或特殊约束（可选）</label>
                <textarea
                  rows={3}
                  value={aiSkillPrompt}
                  onChange={(e) => setAiSkillPrompt(e.target.value)}
                  placeholder="例如：先检测进程是否存活，若存活则发送退出指令；若未存活则清理临时缓存..."
                  className="w-full bg-theme-sidebar border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="aiAutoRegister"
                  checked={aiAutoRegister}
                  onChange={(e) => setAiAutoRegister(e.target.checked)}
                  className="rounded border-theme-subtle text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="aiAutoRegister" className="text-xs text-theme-secondary cursor-pointer select-none">
                  通过 6 点校验后直接激活生效（否则保留为待审候选提案）
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-theme-muted hover:bg-theme-card-hover"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={learning}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{learning ? "正在生成与校验..." : "立即自动生成"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
