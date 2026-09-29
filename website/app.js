/**
 * Nexus Official Website Application Scripts
 * Manages real-time execution consoles, interactive demos, durable state machines,
 * action ledger receipts, capability switchers, and integration copy helpers.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================================
  // 1. Toast Notification Helper
  // =========================================================================
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-msg");
  let toastTimer = null;

  function showToast(message) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  // =========================================================================
  // 2. Hero Interactive Execution Console
  // =========================================================================
  const heroTasks = {
    blender: {
      task: "Open Blender and create a sphere",
      mcp: "application.launch ➔ computer.state ➔ mcp.execution",
      runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
      action: "launch blender.exe --python-expr 'bpy.ops.mesh.primitive_uv_sphere_add()'",
      state: "EXECUTING (Step 4/5 · Viewport Introspection)",
      worldState: "HWND 0x00320E4A visible · Mesh('Sphere') detected (vertices: 482)",
      verify: "PASS · Verification Certified"
    },
    docx: {
      task: "Create architecture specification DOCX and save",
      mcp: "filesystem.init ➔ document.docx.create ➔ document.save",
      runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
      action: "write_document_stream(path='C:/Reports/Spec_v1.docx', template='tech')",
      state: "EXECUTING (Flushing OOXML package to disk)",
      worldState: "file.exists = true · size = 48,920 bytes · SHA-256: 7b2e9c1d...",
      verify: "PASS · File Attributes & Hash Validated"
    },
    browser: {
      task: "Open Chromium, query cluster telemetry, extract metrics",
      mcp: "browser.launch ➔ browser.navigate ➔ browser.extract",
      runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
      action: "cdp.Page.navigate(url='http://127.0.0.1:9090/metrics') ➔ DOM evaluate",
      state: "EXECUTING (Waiting for network idle & DOMContentLoaded)",
      worldState: "HTTP 200 OK · table#metrics extracted (14 nodes, 82 metrics)",
      verify: "PASS · DOM Node Existence Verified"
    },
    process: {
      task: "Compile native Rust runner binary with timeout protection",
      mcp: "runtime.spawn ➔ process.monitor ➔ runtime.verify",
      runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
      action: "cargo build --release --locked in sandboxed workspace",
      state: "EXECUTING (JobObject CPU quota: 400% · RAM cap: 4096MB)",
      worldState: "binary target/release/runner.exe generated · exit code: 0",
      verify: "PASS · Process Termination Clean"
    }
  };

  const heroTaskBtns = document.querySelectorAll(".task-tab-btn");
  const heroTaskVal = document.getElementById("hero-task-val");
  const heroMcpVal = document.getElementById("hero-mcp-val");
  const heroRunnerVal = document.getElementById("hero-runner-val");
  const heroActionVal = document.getElementById("hero-action-val");
  const heroStateVal = document.getElementById("hero-state-val");
  const heroWorldVal = document.getElementById("hero-world-val");
  const heroVerifyVal = document.getElementById("hero-verify-val");
  const heroSimulateBtn = document.getElementById("btn-hero-simulate");
  const pipeNodes = document.querySelectorAll(".pipe-node");

  function setHeroConsoleTask(taskKey) {
    const data = heroTasks[taskKey];
    if (!data) return;

    if (heroTaskVal) heroTaskVal.textContent = data.task;
    if (heroMcpVal) heroMcpVal.textContent = data.mcp;
    if (heroRunnerVal) heroRunnerVal.textContent = data.runner;
    if (heroActionVal) heroActionVal.textContent = data.action;
    if (heroStateVal) heroStateVal.textContent = data.state;
    if (heroWorldVal) heroWorldVal.textContent = data.worldState;
    if (heroVerifyVal) heroVerifyVal.textContent = data.verify;

    heroTaskBtns.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-task") === taskKey);
    });
  }

  heroTaskBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      setHeroConsoleTask(btn.getAttribute("data-task"));
    });
  });

  if (heroSimulateBtn) {
    heroSimulateBtn.addEventListener("click", () => {
      const activeTask = document.querySelector(".task-tab-btn.active");
      if (activeTask) {
        setHeroConsoleTask(activeTask.getAttribute("data-task"));
        ((typeof setSmNode !== "undefined") ? setSmNode("mcp") : null);
        setTimeout(() => ((typeof setSmNode !== "undefined") ? setSmNode("runner") : null), 600);
        setTimeout(() => ((typeof setSmNode !== "undefined") ? setSmNode("ledger") : null), 1200);
        setTimeout(() => ((typeof setSmNode !== "undefined") ? setSmNode("os") : null), 1800);
        setTimeout(() => ((typeof setSmNode !== "undefined") ? setSmNode("verify") : null), 2400);
        setTimeout(() => ((typeof setSmNode !== "undefined") ? setSmNode("started") : null), 3000);
      }
    });
  }

  // Initialize
  setHeroConsoleTask("blender");
  if(typeof renderDemo !== "undefined") renderDemo("blender", 4);
  if(typeof setReceipt !== "undefined") setReceipt("1842");
  ((typeof setSmNode !== "undefined") ? setSmNode("started") : null);

  // =========================================================================
  // 9. Mobile Navigation Drawer & Dropdown Interactions
  // =========================================================================
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const navLinksContainer = document.querySelector(".nav-links");
  const dropdownItems = document.querySelectorAll(".nav-item-dropdown");

  if (mobileToggle && navLinksContainer) {
    mobileToggle.addEventListener("click", () => {
      navLinksContainer.classList.toggle("mobile-open");
    });
  }

  dropdownItems.forEach(item => {
    const trigger = item.querySelector(".nav-link");
    if (trigger) {
      trigger.addEventListener("click", (e) => {
        if (window.innerWidth <= 992) {
          e.preventDefault();
          item.classList.toggle("active-mobile");
        }
      });
    }
  });

  const allNavCards = document.querySelectorAll(".dropdown-card, .nav-links > li > .nav-link:not(.nav-item-dropdown > .nav-link)");
  allNavCards.forEach(card => {
    card.addEventListener("click", () => {
      if (window.innerWidth <= 992 && navLinksContainer) {
        navLinksContainer.classList.remove("mobile-open");
        dropdownItems.forEach(item => item.classList.remove("active-mobile"));
      }
    });
  });
});


document.addEventListener("DOMContentLoaded", () => {
  // =========================================================================
  // 10. Download Page Interactive Features (FAQ, Code Copy)
  // =========================================================================
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      if (item) item.classList.toggle('open');
    });
  });

  const copyCodeBtns = document.querySelectorAll('.btn-copy-code-inline');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');

  function showToast(msg) {
    if(!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  copyCodeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        navigator.clipboard.writeText(cmd).then(() => {
          showToast('命令已复制');
        });
      }
    });
  });

  // =========================================================================
  // 11. Security Defense Simulator
  // =========================================================================
  const simBtns = document.querySelectorAll('.btn-sim');
  const simConsole = document.getElementById('sim-console-output');
  let simTimeoutId = null;

  const attackLogs = {
    path: [
      { text: "> INCOMING RPC: fs.read({ path: '../../../Windows/System32/sam' })", color: "text-blue" },
      { text: "[KERNEL] Normalizing path via fs.realpathSync.native...", color: "text-muted", delay: 300 },
      { text: "[ENFORCER] Path traversal detected! Attempted to escape workspace sandbox.", color: "text-yellow", delay: 600 },
      { text: "[ENFORCER] Target mapped to: C:\\Windows\\System32\\sam", color: "text-yellow", delay: 600 },
      { text: "💥 BLOCKED: fs.read action denied. Security Policy: SANDBOX_ESCAPE", color: "text-red", delay: 900 },
      { text: "📝 ACTION_LEDGER: Incident logged to write-ahead log (TxID: 9x882a).", color: "text-purple", delay: 1200 }
    ],
    memory: [
      { text: "> INCOMING RPC: runtime.execute({ cmd: 'node leak.js' })", color: "text-blue" },
      { text: "[JOB_OBJECT] Wrapping process in Windows JobObject. MaxRAM: 1024MB.", color: "text-muted", delay: 300 },
      { text: "[WATCHDOG] Process started. PID 18992.", color: "text-emerald", delay: 600 },
      { text: "[WATCHDOG] Warning: Memory spiking... (850MB / 1024MB)", color: "text-yellow", delay: 1500 },
      { text: "💥 BLOCKED: Process 18992 exceeded JobObject memory quota.", color: "text-red", delay: 2000 },
      { text: "[KERNEL] Hard-terminating process and all descendants.", color: "text-muted", delay: 2200 },
      { text: "📝 ACTION_LEDGER: Incident logged. Status: ERROR_QUOTA_EXCEEDED.", color: "text-purple", delay: 2500 }
    ],
    env: [
      { text: "> INCOMING RPC: fs.read({ path: '/workspace/.env' })", color: "text-blue" },
      { text: "[ENFORCER] Checking file access control list...", color: "text-muted", delay: 300 },
      { text: "[ENFORCER] Pattern match: '.env' is marked as SENSITIVE_CREDENTIAL.", color: "text-yellow", delay: 600 },
      { text: "💥 BLOCKED: Denied access to physical credential file.", color: "text-red", delay: 900 },
      { text: "📝 ACTION_LEDGER: Agent attempted to steal secrets. Incident logged.", color: "text-purple", delay: 1200 }
    ],
    fork: [
      { text: "> INCOMING RPC: runtime.execute({ cmd: 'bash fork_bomb.sh' })", color: "text-blue" },
      { text: "[JOB_OBJECT] Active process count limit applied: Max 50.", color: "text-muted", delay: 300 },
      { text: "[WATCHDOG] Rapid process spawning detected (rate: 100/s).", color: "text-yellow", delay: 800 },
      { text: "💥 BLOCKED: JobObject ActiveProcessLimit reached.", color: "text-red", delay: 1200 },
      { text: "[KERNEL] Freezing job execution. Reaping 50 zombie processes...", color: "text-muted", delay: 1500 },
      { text: "📝 ACTION_LEDGER: Fork bomb neutralized. Agent isolated.", color: "text-purple", delay: 1800 }
    ]
  };

  function runSimLog(type) {
    if (!simConsole) return;
    simConsole.innerHTML = '<div class="sim-line text-emerald">Nexus Defense Subsystem Active.</div>';
    const logs = attackLogs[type];
    if (!logs) return;

    simBtns.forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.btn-sim[data-attack="${type}"]`);
    if (btn) btn.classList.add('active');

    logs.forEach((logItem) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = `sim-line ${logItem.color}`;
        
        let html = logItem.text;
        if(html.includes('BLOCKED')) html = html.replace('BLOCKED', '<strong>BLOCKED</strong>');
        if(html.includes('ACTION_LEDGER')) html = html.replace('ACTION_LEDGER', '<strong>ACTION_LEDGER</strong>');
        div.innerHTML = html;

        simConsole.appendChild(div);
        simConsole.scrollTop = simConsole.scrollHeight;
      }, logItem.delay || 0);
    });
  }

  if (simBtns.length > 0) {
    simBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        runSimLog(btn.getAttribute('data-attack'));
      });
    });
    // Start default sim
    runSimLog('path');
  }

  // =========================================================================
  // 12. MCP Wire Inspector
  // =========================================================================
  const wireBtns = document.querySelectorAll('.wire-btn');
  const wireReq = document.getElementById('wire-req-code');
  const wireRes = document.getElementById('wire-res-code');

  const wirePayloads = {
    init: {
      req: {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
          "protocolVersion": "2024-11-05",
          "capabilities": {},
          "clientInfo": { "name": "claude-ai", "version": "1.0.0" }
        }
      },
      res: {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
          "protocolVersion": "2024-11-05",
          "capabilities": {
            "experimental": { "verification": true, "actionLedger": true }
          },
          "serverInfo": { "name": "nexus-gateway", "version": "1.2.0" }
        }
      }
    },
    list: {
      req: {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
      },
      res: {
        "jsonrpc": "2.0",
        "id": 2,
        "result": {
          "tools": [
            { "name": "fs.read", "description": "Read physical file", "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } } },
            { "name": "runtime.execute", "description": "Run command in JobObject", "inputSchema": { "type": "object", "properties": { "cmd": { "type": "string" } } } }
          ]
        }
      }
    },
    call: {
      req: {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
          "name": "runtime.execute",
          "arguments": { "cmd": "npm run build" }
        }
      },
      res: {
        "jsonrpc": "2.0",
        "id": 3,
        "result": {
          "content": [
            { "type": "text", "text": "vite v5.0.0 building for production...\n✓ built in 1.2s" }
          ],
          "isError": false,
          "_nexus_meta": { "txId": "e2a18b", "hash": "8f8b1...2a9" }
        }
      }
    },
    event: {
      req: {
        "jsonrpc": "2.0",
        "method": "notifications/event",
        "params": {
          "event": "state_changed",
          "data": { "workspace": "E:/code", "git_branch": "main" }
        }
      },
      res: {
        "//": "Notifications do not expect a response."
      }
    }
  };

  function renderJSON(obj) {
    let str = JSON.stringify(obj, null, 2);
    // basic syntax highlighting
    str = str.replace(/("(\u[a-zA-Z0-9]{4}|\[^u]|[^\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-val';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = 'json-key';
        else cls = 'json-str';
      } else if (/true|false/.test(match)) cls = 'json-bool';
      else if (/null/.test(match)) cls = 'json-null';
      return '<span class="' + cls + '">' + match + '</span>';
    });
    return str;
  }

  if (wireBtns.length > 0) {
    wireBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        wireBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const phase = btn.getAttribute('data-phase');
        const data = wirePayloads[phase];

        // Animate packets
        const packets = document.querySelectorAll('.packet');
        packets.forEach(p => {
          p.style.animation = 'none';
          p.offsetHeight; // trigger reflow
          p.style.animation = null;
        });

        // Set code
        if (wireReq) wireReq.innerHTML = renderJSON(data.req);
        if (wireRes) wireRes.innerHTML = renderJSON(data.res);
      });
    });
    
    // Init syntax highlighting logic style dynamically
    const style = document.createElement('style');
    style.textContent = `
      .json-key { color: #60a5fa; }
      .json-str { color: #34d399; }
      .json-val { color: #f472b6; }
      .json-bool { color: #fbbf24; }
      .json-null { color: #94a3b8; }
    `;
    document.head.appendChild(style);

    // Default trigger
    wireBtns[0].click();
  }

  // =========================================================================
  // 13. Topology Interactive Nodes
  // =========================================================================
  const topoNodes = document.querySelectorAll('.topo-node');
  const tTitle = document.getElementById('topo-title');
  const tDesc = document.getElementById('topo-desc');
  const tIface = document.getElementById('topo-iface');
  const tIso = document.getElementById('topo-iso');

  const topoData = {
    ai: { t: "WebAI (ChatGPT/Claude)", d: "认知层。负责意图理解、逻辑推理、工具选择与异常重规划。完全没有物理执行能力。", i: "JSON-RPC 2.0 Client", s: "Cloud / Browser" },
    gateway: { t: "MCP Gateway", d: "通信枢纽，在本地 127.0.0.1 提供 SSE/stdio 端点，负责接收来自 AI 的标准化工具调用并进行请求鉴权。", i: "HTTP / SSE / stdio", s: "Local Loopback Only" },
    registry: { t: "Tool Registry", d: "严格验证所有传入请求的参数类型（基于 JSON Schema），只有符合物理安全边界的操作才会被放行。", i: "AJV Validator", s: "Strict Types" },
    runner: { t: "JobObject Runner", d: "在 Windows JobObject 中硬隔离拉起实际操作。监控内存、CPU 并在超时时从内核级杀死衍生进程树。", i: "Win32 CreateProcess", s: "Kernel Isolation" },
    ledger: { t: "Action Ledger", d: "事务账本。所有的执行在真正作用于文件系统前预写日志，并在结束后记录哈希。形成不可篡改的审计追踪。", i: "SQLite WAL", s: "Persistent" },
    verify: { t: "Verification Engine", d: "真值探针。不信任执行返回的文字，而是直接向 OS 查文件哈希、查进程状态，并将物理证据返回给 AI。", i: "Native Syscalls", s: "Zero Trust" },
    state: { t: "Computer State", d: "高频感知系统变迁，维持窗口焦点、句柄列表与屏幕树，确保执行环境与 AI 预期一致。", i: "User32.dll / GDI", s: "Real-time" },
    os: { t: "Windows Native OS", d: "最终承载物理状态改变的基础设施，所有证据的绝对真理来源。", i: "NTFS / Win32", s: "Bare Metal" }
  };

  if (topoNodes.length > 0) {
    topoNodes.forEach(node => {
      node.addEventListener('click', () => {
        topoNodes.forEach(n => n.classList.remove('active'));
        node.classList.add('active');
        
        const m = node.getAttribute('data-module');
        const data = topoData[m];
        if(data && tTitle) {
          tTitle.textContent = data.t;
          tDesc.textContent = data.d;
          tIface.textContent = data.i;
          tIso.textContent = data.s;
        }
      });
    });
  }

  // =========================================================================
  // 14. OS Selector Tabs for Download Page
  // =========================================================================
  const osTabBtns = document.querySelectorAll('.os-tab-btn');
  const osPanes = document.querySelectorAll('.os-pane');

  if (osTabBtns.length > 0) {
    // 1. Tab Click Logic
    osTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active from all
        osTabBtns.forEach(b => b.classList.remove('active'));
        osPanes.forEach(p => p.classList.remove('active'));

        // Add active to clicked
        btn.classList.add('active');
        const targetId = 'pane-' + btn.getAttribute('data-os');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 2. Auto-Detect OS and select the right tab initially
    const ua = window.navigator.userAgent.toLowerCase();
    let detectedOS = 'win';
    if (ua.includes('mac') || ua.includes('darwin')) detectedOS = 'mac';
    else if (ua.includes('linux')) detectedOS = 'linux';

    const defaultBtn = document.querySelector(`.os-tab-btn[data-os="${detectedOS}"]`);
    if (defaultBtn) {
      defaultBtn.click();
    }
  }


  // =========================================================================
  // 11. Capability Matrix Tabs (capabilities.html)
  // =========================================================================
  const capTabBtns = document.querySelectorAll('.cap-tab-btn');
  const capPanels = document.querySelectorAll('.cap-panel');

  if (capTabBtns.length > 0) {
    capTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        capTabBtns.forEach(b => b.classList.remove('active'));
        capPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const cat = btn.getAttribute('data-cat');
        const panel = document.querySelector(`.cap-panel[data-cat-panel="${cat}"]`);
        if (panel) {
          panel.classList.add('active');
        }
      });
    });
  }

});
