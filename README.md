# Nexus

<p align="center">
  <b>Dedicated Local AI Control Plane for ChatGPT & Anthropic Claude</b><br>
  <i>Powered by the LocalBridge 332 Canonical MCP Tool Architecture & Durable Action Ledger</i>
</p>

<p align="center">
  <a href="#english"><b>English</b></a> | <a href="#简体中文"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/tag/v1.2.0"><img src="https://img.shields.io/badge/version-1.20.0_(v1.2.0)-blue.svg" alt="Version 1.20.0"></a>
  <img src="https://img.shields.io/badge/MCP_Tools-332_Canonical-success.svg" alt="332 MCP Tools">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-red.svg" alt="License AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg" alt="Platforms">
  <img src="https://img.shields.io/badge/tests-190%2B_suites_%7C_1200%2B_tests-purple.svg" alt="Tests">
</p>

---

<a name="english"></a>
## English

### 1. Overview

**Nexus** is an enterprise-grade Local AI Control Plane designed specifically for ChatGPT, Anthropic Claude, and modern AI coding assistants. It securely bridges remote LLMs to your local workstation through a high-performance **Secure MCP Tunnel** (Streamable HTTP / SSE with OAuth 2.0 & Bearer tokens).

Nexus allows AI agents to inspect, edit, build, debug, and orchestrate complex local engineering workflows within strictly enforced sandbox boundaries—without exposing your full filesystem or transmitting proprietary code to untrusted cloud intermediaries.

