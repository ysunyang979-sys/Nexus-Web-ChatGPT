import crypto from "node:crypto";
import {
  PROTOCOL_VERSION,
  RunnerRpcMethods,
  LocalBridgeError,
  LocalBridgeErrorCode,
  type RunnerCapabilities,
  type RunnerSystemInfo,
  type RunnerHelloResponse,
  type RunnerHelloRequestParams,
  type SecurityMode,
  isUnrestrictedMode,
} from "@localbridge/protocol";
import { createLogger, type Logger } from "@localbridge/shared";
import type { RunnerDaemonConfig } from "./config/schema.js";
import { getOrCreateRunnerId } from "./system/runner-id.js";
import { collectSystemInfo } from "./system/info.js";
import { detectCapabilities } from "./system/capabilities.js";
import { ReconnectController } from "./client/reconnect.js";
import { HeartbeatMonitor } from "./client/heartbeat.js";
import { RunnerWsClient } from "./client/websocket.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RpcRouter } from "./rpc/router.js";
import { createSystemPingHandler } from "./rpc/handlers/system-ping.js";
import { createSystemInfoHandler } from "./rpc/handlers/system-info.js";
import { createProjectListHandler } from "./rpc/handlers/project-list.js";
import { createProjectInfoHandler } from "./rpc/handlers/project-info.js";
import { createProjectValidateHandler } from "./rpc/handlers/project-validate.js";
import { createDirectoryListHandler } from "./rpc/handlers/directory-list.js";
import { createFileStatHandler } from "./rpc/handlers/file-stat.js";
import { createFileReadHandler } from "./rpc/handlers/file-read.js";
import { createFileCreateHandler } from "./rpc/handlers/file-create.js";
import { createFileWriteHandler } from "./rpc/handlers/file-write.js";
import { createFilePatchHandler } from "./rpc/handlers/file-patch.js";
import { createFileDeleteHandler } from "./rpc/handlers/file-delete.js";
import { createFileRestoreHandler } from "./rpc/handlers/file-restore.js";
import { createGitInfoHandler } from "./rpc/handlers/git-info.js";
import { createGitStatusHandler } from "./rpc/handlers/git-status.js";
import { createGitDiffHandler } from "./rpc/handlers/git-diff.js";
import { createGitLogHandler } from "./rpc/handlers/git-log.js";
import { createGitStageHandler } from "./rpc/handlers/git-stage.js";
import { createGitUnstageHandler } from "./rpc/handlers/git-unstage.js";
import { createGitBranchCreateHandler } from "./rpc/handlers/git-branch-create.js";
import { createGitBranchSwitchHandler } from "./rpc/handlers/git-branch-switch.js";
import { createGitCommitHandler } from "./rpc/handlers/git-commit.js";
import { createCommandClassifyHandler } from "./rpc/handlers/command-classify.js";
import { createCommandRunHandler } from "./rpc/handlers/command-run.js";
import { createJobStartHandler } from "./rpc/handlers/job-start.js";
import { createJobStatusHandler } from "./rpc/handlers/job-status.js";
import { createJobLogsHandler } from "./rpc/handlers/job-logs.js";
import { createJobCancelHandler } from "./rpc/handlers/job-cancel.js";
import { createJobCancelAllHandler } from "./rpc/handlers/job-cancel-all.js";
import { createJobListHandler } from "./rpc/handlers/job-list.js";
import { createBuildStartHandler } from "./rpc/handlers/build-start.js";
import { createTestStartHandler } from "./rpc/handlers/test-start.js";
import { createProjectAuthorizeHandler } from "./rpc/handlers/project-authorize.js";
import { createProjectSetAccessHandler } from "./rpc/handlers/project-set-access.js";
import { createProjectSetExecutionHandler } from "./rpc/handlers/project-set-execution.js";
import { createProjectRemoveHandler } from "./rpc/handlers/project-remove.js";
import { createProjectEnableHandler } from "./rpc/handlers/project-enable.js";
import { createProjectDisableHandler } from "./rpc/handlers/project-disable.js";
import { createApprovalCreateHandler } from "./rpc/handlers/approval-create.js";
import { createApprovalResolveHandler } from "./rpc/handlers/approval-resolve.js";
import { createApprovalListHandler } from "./rpc/handlers/approval-list.js";
import { createApprovalGetHandler } from "./rpc/handlers/approval-get.js";
import { createApprovalBulkResolveHandler } from "./rpc/handlers/approval-bulk-resolve.js";
import { createApprovalSetModeHandler } from "./rpc/handlers/approval-set-mode.js";
import { createProjectSetTrustPolicyHandler } from "./rpc/handlers/project-set-trust-policy.js";
import { createProjectSessionTrustHandler } from "./rpc/handlers/project-session-trust.js";
import { ApprovalManager } from "./approvals/index.js";
import { ProjectRegistry } from "./projects/index.js";
import { FilesystemService } from "./filesystem/index.js";
import { BackupService } from "./backup/index.js";
import { GitService } from "./git/index.js";
import {
  CommandExecutionService,
  ExecutableRegistry,
  ProcessRunner,
  ProjectDetectionService,
} from "./process/index.js";
import { createEnvironmentDetectHandler } from "./rpc/handlers/environment-detect.js";
import { createProjectDetectHandler } from "./rpc/handlers/project-detect.js";
import { JobManager } from "./jobs/index.js";
import { LspManager } from "./lsp/index.js";
import { createCodeDocumentSymbolsHandler } from "./rpc/handlers/code-document-symbols.js";
import { createCodeWorkspaceSymbolsHandler } from "./rpc/handlers/code-workspace-symbols.js";
import { createCodeDefinitionHandler } from "./rpc/handlers/code-definition.js";
import { createCodeReferencesHandler } from "./rpc/handlers/code-references.js";
import { createCodeHoverHandler } from "./rpc/handlers/code-hover.js";
import { createCodeDiagnosticsHandler } from "./rpc/handlers/code-diagnostics.js";
import { createCodeCallHierarchyHandler } from "./rpc/handlers/code-call-hierarchy.js";
import { createCodeImpactHandler } from "./rpc/handlers/code-impact.js";
import { createLspStatusHandler } from "./rpc/handlers/lsp-status.js";
import { createLspRestartHandler } from "./rpc/handlers/lsp-restart.js";
import { createLspStopHandler } from "./rpc/handlers/lsp-stop.js";
import { ManagedWorktreeService, WorkspaceResolver } from "./worktree/index.js";
import { createWorktreeCreateHandler } from "./rpc/handlers/worktree-create.js";
import { createWorktreeListHandler } from "./rpc/handlers/worktree-list.js";
import { createWorktreeStatusHandler } from "./rpc/handlers/worktree-status.js";
import { createWorktreeDiffHandler } from "./rpc/handlers/worktree-diff.js";
import { createWorktreeRemoveHandler } from "./rpc/handlers/worktree-remove.js";
import { PersistentRuntimeManager } from "./runtime/index.js";
import { createRuntimeStartHandler } from "./rpc/handlers/runtime-start.js";
import { createRuntimeListHandler } from "./rpc/handlers/runtime-list.js";
import { createRuntimeStatusHandler } from "./rpc/handlers/runtime-status.js";
import { createRuntimeLogsHandler } from "./rpc/handlers/runtime-logs.js";
import { createRuntimeRestartHandler } from "./rpc/handlers/runtime-restart.js";
import { createRuntimeStopHandler } from "./rpc/handlers/runtime-stop.js";
import {
  createFsDeleteHandler,
  createFsMoveHandler,
  createFsCopyHandler,
  createFsMkdirHandler,
} from "./rpc/handlers/fs-universal.js";
import { ProcessOwnershipTracker } from "./process/ownership-tracker.js";
import { TerminalManager } from "./terminal/terminal-manager.js";
import { AgentTaskManager } from "./agent-task/agent-task-manager.js";
import { ActionLedger } from "./agent-task/action-ledger.js";
import { createTerminalStartHandler } from "./rpc/handlers/terminal-start.js";
import { createTerminalWriteHandler } from "./rpc/handlers/terminal-write.js";
import { createTerminalReadHandler } from "./rpc/handlers/terminal-read.js";
import { createTerminalResizeHandler } from "./rpc/handlers/terminal-resize.js";
import { createTerminalStatusHandler } from "./rpc/handlers/terminal-status.js";
import { createTerminalStopHandler } from "./rpc/handlers/terminal-stop.js";
import { createTerminalListHandler } from "./rpc/handlers/terminal-list.js";
import { createProcessListHandler } from "./rpc/handlers/process-list.js";
import { createProcessStatusHandler } from "./rpc/handlers/process-status.js";
import { createProcessKillHandler } from "./rpc/handlers/process-kill.js";
import { createProcessTreeHandler } from "./rpc/handlers/process-tree.js";
import { createPortListHandler } from "./rpc/handlers/port-list.js";
import { createPortKillHandler } from "./rpc/handlers/port-kill.js";
import { createAgentTaskCreateHandler } from "./rpc/handlers/agent-task-create.js";
import { createAgentTaskStatusHandler } from "./rpc/handlers/agent-task-status.js";
import { createAgentTaskLogsHandler } from "./rpc/handlers/agent-task-logs.js";
import { createAgentTaskCancelHandler } from "./rpc/handlers/agent-task-cancel.js";
import { createAgentTaskPauseHandler } from "./rpc/handlers/agent-task-pause.js";
import { createAgentTaskResumeHandler } from "./rpc/handlers/agent-task-resume.js";
import { createAgentTaskListHandler } from "./rpc/handlers/agent-task-list.js";
import { createAgentTaskApproveHandler } from "./rpc/handlers/agent-task-approve.js";
import { createSafetyLayerSetStatusHandler } from "./rpc/handlers/safety-layer-set-status.js";
import { createSafetyLayerGetStatusHandler } from "./rpc/handlers/safety-layer-get-status.js";
import { ArtifactService } from "./artifacts/artifact-service.js";
import { WorkspaceCheckpointService } from "./checkpoints/checkpoint-service.js";
import { WorkspaceHygieneService } from "./hygiene/hygiene-service.js";
import { WindowsComputerUseService } from "./computer-use/computer-use-service.js";
import { CodePatchService } from "./code-patch/patch-service.js";
import { AgentMemoryService } from "./memory/memory-service.js";
import { UnifiedValidationService } from "./validation/validation-service.js";
import {
  createAgentTaskAssignHandler,
  createAgentTaskAttemptHandler,
  createAgentTaskCodingRunHandler,
  createAgentTaskHeartbeatHandler,
  createAgentTaskReconcileHandler,
  createAgentTaskCompleteHandler,
  createAgentTaskHandoffHandler,
  createAgentTaskCheckpointCreateHandler,
  createAgentTaskCheckpointRestoreHandler,
  createAgentTaskCheckpointListHandler,
  createAgentTaskDisconnectHandler,
  createAgentTaskTakeoverHandler,
} from "./rpc/handlers/agent-task-extended.js";
import {
  createArtifactCreateHandler,
  createArtifactWriteChunkHandler,
  createArtifactReadChunkHandler,
  createArtifactGetHandler,
  createArtifactListHandler,
  createArtifactImportHandler,
  createArtifactExportHandler,
  createArtifactDeleteHandler,
  createArtifactAbortHandler,
} from "./rpc/handlers/artifact.js";
import {
  createCheckpointCreateHandler,
  createCheckpointListHandler,
  createCheckpointGetHandler,
  createCheckpointRestoreHandler,
  createCheckpointDeleteHandler,
} from "./rpc/handlers/checkpoint.js";
import {
  createHygieneCheckHandler,
  createHygieneCleanHandler,
  createHygieneResetFileHandler,
  createHygieneCleanUntrackedHandler,
  createHygieneKillZombiesHandler,
} from "./rpc/handlers/hygiene.js";
import {
  createComputerClipboardReadHandler,
  createComputerClipboardWriteHandler,
  createComputerMouseMoveHandler,
  createComputerMouseClickHandler,
  createComputerMouseScrollHandler,
  createComputerKeyboardInputHandler,
  createComputerKeyboardKeyHandler,
  createComputerWindowListHandler,
  createComputerWindowActivateHandler,
  createComputerDisplayListHandler,
  createComputerAppListHandler,
  createComputerAppLaunchHandler,
  createComputerAccessibilityTreeHandler,
  createComputerUIElementActionHandler,
  createComputerScreenSnapshotHandler,
  createComputerStatusHandler,
  createComputerMouseDragHandler,
  createComputerWindowCloseHandler,
  createComputerWaitHandler,
  createComputerObserveHandler,
  createComputerKeyboardHotkeyHandler,
  createComputerTakeControlHandler,
  createComputerReturnControlHandler,
  createComputerTakeoverStatusHandler,
  createComputerLocateUIHandler,
  createComputerTaskAcceptanceHandler,
  createComputerLoopCheckHandler,
  createComputerStateGetHandler,
  createComputerRealtimeStreamHandler,
} from "./rpc/handlers/computer-use.js";
import {
  createFsSearchHandler,
  createFsGrepHandler,
  createFileReadStreamHandler,
  createFsBatchHandler,
} from "./rpc/handlers/fs-advanced.js";
import {
  createCodePatchPreviewHandler,
  createCodePatchApplyHandler,
  createCodePatchRollbackHandler,
} from "./rpc/handlers/code-patch.js";
import {
  createMemorySetHandler,
  createMemoryGetHandler,
  createMemorySearchHandler,
  createMemoryDeleteHandler,
  createMemoryPurgeHandler,
} from "./rpc/handlers/memory.js";
import {
  createValidationRunHandler,
} from "./rpc/handlers/validation.js";
import { BrowserAutomationService } from "./browser/browser-service.js";
import { AgentPlanService } from "./agent-plan/plan-service.js";
import { LocalBridgeEventBus } from "./events/event-bus-service.js";
import { LocalBridgeObservabilityService } from "./trace/trace-service.js";
import { createBrowserHandlers } from "./rpc/handlers/browser.js";
import { createAgentPlanHandlers } from "./rpc/handlers/agent-plan.js";
import { createEventHandlers } from "./rpc/handlers/events.js";
import { createTraceHandlers } from "./rpc/handlers/trace.js";
import { VisionService } from "./vision/vision-service.js";
import { DocumentService } from "./documents/document-service.js";
import { ToolRegistryService } from "./tools/tool-registry.js";
import {
  createVisionAnalyzeHandler,
  createVisionDescribeHandler,
  createVisionOcrHandler,
  createVisionDetectObjectsHandler,
  createVisionDetectRegionsHandler,
  createVisionDetectPartsHandler,
  createVisionGeometryHandler,
  createVisionColorHandler,
  createVisionMaterialHandler,
  createVisionSpatialHandler,
  createVisionCompareHandler,
  createVisionExtractTextHandler,
  createVisionCacheHandler,
  createVisionGetHandler,
  createVisionDeleteHandler,
} from "./rpc/handlers/vision.js";
import {
  createDocumentCreateHandler,
  createDocumentReadHandler,
  createDocumentEditHandler,
  createDocumentAppendHandler,
  createDocumentReplaceHandler,
  createDocumentInsertImageHandler,
  createDocumentInsertTableHandler,
  createDocumentInsertHeadingHandler,
  createDocumentInsertPageBreakHandler,
  createDocumentExportPdfHandler,
  createDocumentConvertHandler,
  createDocumentInspectHandler,
  createDocumentValidateHandler,
  createDocumentRenderHandler,
  createDocumentCompareHandler,
  createDocumentTemplateCreateHandler,
  createDocumentTemplateListHandler,
  createDocumentTemplateApplyHandler,
} from "./rpc/handlers/document.js";
import {
  createToolRegistryListHandler,
  createToolRegistryGetHandler,
} from "./rpc/handlers/tool-registry.js";
import { DiscoveryService } from "./discovery/discovery-service.js";
import {
  createDiscoveryQueryHandler,
  createDiscoveryInspectHandler,
  createDiscoveryLaunchHandler,
  createDiscoveryVerifyHandler,
  createDiscoveryIndexSearchHandler,
  createDiscoveryRefreshHandler,
} from "./rpc/handlers/discovery.js";

