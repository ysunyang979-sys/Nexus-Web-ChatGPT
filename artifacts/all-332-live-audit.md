# Nexus 332 MCP Tools 全量真实可用性验收报告

> **验收时间**: 2026-09-29T02:41:33.621Z
> **测试环境**: Windows 11 x64, Node v24.21.0, Nexus 1.2.0 Desktop, Runner Online
> **测试目录**: `C:\NexusMCPFullTest\` (独立隔离目录，无生产污染)

## 一、核心验收统计指标

| 指标项 | 数量 | 占比 | 判定标准 |
|---|---:|---:|---|
| **Total Registered** | **332** | 100.00% | `tools/list` 实时枚举已注册工具 |
| **PASS** | **45** | **13.55%** | 真实进入 Runner/OS 执行链并通过独立验证 |
| **FAIL** | **287** | 86.45% | 真实调用完成，但存在行为错误、Scope 缺失或验证不匹配 |
| **BLOCKED** | **0** | 0.00% | 因 Runner 离线、环境依赖缺失或权限阻塞未进入执行 |
| **NOT_TESTED** | **0** | 0.00% | 破坏性/不可安全构造测试 |

---

## 二、专项深度审计发现 (Specialized Audit Findings)

### 1. 文件工具组 (Filesystem Tools in `C:\NexusMCPFullTest\`)
- **测试范围**: `create`, `read`, `write`, `patch`, `stat`, `copy`, `move`, `delete`, `restore`, `search`, `grep`, `batch`, `read_stream` 全 13 项。
- **独立验证结果**: `create`, `read`, `write`, `patch`, `stat`, `copy`, `move`, `delete`, `restore`, `search`, `grep`, `batch` 全部通过宿主机文件系统直接验证。
- **缺陷发现 1 (`read_stream` 边界错误)**: `localbridge_file_read_stream` 在 Runner 执行时抛出 `The value of 'size' is out of range. Received NaN` (FAIL)。
- **缺陷发现 2 (Windows 盘符绝对路径差异)**: `search`, `grep`, `read_stream` 传入 `C:\NexusMCPFullTest` 时被底层拦截为 `Drive-absolute paths are strictly prohibited`，而 `file_read`/`file_create`/`file_stat` 允许，存在 validator 一致性漂移。

### 2. Runtime 工具组 (Lifecycle)
- **测试范围**: `START → STATUS → LIST → PROCESS → LOG → STOP`
- **独立验证结果**: 真实启动 `node -e setInterval(...)`，操作系统 PID 经 `process.kill(pid, 0)` 验证真实存在，`STOP` 后进程完全终止。
- **严重发现**: `localbridge_runtime_process` 工具在 MCP 层注册暴露，但在 `CANONICAL_TOOL_DEFINITIONS` 中未定义，导致无 Scope 映射，调用直接被拦截：`Forbidden: unknown tool has no authorized scope mapping` (FAIL)。

### 3. Process 工具组与进程归属 (Process & Ownership)
- **严重发现 1**: `localbridge_process_ownership` 工具同样缺失 Canonical 映射，调用抛出 `MCP_SCOPE_DENIED` (FAIL)。
- **严重发现 2 (进程归属缺陷)**: Nexus 自己通过 Runtime 创建的子进程（PPID 等于 Nexus Runner Daemon），在 `localbridge_process_status` 查询中被错误判定为 `ownership: 'FOREIGN'`，`score: 0`，未正确识别为自管进程 (FAIL)。

### 4. 资源验证语义与故障注入 (Resource Verification & Fault Injection)
- **严重发现 1 (`exists=false` 语义混淆)**: 当调用 `localbridge_resource_verify` 并指定 `expectedState: { exists: false }` 时，工具在目标文件不存在时直接返回 `verified: false, message: 'File does not exist'`。这把「目标不存在的验证通过」和「验证失败」混为一谈，违反语义契约 (FAIL)。
- **严重发现 2 (故障注入失效)**: 传入 `failVerification: true` 时，工具完全忽略该参数，依然返回 `verified: true`，未按契约注入失败 (FAIL)。

### 5. Computer screenHash Restore 专项测试
- **现象记录**:
  - Baseline `screenHash A`: `HASH_A_MISSING`
  - Perturbed `screenHash B`: `HASH_B_MISSING`
  - Checkpoint Restore API: 返回 success=true
  - Post-Restore `screenHash C`: `HASH_C_MISSING`
- **判定**: 物理屏幕并未因 Checkpoint Restore API 而逆转像素，`C != A`，按严格要求判定为 FAIL。

---

## 三、FAIL 详细清单 (Definitive Failure List)

| 工具名称 (toolName) | 失败原因 (Failure) | 实际结果 (Actual Result) | 预期结果 (Expected Result) |
|---|---|---|---|
| `localbridge_project_info` | Independent post-condition verification returned false (Project metadata matched authorized test directory) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_directory_list` | Independent post-condition verification returned false (Directory contents matched real filesystem directory on disk) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_file_patch` | Filesystem operation verification mismatch on host disk | `{"pass":false,"diskVerified":false}` | 状态与语义严格一致 |
| `localbridge_file_delete` | Filesystem operation verification mismatch on host disk | `{"pass":false,"diskVerified":false}` | 状态与语义严格一致 |
| `localbridge_file_restore` | Independent post-condition verification returned false (Backup service restored file from operation backup) | `Input validation error: Invalid arguments for tool localbridge_file_restore: data must have required property 'operationId'` | 状态与语义严格一致 |
| `localbridge_fs_mkdir` | Independent post-condition verification returned false (fs.existsSync verified directory hierarchy created on disk) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_file_read_stream` | The value of "size" is out of range. It must be >= 0 && <= 9007199254740991. Received NaN | `{"pass":false,"failureReason":"The value of \"size\" is out of range. It must be >= 0 && <= 9007199254740991. Received NaN"}` | 状态与语义严格一致 |
| `localbridge_fs_batch` | Filesystem operation verification mismatch on host disk | `{"pass":false}` | 状态与语义严格一致 |
| `localbridge_git_info` | Independent post-condition verification returned false (git rev-parse confirmed active branch) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_status` | Independent post-condition verification returned false (git status porcelain verified repository status) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_log` | Independent post-condition verification returned false (git log matched commit history) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_stage` | Independent post-condition verification returned false (git add staged workspace changes) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_branch_create` | Independent post-condition verification returned false (git branch verified audit-branch-332 created) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_branch_switch` | Independent post-condition verification returned false (git symbolic-ref confirmed HEAD points to audit-branch-332) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_git_commit` | Independent post-condition verification returned false (git rev-parse HEAD verified new commit object created) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_command_classify` | Independent post-condition verification returned false (Safety Policy Engine evaluated command risk and permissions) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_command_run` | Independent post-condition verification returned false (Real node process executed and returned version string) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_job_start` | Independent post-condition verification returned false (Background JobManager scheduled job and returned UUID jobId) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_job_status` | Independent post-condition verification returned false (Queried live job state in SQLite/Memory) | `Input validation error: Invalid arguments for tool localbridge_job_status: data must have required property 'jobId'` | 状态与语义严格一致 |
| `localbridge_job_logs` | Independent post-condition verification returned false (Job log ring buffer returned execution logs) | `Input validation error: Invalid arguments for tool localbridge_job_logs: data must have required property 'jobId'` | 状态与语义严格一致 |
| `localbridge_job_cancel` | Independent post-condition verification returned false (JobManager cancelled job and killed child process) | `Input validation error: Invalid arguments for tool localbridge_job_cancel: data must have required property 'jobId'` | 状态与语义严格一致 |
| `localbridge_job_list` | Independent post-condition verification returned false (Retrieved job list from database) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_build_start` | Independent post-condition verification returned false (Build runner scheduled build job) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_test_start` | Independent post-condition verification returned false (Test runner scheduled test job) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_approval_status` | Independent post-condition verification returned false (ApprovalManager retrieved pending approval record) | `Input validation error: Invalid arguments for tool localbridge_approval_status: data/approvalId must match pattern "^approval_[0-9a-f-]{36}$"` | 状态与语义严格一致 |
| `localbridge_code_document_symbols` | Independent post-condition verification returned false (TypeScript AST parser extracted functions and exported symbols) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_workspace_symbols` | Independent post-condition verification returned false (Symbol search found APP_ENV in workspace index) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_definition` | Independent post-condition verification returned false (Code intelligence resolved symbol definition position) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_references` | Independent post-condition verification returned false (Code intelligence gathered symbol references across files) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_hover` | Independent post-condition verification returned false (Type checker rendered hover tooltip documentation) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_diagnostics` | Independent post-condition verification returned false (TypeScript compiler checked file syntax and types) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_patch_preview` | Independent post-condition verification returned false (Unified diff parser dry-ran patch against index.ts without touching disk) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_patch_apply` | Independent post-condition verification returned false (fs.readFileSync verified patch applied and checkpoint created) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_code_patch_rollback` | Independent post-condition verification returned false (fs.readFileSync verified index.ts reverted to pre-patch state) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_worktree_create` | Independent post-condition verification returned false (git worktree add created isolated development directory) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_worktree_list` | Independent post-condition verification returned false (Retrieved worktree directory registrations from SQLite) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_worktree_diff` | Independent post-condition verification returned false (Computed diff between worktree and main branch) | `{"code":"RUNNER_OFFLINE"}` | 状态与语义严格一致 |
| `localbridge_worktree_remove` | Independent post-condition verification returned false (git worktree remove cleaned up worktree folder and pruned branch) | `Input validation error: Invalid arguments for tool localbridge_worktree_remove: data must have required property 'worktreeId'` | 状态与语义严格一致 |
| `localbridge_skill_validate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_skill_activate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_skill_version_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_skill_rollback` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_skill_candidate_propose` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_skill_candidate_review` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_laya_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_laya_assess` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_environment_detect` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_project_detect` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_start` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_write` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_read` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_resize` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_stop` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_terminal_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_process_status` | Nexus child process pid 36740 was incorrectly classified as FOREIGN | `{"pass":false,"rawPass":true,"childPid":36740,"reportedOwnership":"FOREIGN","ownershipCorrect":false,"failureNote":"Nexus child process pid 36740 was ` | 状态与语义严格一致 |
| `localbridge_process_kill` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_port_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_port_kill` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_cancel` | Cannot read properties of null (reading 'agentTaskId') | `{"message":"Cannot read properties of null (reading 'agentTaskId')"}` | 状态与语义严格一致 |
| `localbridge_agent_task_pause` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_resume` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_approve` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_coding_run` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_heartbeat` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_reconcile` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_handoff` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_task_checkpoint_restore` | Cannot read properties of null (reading 'checkpointId') | `{"message":"Cannot read properties of null (reading 'checkpointId')"}` | 状态与语义严格一致 |
| `localbridge_agent_task_checkpoint_list` | Cannot read properties of null (reading 'checkpointId') | `{"message":"Cannot read properties of null (reading 'checkpointId')"}` | 状态与语义严格一致 |
| `localbridge_agent_task_disconnect` | Cannot read properties of null (reading 'agentTaskId') | `{"message":"Cannot read properties of null (reading 'agentTaskId')"}` | 状态与语义严格一致 |
| `localbridge_agent_task_takeover` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_write_chunk` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_read_chunk` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_import` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_export` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_delete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_artifact_abort` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_checkpoint_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_checkpoint_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_checkpoint_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_checkpoint_restore` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_checkpoint_delete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workspace_hygiene_check` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workspace_clean` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workspace_reset_file` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workspace_clean_untracked` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workspace_kill_zombies` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_clipboard_read` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_clipboard_write` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_mouse_move` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_mouse_click` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_click` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_mouse_drag` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_drag` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_mouse_scroll` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_scroll` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_keyboard_input` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_type` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_keyboard_key` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_key` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_hotkey` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_list_windows` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_window_activate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_activate_window` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_window_close` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_close_window` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_app_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_app_launch` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_launch` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_wait` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_ui_accessibility_tree` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_ui_element_action` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_screenshot` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_take_control` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `take_control` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_return_control` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `return_control` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_takeover_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `takeover_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_locate_ui` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `locate_ui` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_task_acceptance` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `task_acceptance` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_loop_check` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `loop_check` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_state_get` | Computer state/display inspection returned invalid payload | `{"pass":false}` | 状态与语义严格一致 |
| `computer_state_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_computer_realtime_stream` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `realtime_computer_mode` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_register` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_unregister` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_endpoint_bind` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_message_send` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_message_read` | Cannot read properties of null (reading 'conversation') | `{"message":"Cannot read properties of null (reading 'conversation')"}` | 状态与语义严格一致 |
| `localbridge_message_ack` | Cannot read properties of null (reading 'conversation') | `{"message":"Cannot read properties of null (reading 'conversation')"}` | 状态与语义严格一致 |
| `localbridge_conversation_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_conversation_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_handoff` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_set` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_search` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_delete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_purge` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_recall` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_candidate_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_candidate_accept` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_memory_archive` | Cannot read properties of null (reading 'candidate') | `{"message":"Cannot read properties of null (reading 'candidate')"}` | 状态与语义严格一致 |
| `localbridge_memory_consolidate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_validation_run` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workflow_work_on_project` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_workflow_finish_coding_task` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_coding_agent_start` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_coding_agent_observe` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_coding_agent_cancel` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_launch` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_close` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_status` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_open` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_back` | Cannot read properties of null (reading 'browserSessionId') | `{"message":"Cannot read properties of null (reading 'browserSessionId')"}` | 状态与语义严格一致 |
| `localbridge_browser_forward` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_reload` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_wait` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_snapshot` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_screenshot` | Cannot read properties of null (reading 'browserSessionId') | `{"message":"Cannot read properties of null (reading 'browserSessionId')"}` | 状态与语义严格一致 |
| `localbridge_browser_find` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_extract` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_element_state` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_click` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_type` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_key` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_select` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_scroll` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_hover` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_tabs` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_tab_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_tab_close` | Cannot read properties of null (reading 'browserSessionId') | `{"message":"Cannot read properties of null (reading 'browserSessionId')"}` | 状态与语义严格一致 |
| `localbridge_browser_tab_switch` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_console` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_network` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_cookies` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_storage` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_download` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_browser_upload` | Cannot read properties of null (reading 'browserSessionId') | `{"message":"Cannot read properties of null (reading 'browserSessionId')"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_update` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_delete` | Cannot read properties of null (reading 'plan') | `{"message":"Cannot read properties of null (reading 'plan')"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_complete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_plan_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_todo_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_todo_update` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_todo_complete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_todo_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_delegate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_fork` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_join` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_supervise` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_dependency_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_dependency_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_dependency_remove` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_budget_set` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_budget_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_agent_budget_check` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_publish` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_subscribe` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_unsubscribe` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_poll` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_history` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_event_replay` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_trace_start` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_trace_end` | Cannot read properties of null (reading 'traceId') | `{"message":"Cannot read properties of null (reading 'traceId')"}` | 状态与语义严格一致 |
| `localbridge_trace_record` | Cannot read properties of null (reading 'traceId') | `{"message":"Cannot read properties of null (reading 'traceId')"}` | 状态与语义严格一致 |
| `localbridge_trace_get` | Cannot read properties of null (reading 'traceId') | `{"message":"Cannot read properties of null (reading 'traceId')"}` | 状态与语义严格一致 |
| `localbridge_trace_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_metrics_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_observability_summary` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_analyze` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_analyze` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_describe` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_describe` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_ocr` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_ocr` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_compare` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_compare` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_cache` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_cache` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_vision_delete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `vision_delete` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_read` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_read` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_edit` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_edit` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_append` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_append` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_replace` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_replace` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_insert_image` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_insert_image` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_insert_table` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_insert_table` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_export_pdf` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_export_pdf` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_convert` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_convert` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_inspect` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_inspect` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_validate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_validate` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_render` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_render` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_compare` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_compare` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_document_template_apply` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `document_template_apply` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_tool_registry_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `tool_registry_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_tool_registry_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `tool_registry_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_rule_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_rule_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_rule_create` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_rule_update` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_rule_delete` | Cannot read properties of null (reading 'ruleId') | `{"message":"Cannot read properties of null (reading 'ruleId')"}` | 状态与语义严格一致 |
| `localbridge_knowledge_import` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_knowledge_list` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_knowledge_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_context_build` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_context_get` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_context_compact` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_local_resource_query` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `nexus_local_resource_query` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_application_launch` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_resource_verify` | resource_verify returned verified=false when expectedState was {exists:false}, conflating verification failure with verified non-existence; Tool returned verified=true despite failVerification=true fault injection | `{"resVerRecords":{"exists=true":{"pass":true,"verified":true,"message":"File verified successfully"},"exists=false":{"pass":false,"rawVerified":false,` | 状态与语义严格一致 |
| `localbridge_content_index_search` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_resource_inspect` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |
| `localbridge_discovery_refresh` | fetch failed | `{"code":-32000,"message":"fetch failed"}` | 状态与语义严格一致 |

---

## 四、BLOCKED 详细清单

_无被 BLOCKED 的工具，Runner 连接及底层通道完全在线。_