```text
 ChatGPT / Claude Desktop / Cursor
               │
               │ Secure MCP Tunnel (Streamable HTTP / SSE, Bearer lb_xxx, OAuth 2.0)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus Desktop Control Center (Tauri 2)               │
│                                                                        │
│  Fastify MCP & REST API Server (Port 18080)   SQLite Persistence (WAL) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Bidirectional JSON-RPC 2.0 (WebSocket)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus Local Runner Daemon                            │
│                                                                        │
│  ├── 332 Canonical MCP Tools Across 24 Capabilities                    │
│  ├── Action Ledger WAL (Crash Recovery & Idempotent Replay)            │
│  ├── Native Windows Computer Use (WinRT OCR, UI Automation)            │
│  ├── Sandboxed Workspaces & Managed Git Worktrees                      │
│  ├── Persistent Development Runtimes & Windows Job Objects             │
│  ├── Language Server Protocol (LSP - TypeScript / Python)              │
│  ├── Headless & Interactive Browser Automation Engine                  │
│  └── Local Intelligence Store (Memory, Rules, Knowledge, Prompts)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Core Capabilities & Architectural Highlights

#### 1. 332 Canonical MCP Tools
- **Single Source of Truth**: All 332 tools are formally defined in `@localbridge/protocol`, with strict input schemas, risk ratings, and automated evidence tracking.
- **Zero Hallucination Guarantee**: Covers 24 capability dimensions: Filesystem, Advanced FS, Git Operations, Command Execution, Persistent Background Jobs, LSP Code Intelligence, Managed Worktrees, Browser Automation, Windows Computer Use, Vision Analysis, Document Engineering, Local Intelligence (Memory/Rules/Knowledge), Agent Orchestration, and System Discovery.

#### 2. ACID-Compliant Action Ledger WAL
- **Write-Ahead Logging**: Every critical tool execution is recorded in a write-ahead log (`.wal`) prior to side-effect application.
- **Crash Recovery & State Replay**: Automatically recovers pending operations and restores consistent workspace states after host reboot or runner crashes.
- **Idempotency Guard**: Eliminates duplicate execution and resource waste during intermittent network reconnections.

#### 3. Native Windows Computer Use & Vision
- **Semantic UI Locating**: Combines WinRT Native OCR and UI Accessibility trees to locate screen elements without relying on fragile pixel coordinates.
- **Multi-Monitor Control**: Window switching, foregrounding, mouse tracking, drag-and-drop, and keystroke dispatching with non-bypassable human takeover controls.
- **Visual Validation**: Screenshot capture, image comparison, and difference inspection for automated UI testing.

#### 4. Durable Execution & Process Isolation
- **Windows Job Objects**: Enforces hard process hierarchy isolation, CPU quotas, and memory caps on spawned commands.
- **Terminal Daemon (node-pty)**: Stateful pseudo-terminal sessions with ANSI log streaming and exit code tracking.
- **Command Risk Engine**: AST-based command classification (`SAFE`, `CAUTION`, `DANGEROUS`) that blocks destructive system calls (`rm -rf /`, `format`, `reg delete`) by default.

#### 5. Local Intelligence Store
- **Vectorless & Vector Hybrid**: SQLite-backed fast exact-match and semantic retrieval for persistent project memory, team rules, knowledge documentation, and custom prompt templates.
- **Context Compactor**: Automatic token reduction and conversational compaction for extended multi-turn agent tasks.
- **Extensible Skills Engine**: Declarative deterministic workflows with dynamic candidate proposal, automated validation, and live hot-reloading.

#### 6. Multi-Tier Path Sandbox & Enterprise Security
- **Physical Canonical Containment**: Enforces containment inside authorized project roots via `fs.realpathSync.native` to eliminate directory traversal (`../`) and prefix-confusion attacks.
- **Symlink & Junction Escape Shield**: Blocks malicious symlinks and Windows NTFS directory junctions pointing outside project boundaries.
- **Dual Token Cryptographic Isolation**: MCP client tokens (`lb_...`) and Runner daemon tokens (`lbr_...`) are generated with 256-bit entropy and stored exclusively as SHA-256 hashes. Timing side-channel attacks are mitigated via `crypto.timingSafeEqual`.
- **Sensitive File Shield**: Automatically masks `.env*`, `*.pem`, `*.key`, `id_rsa`, `.git`, and cloud credentials.

---

### 3. Monorepo Project Layout

```text
Nexus-Web-ChatGPT/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite Desktop Control Center
│   ├── runner/           # Local execution daemon (332 tools, Action Ledger, Computer Use)
│   ├── server/           # Fastify MCP Server with SQLite WAL persistence & REST API
│   └── bridge/           # Standalone Nexus MCP Bridge (OAuth 2.0 / Gemini / ChatGPT)
├── packages/
│   ├── protocol/         # Pure protocol types, 332 Canonical tool definitions, RPC schemas
│   ├── security/         # Sandboxing, path verification, and command risk engine
│   └── shared/           # Structured logger (Pino), config loader, crypto utilities
├── tests/                # Comprehensive test suites (190+ suites, 1200+ tests)
├── docs/                 # Architectural specifications, security models, and guides
├── artifacts/            # Production truth evidence, capability matrices, and audit ledgers
└── scripts/              # Build automation, bundling tools, and release scripts
```

---

### 4. Quick Start

#### Option A: Desktop Installer (Recommended)
1. Download the pre-built installer for your platform from [GitHub Releases (v1.2.0)](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/tag/v1.2.0):
   - **Windows (x64 NSIS Setup)**: [`Nexus_1.2.0_x64-setup.exe`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.2.0_x64-setup.exe) (or [`Nexus_1.20.0_x64-setup.exe`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_x64-setup.exe))
   - **macOS (Apple Silicon DMG)**: [`Nexus_1.2.0_aarch64.dmg`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.2.0_aarch64.dmg)
   - **Linux (Debian/Ubuntu `.deb`)**: [`Nexus_1.20.0_amd64.deb`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_amd64.deb)
   - **Linux (Universal `.AppImage`)**: [`Nexus_1.20.0_amd64.AppImage`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_amd64.AppImage)
2. Run the installer. Nexus launches in the system tray with a self-contained Node.js runtime, bundled Language Server, and background execution daemon ready out of the box.

#### Option B: Build & Run from Source
Prerequisites: **Node.js >= 24**, **pnpm >= 10**, **Rust stable**.

```powershell
# 1. Clone the repository
git clone https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT.git
cd Nexus-Web-ChatGPT

# 2. Install workspace dependencies
pnpm install

# 3. Build core packages and applications
pnpm run build

# 4. Launch Desktop Control Center
pnpm --filter @localbridge/desktop dev
```

---

### 5. Connecting AI Clients

#### Step 1: Authorize a Local Project
1. Open Nexus Desktop Control Center.
2. Under **Workspace -> Projects**, click **Authorize Project** and select your directory (e.g., `D:\projects\my-app`).
3. Set **Access Mode** (`read-only` or `read-write`) and **Execution Mode** (`disabled`, `safe-only`, or `project-code`)—both can be dynamically switched at any time without restarting.

#### Step 2: Generate an MCP Client Token
1. Go to **Settings -> Tokens**.
2. Click **Generate Token**, choose `MCP Client Token` (`lb_...`), and copy the displayed token.

#### Step 3: Configure Your AI Client

**ChatGPT / Custom GPT Actions**:
Add the Streamable HTTP endpoint:
```text
http://127.0.0.1:18080/mcp
```
Header: `Authorization: Bearer lb_your_token_here`

**Claude Desktop (`claude_desktop_config.json`)**:
```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["<path-to-nexus>/apps/desktop/src-tauri/resources/bridge/index.js"],
      "env": {
        "NEXUS_ENDPOINT": "http://127.0.0.1:18080/mcp",
        "NEXUS_TOKEN": "lb_your_token_here"
      }
    }
  }
}
```

**Cursor / Windsurf / Any MCP Client**:
- Transport: `Streamable HTTP` or `SSE`
- URL: `http://127.0.0.1:18080/mcp`
- Headers: `{"Authorization": "Bearer lb_your_token_here"}`