export const RUNNER_VERSION = "2.0.0";


export type Runner = LocalBridgeRunner;

export type RunnerLifecycleState = "idle" | "connecting" | "handshaking" | "online" | "reconnecting" | "stopped";

export class LocalBridgeRunner {
  private client: RunnerWsClient | null = null;
  private reconnectController: ReconnectController;
  private heartbeatMonitor: HeartbeatMonitor;
  private logger: Logger;
  private state: RunnerLifecycleState = "idle";
  private stopping = false;
  readonly runnerId: string;
  readonly config: RunnerDaemonConfig;
  readonly rpcRouter: RpcRouter;
  readonly projectRegistry: ProjectRegistry;
  readonly backupService: BackupService;
  readonly filesystemService: FilesystemService;
  readonly gitService: GitService;
  readonly executableRegistry: ExecutableRegistry;
  readonly processRunner: ProcessRunner;
  readonly commandExecutionService: CommandExecutionService;
  readonly jobManager: JobManager;
  readonly approvalManager: ApprovalManager;
  readonly lspManager: LspManager;
  readonly worktreeService: ManagedWorktreeService;
  readonly workspaceResolver: WorkspaceResolver;
  readonly runtimeManager: PersistentRuntimeManager;
  readonly projectDetectionService: ProjectDetectionService;
  readonly ownershipTracker: ProcessOwnershipTracker;
  readonly terminalManager: TerminalManager;
  readonly agentTaskManager: AgentTaskManager;
  readonly actionLedger: ActionLedger;
  readonly runnerStateDir: string;
  readonly artifactService: ArtifactService;
  readonly checkpointService: WorkspaceCheckpointService;
  readonly hygieneService: WorkspaceHygieneService;
  readonly computerUseService: WindowsComputerUseService;
  readonly codePatchService: CodePatchService;
  readonly memoryService: AgentMemoryService;
  readonly validationService: UnifiedValidationService;
  readonly browserService: BrowserAutomationService;
  readonly agentPlanService: AgentPlanService;
  readonly eventBus: LocalBridgeEventBus;
  readonly observabilityService: LocalBridgeObservabilityService;
  readonly visionService: VisionService;
  readonly documentService: DocumentService;
  readonly toolRegistryService: ToolRegistryService;
  readonly discoveryService: DiscoveryService;


