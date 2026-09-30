#!/usr/bin/env node
/**
 * Nexus 开源推广一键发布助手 (API 直发 + 浏览器预填 + 剪贴板自动同步)
 * 用法:
 *   node scripts/promote-publish.mjs            # 启动交互式一键发布菜单
 *   node scripts/promote-publish.mjs --all-en   # 一键打开海外核心平台并同步英文文案
 *   node scripts/promote-publish.mjs --all-zh   # 一键打开中文核心平台并同步中文文案
 *   node scripts/promote-publish.mjs --devto    # 使用 DEVTO_API_KEY 全自动通过 API 发布到 DEV.to
 */

import { spawnSync, exec } from 'node:child_process';
import readline from 'node:readline';

const REPO_URL = 'https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT';
const RELEASE_URL = 'https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/releases/tag/v1.20.0';

// ============================================================================
// 1. 各平台定制化高转化文案库 (聚焦 ChatGPT 网页官网 chatgpt.com)
// ============================================================================

const POSTS = {
  zh_community: {
    title: '开源了 Nexus：让网页版 ChatGPT (chatgpt.com) 直接接管你的本地代码库与桌面（内置 332 个工具 + 沙箱权限控制）',
    tags: 'ChatGPT, AI编程, 开源项目, MCP, Tauri',
    body: `大家好，最近把打磨了很久的开源项目 **Nexus** 正式整理发布了 v1.20 版本，分享给平时重度使用 **ChatGPT 网页官网（chatgpt.com）** 写代码、查问题、跑任务的朋友。

🔗 **GitHub 仓库**：${REPO_URL}
📦 **安装包直装（Windows / macOS / Linux）**：${RELEASE_URL}

---

### 💡 为什么要做 Nexus？

很多开发者订阅了 ChatGPT Plus / Pro / Team，平时最习惯在 **ChatGPT 网页官网** 里聊架构、写代码、推演逻辑。但网页版一直有几个非常割裂的痛点：
1. **浏览器与本地环境完全割裂**：网页版 ChatGPT 聊方案很强，但没法直接看你的本地目录结构、改代码、跑测试、看 Git Diff，只能苦哈哈地手动复制粘贴。
2. **安全边界与权限难把控**：如果直接给 AI 裸奔的本地脚本权限，又担心它误删文件或执行高危命令；而且完全看不清它在后台干了什么。
3. **连接不稳定、断连丢状态**：普通网页桥接方案经常因为网络波动断连，导致执行到一半的任务状态全丢。

为了彻底打通“最后一公里”，我开发了 **Nexus —— 专为 ChatGPT 网页官网打造的本地 AI 控制中枢（Local AI Control Plane）**。

---

### ✨ 核心亮点

1. **专为 ChatGPT 网页版打通，内置 332 项规范工具**
   基于 **Tauri 2 + Rust + React** 打造的桌面控制中心，安装即自带独立运行时，直接赋能网页版 ChatGPT **24 大本地工程能力**：
   - 本地文件系统检索、AST 级代码分析与精准局部修改
   - Git 版本管理与 **Managed Worktree（隔离分支安全开发）**
   - 持久终端会话（\`node-pty\`）与后台长稳任务执行
   - 内置 **LSP 语言服务**（TypeScript / Python 符号跳转与诊断）
   - 本地浏览器自动化 + **原生 Windows Computer Use**（结合 WinRT OCR 与 UI 树直接操作桌面软件）
   - 本地记忆库（Memory）、全局规则（Rules）与知识库（Knowledge）

2. **细粒度动态权限沙箱（随时一键切换，无需重启）**
   每个本地项目文件夹都可以独立授权，并在桌面控制面板中随时动态切换权限：
   - **访问模式**：\`只读 (read-only)\` / \`读写 (read-write)\`
   - **执行模式**：\`禁用执行 (disabled)\` / \`仅安全命令 (safe-only)\` / \`完整工程代码 (project-code)\`
   - **多层安全护栏**：底层通过物理规范路径校验阻断 \`../\` 越权与软链接逃逸；内置 AST 命令风控引擎自动拦截 \`rm -rf /\`、\`format\` 等破坏性指令；默认屏蔽 \`.env\`、\`*.key\`、\`id_rsa\` 等敏感文件。

3. **ACID 级 Action Ledger（预写式事务账本）**
   网页版 ChatGPT 发起的每一次工具调用与文件修改都会先写入本地 WAL 账本。桌面端可实时查看每一步操作轨迹与耗时，遇到网络抖动或断连重连也能保证幂等恢复。

---

### 🗺️ 当前支持与后续规划

- **当前版本（v1.20）**：深度适配 **ChatGPT 网页官网（chatgpt.com）**。
- **后续 Roadmap**：后续版本将陆续适配更多 AI 平台与客户端生态。

---

### 🚀 快速体验

可以直接在 [GitHub Releases](${RELEASE_URL}) 下载打包好的桌面端安装程序（支持 Windows \`.exe\`、macOS \`.dmg\`、Linux \`.deb\` / \`.AppImage\`），也可以直接 Clone 源码编译。

项目采用 **AGPL-3.0** 协议开源。如果觉得对你的 ChatGPT 工作流有帮助，欢迎点个 ⭐ **Star** 支持一下！有任何 Bug 或建议也欢迎提 Issue 交流。`
  },

  zh_short: {
    title: '开源了！让网页版 ChatGPT 直接接管你的本地电脑和代码库 🚀',
    body: `平时用 ChatGPT 网页官网写代码，还在把代码一段段复制进浏览器、改完再手动粘回本地编辑器吗？😭

这几个月我肝了一个开源桌面工具 —— 「Nexus」，专门给 ChatGPT 网页官网（chatgpt.com）装上本地“手脚”，直接把它变成你的本地全能 AI 工程师！💻✨

🔥 它能给网页版 ChatGPT 带来什么？
✅ 告别复制粘贴：直接授权本地项目文件夹，让网页版 ChatGPT 自己读目录、改代码、跑终端测试、看 Git 记录。
✅ 内置 332 个本地工具：文件读写、LSP 代码诊断、Git Worktree 分支隔离、浏览器检索，甚至通过原生 OCR 直接操作你的 Windows 桌面！
✅ 安全感拉满的权限开关：Tauri 2 桌面控制中心，每个项目随时切换「只读 / 读写」和「禁用命令 / 仅安全命令 / 工程执行」，AI 的每一步操作都有实时审计日志，绝不怕乱删文件。
✅ 内置本地记忆与规则库：让网页版 ChatGPT 真正记住你的项目规范和代码习惯。

（注：目前版本专门针对 ChatGPT 网页官网深度打磨，其他平台后续版本会陆续支持～）

🎁 完全免费开源，提供 Windows / macOS / Linux 安装包直装！
🔗 GitHub 开源地址：${REPO_URL}

觉得有用的话欢迎去 GitHub 点个 Star ⭐️ 鼓励一下！
#ChatGPT #AI编程 #开源项目 #程序员效率工具 #独立开发 #人工智能`
  },

  zh_weekly_issue: {
    title: '自荐开源项目：Nexus —— 让网页版 ChatGPT 直接安全接管本地工程与桌面的控制中枢',
    body: `### 项目名称
**Nexus** — 专为 ChatGPT 网页官网打造的本地 AI 控制中枢（Local AI Control Plane）

### 项目地址
- **GitHub 仓库**：${REPO_URL}
- **Release 安装包（Win / Mac / Linux）**：${RELEASE_URL}

### 一句话简介
告别在 ChatGPT 网页端与本地编辑器之间来回复制粘贴——基于 Tauri 2 + Rust 打造的本地 AI 控制中枢，内置 332 项本地工具与动态权限沙箱，让网页版 ChatGPT 安全读写本地代码、执行终端命令与自动化操作桌面。

### 核心亮点
1. **开箱即用**：提供自包含桌面端安装程序（Windows / macOS / Linux），内置 332 项标准工具（涵盖文件读写、AST 分析、Git Worktree 隔离分支、持久终端、内置 LSP 语言服务、浏览器自动化与 Windows 原生 OCR 桌面控制）。
2. **动态项目级安全沙箱**：支持在桌面 GUI 中随时一键切换每个项目的「只读 / 读写」与「禁用命令 / 仅安全命令 / 工程代码执行」权限，内置 AST 命令风控拦截高危指令。
3. **ACID 预写式事务账本（Action Ledger WAL）**：全量记录 AI 的每一步本地操作轨迹，支持断连重放与崩溃恢复。`
  },

  en_long: {
    title: 'I built Nexus, an open-source desktop control plane that bridges ChatGPT Web (chatgpt.com) to your local codebase with 332 sandboxed tools',
    hnTitle: 'Show HN: Nexus – Local AI Control Plane bridging ChatGPT Web to local codebases',
    tags: ['chatgpt', 'ai', 'opensource', 'rust'],
    body: `Hey everyone,

If you use **ChatGPT on the web (\`chatgpt.com\`)** for coding and system tasks, you know the pain: endless copy-pasting between browser tabs and your editor, no direct access to your local file tree or terminal, and zero visibility into how changes actually run locally.

Over the past few months I’ve been building **Nexus**, an open-source **Local AI Control Plane** purpose-built for **ChatGPT Web** (with support for additional AI platforms planned for future releases). Today I’m releasing **v1.20.0** under AGPL-3.0.

🔗 **GitHub Repo**: ${REPO_URL}
📦 **Installers (Windows / macOS / Linux)**: ${RELEASE_URL}

---

### What Nexus Does

Nexus runs as a self-contained **Tauri 2 + Rust + React** desktop control center on your machine, bridging **ChatGPT Web** to your local workstation with strict, auditable security boundaries.

### Key Technical Highlights

* **332 Canonical Tools Out of the Box**: Gives ChatGPT Web structured access across 24 capability domains—Filesystem, AST-aware edits, Git & **Managed Git Worktrees** (so ChatGPT can experiment in isolated branches), persistent \`node-pty\` terminals, background jobs, built-in **LSP code intelligence** (TypeScript/Python), headless/interactive browser automation, **Native Windows Computer Use** (WinRT OCR + Accessibility UI Tree), and a SQLite-backed **Local Intelligence Store** (Memory, Rules, Knowledge, Prompts).
* **Dynamic Per-Project Sandboxing**: Authorize specific local folders and toggle **Access Mode** (\`read-only\` vs. \`read-write\`) and **Execution Mode** (\`disabled\` / \`safe-only\` / \`project-code\`) on the fly from the desktop UI without restarting.
* **Defense-in-Depth Security**:
  * Physical path canonicalization (\`fs.realpathSync.native\`) to block \`../\` traversal and NTFS junction / symlink escapes.
  * AST-based command risk classification (\`SAFE\`, \`CAUTION\`, \`DANGEROUS\`) that blocks destructive commands (\`rm -rf /\`, \`format\`, \`reg delete\`) by default.
  * Automatic masking for \`.env*\`, \`*.pem\`, \`*.key\`, \`id_rsa\`, and cloud credentials.
* **ACID Action Ledger (WAL)**: Every side-effecting tool execution triggered by ChatGPT is recorded in a Write-Ahead Log before execution, giving you a live audit trail, crash recovery, and idempotent replay across network drops.

---

### Current Support & Roadmap

* **Current (v1.20.0)**: Dedicated integration for **ChatGPT Web (\`chatgpt.com\`)**.
* **Roadmap**: Support for additional AI clients and platforms will be rolled out in upcoming releases.

---

### Quick Start

Pre-built installers for Windows (\`.exe\`), macOS Apple Silicon (\`.dmg\`), and Linux (\`.deb\` / \`.AppImage\`) are available on the [Releases page](${RELEASE_URL}), or you can build from source (\`pnpm install && pnpm run build\`).

Would love to hear your feedback, critiques, or feature requests!`
  },

  en_tweet: {
    text: `Just open-sourced Nexus v1.20 ⚡️ — A Local AI Control Plane purpose-built for ChatGPT Web (chatgpt.com).

Stop copy-pasting code between ChatGPT browser tabs and your local IDE.

🛠️ 332 Local Tools (FS, Git Worktrees, Terminal, LSP, Browser, Windows OCR Computer Use)
🔒 Live Read-Only / Read-Write & Safe-Only Sandbox toggles
📒 ACID Action Ledger (WAL)

GitHub: ${REPO_URL}`
  }
};

