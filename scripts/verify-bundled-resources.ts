import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resources = path.join(root, "apps/desktop/src-tauri/resources");
const forbidden: string[] = [];

function walk(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/(?:\.db|\.db-wal|\.db-shm|\.bak)$/i.test(entry.name)) forbidden.push(absolute);
  }
}

walk(resources);
if (forbidden.length > 0) {
  throw new Error(`Tauri resource verification failed; database artifacts found:\n${forbidden.join("\n")}`);
}

const isWin = process.platform === "win32";
const tunnelExe = path.join(resources, "tunnel/tunnel-client-runtime-cloudflared.exe");
const cloudflaredExe = path.join(resources, "tunnel/cloudflared.exe");
const license = path.join(resources, "tunnel/LICENSE");
if (isWin && (!fs.existsSync(tunnelExe) || !fs.existsSync(cloudflaredExe) || !fs.existsSync(license))) {
  throw new Error("Tauri resource verification failed; bundled tunnel runtime or license missing.");
}

const lspCli = path.join(resources, "lsp/node_modules/typescript-language-server/lib/cli.mjs");
const lspTsserver = path.join(resources, "lsp/node_modules/typescript/lib/tsserver.js");
if (!fs.existsSync(lspCli) || !fs.existsSync(lspTsserver)) {
  throw new Error("Tauri resource verification failed; bundled language server (typescript-language-server / typescript) missing.");
}

const bundledNodeExe = path.join(resources, isWin ? "runtime/node.exe" : "runtime/node");
const actualNodeExe = fs.existsSync(bundledNodeExe) ? bundledNodeExe : path.join(resources, "runtime/node.exe");
if (fs.existsSync(actualNodeExe)) {
  const version = child_process.execFileSync(actualNodeExe, [lspCli, "--version"], {
    env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "C:\\Windows" },
  }).toString().trim();
  if (!version.startsWith("6.")) {
    throw new Error(`Tauri resource verification failed; unexpected language server version: ${version}`);
  }
}

const bridgeJs = path.join(resources, "bridge/index.js");
const bridgeExe = path.join(resources, isWin ? "bridge/nexus-mcp-bridge.exe" : "bridge/nexus-mcp-bridge");
const actualBridgeExe = fs.existsSync(bridgeExe) ? bridgeExe : path.join(resources, "bridge/nexus-mcp-bridge.exe");
if (!fs.existsSync(bridgeJs) || !fs.existsSync(actualBridgeExe)) {
  throw new Error("Tauri resource verification failed; bundled MCP bridge (index.js or launcher executable) missing.");
}

console.log("Bundled resources contain verified tunnel runtime, bundled language server, bundled MCP bridge, and no database or migration-backup artifacts.");