  constructor(config: RunnerDaemonConfig, logger?: Logger) {
    this.config = config;
    this.logger =
      logger ??
      createLogger({
        level: config.logging.level,
        pretty: config.logging.pretty,
      });

    this.runnerId =
      config.runnerId ||
      getOrCreateRunnerId(config.statePath);

    const runnerStateDir =
      config.statePath
        ? path.dirname(config.statePath)
        : path.join(os.homedir(), ".localbridge");
    this.runnerStateDir = runnerStateDir;

    const projectsPath =
      config.projectsPath ||
      path.join(runnerStateDir, "projects.json");

    this.projectRegistry = new ProjectRegistry(projectsPath, this.logger);

    const backupDir =
      config.statePath
        ? path.join(path.dirname(config.statePath), "backups")
        : path.join(os.homedir(), ".localbridge", "backups");

    this.backupService = new BackupService(backupDir, this.logger);

    this.worktreeService = new ManagedWorktreeService({
      runnerStateDir,
      projectRegistry: this.projectRegistry,
      logger: this.logger,
    });

    this.workspaceResolver = new WorkspaceResolver(
      this.projectRegistry,
      this.worktreeService,
      this.logger
    );

    this.reconnectController = new ReconnectController({
      enabled: config.reconnect.enabled,
      initialDelayMs: config.reconnect.initialDelayMs,
      maxDelayMs: config.reconnect.maxDelayMs,
      factor: config.reconnect.factor,
      jitter: config.reconnect.jitter,
    });

    this.heartbeatMonitor = new HeartbeatMonitor({
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      onDeadConnection: () => {
        this.logger.warn("Heartbeat timeout detected; terminating runner connection");
        this.client?.terminate();
      },
      logger: this.logger,
    });

    this.filesystemService = new FilesystemService(
      this.projectRegistry,
      this.backupService,
      this.logger
    );
    this.filesystemService.setWorkspaceResolver(this.workspaceResolver);

    this.gitService = new GitService(
      this.projectRegistry,
      this.logger
    );
    this.gitService.setWorkspaceResolver(this.workspaceResolver);

    this.executableRegistry = new ExecutableRegistry(this.logger);
    this.processRunner = new ProcessRunner(this.logger);
    this.approvalManager = new ApprovalManager(this.logger);

    this.commandExecutionService = new CommandExecutionService(
      this.projectRegistry,
      this.executableRegistry,
      this.processRunner,
      runnerStateDir,
      this.logger,
      this.approvalManager
    );
    this.commandExecutionService.setWorkspaceResolver(this.workspaceResolver);

    this.jobManager = new JobManager(
      this.projectRegistry,
      this.executableRegistry,
      runnerStateDir,
      this.logger,
      this.approvalManager,
      { enableQueue: true, persistState: true }
    );
    this.jobManager.setWorkspaceResolver(this.workspaceResolver);

    this.lspManager = new LspManager(
      this.projectRegistry,
      runnerStateDir,
      this.logger
    );
    this.lspManager.setWorkspaceResolver(this.workspaceResolver);

    this.filesystemService.onFileChange((projectId, path, content) => {
      this.lspManager.onFileModified(projectId, path, content).catch(() => {});
    });

    this.ownershipTracker = new ProcessOwnershipTracker(
      runnerStateDir,
      this.projectRegistry,
      this.logger
    );

    this.terminalManager = new TerminalManager(
      this.projectRegistry,
      this.ownershipTracker,
      this.logger
    );

    this.runtimeManager = new PersistentRuntimeManager(
      this.projectRegistry,
      this.executableRegistry,
      this.approvalManager,
      this.logger,
      { runnerStateDir, persistState: true }
    );
    this.runtimeManager.setWorkspaceResolver(this.workspaceResolver);
    this.eventBus = new LocalBridgeEventBus(runnerStateDir, this.logger);
    this.observabilityService = new LocalBridgeObservabilityService(runnerStateDir, this.logger);
    this.observabilityService.attachEventBus(this.eventBus);
    this.validationService = new UnifiedValidationService(this.projectRegistry, this.logger);
    this.computerUseService = new WindowsComputerUseService(runnerStateDir, this.logger);

    this.agentTaskManager = new AgentTaskManager(
      runnerStateDir,
      this.ownershipTracker,
      this.terminalManager,
      this.runtimeManager,
      this.logger,
      this.filesystemService,
      this.eventBus,
      this.observabilityService,
      this.projectRegistry,
      this.gitService,
      this.validationService,
      this.commandExecutionService,
      this.computerUseService
    );

    this.projectDetectionService = new ProjectDetectionService(this.projectRegistry);
    this.projectDetectionService.setWorkspaceResolver(this.workspaceResolver);

    this.artifactService = new ArtifactService(runnerStateDir, this.projectRegistry, this.logger);
    this.agentTaskManager.setArtifactService(this.artifactService);
    this.checkpointService = new WorkspaceCheckpointService(runnerStateDir, this.projectRegistry, this.logger);
    this.hygieneService = new WorkspaceHygieneService(
      this.projectRegistry,
      this.ownershipTracker,
      this.runtimeManager,
      this.terminalManager,
      this.logger
    );
    this.codePatchService = new CodePatchService(this.projectRegistry, this.checkpointService, this.logger);
    this.memoryService = new AgentMemoryService(runnerStateDir, this.logger);
    this.browserService = new BrowserAutomationService(runnerStateDir, this.projectRegistry, this.logger);
    this.agentPlanService = new AgentPlanService(runnerStateDir, this.logger, this.agentTaskManager);
    this.visionService = new VisionService(runnerStateDir, this.logger);
    this.documentService = new DocumentService(runnerStateDir, this.logger);
    this.toolRegistryService = new ToolRegistryService();

    this.agentTaskManager.setVisionService(this.visionService);
    this.agentTaskManager.setDocumentService(this.documentService);
    this.agentTaskManager.setToolRegistryService(this.toolRegistryService);
    this.computerUseService.setVisionService(this.visionService);
    this.computerUseService.setEventBus(this.eventBus);

    this.actionLedger = new ActionLedger(
      runnerStateDir,
      this.eventBus,
      this.logger,
      this.projectRegistry,
      this.filesystemService,
      this.computerUseService
    );
    this.agentTaskManager.setActionLedger(this.actionLedger);
    this.agentPlanService.attachEventBus(this.eventBus);
    this.discoveryService = new DiscoveryService(
      runnerStateDir,
      this.projectRegistry,
      this.computerUseService.getNativeCore(),
      this.logger,
      (this.config as any).workspaceRoot
    );

    this.rpcRouter = new RpcRouter(this.logger);
    this.rpcRouter.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.setupActionLedgerInterceptor();

    this.registerDefaultHandlers();
  }