// ============================================================================
// 2. 跨平台系统剪贴板写入（Windows UTF-8 无乱码）与浏览器唤起
// ============================================================================

function copyToClipboard(text) {
  if (process.platform === 'win32') {
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    const psCmd = `[Console]::InputEncoding = [System.Text.Encoding]::UTF8; $bytes = [System.Convert]::FromBase64String('${encoded}'); $str = [System.Text.Encoding]::UTF8.GetString($bytes); Set-Clipboard -Value $str`;
    spawnSync('powershell', ['-NoProfile', '-Command', psCmd]);
  } else if (process.platform === 'darwin') {
    spawnSync('pbcopy', [], { input: text, encoding: 'utf8' });
  } else {
    spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf8' });
  }
}

function openUrl(url) {
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process "${url}"`]);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

// ============================================================================
// 3. API 全自动直发函数 (DEV.to & GitHub 开源周刊 Issue)
// ============================================================================

async function publishToDevTo(apiKey) {
  console.log('\n⏳ 正在通过 DEV.to 官方 API 自动发布英文技术文章...');
  const response = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      article: {
        title: POSTS.en_long.title,
        published: true,
        body_markdown: POSTS.en_long.body,
        tags: POSTS.en_long.tags
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DEV.to API 返回错误 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  console.log(`✅ DEV.to 发布成功！文章链接: ${data.url}`);
  openUrl(data.url);
}

// ============================================================================
// 4. 平台配置清单（含 URL 预填参数）
// ============================================================================

const CHANNELS = [
  {
    key: '1',
    group: '🇨🇳 中文极客社区',
    name: 'Linux.do（国内最火 ChatGPT/AI 社区）',
    url: 'https://linux.do/',
    clipTitle: POSTS.zh_community.title,
    clipBody: POSTS.zh_community.body,
    tip: '进入后点击左上角「+ 新建话题」，分类选「搞七捻三」或「资源荟萃」，直接粘贴正文'
  },
  {
    key: '2',
    group: '🇨🇳 中文极客社区',
    name: 'V2EX - 分享创造 (/go/create)',
    url: 'https://www.v2ex.com/write?node=create',
    clipTitle: POSTS.zh_community.title,
    clipBody: POSTS.zh_community.body,
    tip: '已直接定位到「分享创造」发帖页，正文格式选 Markdown，粘贴即可'
  },
  {
    key: '3',
    group: '🇨🇳 中文技术博客',
    name: '稀土掘金 (Juejin 写文章)',
    url: 'https://juejin.cn/editor/drafts/new?v=2',
    clipTitle: POSTS.zh_community.title,
    clipBody: POSTS.zh_community.body,
    tip: '直接打开掘金 Markdown 编辑器，Ctrl+V 粘贴正文即可自动解析排版'
  },
  {
    key: '4',
    group: '🇨🇳 中文技术博客',
    name: '知乎专栏 (写文章)',
    url: 'https://zhuanlan.zhihu.com/write',
    clipTitle: POSTS.zh_community.title,
    clipBody: POSTS.zh_community.body,
    tip: '在知乎编辑器中 Ctrl+V 粘贴后，点击顶部提示「确认转为 Markdown 格式」'
  },
  {
    key: '5',
    group: '🇨🇳 港台/小红书',
    name: '方格子 vocus / 小红书（短平快高互动版）',
    url: 'https://vocus.cc/salon/creator',
    clipTitle: POSTS.zh_short.title,
    clipBody: POSTS.zh_short.body,
    tip: '已复制短平快版文案到剪贴板，可直接粘贴到方格子或小红书创作者中心'
  },
  {
    key: '6',
    group: '🇨🇳 开源周刊白嫖',
    name: '阮一峰《科技爱好者周刊》一键预填 Issue 自荐',
    url: `https://github.com/ruanyf/weekly/issues/new?title=${encodeURIComponent(POSTS.zh_weekly_issue.title)}&body=${encodeURIComponent(POSTS.zh_weekly_issue.body)}`,
    clipTitle: POSTS.zh_weekly_issue.title,
    clipBody: POSTS.zh_weekly_issue.body,
    tip: '✨ 标题和全套自荐内容已通过 URL 自动填好！浏览器打开后直接点绿色的「Submit new issue」即可！'
  },
  {
    key: '7',
    group: '🌍 海外引爆社区',
    name: 'Reddit - r/ChatGPTCoding（最精准，标题已自动预填）',
    url: `https://www.reddit.com/r/ChatGPTCoding/submit?title=${encodeURIComponent(POSTS.en_long.title)}`,
    clipTitle: POSTS.en_long.title,
    clipBody: POSTS.en_long.body,
    tip: '✨ 标题已自动填入 Reddit 输入框！英文 Markdown 正文已在剪贴板，点击 Body 框按 Ctrl+V 即可！'
  },
  {
    key: '8',
    group: '🌍 海外引爆社区',
    name: 'Reddit - r/ChatGPT（标题已自动预填）',
    url: `https://www.reddit.com/r/ChatGPT/submit?title=${encodeURIComponent(POSTS.en_long.title)}`,
    clipTitle: POSTS.en_long.title,
    clipBody: POSTS.en_long.body,
    tip: '✨ 标题已自动填入！切换到 Markdown 编辑器按 Ctrl+V 粘贴正文即可！'
  },
  {
    key: '9',
    group: '🌍 海外引爆社区',
    name: 'Hacker News - Show HN（标题+链接已自动预填！）',
    url: `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(REPO_URL)}&t=${encodeURIComponent(POSTS.en_long.hnTitle)}`,
    clipTitle: POSTS.en_long.hnTitle,
    clipBody: POSTS.en_long.body,
    tip: '✨ 标题和 GitHub 链接已 100% 自动填好！直接点 Submit，然后在评论区 Ctrl+V 粘贴剪贴板里的详细介绍！'
  },
  {
    key: '10',
    group: '🌍 海外引爆社区',
    name: 'X (Twitter) 一键发推（全篇推文已自动预填！）',
    url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(POSTS.en_tweet.text)}`,
    clipTitle: 'X Launch Post',
    clipBody: POSTS.en_tweet.text,
    tip: '✨ 推文内容和链接已 100% 自动填进发推框！附上截图直接点 Post 即可！'
  },
  {
    key: '11',
    group: '🌍 海外技术博客',
    name: 'DEV.to（全球最大程序员博客，支持 Markdown）',
    url: 'https://dev.to/new',
    clipTitle: POSTS.en_long.title,
    clipBody: POSTS.en_long.body,
    tip: '打开后在标题填标题，正文区直接 Ctrl+V 粘贴英文 Markdown，标签填 chatgpt, ai, opensource, rust'
  },
  {
    key: '12',
    group: '🌍 海外技术博客',
    name: 'Hashnode / Medium / Substack（英文 Markdown 已复制）',
    url: 'https://hashnode.com/draft',
    clipTitle: POSTS.en_long.title,
    clipBody: POSTS.en_long.body,
    tip: '英文长文 Markdown 已复制到剪贴板，直接在 Hashnode / Medium / Substack 编辑器中 Ctrl+V 即可'
  }
];

function launchChannel(channel) {
  console.log(`\n============================================================`);
  console.log(`🚀 正在启动: [${channel.group}] ${channel.name}`);
  console.log(`📌 建议标题: ${channel.clipTitle}`);
  copyToClipboard(channel.clipBody);
  console.log(`📋 正文已自动写入你的 Windows 剪贴板！(进页面直接按 Ctrl + V 粘贴)`);
  console.log(`💡 操作提示: ${channel.tip}`);
  console.log(`============================================================\n`);
  openUrl(channel.url);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--devto')) {
    const apiKey = process.env.DEVTO_API_KEY;
    if (!apiKey) {
      console.error('❌ 请先设置环境变量 DEVTO_API_KEY，例如: $env:DEVTO_API_KEY="你的key"; node scripts/promote-publish.mjs --devto');
      process.exit(1);
    }
    await publishToDevTo(apiKey);
    return;
  }

  if (args.includes('--all-zh')) {
    copyToClipboard(`# ${POSTS.zh_community.title}\n\n${POSTS.zh_community.body}`);
    console.log('✅ 中文完整版（含标题+Markdown正文）已复制到剪贴板！正在打开核心中文平台...');
    for (const k of ['1', '2', '3', '6']) {
      const ch = CHANNELS.find((c) => c.key === k);
      if (ch) openUrl(ch.url);
    }
    return;
  }

  if (args.includes('--all-en')) {
    copyToClipboard(POSTS.en_long.body);
    console.log('✅ 英文完整版 Markdown 正文已复制到剪贴板！正在打开海外预填链接...');
    for (const k of ['7', '9', '10', '11']) {
      const ch = CHANNELS.find((c) => c.key === k);
      if (ch) openUrl(ch.url);
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const printMenu = () => {
    console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║          🚀 Nexus v1.20 开源全网一键发布助手 (ChatGPT 官网专版)            ║');
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    for (const ch of CHANNELS) {
      console.log(`║  [${ch.key.padStart(2, ' ')}] ${ch.group} | ${ch.name}`);
    }
    console.log('╠════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  [zh] 一键打开全部核心中文平台 (Linux.do / V2EX / 掘金 / 阮一峰周刊)       ║');
    console.log('║  [en] 一键打开全部核心海外平台 (Reddit / HackerNews / X / DEV.to)          ║');
    console.log('║  [t ] 仅复制当前平台【标题】到剪贴板                                       ║');
    console.log('║  [q ] 退出脚本                                                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  };

  let lastChannel = CHANNELS[0];
  printMenu();

  const ask = () => {
    rl.question('\n👉 请输入编号 (1-12 / zh / en / t / q) 并回车: ', (answer) => {
      const input = answer.trim().toLowerCase();
      if (input === 'q' || input === 'exit') {
        rl.close();
        return;
      }
      if (input === 't') {
        copyToClipboard(lastChannel.clipTitle);
        console.log(`📋 已复制标题到剪贴板: "${lastChannel.clipTitle}"`);
        ask();
        return;
      }
      if (input === 'zh') {
        copyToClipboard(POSTS.zh_community.body);
        console.log('📋 已将【中文社区版 Markdown 正文】复制到剪贴板，并为你打开 Linux.do / V2EX / 掘金 / 阮一峰周刊！');
        for (const k of ['1', '2', '3', '6']) {
          openUrl(CHANNELS.find((c) => c.key === k).url);
        }
        ask();
        return;
      }
      if (input === 'en') {
        copyToClipboard(POSTS.en_long.body);
        console.log('📋 已将【英文版 Markdown 正文】复制到剪贴板，并为你打开 Reddit / Hacker News / X / DEV.to（标题已自动预填）！');
        for (const k of ['7', '9', '10', '11']) {
          openUrl(CHANNELS.find((c) => c.key === k).url);
        }
        ask();
        return;
      }

      const found = CHANNELS.find((c) => c.key === input);
      if (found) {
        lastChannel = found;
        launchChannel(found);
      } else {
        printMenu();
      }
      ask();
    });
  };

  ask();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
