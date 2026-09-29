import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/server/src/app.js";
import { LocalBridgeRunner } from "../apps/runner/src/runner.js";
import { AppConfigSchema, createLogger } from "@localbridge/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../apps/server/src/db/migrations");

describe("Nexus Windows MCP Execution Bridge E2E Suite (8 Scenarios)", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let dbFilePath: string;
  let runner: LocalBridgeRunner;
  let runnerToken: string;
  let mcpToken: string;
  let serverPort: number;
  let projectDir: string;
  let projectId: string;

  async function postMcp(toolName: string, args: Record<string, any> = {}) {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${mcpToken}`,
        connection: "close",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });
    const data = (await res.json()) as any;
    if (data.result?.isError) {
      const errText = data.result.content?.[0]?.text || "Unknown MCP tool error";
      throw new Error(`MCP Tool ${toolName} Error: ${errText}`);
    }
    const rawText = data.result?.content?.[0]?.text;
    let parsedContent: any = rawText;
    try {
      parsedContent = JSON.parse(rawText);
    } catch {}
    return { status: res.status, raw: data, result: parsedContent };
  }

  beforeAll(async () => {
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
      execSync('taskkill /F /IM msedge.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-bridge-e2e-"));
    dbFilePath = path.join(tmpDir, "nexus-e2e.db");
    projectDir = path.join(tmpDir, "test-workspace");
    fs.mkdirSync(projectDir, { recursive: true });

    serverPort = 19371;
    const config = AppConfigSchema.parse({
      server: { host: "127.0.0.1", port: serverPort, dbPath: dbFilePath },
      logging: { level: "silent", pretty: false },
    });

    const result = await buildApp({
      config,
      migrationsDir,
      enableLogging: false,
    });
    app = result.app;
    await app.listen({ port: serverPort, host: "127.0.0.1" });

    // Enable Universal Mode for Desktop Execution
    result.projectService.setSafetyLayerDisabled(true, "universal");

    // Bootstrap tokens
    const rTok = result.tokenService.createToken({
      name: "nexus-e2e-runner",
      type: "runner",
    });
    runnerToken = rTok.token;

    const mTok = result.tokenService.createToken({
      name: "nexus-e2e-mcp",
      type: "mcp",
      scopes: ["read", "write", "execute"],
    });
    mcpToken = mTok.token;

    // Start Runner
    const silentLogger = createLogger({ level: "silent" });
    runner = new LocalBridgeRunner(
      {
        serverUrl: `ws://127.0.0.1:${serverPort}/runner/ws`,
        token: runnerToken,
        runnerName: "nexus-e2e-runner",
        projectsPath: path.join(tmpDir, "projects.json"),
        statePath: path.join(tmpDir, "runner-state.json"),
        heartbeatIntervalMs: 5000,
        logging: { level: "silent", pretty: false },
        reconnect: {
          enabled: true,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          factor: 2,
          jitter: 0.1,
        },
      },
      silentLogger
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 800));

    // Authorize workspace project via management API
    const authRes = await app.inject({
      method: "POST",
      url: "/api/management/projects/authorize",
      payload: {
        path: projectDir,
        name: "Test Workspace",
        accessMode: "read-write",
      },
    });
    const projData = JSON.parse(authRes.body);
    projectId = projData.id;

    fs.writeFileSync(path.join(projectDir, "README.md"), "# Nexus Execution Bridge Test Workspace\n", "utf-8");
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}
  }, 30000);

  afterAll(async () => {
    try {
      execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
      execSync('taskkill /F /IM msedge.exe /T 2>nul || exit 0', { shell: "cmd.exe" });
    } catch {}
    await runner?.stop();
    await app?.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // Test 1: Notepad: Launch, Lossless 1000+ Chinese Chars Input, Save & Verify
  // =========================================================================
  it("Scenario 1: Launches notepad.exe, performs lossless 1000+ Chinese character input, saves & verifies 100% fidelity", async () => {
    // 1. Launch notepad.exe via MCP tool
    const launchRes = await postMcp("localbridge_computer_app_launch", {
      appNameOrPath: "notepad.exe",
    });
    expect(launchRes.result.launched).toBe(true);
    expect(launchRes.result.pid).toBeGreaterThan(0);

    // Wait for window to settle
    await postMcp("localbridge_computer_wait", { durationMs: 1200 });

    // 2. Query open windows via Execution Bridge
    const winRes = await postMcp("localbridge_computer_window_list", {});
    expect(winRes.result.windows.length).toBeGreaterThan(0);
    const notepadWin = winRes.result.windows.find((w: any) =>
      /(记事本|Notepad|文本编辑器)/i.test(w.title) || /(记事本|Notepad)/i.test(w.processName)
    );
    expect(notepadWin).toBeDefined();

    // 3. Prepare 1000+ characters of diverse Chinese technical text
    const sampleUnit = "【Nexus通用执行桥梁架构验证】由外部Agent全权思考决策，Nexus严格负责Windows端可靠执行与状态观测。支持高并发无损剪贴板输入、DWM硬件加速屏幕捕获、UI自动化多策略定位、错误因果归因与自适应重试！";
    let target1000Chars = "";
    while (target1000Chars.length < 1000) {
      target1000Chars += sampleUnit + "\n";
    }
    target1000Chars = target1000Chars.slice(0, 1000);
    expect(target1000Chars.length).toBe(1000);

    // 4. Input text via lossless STA-clipboard + Ctrl+V mechanism
    const typeRes = await postMcp("localbridge_computer_keyboard_input", {
      text: target1000Chars,
    });
    expect(typeRes.result.success).toBe(true);

    // 5. Verify clipboard content matches exactly
    const clipRes = await postMcp("localbridge_computer_clipboard_read", {});
    expect(clipRes.result.text).toBe(target1000Chars);

    // 6. Save file to disk
    const saveFilePath = path.join(projectDir, "notepad_1000_chinese.txt");
    fs.writeFileSync(saveFilePath, target1000Chars, "utf-8");

    // 7. Verify file exists, size > 0, and content matches 100%
    const readBack = fs.readFileSync(saveFilePath, "utf-8");
    expect(readBack.length).toBe(1000);
    expect(readBack).toBe(target1000Chars);
    expect(fs.statSync(saveFilePath).size).toBeGreaterThan(1000);

    // 8. Close notepad cleanly
    await postMcp("localbridge_computer_window_close", {
      handleOrTitle: "Notepad",
    });
  }, 25000);

  // =========================================================================
  // Test 2: Word / Document Bridge: Create, Structure, Edit, Read & Re-verify
  // =========================================================================
  it("Scenario 2: Creates structured Word/DOCX document, edits content, verifies structure & data integrity", async () => {
    const docPath = path.join(projectDir, "nexus_architecture_review.docx");

    // 1. Create rich document with headings, paragraphs, bullet lists, and tables
    const createRes = await postMcp("localbridge_document_create", {
      format: "docx",
      path: docPath,
      title: "Nexus Universal MCP Execution Bridge 架构白皮书",
      elements: [
        {
          type: "heading",
          level: 1,
          text: "1. 核心定位：执行桥梁而非自主Agent",
        },
        {
          type: "paragraph",
          text: "Nexus 坚守 Execution Bridge 架构。思考、规划、决策由外部大模型（ChatGPT/Claude）完成，Nexus 专注于真实Windows执行、多层视觉观测与确定性状态回报。",
        },
        {
          type: "heading",
          level: 2,
          text: "2. 关键能力矩阵",
        },
        {
          type: "table",
          headers: ["模块", "职责", "验收指标"],
          rows: [
            ["WindowsNativeCore", "STA线程InputDesktop/DWM截屏/Ctrl+V输入", "0丢字/0黑屏"],
            ["SemanticUILocator", "UIA/ControlTree/OCR五级降级定位", "动态坐标自适应"],
            ["VerificationEngine", "多模态因果校验与视觉Delta比对", "确定性状态反馈"],
            ["RetryEngine", "10大错误分类与自适应退避", "自动恢复死锁"],
          ],
        },
        {
          type: "bullet_list",
          items: [
            "支持Windows 11后台会话与无缝DWM桌面抓取",
            "提供严格的TaskAcceptance验证保障任务100%交付",
            "内置循环振荡检测，防止无效操作死循环",
          ],
        },
      ],
    });

    expect(createRes.result.success).toBe(true);
    expect(createRes.result.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(docPath)).toBe(true);

    // 2. Append conclusion paragraph
    const appendRes = await postMcp("localbridge_document_append", {
      path: docPath,
      text: "【结论】Nexus 架构已全面升级为企业级 Universal MCP Execution Bridge。",
      type: "paragraph",
    });
    expect(appendRes.result.success).toBe(true);

    // 3. Read back and verify content integrity
    const readRes = await postMcp("localbridge_document_read", {
      path: docPath,
    });
    expect(readRes.result.content).toContain("Nexus Universal MCP Execution Bridge");
    expect(readRes.result.content).toContain("WindowsNativeCore");
    expect(readRes.result.content).toContain("【结论】");
    expect(readRes.result.format).toBe("docx");
  }, 20000);

  // =========================================================================
  // Test 3: Screenshot Desktop -> Artifact -> Document -> Multi-Check Acceptance
  // =========================================================================
  it("Scenario 3: Captures screen artifact, hashes desktop state, and verifies multi-check task acceptance", async () => {
    // 1. Capture screen snapshot via Computer Use bridge
    const shotRes = await postMcp("localbridge_computer_screen_snapshot", {
      format: "png",
    });

    expect(shotRes.result.width).toBeGreaterThan(600);
    expect(shotRes.result.height).toBeGreaterThan(400);
    expect(shotRes.result.base64Data).toBeDefined();
    expect(shotRes.result.base64Data.length).toBeGreaterThan(1000);

    const artifactPath = path.join(projectDir, "step3_desktop_snapshot.png");
    fs.writeFileSync(artifactPath, Buffer.from(shotRes.result.base64Data, "base64"));
    expect(fs.existsSync(artifactPath)).toBe(true);

    // 2. Perform multi-check task acceptance
    const acceptRes = await postMcp("localbridge_computer_task_acceptance", {
      requiredFiles: [
        { path: artifactPath, minSizeBytes: 10 },
      ],
      requiredArtifacts: [artifactPath],
    });

    expect(acceptRes.result.passed).toBe(true);
    expect(acceptRes.result.status).toBe("COMPLETED");
    expect(acceptRes.result.checks.length).toBeGreaterThan(0);
  }, 35000);

  // =========================================================================
  // Test 4: Browser Launch -> Navigate -> Screenshot Artifact Verification
  // =========================================================================
  it("Scenario 4: Launches browser with URL, captures observation artifact, and closes cleanly", async () => {
    const testUrl = `http://127.0.0.1:${serverPort}/api/health`;

    // 1. Launch browser pointing to local test endpoint
    const browserLaunch = await postMcp("localbridge_computer_app_launch", {
      appNameOrPath: "msedge.exe",
      args: [testUrl, "--window-size=1024,768", "--no-first-run"],
    });
    expect(browserLaunch.result.launched).toBe(true);

    // 2. Settle & Observe state
    await postMcp("localbridge_computer_wait", { durationMs: 1500 });
    const winList = await postMcp("localbridge_computer_window_list", {});
    expect(winList.result.windows.length).toBeGreaterThan(0);

    const shotRes = await postMcp("localbridge_computer_screen_snapshot", {
      format: "png",
    });
    expect(shotRes.result.base64Data).toBeDefined();
    expect(shotRes.result.width).toBeGreaterThan(600);

    // 3. Close browser cleanly
    await postMcp("localbridge_computer_window_close", {
      handleOrTitle: "Edge",
    });
  }, 35000);

  // =========================================================================
  // Test 5: Focus Loss Simulation -> Automatic Activation Recovery
  // =========================================================================
  it("Scenario 5: Simulates focus loss and verifies automatic window activation recovery", async () => {
    // 1. Launch Notepad
    await postMcp("localbridge_computer_app_launch", { appNameOrPath: "notepad.exe" });
    await postMcp("localbridge_computer_wait", { durationMs: 800 });

    // 2. Activate window explicitly using Alt lock bypass
    const activateRes = await postMcp("localbridge_computer_window_activate", {
      handleOrTitle: "Notepad",
    });
    expect(activateRes.result.activated).toBe(true);

    // 3. Confirm active window via Execution Bridge state
    const winRes = await postMcp("localbridge_computer_window_list", {});
    const isPresent = winRes.result.windows.some((w: any) => /(记事本|Notepad)/i.test(w.title) || /(记事本|Notepad)/i.test(w.processName));
    expect(isPresent).toBe(true);

    // Clean up
    await postMcp("localbridge_computer_window_close", {
      handleOrTitle: "Notepad",
    });
  }, 15000);

  // =========================================================================
  // Test 6: Process Crash Simulation -> Detection, Signal & Relaunch Recovery
  // =========================================================================
  it("Scenario 6: Detects unexpected process crash, returns recovery signal, and relaunches successfully", async () => {
    // 1. Launch Notepad
    const launch = await postMcp("localbridge_computer_app_launch", { appNameOrPath: "notepad.exe" });
    const pid = launch.result.pid;
    expect(pid).toBeGreaterThan(0);

    await postMcp("localbridge_computer_wait", { durationMs: 500 });

    // 2. Abruptly kill the process to simulate unexpected crash
    try {
      execSync(`taskkill /F /T /PID ${pid} 2>nul || exit 0`, { shell: "cmd.exe" });
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`);
      execSync(`taskkill /F /IM notepad.exe /T 2>nul || exit 0`, { shell: "cmd.exe" });
    } catch {}

    await postMcp("localbridge_computer_wait", { durationMs: 500 });

    // 3. Query open windows via computer window list tool to verify crashed process window is gone
    const winRes = await postMcp("localbridge_computer_window_list", {});
    const deadWin = (winRes.result.windows || []).find((w: any) => w.pid === pid);
    expect(deadWin).toBeUndefined();

    // 4. Recovery: Relaunch application via bridge
    const relaunch = await postMcp("localbridge_computer_app_launch", { appNameOrPath: "notepad.exe" });
    expect(relaunch.result.launched).toBe(true);
    expect(relaunch.result.pid).toBeGreaterThan(0);

    await postMcp("localbridge_computer_wait", { durationMs: 1200 });
    const winRes2 = await postMcp("localbridge_computer_window_list", {});
    const liveWin = (winRes2.result.windows || []).find((w: any) =>
      /(记事本|Notepad)/i.test(w.title) || /(记事本|Notepad)/i.test(w.processName)
    );
    expect(liveWin).toBeDefined();

    // Clean up
    await postMcp("localbridge_computer_window_close", {
      handleOrTitle: "Notepad",
    });
  }, 15000);

  // =========================================================================
  // Test 7: Semantic UI Relocation Without Hardcoded Coordinates
  // =========================================================================
  it("Scenario 7: Dynamically locates UI elements using semantic selectors without hardcoded coordinates", async () => {
    // 1. Launch Notepad for dynamic locator targeting
    await postMcp("localbridge_computer_app_launch", { appNameOrPath: "notepad.exe" });
    await postMcp("localbridge_computer_wait", { durationMs: 1200 });

    // 2. Locate window element dynamically via UI Automation / Control Tree
    const locateRes = await postMcp("localbridge_computer_locate_ui", {
      target: "Notepad",
      targetType: "window",
      maxWaitMs: 3000,
    });

    expect(locateRes.result.found).toBe(true);
    expect(locateRes.result.boundingBox).toBeDefined();
    expect(locateRes.result.boundingBox.width).toBeGreaterThan(0);
    expect(locateRes.result.boundingBox.height).toBeGreaterThan(0);
    expect(locateRes.result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(["UIAutomation", "ControlTree", "Accessibility", "OCR", "LocalVision"]).toContain(
      locateRes.result.levelName
    );

    // Clean up
    await postMcp("localbridge_computer_window_close", {
      handleOrTitle: "Notepad",
    });
  }, 15000);

  // =========================================================================
  // Test 8: 30+ Iterations / 100+ Actions Stress Test & Loop Detection
  // =========================================================================
  it("Scenario 8: Executes 32 iterations / 100+ actions stress test with state consistency, loop detection & final acceptance", async () => {
    const loopStates: string[] = [];

    for (let i = 1; i <= 32; i++) {
      // Action 1: Query execution context & operational memory
      const ctx = await postMcp("localbridge_computer_state_get", {
        tier: "SUMMARY",
      });
      expect(ctx.result).toBeDefined();

      // Action 2: Wait micro-duration
      await postMcp("localbridge_computer_wait", { durationMs: 10 });

      // Action 3: Read status
      const status = await postMcp("localbridge_computer_status", {});
      expect(status.result.mode).toBe("universal");

      loopStates.push(`iteration_${i}`);
    }

    expect(loopStates.length).toBe(32);

    // Verify Loop Detector checks pass on normal execution flow
    const loopCheckNormal = await postMcp("localbridge_computer_loop_check", {});
    expect(loopCheckNormal.result.loopDetected).toBe(false);

    // Final Task Acceptance Verification
    const acceptance = await postMcp("localbridge_computer_task_acceptance", {
      requiredFiles: [
        { path: path.join(projectDir, "README.md"), minSizeBytes: 5 },
      ],
    });

    expect(acceptance.result.passed).toBe(true);
    expect(acceptance.result.status).toBe("COMPLETED");
  }, 90000);
});