  private static readonly CONTROL_PLANE_POLL_METHODS = new Set<string>([
    "system.ping",
    "system.info",
    "system.shutdown",
    "project.list",
    "project.info",
    "project.authorize",
    "project.setAccess",
    "project.setExecution",
    "project.enable",
    "project.disable",
    "project.remove",
    "project.setTrustPolicy",
    "project.sessionTrust",
    "project.validate",
    "project.detect",
    "approval.list",
    "approval.get",
    "approval.resolve",
    "approval.bulkResolve",
    "approval.setMode",
    "job.list",
    "job.status",
    "job.logs",
    "runtime.list",
    "runtime.status",
    "runtime.logs",
    "terminal.list",
    "terminal.status",
    "process.list",
    "process.status",
    "process.tree",
    "port.list",
    "lsp.status",
    "lsp.restart",
    "lsp.stop",
    "agentTask.list",
    "agentTask.status",
    "agentTask.logs",
    "agentTask.checkpointList",
    "checkpoint.list",
    "checkpoint.get",
    "event.poll",
    "event.history",
    "trace.list",
    "trace.get",
    "metrics.get",
    "observability.summary",
    "toolRegistry.list",
    "toolRegistry.get",
    "safetyLayer.getStatus",
    "safetyLayer.setStatus",
    "computer.status",
    "computer.takeoverStatus",
    "computer.takeControl",
    "computer.returnControl",
    "computer.displayList",
    "computer.windowList",
    "computer.appList",
    "computer.stateGet",
    "browser.status",
  ]);