---

### 6. Development & Quality Verification

```powershell
# Typecheck across all 7 workspace packages (0 errors)
pnpm run typecheck

# Build all packages, bundles, and Tauri resources
pnpm run build

# Run the test suite
pnpm run test

# Run Rust desktop check
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

### 7. License, Anti-Rebranding & Security Disclaimer

- **License ([GNU AGPL-3.0](LICENSE))**: This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)** with **Section 7 Additional Terms**.
  - Any modification, derivative work, packaged installer, or network-hosted service interacting with users **must disclose its complete corresponding source code** under the same AGPL-3.0 license.
  - **Anti-Rebranding & Attribution (AGPL-3.0 Section 7)**: Removing or obscuring original copyright notices, author credits, or license disclosures in the UI, tray menu, CLI, or About dialogs—or misrepresenting a repackaged version as an original proprietary commercial product ("skinning / rebranding")—is strictly prohibited and terminates license rights immediately.
- **Security & Unrestricted Mode Disclaimer ([SECURITY.md](SECURITY.md))**:
  - By default, Nexus enforces strict path sandboxing (`read-only`) and AST command risk filtering (`safe-only`).
  - If you explicitly enable `read-write`, `project-code`, Computer Use UI automation, or **Unrestricted / Full-Control Mode**, you assume full responsibility for all commands executed and files modified by connected AI models. Always back up critical work or use Git version control.

---

<a name="简体中文"></a>
## 简体中文

### 1. 项目概述

**Nexus** 是一套专为 ChatGPT、Anthropic Claude 及新一代 AI 编程智能体量身打造的企业级**本地 AI 控制中枢（Local AI Control Plane）**。它通过高性能**安全 MCP 隧道**（基于 OAuth 2.0 与 Bearer 令牌的 Streamable HTTP / SSE 协议），将远端大模型安全连接至开发者的本地工作站。

Nexus 赋予 AI 智能体在严格沙箱边界内检索、编辑、构建、测试与编排完整研发工作流的能力，从根本上杜绝整盘泄露风险，且绝不将私有源码转传给任何不可信第三方云端中继。

```text
 ChatGPT / Claude Desktop / Cursor 客户端
               │
               │ 安全 MCP 隧道 (Streamable HTTP / SSE, Bearer lb_xxx, OAuth 2.0)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus 桌面控制中心 (Tauri 2 + React)                 │
│                                                                        │
│  Fastify MCP & REST 核心服务 (Port 18080)    SQLite 持久化引擎 (WAL)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ 双向强类型 JSON-RPC 2.0 (WebSocket)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Nexus 本地执行守护进程 (Runner Daemon)               │
│                                                                        │
│  ├── 332 项规范 MCP 工具 (覆盖 24 类工程与智能能力)                    │
│  ├── Action Ledger 事务日志 (WAL 崩溃恢复与幂等安全跳过)               │
│  ├── 原生 Windows Computer Use (WinRT OCR, UI 自动化定位)              │
│  ├── 沙箱隔离工作区与 Git Managed Worktree (独立分支隔离开发)          │
│  ├── 长稳持久开发运行时 (Persistent Runtime & Windows Job Object)       │
│  ├── 语言服务器协议 (LSP - TypeScript / Python 代码智能)               │
│  ├── 无头及交互式浏览器自动化引擎 (Deep Research 深度调研)             │
│  └── 本地智能知识中枢 (记忆库、全局规则、知识库、提示词库)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. 核心技术支柱与特性

#### 1. 332 项规范 MCP 工具（Canonical Tools）
- **唯一真值源定义**：全量 332 项工具统一定义于 `@localbridge/protocol`，具备严格的 Zod Schema 校验、权限分级和执行证据链。
- **全方位工程覆盖**：涵盖文件系统、高级文件操作、Git 版本控制、命令安全执行、后台长稳作业、LSP 代码智能、Worktree 隔离、浏览器自动化、Windows 桌面控制（Computer Use）、图像视觉分析、多格式文档处理、本地记忆知识库、任务规划编排与系统环境发现等 24 个维度。