// Section 9: Build Artifact Regression Test
// Verify the bundled server runtime directly by launching it and fetching tools/list
async function verifyBundledServerMcpSchema() {
  console.log("Verifying bundled server MCP tools/list schema...");
  const serverDir = path.join(resources, "server");
  const nodeExe = isWin
    ? path.join(resources, "runtime/node.exe")
    : (fs.existsSync(path.join(resources, "runtime/node")) ? path.join(resources, "runtime/node") : path.join(resources, "runtime/node.exe"));

  if (!fs.existsSync(path.join(serverDir, "index.js")) || !fs.existsSync(nodeExe)) {
    throw new Error("Bundled server or runtime missing for schema verification.");
  }

  const tmpDbDir = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "lb-verify-tools-"));
  const dbPath = path.join(tmpDbDir, "verify.db");
  const testPort = "18998";
  const mgmtToken = "lm_verify_secret_token_12345";

  const serverProc = child_process.spawn(nodeExe, ["index.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      LOCALBRIDGE_SERVER_HOST: "127.0.0.1",
      LOCALBRIDGE_SERVER_PORT: testPort,
      LOCALBRIDGE_SERVER_DB_PATH: dbPath,
      LOCALBRIDGE_LOG_LEVEL: "silent",
      LOCALBRIDGE_MANAGEMENT_TOKEN: mgmtToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverStderr = "";
  let serverStdout = "";
  serverProc.stderr?.on("data", (d) => { serverStderr += d.toString(); });
  serverProc.stdout?.on("data", (d) => { serverStdout += d.toString(); });

  try {
    // Wait for server ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${testPort}/api/mcp/status`, {
          headers: { authorization: `Bearer ${mgmtToken}` },
        });
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) {
      throw new Error(`Bundled server failed to start within timeout during resource verification.\nStdout: ${serverStdout}\nStderr: ${serverStderr}`);
    }

    // Check /api/mcp/status toolsCount
    const statusRes = await fetch(`http://127.0.0.1:${testPort}/api/mcp/status`, {
      headers: { authorization: `Bearer ${mgmtToken}` },
    });
    const statusData = (await statusRes.json()) as any;
    if (statusData.toolsCount !== 332) {
      throw new Error(`Bundled server /api/mcp/status toolsCount mismatch: expected 332, got ${statusData.toolsCount}`);
    }

    // Check /api/skills endpoint on bundled server
    const skillsRes = await fetch(`http://127.0.0.1:${testPort}/api/skills?source=builtin`, {
      headers: { authorization: `Bearer ${mgmtToken}` },
    });
    if (skillsRes.status !== 200) {
      throw new Error(`Bundled server /api/skills returned HTTP ${skillsRes.status}`);
    }
    const skillsData = (await skillsRes.json()) as any;
    if (skillsData.count !== 8) {
      throw new Error(`Bundled server /api/skills count mismatch: expected 8, got ${skillsData.count}`);
    }

    // Verify bundled skills files on disk
    const bundledSkillsDir = path.join(resources, "skills");
    const expectedBuiltins = [
      "nexus.project-inspect",
      "nexus.fix-build",
      "nexus.run-tests",
      "nexus.code-debug",
      "nexus.safe-refactor",
      "nexus.git-review",
      "nexus.start-dev-runtime",
      "nexus.project-cleanup",
    ];
    for (const sk of expectedBuiltins) {
      const yamlFile = path.join(bundledSkillsDir, sk, "skill.yaml");
      const mdFile = path.join(bundledSkillsDir, sk, "SKILL.md");
      if (!fs.existsSync(yamlFile) || !fs.existsSync(mdFile)) {
        throw new Error(`Bundled skills directory missing definition or guide for ${sk}`);
      }
    }

    // Create an MCP token
    const tokenRes = await fetch(`http://127.0.0.1:${testPort}/api/tokens`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${mgmtToken}`,
      },
      body: JSON.stringify({
        name: "verify-mcp-token",
        type: "mcp",
        scopes: ["read", "write", "execute"],
      }),
    });
    const tokenData = await tokenRes.json();
    const mcpToken = tokenData.token;

    // Call tools/list
    const listRes = await fetch(`http://127.0.0.1:${testPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "verify-list",
        method: "tools/list",
        params: {},
      }),
    });
    const listData = await listRes.json();
    const tools = listData.result?.tools ?? [];

    if (tools.length !== 332) {
      throw new Error(`Bundled server tools/list returned ${tools.length} tools, expected exactly 332!`);
    }

    const requiredDiscoveryTools = [
      "localbridge_local_resource_query",
      "nexus_local_resource_query",
      "localbridge_application_launch",
      "localbridge_resource_verify",
      "localbridge_content_index_search",
      "localbridge_resource_inspect",
      "localbridge_discovery_refresh",
    ];
    for (const dt of requiredDiscoveryTools) {
      if (!tools.find((t: any) => t.name === dt)) {
        throw new Error(`Bundled server tools/list is missing required Discovery tool: ${dt}`);
      }
    }

    const requiredIntelligenceTools = [
      "localbridge_skill_create",
      "localbridge_skill_validate",
      "localbridge_skill_activate",
      "localbridge_skill_version_list",
      "localbridge_skill_rollback",
      "localbridge_skill_candidate_propose",
      "localbridge_skill_candidate_review",
      "localbridge_memory_recall",
      "localbridge_memory_candidate_create",
      "localbridge_memory_candidate_accept",
      "localbridge_memory_archive",
      "localbridge_memory_consolidate",
      "localbridge_rule_list",
      "localbridge_rule_get",
      "localbridge_rule_create",
      "localbridge_rule_update",
      "localbridge_rule_delete",
      "localbridge_knowledge_import",
      "localbridge_knowledge_list",
      "localbridge_knowledge_get",
      "localbridge_context_build",
      "localbridge_context_get",
      "localbridge_context_compact",
    ];
    for (const it of requiredIntelligenceTools) {
      if (!tools.find((t: any) => t.name === it)) {
        throw new Error(`Bundled server tools/list is missing required Intelligence Layer tool: ${it}`);
      }
    }

    const requiredBridgeTools = [
      "localbridge_computer_locate_ui",
      "localbridge_computer_task_acceptance",
      "localbridge_computer_loop_check",
      "localbridge_computer_state_get",
      "localbridge_computer_realtime_stream",
      "localbridge_agent_task_checkpoint_create",
      "localbridge_agent_task_checkpoint_restore",
      "localbridge_agent_task_checkpoint_list",
      "localbridge_agent_task_disconnect",
      "localbridge_agent_task_takeover",
    ];
    for (const bt of requiredBridgeTools) {
      if (!tools.find((t: any) => t.name === bt)) {
        throw new Error(`Bundled server tools/list is missing required Computer Execution Bridge tool: ${bt}`);
      }
    }

    const requiredEnvTools = [
      "localbridge_environment_detect",
      "localbridge_project_detect",
    ];
    for (const et of requiredEnvTools) {
      if (!tools.find((t: any) => t.name === et)) {
        throw new Error(`Bundled server tools/list is missing required environment tool: ${et}`);
      }
    }

    const requiredSkillTools = [
      "localbridge_skill_list",
      "localbridge_skill_get",
      "localbridge_skill_match",
    ];
    for (const st of requiredSkillTools) {
      if (!tools.find((t: any) => t.name === st)) {
        throw new Error(`Bundled server tools/list is missing required skill tool: ${st}`);
      }
    }

    const requiredLayaTools = [
      "localbridge_laya_status",
      "localbridge_laya_assess",
    ];
    for (const lt of requiredLayaTools) {
      if (!tools.find((t: any) => t.name === lt)) {
        throw new Error(`Bundled server tools/list is missing required laya tool: ${lt}`);
      }
    }

    const requiredNexus2Tools = [
      "localbridge_terminal_start",
      "localbridge_terminal_write",
      "localbridge_terminal_read",
      "localbridge_terminal_resize",
      "localbridge_terminal_status",
      "localbridge_terminal_stop",
      "localbridge_terminal_list",
      "localbridge_process_list",
      "localbridge_process_status",
      "localbridge_process_kill",
      "localbridge_process_tree",
      "localbridge_port_list",
      "localbridge_port_kill",
      "localbridge_agent_task_create",
      "localbridge_agent_task_status",
      "localbridge_agent_task_logs",
      "localbridge_agent_task_cancel",
      "localbridge_agent_task_pause",
      "localbridge_agent_task_resume",
      "localbridge_agent_task_list",
      "localbridge_agent_task_approve",
    ];
    for (const n2t of requiredNexus2Tools) {
      if (!tools.find((t: any) => t.name === n2t)) {
        throw new Error(`Bundled server tools/list is missing required Nexus 2.0 tool: ${n2t}`);
      }
    }

    const cmdRun = tools.find((t: any) => t.name === "localbridge_command_run");
    if (!cmdRun) throw new Error("localbridge_command_run tool missing from bundled server tools/list");
    if (cmdRun.inputSchema?.type !== "object") throw new Error("localbridge_command_run inputSchema is not an object");
    if (!cmdRun.inputSchema?.properties?.approvalId) {
      throw new Error("BUILD ARTIFACT REGRESSION: localbridge_command_run inputSchema is missing properties.approvalId!");
    }
    if (cmdRun.inputSchema.properties.approvalId.type !== "string") {
      throw new Error("localbridge_command_run properties.approvalId must be string");
    }
    if (cmdRun.inputSchema.required?.includes("approvalId")) {
      throw new Error("localbridge_command_run approvalId must NOT be required");
    }
    if (cmdRun.inputSchema.properties.timeoutMs?.maximum !== 300000 || cmdRun.inputSchema.properties.timeoutMs?.default !== 60000) {
      throw new Error(`localbridge_command_run timeoutMs contract mismatch: expected max 300000, default 60000`);
    }

    const jobStart = tools.find((t: any) => t.name === "localbridge_job_start");
    if (!jobStart?.inputSchema?.properties?.approvalId) {
      throw new Error("BUILD ARTIFACT REGRESSION: localbridge_job_start inputSchema is missing properties.approvalId!");
    }
    if (jobStart.inputSchema.properties.timeoutMs?.maximum !== 300000 || jobStart.inputSchema.properties.timeoutMs?.default !== 60000) {
      throw new Error(`localbridge_job_start timeoutMs contract mismatch: expected max 300000, default 60000`);
    }

    const gitWriteTools = [
      "localbridge_git_stage",
      "localbridge_git_unstage",
      "localbridge_git_branch_create",
      "localbridge_git_branch_switch",
      "localbridge_git_commit",
    ];

    for (const toolName of gitWriteTools) {
      const tool = tools.find((t: any) => t.name === toolName);
      if (!tool) throw new Error(`${toolName} tool missing from bundled server tools/list`);
      if (tool.inputSchema?.type !== "object") throw new Error(`${toolName} inputSchema is not an object`);
      if (!tool.inputSchema?.properties?.approvalId) {
        throw new Error(`BUILD ARTIFACT REGRESSION: ${toolName} inputSchema is missing properties.approvalId!`);
      }
      if (tool.inputSchema.properties.approvalId.type !== "string") {
        throw new Error(`${toolName} properties.approvalId must be string`);
      }
    }

    // Verify session tools contract
    const sessionReadTools = [
      "localbridge_session_list",
      "localbridge_session_status",
      "localbridge_session_events",
      "localbridge_session_handoff",
    ];
    const sessionWriteTools = [
      "localbridge_session_start",
      "localbridge_session_checkpoint",
      "localbridge_session_finish",
    ];

    for (const name of sessionReadTools) {
      const tool = tools.find((t: any) => t.name === name);
      if (!tool) throw new Error(`${name} missing from bundled server tools/list`);
      if (tool.inputSchema?.additionalProperties !== false) {
        throw new Error(`${name} inputSchema.additionalProperties must be false`);
      }
    }

    for (const name of sessionWriteTools) {
      const tool = tools.find((t: any) => t.name === name);
      if (!tool) throw new Error(`${name} missing from bundled server tools/list`);
      if (tool.inputSchema?.additionalProperties !== false) {
        throw new Error(`${name} inputSchema.additionalProperties must be false`);
      }
    }

    console.log("Bundled server MCP schema verified successfully: approvalId exists for command, job, and git-write tools, timeoutMs contract is unified, session tools strictly enforce additionalProperties: false.");
  } finally {
    serverProc.kill();
    try {
      fs.rmSync(tmpDbDir, { recursive: true, force: true });
    } catch {}
  }
}

verifyBundledServerMcpSchema().catch((err) => {
  console.error("Bundled resource verification failed:", err);
  process.exit(1);
});
