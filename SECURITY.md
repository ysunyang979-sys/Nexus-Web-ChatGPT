# Security Policy & Responsibility Disclaimer / 安全策略与免责声明

## 1. Security Architecture (安全架构设计)

**Nexus (LocalBridge)** is designed with a multi-layered local security boundary to protect your workstation when connecting cloud AI assistants (ChatGPT Web, Claude, Cursor, etc.):

1. **Canonical Path Containment (`@localbridge/security`)**:
   - Every file operation is verified via `fs.realpathSync.native` against authorized project roots.
   - Blocks directory traversal (`../`), NTFS Alternate Data Streams (ADS), Windows reserved device names (`CON`, `NUL`, `\\\\?\\`), and symlink/junction escapes.
2. **Access & Execution Boundary Coupling**:
   - Each authorized project enforces explicit **Access Mode** (`read-only` vs. `read-write`) and **Execution Mode** (`disabled`, `safe-only`, `project-code`).
   - Switching a project to `read-only` automatically downgrades `project-code` execution to `disabled`.
3. **AST Command Risk Classification & Approval Gate**:
   - Commands are classified into `SAFE`, `CAUTION`, and `DANGEROUS` tiers. Destructive system commands are blocked or require explicit human approval.
4. **Cryptographic Token Domain Isolation**:
   - MCP Client tokens (`lb_...`), Runner tokens (`lbr_...`), and Loopback Management tokens (`lm_...`) are strictly isolated by domain and verified using constant-time comparison (`crypto.timingSafeEqual`).

---

## 2. Unrestricted / Full-Control Mode Disclaimer (全盘访问与桌面接管免责声明)

> **IMPORTANT / 重要安全提示**
>
> - **Standard / Safe Mode (Default)**: AI operations are strictly confined to user-authorized project directories and governed by read/write and command execution policies.
> - **Unrestricted / Full-Disk Mode (`drive-c` / `全盘访问`) & Computer Use (`桌面接管`)**: When explicitly enabled by the user, AI agents may read/write files across system drives or dispatch keyboard/mouse actions on the host OS.
> - **User Responsibility**: Enabling `read-write` access, `project-code` execution, Full-Disk Access (`C盘全盘访问`), or Computer Use grants high-privilege capabilities to connected AI models. **You are solely responsible for reviewing AI actions, managing your MCP tokens, and any data modification or system side effects resulting from your authorization.** The authors and contributors of Nexus provide this software "AS IS" without warranty of any kind (see [LICENSE](LICENSE) Sections 15 & 16).

---

## 3. Reporting a Vulnerability (报告安全漏洞)

If you discover a security vulnerability in Nexus (such as a sandbox escape, path traversal bypass, or authentication flaw):

1. **Do NOT open a public GitHub issue** for unpatched security vulnerabilities.
2. Please report it privately via [GitHub Security Advisories](https://github.com/ysunyang979-sys/Nexus-Web-ChatGPT/security/advisories/new) with reproduction steps and impact analysis.
3. We will acknowledge your report and work on a fix promptly.