#### 2. ACID 级 Action Ledger 事务账本
- **预写式日志（WAL）**：所有对文件系统或外部状态产生副作用的操作均在预写日志落盘后执行。
- **崩溃自动恢复与重放**：守护进程异常终止或系统断电重启后，系统能够检测未提交事务并实现一致性回滚或安全重试。
- **幂等性防护机制**：自动识别重复指令，防止在弱网重连时造成重复执行。

#### 3. 原生 Windows Computer Use 桌面接管与视觉感知
- **语义级 UI 定位**：深度融合 WinRT 原生 OCR 与 Windows UI 辅助功能树（Accessibility Tree），摆脱脆弱的绝对像素坐标定位。
- **完整人机交互**：窗口激活与置顶、鼠标平滑移动、拖拽交互、键盘按键派发，配备桌面一键紧急熔断机制。
- **视觉对比与判定**：支持截屏捕获、图像差异比对，为桌面自动化操作提供真实反馈。

#### 4. 长稳执行与企业级进程隔离
- **Windows Job Object 隔离**：子进程与作业严格挂载至 Windows 作业对象，精确限制 CPU 配额与内存上限，防止僵尸进程驻留。
- **全状态终端会话（node-pty）**：提供原生伪终端会话，支持 ANSI 实时日志流式推送与退出码追踪。
- **AST 语法级命令风控**：将命令划分为 `SAFE`（安全）、`CAUTION`（注意）、`DANGEROUS`（危险）三级，默认拦截 `rm -rf /`、`format`、`reg delete` 等破坏性指令。

#### 5. 本地智能知识中枢（Local Intelligence Store）
- **混合检索能力**：基于 SQLite 构建持久化记忆库、工程规则库、技术知识库与提示词模板，支持超低延迟精确检索。
- **上下文压缩器（Context Compactor）**：智能识别关键实体与上下文摘要，在多轮高负荷对话下大幅降低 Token 消耗。
- **技能引擎（Skills System）**：支持确定性声明式工作流、动态候选技能提议、自动化验证与热重载。

#### 6. 多层沙箱与企业级安全护栏
- **物理规范路径包含**：借助 `fs.realpathSync.native` 解析真实路径，彻底阻断跨目录遍历（`../`）与前缀混淆攻击。
- **符号链接与 Junction 逃逸防御**：拦截指向受控目录外的软链接与 Windows 目录连接点（NTFS Junction）。
- **双令牌密码学隔离**：MCP 客户端令牌（`lb_...`）与 Runner 令牌（`lbr_...`）采用 256 位熵生成，仅以 SHA-256 哈希存储；比对均使用恒定时间比较（`crypto.timingSafeEqual`），防止时序侧信道反推。
- **敏感凭证智能屏蔽**：默认拦截并隐藏 `.env*`、`*.pem`、`*.key`、`id_rsa`、`.git` 及各类云平台凭据文件。

---

### 3. 代码仓库结构

```text
Nexus-Web-ChatGPT/
├── apps/
│   ├── desktop/          # Tauri 2 + React + Vite 桌面控制中心
│   ├── runner/           # 本地执行守护进程（332 工具集、Action Ledger、Computer Use）
│   ├── server/           # Fastify MCP 服务端（SQLite WAL 持久化 & REST API）
│   └── bridge/           # Nexus MCP 独立网桥（兼容 OAuth 2.0 / Gemini / ChatGPT）
├── packages/
│   ├── protocol/         # 纯协议类型层、332 工具规范定义、RPC JSON-Schema
│   ├── security/         # 沙箱隔离防护、路径规范化验证、命令风控引擎
│   └── shared/           # 结构化日志（Pino）、配置解析、密码学工具库
├── tests/                # 自动化测试矩阵（190+ 模块，1200+ 项测试）
├── docs/                 # 架构设计规范、安全模型与协议文档
├── artifacts/            # 生产真值审计凭据、能力矩阵与证据账本
└── scripts/              # 构建编译、依赖捆绑与版本打包脚本
```

---

### 4. 快速上手

#### 方式 A：使用桌面端安装包（推荐）
1. 从 [GitHub Releases (v1.2.0)](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/tag/v1.2.0) 下载对应平台的最新安装包：
   - **Windows (x64 NSIS 安装程序)**：[`Nexus_1.2.0_x64-setup.exe`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.2.0_x64-setup.exe)（或 [`Nexus_1.20.0_x64-setup.exe`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_x64-setup.exe)）
   - **macOS (Apple Silicon DMG)**：[`Nexus_1.2.0_aarch64.dmg`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.2.0_aarch64.dmg)
   - **Linux (Debian/Ubuntu `.deb`)**：[`Nexus_1.20.0_amd64.deb`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_amd64.deb)
   - **Linux (通用 `.AppImage`)**：[`Nexus_1.20.0_amd64.AppImage`](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/download/v1.2.0/Nexus_1.20.0_amd64.AppImage)