  private setupActionLedgerInterceptor(): void {
    this.rpcRouter.setInterceptor(async (method: string, rawParams: any, next: (cleanParams: any) => Promise<any>) => {
      const raw = (rawParams && typeof rawParams === "object" ? { ...rawParams } : {}) as Record<string, any>;
      const executionContext = raw._executionContext;
      const rawToolName = raw._toolName;
      delete raw._executionContext;
      delete raw._toolName;

      const taskIdArg = raw.taskId || executionContext?.taskId;
      const executionIdArg = raw.executionId || executionContext?.executionId;
      const sessionIdArg = raw.sessionId || executionContext?.sessionId;
      const idempotencyKeyArg = raw.idempotencyKey || executionContext?.idempotencyKey;
      const explicitToolName = rawToolName || executionContext?.toolName;
      const toolName = explicitToolName || `localbridge_${method.replace(/\./g, "_")}`;

      const cleanParams = { ...raw };
      if (
        !method.startsWith("agentTask.") &&
        !method.startsWith("agent_task.") &&
        !method.startsWith("safetyLayer.") &&
        !method.startsWith("safety_layer.") &&
        !method.startsWith("checkpoint.") &&
        !method.startsWith("event.")
      ) {
        delete cleanParams.taskId;
        delete cleanParams.executionId;
        delete cleanParams.idempotencyKey;
        delete cleanParams.sessionId;
        delete cleanParams._executionContext;
        delete cleanParams._toolName;
      }

      // Bypass ActionLedger for system.shutdown or internal UI/control-plane polling (when not invoked via MCP tool or explicit task)
      if (
        method === "system.shutdown" ||
        (!taskIdArg && !idempotencyKeyArg && !explicitToolName && LocalBridgeRunner.CONTROL_PLANE_POLL_METHODS.has(method))
      ) {
        return next(cleanParams);
      }


      let task = this.agentTaskManager.resolveActiveTask({
        taskId: taskIdArg,
        sessionId: sessionIdArg,
        projectId: cleanParams.projectId,
      });

      if (!task) {
        task = await this.agentTaskManager.getOrCreateAmbientTask({
          sessionId: sessionIdArg,
          projectId: cleanParams.projectId,
        });
      }

      const taskId = task.id;
      const executionId = executionIdArg || task.executionId || `exec_${taskId}`;
      const checkpointId = task.latestCheckpoint?.checkpointId;

      if (task.state === "queued" || task.state === "paused") {
        task.state = "running";
        task.startedAt = task.startedAt || Date.now();
        this.agentTaskManager.saveTask(task);
        void this.eventBus?.publish({
          topic: "agent.task.started",
          source: "runner.agent-task",
          type: "TASK_STARTED",
          taskId,
          executionId,
          payload: { agentTaskId: taskId, startedAt: task.startedAt, runner: "windows" },
        });
      }

      const isExplicitTask = Boolean(taskIdArg);
      const isIdempotent = this.actionLedger.isMethodIdempotent(method);
      const argsHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(cleanParams))
        .digest("hex");
      const computedIdemKey =
        idempotencyKeyArg ||
        (isExplicitTask || isIdempotent
          ? crypto.createHash("sha256").update(`${taskId}:${toolName}:${method}:${argsHash}`).digest("hex")
          : crypto.createHash("sha256").update(`${taskId}:${toolName}:${method}:${Date.now()}:${crypto.randomUUID()}`).digest("hex"));

      const existingCommitted = idempotencyKeyArg ? this.actionLedger.findCommitted(taskId, computedIdemKey) : undefined;
      if (existingCommitted) {
        if (existingCommitted.isIdempotent || (existingCommitted.alreadyExecuted && existingCommitted.alreadyVerified)) {
          this.logger?.info(
            { taskId, idempotencyKey: computedIdemKey, method },
            "Action already committed and verified; safe skip"
          );
          this.observabilityService?.recordMetric("idempotency_hit_total");
          this.observabilityService?.recordMetric("action_total");
          this.observabilityService?.recordMetric("action_success_total");
          void this.observabilityService
            ?.startTrace({
              traceId: executionId || `trc_${taskId}`,
              name: `${toolName}:${method} (idempotent_skip)`,
              service: "runner.action",
              attributes: {
                taskId,
                executionId,
                actionId: existingCommitted.actionId,
                toolName,
                method,
                idempotencyKey: computedIdemKey,
                skipped: true,
              },
            })
            .then((span) =>
              this.observabilityService?.endTrace({
                spanId: span.spanId,
                status: "ok",
                attributes: { skipped: true, actionId: existingCommitted.actionId },
              })
            )
            .catch(() => {});
          return existingCommitted.result;
        }
      }

      const latestAttempt = this.actionLedger.findLatest(taskId, computedIdemKey);
      if (
        latestAttempt &&
        (latestAttempt.status === "RETRY_UNSAFE" ||
          latestAttempt.status === "UNKNOWN" ||
          (latestAttempt.status === "EXECUTED" && !latestAttempt.alreadyVerified && !latestAttempt.safeToRetry)) &&
        !isIdempotent
      ) {
        throw new LocalBridgeError(
          LocalBridgeErrorCode.OPERATION_FAILED,
          `Action '${latestAttempt.actionId}' for '${method}' was previously interrupted or unverified; retry is unsafe (RETRY_UNSAFE)`
        );
      }

      const action = await this.actionLedger.prepareAction({
        taskId,
        executionId,
        toolName,
        method,
        idempotencyKey: computedIdemKey,
        params: cleanParams,
        checkpointId,
      });

      // Start Trace Span for durable action execution
      const traceSpan = await this.observabilityService
        ?.startTrace({
          traceId: executionId || `trc_${taskId}`,
          name: `${toolName}:${method}`,
          service: "runner.action",
          attributes: {
            taskId,
            executionId,
            actionId: action.actionId,
            toolName,
            method,
            idempotencyKey: computedIdemKey,
          },
        })
        .catch(() => undefined);

      const preStateHash = await this.actionLedger.computePreStateHash(method, cleanParams);
      await this.actionLedger.startAction(action.actionId, preStateHash, checkpointId);
      this.observabilityService?.recordMetric("action_total");
      if (method.startsWith("computer.")) {
        this.observabilityService?.recordMetric("computer_action_total");
      }

      let result: any;
      try {
        result = await next(cleanParams);
      } catch (err: any) {
        this.observabilityService?.recordMetric("action_failure");
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.actionLedger.recordFailed(action.actionId, errorMsg, true, checkpointId);
        if (traceSpan) {
          await this.observabilityService
            ?.endTrace({
              spanId: traceSpan.spanId,
              status: "error",
              error: errorMsg,
              attributes: { actionId: action.actionId, verified: false },
            })
            .catch(() => {});
        }
        this.actionLedger.reduceTaskState(task);
        this.agentTaskManager.saveTask(task);
        throw err;
      }

      this.observabilityService?.recordMetric("tool_success_total");
      this.observabilityService?.recordMetric("verification_total");
      const sideEffects = this.actionLedger.detectSideEffects(method, cleanParams, result);
      await this.actionLedger.recordExecuted(action.actionId, result, sideEffects, checkpointId);

      await this.actionLedger.startVerification(action.actionId, checkpointId);
      const postStateHash = await this.actionLedger.computePostStateHash(method, cleanParams, result);
      const verificationResult = await this.actionLedger.verifyAction(
        method,
        cleanParams,
        result,
        preStateHash,
        postStateHash
      );

      if (verificationResult.verified) {
        this.observabilityService?.recordMetric("verification_success_total");
        this.observabilityService?.recordMetric("action_success_total");
        await this.actionLedger.recordVerified(action.actionId, postStateHash, verificationResult.details, checkpointId);
        await this.actionLedger.commitAction(action.actionId, checkpointId);
        if (traceSpan) {
          await this.observabilityService
            ?.endTrace({
              spanId: traceSpan.spanId,
              status: "ok",
              attributes: {
                actionId: action.actionId,
                verified: true,
                postStateHash,
              },
            })
            .catch(() => {});
        }
      } else {
        this.observabilityService?.recordMetric("verification_failure");
        this.observabilityService?.recordMetric("action_failure");
        if (method.startsWith("computer.")) {
          this.observabilityService?.recordMetric("computer_verification_failure");
        }
        if (!isIdempotent) {
          await this.actionLedger.recordRetryUnsafe(
            action.actionId,
            `Action execution could not be verified: ${JSON.stringify(verificationResult.details)}`,
            checkpointId
          );
        } else {
          await this.actionLedger.recordFailed(
            action.actionId,
            `Verification failed: ${JSON.stringify(verificationResult.details)}`,
            true,
            checkpointId
          );
        }
        if (traceSpan) {
          await this.observabilityService
            ?.endTrace({
              spanId: traceSpan.spanId,
              status: "error",
              error: `Action verification failed: ${JSON.stringify(verificationResult.details)}`,
              attributes: { actionId: action.actionId, verified: false },
            })
            .catch(() => {});
        }
        this.actionLedger.reduceTaskState(task);
        this.agentTaskManager.saveTask(task);
        throw new LocalBridgeError(
          LocalBridgeErrorCode.OPERATION_FAILED,
          `Action verification failed for ${method}: ${JSON.stringify(verificationResult.details)}`
        );
      }

      this.actionLedger.reduceTaskState(task);
      this.agentTaskManager.saveTask(task);

      return result;
    });
  }


  private registerDefaultHandlers(): void {
    const systemInfo: RunnerSystemInfo = collectSystemInfo();
    const capabilities: RunnerCapabilities = detectCapabilities(systemInfo.tools);

    this.rpcRouter.register(
      RunnerRpcMethods.SystemPing,
      createSystemPingHandler({ runnerId: this.runnerId })
    );

    this.rpcRouter.register(
      RunnerRpcMethods.SystemInfo,
      createSystemInfoHandler({
        runnerId: this.runnerId,
        version: RUNNER_VERSION,
        capabilities,
        tools: systemInfo.tools,
      })
    );

    this.rpcRouter.register(RunnerRpcMethods.SystemShutdown, async () => {
      setTimeout(() => { void this.stop(); }, 50);
      return { accepted: true as const };
    });

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectList,
      createProjectListHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectInfo,
      createProjectInfoHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectValidate,
      createProjectValidateHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.DirectoryList,
      createDirectoryListHandler(this.filesystemService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileStat,
      createFileStatHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRead,
      createFileReadHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileCreate,
      createFileCreateHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileWrite,
      createFileWriteHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FilePatch,
      createFilePatchHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileDelete,
      createFileDeleteHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FileRestore,
      createFileRestoreHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitInfo,
      createGitInfoHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitStatus,
      createGitStatusHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitDiff,
      createGitDiffHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitLog,
      createGitLogHandler(this.gitService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitStage,
      createGitStageHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitUnstage,
      createGitUnstageHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitBranchCreate,
      createGitBranchCreateHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitBranchSwitch,
      createGitBranchSwitchHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.GitCommit,
      createGitCommitHandler(this.gitService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CommandClassify,
      createCommandClassifyHandler(this.commandExecutionService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CommandRun,
      createCommandRunHandler(this.commandExecutionService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobStart,
      createJobStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobStatus,
      createJobStatusHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobLogs,
      createJobLogsHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobCancel,
      createJobCancelHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobList,
      createJobListHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.BuildStart,
      createBuildStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.TestStart,
      createTestStartHandler(this.jobManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectAuthorize,
      createProjectAuthorizeHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetAccess,
      createProjectSetAccessHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetExecution,
      createProjectSetExecutionHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectRemove,
      createProjectRemoveHandler(this.projectRegistry, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectEnable,
      createProjectEnableHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectDisable,
      createProjectDisableHandler(this.projectRegistry, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalCreate,
      createApprovalCreateHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalResolve,
      createApprovalResolveHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalList,
      createApprovalListHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalGet,
      createApprovalGetHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalBulkResolve,
      createApprovalBulkResolveHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ApprovalSetMode,
      createApprovalSetModeHandler(this.approvalManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSetTrustPolicy,
      createProjectSetTrustPolicyHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectSessionTrust,
      createProjectSessionTrustHandler(this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.JobCancelAll,
      createJobCancelAllHandler(this.jobManager, this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDocumentSymbols,
      createCodeDocumentSymbolsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeWorkspaceSymbols,
      createCodeWorkspaceSymbolsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDefinition,
      createCodeDefinitionHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeReferences,
      createCodeReferencesHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeHover,
      createCodeHoverHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeDiagnostics,
      createCodeDiagnosticsHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeCallHierarchy,
      createCodeCallHierarchyHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.CodeImpact,
      createCodeImpactHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspStatus,
      createLspStatusHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspRestart,
      createLspRestartHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.LspStop,
      createLspStopHandler(this.lspManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.WorktreeCreate,
      createWorktreeCreateHandler(this.worktreeService, this.approvalManager, this.projectRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.WorktreeList,
      createWorktreeListHandler(this.worktreeService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.WorktreeStatus,
      createWorktreeStatusHandler(this.worktreeService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.WorktreeDiff,
      createWorktreeDiffHandler(this.worktreeService)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.WorktreeRemove,
      createWorktreeRemoveHandler(
        this.worktreeService,
        this.approvalManager,
        this.projectRegistry,
        this.lspManager
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeStart,
      createRuntimeStartHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeList,
      createRuntimeListHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeStatus,
      createRuntimeStatusHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeLogs,
      createRuntimeLogsHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeRestart,
      createRuntimeRestartHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.RuntimeStop,
      createRuntimeStopHandler(this.runtimeManager)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FsDelete,
      createFsDeleteHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry,
        this.runnerStateDir
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FsMove,
      createFsMoveHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry,
        this.runnerStateDir
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FsCopy,
      createFsCopyHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry,
        this.runnerStateDir
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.FsMkdir,
      createFsMkdirHandler(
        this.filesystemService,
        this.approvalManager,
        this.projectRegistry,
        this.runnerStateDir
      )
    );

    this.rpcRouter.register(
      RunnerRpcMethods.EnvironmentDetect,
      createEnvironmentDetectHandler(this.executableRegistry)
    );

    this.rpcRouter.register(
      RunnerRpcMethods.ProjectDetect,
      createProjectDetectHandler(this.projectDetectionService)
    );

    // Terminal Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalStart,
      createTerminalStartHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalWrite,
      createTerminalWriteHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalRead,
      createTerminalReadHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalResize,
      createTerminalResizeHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalStatus,
      createTerminalStatusHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalStop,
      createTerminalStopHandler(this.terminalManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.TerminalList,
      createTerminalListHandler(this.terminalManager)
    );

    // Process Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.ProcessList,
      createProcessListHandler(this.ownershipTracker)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ProcessStatus,
      createProcessStatusHandler(this.ownershipTracker)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ProcessKill,
      createProcessKillHandler(this.ownershipTracker)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ProcessTree,
      createProcessTreeHandler(this.ownershipTracker)
    );

    // Port Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.PortList,
      createPortListHandler(this.ownershipTracker)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.PortKill,
      createPortKillHandler(this.ownershipTracker)
    );

    // Agent Task Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCreate,
      createAgentTaskCreateHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskStatus,
      createAgentTaskStatusHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskLogs,
      createAgentTaskLogsHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCancel,
      createAgentTaskCancelHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskPause,
      createAgentTaskPauseHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskResume,
      createAgentTaskResumeHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskList,
      createAgentTaskListHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskApprove,
      createAgentTaskApproveHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskAssign,
      createAgentTaskAssignHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskAttempt,
      createAgentTaskAttemptHandler(this.agentTaskManager, this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCodingRun,
      createAgentTaskCodingRunHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskHeartbeat,
      createAgentTaskHeartbeatHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskReconcile,
      createAgentTaskReconcileHandler(this.agentTaskManager, this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskComplete,
      createAgentTaskCompleteHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskHandoff,
      createAgentTaskHandoffHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCheckpointCreate,
      createAgentTaskCheckpointCreateHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCheckpointRestore,
      createAgentTaskCheckpointRestoreHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskCheckpointList,
      createAgentTaskCheckpointListHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskDisconnect,
      createAgentTaskDisconnectHandler(this.agentTaskManager)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.AgentTaskTakeover,
      createAgentTaskTakeoverHandler(this.agentTaskManager)
    );

    // Artifact Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactCreate,
      createArtifactCreateHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactWriteChunk,
      createArtifactWriteChunkHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactReadChunk,
      createArtifactReadChunkHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactGet,
      createArtifactGetHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactList,
      createArtifactListHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactImport,
      createArtifactImportHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactExport,
      createArtifactExportHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactDelete,
      createArtifactDeleteHandler(this.artifactService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ArtifactAbort,
      createArtifactAbortHandler(this.artifactService)
    );

    // Checkpoint Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.CheckpointCreate,
      createCheckpointCreateHandler(this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CheckpointList,
      createCheckpointListHandler(this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CheckpointGet,
      createCheckpointGetHandler(this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CheckpointRestore,
      createCheckpointRestoreHandler(this.checkpointService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CheckpointDelete,
      createCheckpointDeleteHandler(this.checkpointService)
    );

    // Hygiene Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.HygieneCheck,
      createHygieneCheckHandler(this.hygieneService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.HygieneClean,
      createHygieneCleanHandler(this.hygieneService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.HygieneResetFile,
      createHygieneResetFileHandler(this.hygieneService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.HygieneCleanUntracked,
      createHygieneCleanUntrackedHandler(this.hygieneService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.HygieneKillZombies,
      createHygieneKillZombiesHandler(this.hygieneService)
    );

    // Windows Computer Use Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerClipboardRead,
      createComputerClipboardReadHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerClipboardWrite,
      createComputerClipboardWriteHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerMouseMove,
      createComputerMouseMoveHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerMouseClick,
      createComputerMouseClickHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerMouseScroll,
      createComputerMouseScrollHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerKeyboardInput,
      createComputerKeyboardInputHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerKeyboardKey,
      createComputerKeyboardKeyHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerWindowList,
      createComputerWindowListHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerWindowActivate,
      createComputerWindowActivateHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerDisplayList,
      createComputerDisplayListHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerAppList,
      createComputerAppListHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerAppLaunch,
      createComputerAppLaunchHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerAccessibilityTree,
      createComputerAccessibilityTreeHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerUIElementAction,
      createComputerUIElementActionHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerScreenSnapshot,
      createComputerScreenSnapshotHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerStatus,
      createComputerStatusHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerMouseDrag,
      createComputerMouseDragHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerWindowClose,
      createComputerWindowCloseHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerWait,
      createComputerWaitHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerObserve,
      createComputerObserveHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerKeyboardHotkey,
      createComputerKeyboardHotkeyHandler(this.computerUseService)
    );

    // Filesystem Advanced Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.FsSearch,
      createFsSearchHandler(this.projectRegistry, this.workspaceResolver)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.FsGrep,
      createFsGrepHandler(this.projectRegistry, this.workspaceResolver)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.FileReadStream,
      createFileReadStreamHandler(this.projectRegistry, this.workspaceResolver)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.FsBatch,
      createFsBatchHandler(this.projectRegistry, this.filesystemService)
    );

    // Code Patch Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.CodePatchPreview,
      createCodePatchPreviewHandler(this.codePatchService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CodePatchApply,
      createCodePatchApplyHandler(this.codePatchService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.CodePatchRollback,
      createCodePatchRollbackHandler(this.codePatchService)
    );

    // Memory Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.MemorySet,
      createMemorySetHandler(this.memoryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.MemoryGet,
      createMemoryGetHandler(this.memoryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.MemorySearch,
      createMemorySearchHandler(this.memoryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.MemoryDelete,
      createMemoryDeleteHandler(this.memoryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.MemoryPurge,
      createMemoryPurgeHandler(this.memoryService)
    );

    // Validation Handler
    this.rpcRouter.register(
      RunnerRpcMethods.ValidationRun,
      createValidationRunHandler(this.validationService)
    );

    // Command Safety Layer Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.SafetyLayerSetStatus,
      createSafetyLayerSetStatusHandler(this)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.SafetyLayerGetStatus,
      createSafetyLayerGetStatusHandler(this)
    );

    // Browser Automation Handlers
    const browserHandlers = createBrowserHandlers(this.browserService);
    this.rpcRouter.register(RunnerRpcMethods.BrowserLaunch, browserHandlers.launch);
    this.rpcRouter.register(RunnerRpcMethods.BrowserClose, browserHandlers.close);
    this.rpcRouter.register(RunnerRpcMethods.BrowserList, browserHandlers.list);
    this.rpcRouter.register(RunnerRpcMethods.BrowserStatus, browserHandlers.status);
    this.rpcRouter.register(RunnerRpcMethods.BrowserOpen, browserHandlers.open);
    this.rpcRouter.register(RunnerRpcMethods.BrowserBack, browserHandlers.back);
    this.rpcRouter.register(RunnerRpcMethods.BrowserForward, browserHandlers.forward);
    this.rpcRouter.register(RunnerRpcMethods.BrowserReload, browserHandlers.reload);
    this.rpcRouter.register(RunnerRpcMethods.BrowserWait, browserHandlers.wait);
    this.rpcRouter.register(RunnerRpcMethods.BrowserSnapshot, browserHandlers.snapshot);
    this.rpcRouter.register(RunnerRpcMethods.BrowserScreenshot, browserHandlers.screenshot);
    this.rpcRouter.register(RunnerRpcMethods.BrowserFind, browserHandlers.find);
    this.rpcRouter.register(RunnerRpcMethods.BrowserExtract, browserHandlers.extract);
    this.rpcRouter.register(RunnerRpcMethods.BrowserElementState, browserHandlers.elementState);
    this.rpcRouter.register(RunnerRpcMethods.BrowserClick, browserHandlers.click);
    this.rpcRouter.register(RunnerRpcMethods.BrowserType, browserHandlers.type);
    this.rpcRouter.register(RunnerRpcMethods.BrowserKey, browserHandlers.key);
    this.rpcRouter.register(RunnerRpcMethods.BrowserSelect, browserHandlers.select);
    this.rpcRouter.register(RunnerRpcMethods.BrowserScroll, browserHandlers.scroll);
    this.rpcRouter.register(RunnerRpcMethods.BrowserHover, browserHandlers.hover);
    this.rpcRouter.register(RunnerRpcMethods.BrowserTabs, browserHandlers.tabs);
    this.rpcRouter.register(RunnerRpcMethods.BrowserTabCreate, browserHandlers.tabCreate);
    this.rpcRouter.register(RunnerRpcMethods.BrowserTabClose, browserHandlers.tabClose);
    this.rpcRouter.register(RunnerRpcMethods.BrowserTabSwitch, browserHandlers.tabSwitch);
    this.rpcRouter.register(RunnerRpcMethods.BrowserConsole, browserHandlers.console);
    this.rpcRouter.register(RunnerRpcMethods.BrowserNetwork, browserHandlers.network);
    this.rpcRouter.register(RunnerRpcMethods.BrowserCookies, browserHandlers.cookies);
    this.rpcRouter.register(RunnerRpcMethods.BrowserStorage, browserHandlers.storage);
    this.rpcRouter.register(RunnerRpcMethods.BrowserDownload, browserHandlers.download);
    this.rpcRouter.register(RunnerRpcMethods.BrowserUpload, browserHandlers.upload);

    // Agent Plan, Todo, Delegation, Supervisor, Budget Handlers
    const planHandlers = createAgentPlanHandlers(this.agentPlanService);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanCreate, planHandlers.createPlan);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanGet, planHandlers.getPlan);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanUpdate, planHandlers.updatePlan);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanDelete, planHandlers.deletePlan);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanComplete, planHandlers.completePlan);
    this.rpcRouter.register(RunnerRpcMethods.AgentPlanList, planHandlers.listPlans);
    this.rpcRouter.register(RunnerRpcMethods.AgentTodoCreate, planHandlers.createTodo);
    this.rpcRouter.register(RunnerRpcMethods.AgentTodoUpdate, planHandlers.updateTodo);
    this.rpcRouter.register(RunnerRpcMethods.AgentTodoComplete, planHandlers.completeTodo);
    this.rpcRouter.register(RunnerRpcMethods.AgentTodoList, planHandlers.listTodos);
    this.rpcRouter.register(RunnerRpcMethods.AgentDelegate, planHandlers.delegate);
    this.rpcRouter.register(RunnerRpcMethods.AgentFork, planHandlers.fork);
    this.rpcRouter.register(RunnerRpcMethods.AgentJoin, planHandlers.join);
    this.rpcRouter.register(RunnerRpcMethods.AgentSupervise, planHandlers.supervise);
    this.rpcRouter.register(RunnerRpcMethods.AgentDependencyCreate, planHandlers.createDependency);
    this.rpcRouter.register(RunnerRpcMethods.AgentDependencyList, planHandlers.listDependencies);
    this.rpcRouter.register(RunnerRpcMethods.AgentDependencyRemove, planHandlers.removeDependency);
    this.rpcRouter.register(RunnerRpcMethods.AgentBudgetSet, planHandlers.setBudget);
    this.rpcRouter.register(RunnerRpcMethods.AgentBudgetGet, planHandlers.getBudget);
    this.rpcRouter.register(RunnerRpcMethods.AgentBudgetCheck, planHandlers.checkBudget);

    // Event Bus Handlers
    const eventHandlers = createEventHandlers(this.eventBus);
    this.rpcRouter.register(RunnerRpcMethods.EventPublish, eventHandlers.publish);
    this.rpcRouter.register(RunnerRpcMethods.EventSubscribe, eventHandlers.subscribe);
    this.rpcRouter.register(RunnerRpcMethods.EventUnsubscribe, eventHandlers.unsubscribe);
    this.rpcRouter.register(RunnerRpcMethods.EventPoll, eventHandlers.poll);
    this.rpcRouter.register(RunnerRpcMethods.EventHistory, eventHandlers.history);
    this.rpcRouter.register(RunnerRpcMethods.EventReplay, eventHandlers.replay);

    // Trace & Observability Handlers
    const traceHandlers = createTraceHandlers(this.observabilityService);
    this.rpcRouter.register(RunnerRpcMethods.TraceStart, traceHandlers.start);
    this.rpcRouter.register(RunnerRpcMethods.TraceEnd, traceHandlers.end);
    this.rpcRouter.register(RunnerRpcMethods.TraceRecord, traceHandlers.record);
    this.rpcRouter.register(RunnerRpcMethods.TraceGet, traceHandlers.get);
    this.rpcRouter.register(RunnerRpcMethods.TraceList, traceHandlers.list);
    this.rpcRouter.register(RunnerRpcMethods.MetricsGet, traceHandlers.metrics);
    this.rpcRouter.register(RunnerRpcMethods.ObservabilitySummary, traceHandlers.summary);

    // Human Takeover Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerTakeControl,
      createComputerTakeControlHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerReturnControl,
      createComputerReturnControlHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerTakeoverStatus,
      createComputerTakeoverStatusHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerLocateUI,
      createComputerLocateUIHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerTaskAcceptance,
      createComputerTaskAcceptanceHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerLoopCheck,
      createComputerLoopCheckHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerStateGet,
      createComputerStateGetHandler(this.computerUseService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ComputerRealtimeStream,
      createComputerRealtimeStreamHandler(this.computerUseService)
    );

    // Tool Registry Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.ToolRegistryList,
      createToolRegistryListHandler(this.toolRegistryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.ToolRegistryGet,
      createToolRegistryGetHandler(this.toolRegistryService)
    );

    // Vision Bridge Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.VisionAnalyze,
      createVisionAnalyzeHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionDescribe,
      createVisionDescribeHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionOcr,
      createVisionOcrHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionDetectObjects,
      createVisionDetectObjectsHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionDetectRegions,
      createVisionDetectRegionsHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionDetectParts,
      createVisionDetectPartsHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionGeometry,
      createVisionGeometryHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionColor,
      createVisionColorHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionMaterial,
      createVisionMaterialHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionSpatial,
      createVisionSpatialHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionCompare,
      createVisionCompareHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionExtractText,
      createVisionExtractTextHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionCache,
      createVisionCacheHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionGet,
      createVisionGetHandler(this.visionService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.VisionDelete,
      createVisionDeleteHandler(this.visionService)
    );

    // Document Bridge Handlers
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentCreate,
      createDocumentCreateHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentRead,
      createDocumentReadHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentEdit,
      createDocumentEditHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentAppend,
      createDocumentAppendHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentReplace,
      createDocumentReplaceHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentInsertImage,
      createDocumentInsertImageHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentInsertTable,
      createDocumentInsertTableHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentInsertHeading,
      createDocumentInsertHeadingHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentInsertPageBreak,
      createDocumentInsertPageBreakHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentExportPdf,
      createDocumentExportPdfHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentConvert,
      createDocumentConvertHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentInspect,
      createDocumentInspectHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentValidate,
      createDocumentValidateHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentRender,
      createDocumentRenderHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentCompare,
      createDocumentCompareHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentTemplateCreate,
      createDocumentTemplateCreateHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentTemplateList,
      createDocumentTemplateListHandler(this.documentService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DocumentTemplateApply,
      createDocumentTemplateApplyHandler(this.documentService)
    );

    // Discovery & Verification
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryQuery,
      createDiscoveryQueryHandler(this.discoveryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryInspect,
      createDiscoveryInspectHandler(this.discoveryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryLaunch,
      createDiscoveryLaunchHandler(this.discoveryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryVerify,
      createDiscoveryVerifyHandler(this.discoveryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryIndexSearch,
      createDiscoveryIndexSearchHandler(this.discoveryService)
    );
    this.rpcRouter.register(
      RunnerRpcMethods.DiscoveryRefresh,
      createDiscoveryRefreshHandler(this.discoveryService)
    );
  }


  private safetyLayerDisabled: boolean = false;
  private securityMode: SecurityMode = "safe";

  setSafetyLayerDisabled(disabled: boolean, mode?: SecurityMode): void {
    const isUnres = isUnrestrictedMode(mode) || disabled;
    this.safetyLayerDisabled = isUnres;
    this.securityMode = mode ?? (disabled ? "UNRESTRICTED" : "SAFE");
    this.computerUseService.setSecurityMode(isUnres ? "universal" : "safe");
    this.discoveryService.setSecurityMode(this.securityMode);
    this.projectRegistry.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.filesystemService.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.commandExecutionService.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.approvalManager.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.jobManager.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.runtimeManager.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.terminalManager.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.rpcRouter.setSafetyLayerDisabled(this.safetyLayerDisabled);
    this.logger.info(
      { disabled: this.safetyLayerDisabled, mode: this.securityMode },
      `Command Safety Layer has been updated to mode: ${this.securityMode} (disabled: ${this.safetyLayerDisabled})`
    );
  }

  isSafetyLayerDisabled(): boolean {
    return this.safetyLayerDisabled;
  }

  getSecurityMode(): SecurityMode {
    return this.securityMode;
  }

  get router(): RpcRouter {
    return this.rpcRouter;
  }

  /**
   * Safe cleanup of orphaned LocalBridge temporary files from previous crashed runs.
   * Strictly targets files matching the LocalBridge atomic write pattern:
   * (e.g. `.*.localbridge-[0-9a-f]{16}.tmp` or `.localbridge-*.tmp`).
   * Never deletes ordinary user files.
   */
  private cleanOrphanedTempFiles(): void {
    const isLocalBridgeTempFile = (filename: string): boolean => {
      return (
        /^\..*\.localbridge-[0-9a-f]+\.tmp$/i.test(filename) ||
        /^\.localbridge-.*\.tmp$/i.test(filename)
      );
    };

    const cleanDirectory = (dirPath: string): void => {
      if (!fs.existsSync(dirPath)) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && isLocalBridgeTempFile(entry.name)) {
            const filePath = path.join(dirPath, entry.name);
            try {
              fs.unlinkSync(filePath);
              this.logger.debug(
                { file: entry.name, dir: dirPath },
                "Cleaned up orphaned LocalBridge temp file"
              );
            } catch (e) {
              this.logger.warn(
                { file: entry.name, error: String(e) },
                "Failed to delete temp file"
              );
            }
          }
        }
      } catch (e) {
        this.logger.warn(
          { dir: dirPath, error: String(e) },
          "Failed to scan directory for temp files"
        );
      }
    };

    cleanDirectory(this.runnerStateDir);
    for (const project of this.projectRegistry.list()) {
      cleanDirectory(project.canonicalRoot);
    }
  }

  /**
   * Start the Runner daemon and initiate connection to LocalBridge Server.
   */
  async start(): Promise<void> {
    this.stopping = false;
    this.logger.info(
      {
        runnerId: this.runnerId,
        runnerName: this.config.runnerName,
        serverUrl: this.config.serverUrl,
        version: RUNNER_VERSION,
      },
      "Starting LocalBridge Runner daemon..."
    );

    // Phase 12 Security Hardening: Startup cleanups
    this.backupService.cleanupAllProjects();
    this.cleanOrphanedTempFiles();

    await this.connect();
  }

  /**
   * Stop the Runner daemon gracefully.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.state = "stopped";
    this.reconnectController.cancel();
    this.heartbeatMonitor.stop();
    this.agentTaskManager.stop();
    this.actionLedger.flushAll();
    await this.jobManager.stop();
    await this.lspManager.stopAll();
    await this.runtimeManager.shutdown();
    await this.terminalManager.shutdown();
    await this.browserService.shutdown();
    this.approvalManager.expireAll();

    if (this.client) {
      this.logger.info("Closing WebSocket connection to server...");
      this.client.close(1000, "runner_shutdown");
      this.client = null;
    }

    this.logger.info("LocalBridge Runner stopped gracefully.");
  }

  get currentState(): RunnerLifecycleState {
    return this.state;
  }

  get isOnline(): boolean {
    return this.state === "online";
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;

    this.state = "connecting";
    this.logger.info(
      { serverUrl: this.config.serverUrl, attempt: this.reconnectController.currentAttempts },
      "Connecting to LocalBridge Server..."
    );

    this.client = new RunnerWsClient({
      serverUrl: this.config.serverUrl,
      token: this.config.token,
      logger: this.logger,
      onOpen: () => {
        this.logger.info("WebSocket connected, initiating handshake...");
      },
      onClose: (code, reason) => {
        this.handleDisconnect(code, reason);
      },
      onError: (err) => {
        this.logger.warn({ err: err.message }, "WebSocket connection error");
      },
      onMessage: async (data) => {
        const response = await this.rpcRouter.handle(data as string | Buffer);
        if (response && this.client) {
          this.client.send(JSON.stringify(response));
        }
      },
    });

    try {
      await this.client.connect();
      await this.performHandshake();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn({ error: msg }, "Failed to connect or handshake with server");
      this.handleDisconnect(-1, msg);
    }
  }

  private async performHandshake(): Promise<void> {
    if (!this.client || this.stopping) return;

    this.state = "handshaking";
    const systemInfo: RunnerSystemInfo = collectSystemInfo();
    const capabilities: RunnerCapabilities = detectCapabilities(systemInfo.tools);

    const helloParams: RunnerHelloRequestParams = {
      protocolVersion: PROTOCOL_VERSION,
      runnerId: this.runnerId,
      runnerVersion: RUNNER_VERSION,
      name: this.config.runnerName,
      system: systemInfo,
      capabilities,
    };

    this.logger.info(
      {
        runnerId: this.runnerId,
        protocolVersion: PROTOCOL_VERSION,
        tools: systemInfo.tools,
        capabilities,
      },
      "Sending runner.hello handshake..."
    );

    const result = await this.client.call<RunnerHelloResponse>(
      RunnerRpcMethods.Hello,
      helloParams,
      8000
    );

    if (result && result.accepted) {
      this.state = "online";
      this.reconnectController.reset();

      if (this.client.rawSocket) {
        this.heartbeatMonitor.start(this.client.rawSocket, result.heartbeatIntervalMs);
      }

      this.logger.info(
        {
          serverVersion: result.serverVersion,
          protocolVersion: result.protocolVersion,
          heartbeatIntervalMs: result.heartbeatIntervalMs,
        },
        "Handshake accepted! LocalBridge Runner is ONLINE"
      );
    } else {
      throw new Error("Handshake was not accepted by server");
    }
  }

  private handleDisconnect(code: number, reason: string): void {
    this.heartbeatMonitor.stop();

    if (this.stopping) {
      this.state = "stopped";
      return;
    }

    this.state = "reconnecting";
    this.logger.warn(
      { code, reason },
      "Runner disconnected from server"
    );

    if (this.config.reconnect.enabled) {
      const delay = this.reconnectController.schedule(() => {
        this.connect().catch((err) => {
          this.logger.error(err, "Reconnection attempt encountered error");
        });
      });

      if (delay !== null) {
        this.logger.info(
          { delayMs: delay, nextAttempt: this.reconnectController.currentAttempts },
          `Reconnecting in ${Math.round(delay / 1000)}s...`
        );
      }
    }
  }
}

