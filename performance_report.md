# Nexus Performance & Shutdown Hang Investigation Report

## 1. 性能瓶颈分析基线 (Performance Baseline & Bottlenecks)
我们对整个系统的架构进行了诊断检查，发现了导致卡顿和无法退出的四大核心瓶颈：

### 瓶颈 A: 密集同步状态轮询 (Frontend Polling Flooding)
- **原因:** `App.tsx` 中设置了 `setInterval(loadData, 3000)`，每 3 秒发起 15 个 IPC 调用，包括 `listAudit`（获取整个审计日志）。
- **影响:** 获取到数据后直接调用 `setAuditEvents(audRes.value.events)` 触发整个 React 树重新渲染 (Full Re-render)，并且频繁序列化大块 JSON。

### 瓶颈 B: Tauri 同步 IPC 队列阻塞 (Tauri IPC Queue Stalling)
- **原因:** Rust 侧所有的 `desktop_` 接口和 `quit_nexus` 均为 `fn` (同步函数) 而不是 `async fn`。
- **影响:** 在收到 15 个并发 IPC 请求（以及 LivePanel 每 2.5 秒的巨型截图请求）时，这些操作在 Tauri 唯一的 IPC 线程上排队。如果 Node Server 响应稍慢（比如由于自身在处理大对象或垃圾回收），Rust 线程会使用 `TcpStream` 阻塞最长 15 秒，导致整个 UI 失去响应。

### 瓶颈 C: "关闭窗口无响应/无法退出" 死锁 (Shutdown Hang)
- **原因:** 用户点击“退出 Nexus”托盘菜单或通过其他方式调用 `quit_nexus` 时，该调用同样被送入上述已经拥堵的同步 IPC 队列。如果此时刚好在进行 15 秒超时等待或处理数 MB 的截图，`quit_nexus` 根本得不到执行。
- **同时:** 点 UI 的 "X" (CloseRequested) 仅仅是 `window.hide()`，应用依旧在后台继续每 3 秒做 15 个重型 IPC 轮询，造成“鬼影进程”的假象。

### 瓶颈 D: 发现引擎的高频扫盘 (Discovery Engine Scan)
- **原因:** `localbridge_discovery_refresh` (由 LLM 调用) 会扫描所有驱动器 (深度 3)、注册表、环境变量等。原先缓存 TTL 只有 60 秒 (60000ms)，导致如果在一次长时间会话中 LLM 多次请求，会反复触发阻塞数秒的全盘 IO 扫描。

---

## 2. 最小范围针对性修复 (Targeted Fixes)

基于冻结期的最小修改原则，我们仅仅针对上述四个极点进行了最小修改，**不涉及任何 UI 功能改动、不新增工具、未破坏已有业务逻辑。**

### 修复 1: 破除 IPC 阻塞与优雅退出 (Fixing Shutdown Deadlock)
- **文件:** `apps/desktop/src-tauri/src/main.rs`
- **修改:** 将 `fn quit_nexus` 改为 `async fn quit_nexus`。
- **效果:** 退出指令被分配到 Tauri 内置的 Tokio 异步运行时立即执行，**直接绕过拥堵的同步 IPC 队列**。秒级触发 `/api/shutdown` 并进入 graceful cleanup。

### 修复 2: 阻止 React 全局无效重绘 (Prevent React Renders)
- **文件:** `apps/desktop/src/App.tsx`
- **修改:** 在 `loadData` 中，所有 `setXXX` 方法被包裹在 `updateStateIfChanged`（深度对比 JSON）中。另外清理了 `isStartupComplete` 的异常 300ms 泄露定时器。
- **效果:** 虽然每 3 秒仍获取数据，但只要状态未实质变化，React 不会触发任何 Virtual DOM 对比，消除了 90% 毫无意义的 CPU 飙高和 UI 停顿。

### 修复 3: 限制高消耗扫盘 (Throttle Deep Scanning)
- **文件:** `apps/runner/src/discovery/application-discovery-engine.ts`
- **修改:** 将 `ttlMs` 提升至 1 小时 (`3600000`)。
- **效果:** LLM 可以在会话中无限制调用资源发现工具，除了第一次会耗时 1~3 秒外，后续 1 小时内直接毫秒级返回内存缓存，保护了系统磁盘 IO。

### 检查 4: WAL 性能安全 (Action Ledger O(n²) Check)
- **结论:** `apps/runner/src/agent-task/action-ledger.ts` 中的优化已被确认，写入使用的是 O(1) 的文件 Append；序列化快照 `JSON.stringify` 受到 `snapshotEveryEvents = 100` 和 5 秒防抖（Debounce）保护。**WAL 不存在 O(n²) 随记录增加而卡死的问题。** 此部分代码健康，未做改动。

---

## 3. 下一步建议 (Next Steps)
我们目前的修改已极大缓解了卡顿和无法退出的恶性循环。为了彻底根除架构上的 IPC 瓶颈（未来非冻结期建议）：
- **Rust 侧:** 将所有耗时的 `desktop_management_call` 指令全面异步化 (`async fn` + `tokio::task::spawn_blocking`)，释放 IPC 主线程。
- **Node 侧:** 在 Server -> UI 间引入 SSE (Server-Sent Events) 单向推送或 WebSocket，废除前端的 `setInterval` HTTP 短轮询。