2. 双击安装。Nexus 随系统托盘启动，内置自包含 Node.js 运行时、语言服务器和后台执行守护进程，开箱即用。

#### 方式 B：从源码编译与启动
环境要求：**Node.js >= 24**、**pnpm >= 10**、**Rust stable**。

```powershell
# 1. 克隆代码仓库
git clone https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT.git
cd Nexus-Web-ChatGPT

# 2. 安装项目依赖
pnpm install

# 3. 编译协议包与各子项目
pnpm run build

# 4. 启动桌面控制中心
pnpm --filter @localbridge/desktop dev
```

---

### 5. 接入 AI 客户端

#### 步骤 1：授权本地工程项目
1. 打开 Nexus 桌面端。
2. 进入 **工作区 -> 项目管理**，点击 **授权项目** 并选择本地文件夹（如 `D:\projects\my-app`）。
3. 配置 **访问模式**（只读 `read-only` 或 读写 `read-write`）与 **执行模式**（禁用 `disabled`、仅安全命令 `safe-only` 或 完整工程代码 `project-code`），支持在运行期随时二次切换，立即生效。

#### 步骤 2：生成 MCP 访问令牌
1. 进入 **设置 -> 访问令牌**。
2. 点击 **生成令牌**，选择 `MCP 客户端令牌`（`lb_...`），复制显示的凭据。

#### 步骤 3：在 AI 工具中配置

**ChatGPT / 自定义 GPT Actions**：
添加 Streamable HTTP 接口：
```text
http://127.0.0.1:18080/mcp
```
Header 添加：`Authorization: Bearer lb_your_token_here`

**Claude Desktop（`claude_desktop_config.json`）**：
```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["<path-to-nexus>/apps/desktop/src-tauri/resources/bridge/index.js"],
      "env": {
        "NEXUS_ENDPOINT": "http://127.0.0.1:18080/mcp",
        "NEXUS_TOKEN": "lb_your_token_here"
      }
    }
  }
}
```

**Cursor / Windsurf / 通用 MCP 客户端**：
- 传输类型：`Streamable HTTP` 或 `SSE`
- 请求地址：`http://127.0.0.1:18080/mcp`
- 标头参数：`{"Authorization": "Bearer lb_your_token_here"}`

---

### 6. 质量保障与验证指令

```powershell
# 全局 7 个工作区强类型校验（0 错误）
pnpm run typecheck

# 构建各端产物、自包含资源与独立启动器
pnpm run build

# 运行自动化测试套件
pnpm run test

# 验证桌面 Rust 端编译状态
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

### 7. 开源许可证、防商业换皮条款与安全免责声明

- **开源协议（[GNU AGPL-3.0](LICENSE)）**：本项目基于 **GNU Affero General Public License v3.0 (AGPL-3.0-only)** 协议开源，并附带 **第 7 条附加条款（Section 7 Additional Terms）**：
  - **强制开源传染**：任何基于本项目的修改版本、衍生作品、二次打包安装包或通过网络（包括 SaaS / 远程 MCP 托管服务）向用户提供服务的系统，**必须以相同的 AGPL-3.0 协议完整公开其全部源代码**。
  - **防商业换皮与署名保留（AGPL-3.0 第 7 条）**：严禁移除、隐藏或篡改桌面端界面、托盘菜单、命令行工具及关于页面中的原始版权声明、作者署名与开源许可证标识；严禁将修改或重打包版本伪装为闭源原创商业产品进行售卖或分发（即“商业换皮”）。违反上述条款将立即自动终止协议授予的一切许可权利。
  - 若需用于闭源商业分发或 OEM 集成，请联系项目维护者获取独立的商业授权许可。
- **安全架构与无限制模式免责声明（[SECURITY.md](SECURITY.md)）**：
  - Nexus 默认启用严格物理路径沙箱（只读 `read-only`）与 AST 命令风控拦截（仅安全命令 `safe-only`）。
  - 当用户主动开启读写模式（`read-write`）、工程代码执行（`project-code`）、桌面 UI 自动化（Computer Use）或 **无限制完全控制模式（Unrestricted Mode）** 时，即视为用户本人显式授权 AI 智能体在对应权限边界内执行本地指令与修改文件。由此产生的任何系统变更、数据修改或命令执行后果由用户自行承担，重要工程请务必做好 Git 版本管理与数据备份。

