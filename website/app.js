/**
 * Nexus Official Website Application Scripts (v1.20.0)
 * Manages bilingual (EN default / 中文) language switching, real-time execution consoles,
 * interactive demos, durable state machines, action ledger receipts, capability switchers,
 * security defense simulator, and clipboard helpers.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================================
  // 0. Bilingual Language Engine (Default: English 'en', Toggle: 'en' | 'zh')
  // =========================================================================
  const LANG_STORAGE_KEY = "nexus_website_lang";
  let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || "en";
  if (currentLang !== "en" && currentLang !== "zh") {
    currentLang = "en";
  }

  // Record original English innerHTML on all [data-zh] elements once at startup
  const translatableEls = document.querySelectorAll("[data-zh]");
  translatableEls.forEach((el) => {
    if (!el.hasAttribute("data-en")) {
      el.setAttribute("data-en", el.innerHTML);
    }
  });

  const langToggleBtn = document.getElementById("lang-toggle-btn");

  function updateLangToggleUI(lang) {
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    if (!langToggleBtn) return;
    const opts = langToggleBtn.querySelectorAll(".lang-opt");
    opts.forEach((opt) => {
      opt.classList.toggle("active", opt.getAttribute("data-lang") === lang);
    });
  }

  function applyLanguage(lang, save = true) {
    currentLang = lang;
    if (save) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
    updateLangToggleUI(lang);

    translatableEls.forEach((el) => {
      const targetHtml = lang === "zh" ? el.getAttribute("data-zh") : el.getAttribute("data-en");
      if (targetHtml !== null) {
        if (el.tagName === "TITLE") {
          document.title = targetHtml;
        } else {
          el.innerHTML = targetHtml;
        }
      }
    });

    // Re-render active interactive widgets in the selected language
    const activeHeroBtn = document.querySelector(".task-tab-btn.active[data-task]");
    if (activeHeroBtn) {
      setHeroConsoleTask(activeHeroBtn.getAttribute("data-task"));
    }
    const activeTopoNode = document.querySelector(".topo-node.active[data-module]");
    if (activeTopoNode) {
      renderTopoNode(activeTopoNode.getAttribute("data-module"));
    }
    const activeReceiptBtn = document.querySelector(".receipt-select-btn.active[data-action-id]");
    if (activeReceiptBtn) {
      setReceipt(activeReceiptBtn.getAttribute("data-action-id"));
    }
    const activeSmNode = document.querySelector(".sm-node.active-node[data-sm-node]");
    if (activeSmNode) {
      setSmNode(activeSmNode.getAttribute("data-sm-node"));
    }
    const activeDemoTab = document.querySelector(".demo-tab-item.active[data-demo]");
    if (activeDemoTab) {
      renderDemo(activeDemoTab.getAttribute("data-demo"), currentDemoStep);
    }
    const activeSimBtn = document.querySelector(".btn-sim.active[data-attack]");
    if (activeSimBtn) {
      runSimLog(activeSimBtn.getAttribute("data-attack"));
    }
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      const nextLang = currentLang === "en" ? "zh" : "en";
      applyLanguage(nextLang, true);
    });
  }

  // =========================================================================
  // 1. Toast Notification & Clipboard Helpers
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
    }, 2500);
  }

  const copyCodeBtns = document.querySelectorAll(".btn-copy-code-inline");
  copyCodeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-cmd");
      if (cmd && navigator.clipboard) {
        navigator.clipboard.writeText(cmd).then(() => {
          showToast(currentLang === "zh" ? "命令已复制到剪贴板" : "Command copied to clipboard");
          const origText = btn.textContent;
          btn.textContent = currentLang === "zh" ? "已复制 ✓" : "Copied ✓";
          setTimeout(() => {
            btn.textContent = currentLang === "zh" ? "复制" : "Copy";
          }, 1800);
        });
      }
    });
  });

  const copyHashBtns = document.querySelectorAll(".btn-copy-hash");
  copyHashBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const hash = btn.getAttribute("data-hash");
      if (hash && navigator.clipboard) {
        navigator.clipboard.writeText(hash).then(() => {
          btn.textContent = currentLang === "zh" ? "已复制 ✓" : "Copied ✓";
          setTimeout(() => {
            btn.textContent = currentLang === "zh" ? "复制" : "Copy";
          }, 1800);
        });
      }
    });
  });

  // =========================================================================
  // 2. Hero Interactive Execution Console (index.html)
  // =========================================================================
  const heroTasks = {
    blender: {
      en: {
        task: "Open Blender and create a sphere",
        mcp: "application.launch ➔ computer.state ➔ mcp.execution",
        runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "launch blender.exe --python-expr 'bpy.ops.mesh.primitive_uv_sphere_add()'",
        state: "EXECUTING (Step 4/5 · Viewport Introspection)",
        worldState: "HWND 0x00320E4A visible · Mesh('Sphere') detected (vertices: 482)",
        verify: "PASS · Verification Certified"
      },
      zh: {
        task: "启动 Blender 并创建高精度三维球体网格",
        mcp: "application.launch ➔ computer.state ➔ mcp.execution",
        runner: "已连接 (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "launch blender.exe --python-expr 'bpy.ops.mesh.primitive_uv_sphere_add()'",
        state: "执行中 (阶段 4/5 · 视口句柄与网格状态探测)",
        worldState: "HWND 0x00320E4A 可见 · 检测到 Mesh('Sphere') (顶点数: 482)",
        verify: "PASS · 物理世界状态真值校验通过"
      }
    },
    docx: {
      en: {
        task: "Create architecture specification DOCX and save",
        mcp: "filesystem.init ➔ document.docx.create ➔ document.save",
        runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "write_document_stream(path='C:/Reports/Spec_v1.docx', template='tech')",
        state: "EXECUTING (Flushing OOXML package to disk)",
        worldState: "file.exists = true · size = 48,920 bytes · SHA-256: 7b2e9c1d...",
        verify: "PASS · File Attributes & Hash Validated"
      },
      zh: {
        task: "生成系统架构规范 DOCX 公文并原子落盘",
        mcp: "filesystem.init ➔ document.docx.create ➔ document.save",
        runner: "已连接 (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "write_document_stream(path='C:/Reports/Spec_v1.docx', template='tech')",
        state: "执行中 (正在将 OOXML 文档流原子写入磁盘)",
        worldState: "file.exists = true · 大小 = 48,920 字节 · SHA-256: 7b2e9c1d...",
        verify: "PASS · 文件属性与 SHA-256 哈希校验通过"
      }
    },
    browser: {
      en: {
        task: "Open Chromium, query cluster telemetry, extract metrics",
        mcp: "browser.launch ➔ browser.navigate ➔ browser.extract",
        runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "cdp.Page.navigate(url='http://127.0.0.1:9090/metrics') ➔ DOM evaluate",
        state: "EXECUTING (Waiting for network idle & DOMContentLoaded)",
        worldState: "HTTP 200 OK · table#metrics extracted (14 nodes, 82 metrics)",
        verify: "PASS · DOM Node Existence Verified"
      },
      zh: {
        task: "挂载 Chromium CDP 抓取本地集群监控指标",
        mcp: "browser.launch ➔ browser.navigate ➔ browser.extract",
        runner: "已连接 (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "cdp.Page.navigate(url='http://127.0.0.1:9090/metrics') ➔ DOM evaluate",
        state: "执行中 (等待网络空闲与 DOM 树渲染完成)",
        worldState: "HTTP 200 OK · 提取 table#metrics (14 个节点, 82 项指标)",
        verify: "PASS · DOM 节点存在性断言通过"
      }
    },
    process: {
      en: {
        task: "Compile native Rust runner binary with timeout protection",
        mcp: "runtime.spawn ➔ process.monitor ➔ runtime.verify",
        runner: "CONNECTED (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "cargo build --release --locked in sandboxed workspace",
        state: "EXECUTING (JobObject CPU quota: 80% · RAM cap: 4096MB)",
        worldState: "binary target/release/runner.exe generated · exit code: 0",
        verify: "PASS · Process Termination Clean"
      },
      zh: {
        task: "在 JobObject 沙盒配额内编译 Rust 原生二进制",
        mcp: "runtime.spawn ➔ process.monitor ➔ runtime.verify",
        runner: "已连接 (PID: 14208 · JobObject: JO_NEXUS_01)",
        action: "cargo build --release --locked (受控工作区沙箱)",
        state: "执行中 (JobObject CPU 限额: 80% · 内存上限: 4096MB)",
        worldState: "产物 target/release/runner.exe 已生成 · 退出码: 0",
        verify: "PASS · 进程树正常退出且产物校验通过"
      }
    }
  };

  const heroTaskBtns = document.querySelectorAll(".task-tab-btn[data-task]");
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
    const taskGroup = heroTasks[taskKey];
    if (!taskGroup) return;
    const data = taskGroup[currentLang] || taskGroup.en;

    if (heroTaskVal) heroTaskVal.textContent = data.task;
    if (heroMcpVal) heroMcpVal.textContent = data.mcp;
    if (heroRunnerVal) heroRunnerVal.textContent = data.runner;
    if (heroActionVal) heroActionVal.textContent = data.action;
    if (heroStateVal) heroStateVal.textContent = data.state;
    if (heroWorldVal) heroWorldVal.textContent = data.worldState;
    if (heroVerifyVal) heroVerifyVal.textContent = data.verify;

    heroTaskBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-task") === taskKey);
    });
  }

  heroTaskBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setHeroConsoleTask(btn.getAttribute("data-task"));
    });
  });

  if (heroSimulateBtn) {
    heroSimulateBtn.addEventListener("click", () => {
      const activeTask = document.querySelector(".task-tab-btn.active[data-task]");
      if (activeTask) {
        setHeroConsoleTask(activeTask.getAttribute("data-task"));
      }
      pipeNodes.forEach((n) => n.classList.remove("active"));
      pipeNodes.forEach((node, idx) => {
        setTimeout(() => {
          pipeNodes.forEach((n) => n.classList.remove("active"));
          node.classList.add("active");
        }, idx * 320);
      });
    });
  }

  // =========================================================================
  // 3. Architecture Topology Interactive Nodes (architecture.html)
  // =========================================================================
  const topoNodes = document.querySelectorAll(".topo-node");
  const tTitle = document.getElementById("topo-title");
  const tDesc = document.getElementById("topo-desc");
  const tIface = document.getElementById("topo-iface");
  const tIso = document.getElementById("topo-iso");

  const topoData = {
    ai: {
      en: {
        t: "WebAI (ChatGPT Web)",
        d: "Cognitive plane. Handles intent understanding, multi-step planning, tool selection, and replanning. Has zero direct OS privileges.",
        i: "JSON-RPC 2.0 Client",
        s: "Cloud / Browser Sandbox"
      },
      zh: {
        t: "WebAI (ChatGPT 官网)",
        d: "认知层。负责意图理解、逻辑推理、工具选择与异常重规划。本身没有任何本地物理操作系统权限。",
        i: "JSON-RPC 2.0 Client",
        s: "云端 / 浏览器沙盒"
      }
    },
    gateway: {
      en: {
        t: "MCP Gateway",
        d: "Acts as the local communication hub on 127.0.0.1, exposing SSE/stdio endpoints to receive standardized tool invocations from ChatGPT Web and authenticate requests.",
        i: "HTTP / SSE / stdio",
        s: "Local Loopback Only"
      },
      zh: {
        t: "MCP Gateway",
        d: "本地通信枢纽，在 127.0.0.1 提供 SSE/stdio 端点，负责接收来自 ChatGPT 官网的标准化工具调用并进行高熵令牌鉴权。",
        i: "HTTP / SSE / stdio",
        s: "仅限本地环回 (127.0.0.1)"
      }
    },
    registry: {
      en: {
        t: "Tool Registry",
        d: "Validates all incoming tool calls against strict JSON Schema Draft 7 contracts. Only requests matching authorized workspace boundaries are dispatched.",
        i: "AJV Schema Validator",
        s: "Strict Contract Types"
      },
      zh: {
        t: "Tool Registry",
        d: "严格验证所有传入请求的参数类型（基于 JSON Schema Draft 7），只有符合安全策略边界的操作才会被放行。",
        i: "AJV 校验器",
        s: "强类型契约"
      }
    },
    runner: {
      en: {
        t: "JobObject Runner",
        d: "Spawns child processes inside hardware-isolated Windows JobObjects. Monitors RAM/CPU quotas and terminates orphan process trees on timeout.",
        i: "Win32 CreateProcess",
        s: "Kernel JobObject Isolation"
      },
      zh: {
        t: "JobObject Runner",
        d: "在 Windows JobObject 中硬隔离拉起实际操作。实时监控内存与 CPU 配额，并在超时时从内核级终止衍生进程树。",
        i: "Win32 CreateProcess",
        s: "内核级进程隔离"
      }
    },
    ledger: {
      en: {
        t: "Action Ledger",
        d: "Append-only SQLite WAL transactional ledger. Pre-registers every action with an Idempotency Key before execution and seals it with SHA-256 receipts afterward.",
        i: "SQLite WAL",
        s: "ACID Persistent"
      },
      zh: {
        t: "Action Ledger",
        d: "预写式事务账本。所有动作在作用于系统前先写入 WAL 日志，并在完成后封存文件哈希与证据，形成不可篡改的审计链。",
        i: "SQLite WAL",
        s: "ACID 持久化"
      }
    },
    verify: {
      en: {
        t: "Verification Engine",
        d: "Ground-truth probe. Never trusts tool return strings alone—queries the OS directly for file SHA-256 hashes, process exit codes, and active HWND handles.",
        i: "Native OS Syscalls",
        s: "Zero-Trust Verification"
      },
      zh: {
        t: "Verification Engine",
        d: "物理真值探针。不轻信工具返回的表面状态，而是直接向 OS 查验文件哈希、进程退出码与窗口句柄，签发真实证据。",
        i: "原生系统调用",
        s: "零信任真值断言"
      }
    },
    state: {
      en: {
        t: "Computer State",
        d: "Tracks real-time OS state transitions including active HWND window focus, UI Automation trees, and file locks so the AI always sees ground truth.",
        i: "User32 / WinRT UIA",
        s: "Real-Time Telemetry"
      },
      zh: {
        t: "Computer State",
        d: "高频感知操作系统状态变迁，维持窗口焦点、句柄列表与无障碍 UI 树，确保执行环境与 AI 预期一致。",
        i: "User32 / WinRT UIA",
        s: "实时遥测感知"
      }
    },
    os: {
      en: {
        t: "Windows Native OS",
        d: "The physical operating system layer (NTFS, Win32, PTY, Chromium CDP) where actual mutations occur and ground-truth evidence originates.",
        i: "NTFS / Win32 / CDP",
        s: "Physical Ground Truth"
      },
      zh: {
        t: "Windows Native OS",
        d: "最终承载物理状态改变的本地操作系统底层（NTFS、Win32、PTY、Chromium CDP），所有验证证据的真值来源。",
        i: "NTFS / Win32 / CDP",
        s: "物理真值底座"
      }
    }
  };

  function renderTopoNode(moduleKey) {
    const entry = topoData[moduleKey];
    if (!entry || !tTitle) return;
    const data = entry[currentLang] || entry.en;
    tTitle.textContent = data.t;
    tDesc.textContent = data.d;
    tIface.textContent = data.i;
    tIso.textContent = data.s;
  }

  if (topoNodes.length > 0) {
    topoNodes.forEach((node) => {
      node.addEventListener("click", () => {
        topoNodes.forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        renderTopoNode(node.getAttribute("data-module"));
      });
    });
  }

  // =========================================================================
  // 4. Action Ledger Interactive Receipts & Durable State Machine (architecture.html)
  // =========================================================================
  const receiptData = {
    "1842": {
      id: "ACTION #1842",
      status: "EXECUTED · WAL_COMMITTED",
      tool: "filesystem.write",
      input: '{ "path": "C:/Reports/Q3_Summary.docx", "bytes": 48920 }',
      output: '{ "bytes_written": 48920, "fs_time_ms": 14 }',
      world: 'file.exists = true · sha256 = "e3b0c442..." · lock = false',
      verifyEn: "PASS (Direct Win32 GetFileAttributesExW & SHA256 match)",
      verifyZh: "PASS (Win32 GetFileAttributesExW 属性与 SHA256 哈希比对一致)",
      timestamp: "2026-09-30T12:00:12.842Z",
      idem: "IDEM-KEY-789a-4c21-99fe"
    },
    "1843": {
      id: "ACTION #1843",
      status: "EXECUTED · WAL_COMMITTED",
      tool: "application.launch",
      input: '{ "app": "blender.exe", "args": ["--python", "scene.py"] }',
      output: '{ "pid": 14208, "job_object": "JO_NEXUS_01", "spawn_ms": 182 }',
      world: 'process.alive = true · hwnd = "0x00320E4A" · responsive = true',
      verifyEn: "PASS (HWND enumerated & JobObject active process verified)",
      verifyZh: "PASS (HWND 窗口句柄已枚举且 JobObject 活动进程存活确认)",
      timestamp: "2026-09-30T12:01:04.119Z",
      idem: "IDEM-KEY-301b-8f12-44a0"
    },
    "1844": {
      id: "ACTION #1844",
      status: "EXECUTED · WAL_COMMITTED",
      tool: "computer.window_action",
      input: '{ "hwnd": "0x00320E4A", "action": "click", "anchor": "Render" }',
      output: '{ "dispatched": true, "uia_matched": true, "latency_ms": 9 }',
      world: 'window.foreground = true · render_job.active = true',
      verifyEn: "PASS (UI Automation tree state transition confirmed)",
      verifyZh: "PASS (UI Automation 无障碍树状态跃迁已确认)",
      timestamp: "2026-09-30T12:01:09.508Z",
      idem: "IDEM-KEY-994c-1d08-77b2"
    }
  };

  const receiptBtns = document.querySelectorAll(".receipt-select-btn");
  function setReceipt(actionId) {
    const r = receiptData[actionId];
    if (!r) return;
    const elId = document.getElementById("receipt-id");
    if (!elId) return;
    elId.textContent = r.id;
    document.getElementById("receipt-status").textContent = r.status;
    document.getElementById("receipt-tool").textContent = r.tool;
    document.getElementById("receipt-input").textContent = r.input;
    document.getElementById("receipt-output").textContent = r.output;
    document.getElementById("receipt-world").textContent = r.world;
    document.getElementById("receipt-verify").textContent = currentLang === "zh" ? r.verifyZh : r.verifyEn;
    document.getElementById("receipt-timestamp").textContent = r.timestamp;
    document.getElementById("receipt-idem").textContent = r.idem;

    receiptBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-action-id") === actionId);
    });
  }

  receiptBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setReceipt(btn.getAttribute("data-action-id"));
    });
  });

  const smData = {
    started: {
      en: {
        title: "STAGE 1: STARTED (Write-Ahead Intent Registration)",
        desc: "Before invoking any native OS API, Nexus assigns a monotonic Action ID and an Idempotency Token, committing the full parameter contract to the SQLite WAL table so no action is ever lost."
      },
      zh: {
        title: "阶段 1: STARTED (意图与参数预写登记)",
        desc: "在调用任何本地操作系统 API 前，Nexus 为本次操作分配全局单调递增的 Action ID 与幂等键（Idempotency Token），完整参数契约先行落盘至 SQLite WAL 事务表。"
      }
    },
    executing: {
      en: {
        title: "STAGE 2: EXECUTING (Sandboxed OS Dispatch)",
        desc: "The Runner executes the operation inside a Windows JobObject container while streaming real-time stdout/stderr and monitoring memory/CPU quotas."
      },
      zh: {
        title: "阶段 2: EXECUTING (受控沙箱物理执行)",
        desc: "Runner 在 Windows JobObject 隔离容器内拉起物理操作，实时流式捕获标准输出并监控内存与 CPU 硬件配额。"
      }
    },
    crash: {
      en: {
        title: "STAGE 3: CRASH DETECTED (Sudden Process or Power Interruption)",
        desc: "An unexpected external interruption occurs mid-flight (e.g., child process crash, network drop, or host power loss). Traditional agents lose state here; Nexus preserves the WAL record."
      },
      zh: {
        title: "阶段 3: CRASH (检测到进程异常中断或断电)",
        desc: "执行途中发生意外中断（如子进程崩溃、网络闪断或宿主机重启）。传统 Agent 在此丢失状态，而 Nexus 完整保留了 WAL 预写存根。"
      }
    },
    unknown: {
      en: {
        title: "STAGE 4: UNKNOWN (Anti-Duplicate Side-Effect Hold)",
        desc: "On restart, the watchdog marks the interrupted action as UNKNOWN and blocks blind retries, preventing duplicate file corruption or repeated commands."
      },
      zh: {
        title: "阶段 4: UNKNOWN (挂起并阻止盲目重复执行)",
        desc: "恢复启动后，看门狗将该未闭环动作标记为 UNKNOWN 状态，严禁直接无脑重放，从根源上杜绝重复写入或二次副作用。"
      }
    },
    world_state: {
      en: {
        title: "STAGE 5: WORLD STATE INTROSPECTION (Physical Ground-Truth Probe)",
        desc: "Nexus probes the operating system directly—checking whether the target file SHA-256 already matches or whether the process handle completed—to determine what actually happened."
      },
      zh: {
        title: "阶段 5: WORLD STATE (物理世界状态真值探测)",
        desc: "Nexus 直接向操作系统底层发起探测（核对目标文件 SHA-256 哈希是否已落盘、句柄是否已生成），查明崩溃前的真实物理结果。"
      }
    },
    committed: {
      en: {
        title: "STAGE 6: COMMITTED (Idempotent Recovery & Receipt Sealed)",
        desc: "Once ground-truth verification confirms the mutation succeeded (or cleanly rolls back partial temp files), Nexus seals the WAL receipt as COMMITTED and returns certified evidence to ChatGPT Web."
      },
      zh: {
        title: "阶段 6: COMMITTED (幂等自愈完成并签发回执)",
        desc: "当物理真值探针确认操作已完整生效（或已安全清理局部临时文件）后，Nexus 将账本状态推进至 COMMITTED，并向 ChatGPT 官网返回认证证据。"
      }
    }
  };

  const smNodes = document.querySelectorAll(".sm-node[data-sm-node]");
  const smTitle = document.getElementById("sm-detail-title");
  const smDesc = document.getElementById("sm-detail-desc");
  const btnSimCrash = document.getElementById("btn-sim-crash");

  function setSmNode(nodeKey) {
    const entry = smData[nodeKey];
    if (!entry || !smTitle) return;
    const data = entry[currentLang] || entry.en;
    smTitle.textContent = data.title;
    smDesc.textContent = data.desc;
    smNodes.forEach((n) => {
      n.classList.toggle("active-node", n.getAttribute("data-sm-node") === nodeKey);
    });
  }

  smNodes.forEach((node) => {
    node.addEventListener("click", () => {
      setSmNode(node.getAttribute("data-sm-node"));
    });
  });

  if (btnSimCrash) {
    btnSimCrash.addEventListener("click", () => {
      const sequence = ["started", "executing", "crash", "unknown", "world_state", "committed"];
      sequence.forEach((key, idx) => {
        setTimeout(() => {
          setSmNode(key);
        }, idx * 650);
      });
    });
  }

  // =========================================================================
  // 5. Interactive Demo Studio (capabilities.html)
  // =========================================================================
  const demoCaseData = {
    blender: {
      promptEn: "AI: Open Blender and create a UV sphere mesh in the active scene.",
      promptZh: "AI: 启动 Blender 并在当前三维场景中创建一个 UV 球体网格。",
      badgeEn: "Sphere Created · Verified PASS",
      badgeZh: "三维球体已生成 · 真值验证通过",
      stepsEn: [
        { title: "1. WAL Pre-Registration", desc: "Action #2041 registered with idempotency key" },
        { title: "2. Spawn Blender Process", desc: "application.launch('blender.exe') in JobObject" },
        { title: "3. Inject Python Mesh Op", desc: "bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0)" },
        { title: "4. Introspect HWND & Scene", desc: "Verify HWND 0x00320E4A & Mesh('Sphere') vertices=482" }
      ],
      stepsZh: [
        { title: "1. WAL 账本预登记", desc: "分配 Action #2041 与幂等键并写入 SQLite WAL" },
        { title: "2. 拉起 Blender 进程", desc: "在 JobObject 隔离容器内调用 application.launch" },
        { title: "3. 注入 Python 网格指令", desc: "执行 bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0)" },
        { title: "4. 窗口句柄与网格真值核验", desc: "确认 HWND 0x00320E4A 存活且 Mesh('Sphere') 顶点数=482" }
      ],
      logs: [
        "[12:04:01] WAL_APPEND: Action #2041 (tool=application.launch, idem=IDEM-BL-01)",
        "[12:04:01] JOB_OBJECT: Assigned PID 14208 -> JO_NEXUS_01 (RAM_CAP=4096MB)",
        "[12:04:02] PYTHON_EXPR: bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0)",
        "[12:04:02] WORLD_STATE: HWND=0x00320E4A | Mesh('Sphere') vertices=482 | faces=512",
        "[12:04:02] VERIFY_PASS: Certified receipt returned to ChatGPT Web."
      ]
    },
    word: {
      promptEn: "AI: Generate the Q3 Architecture Specification DOCX with tables and verify disk hash.",
      promptZh: "AI: 生成包含规范样式表与表格的 Q3 架构白皮书 DOCX 并校验落盘哈希。",
      badgeEn: "DOCX Flushed · SHA-256 Verified",
      badgeZh: "DOCX 原子落盘 · SHA-256 校验通过",
      stepsEn: [
        { title: "1. Canonical Path Check", desc: "fs.realpathSync.native('C:/Reports/Spec_v1.docx')" },
        { title: "2. Build OOXML AST", desc: "Construct styles, headings, and 4 telemetry tables" },
        { title: "3. Atomic Temp-Swap Write", desc: "Write to .tmp and atomically rename to target path" },
        { title: "4. SHA-256 Ground-Truth Probe", desc: "Verify 48,920 bytes & SHA-256 digest on NTFS" }
      ],
      stepsZh: [
        { title: "1. 物理规范路径校验", desc: "通过 fs.realpathSync.native 校验目标工作区边界" },
        { title: "2. 构建 OpenXML 文档树", desc: "注入公文样式表、多级标题与 4 张架构指标表格" },
        { title: "3. 原子临时文件落盘", desc: "写入临时文件并原子重命名至 Spec_v1.docx" },
        { title: "4. SHA-256 物理真值探针", desc: "核对 NTFS 磁盘文件字节数 (48,920B) 与哈希签名" }
      ],
      logs: [
        "[12:05:10] REALPATH_OK: C:\\Reports\\Spec_v1.docx inside authorized sandbox",
        "[12:05:10] OOXML_BUILD: 3 heading levels, 4 tables, valid ZIP container",
        "[12:05:10] ATOMIC_SWAP: Spec_v1.docx.tmp -> Spec_v1.docx (48,920 bytes)",
        "[12:05:10] WORLD_STATE: sha256=7b2e9c1d4a8f... | file_locked=false",
        "[12:05:10] VERIFY_PASS: Certified receipt returned to ChatGPT Web."
      ]
    },
    browser: {
      promptEn: "AI: Navigate Chromium to local telemetry dashboard and extract node health metrics.",
      promptZh: "AI: 通过 Chromium CDP 访问本地监控面板并提取集群健康指标。",
      badgeEn: "DOM Extracted · HTTP 200 Verified",
      badgeZh: "DOM 指标已提取 · HTTP 200 验证通过",
      stepsEn: [
        { title: "1. Attach CDP Session", desc: "Connect to Chromium DevTools Protocol on loopback" },
        { title: "2. Navigate & Wait Idle", desc: "browser.navigate('http://127.0.0.1:9090/metrics')" },
        { title: "3. Semantic DOM Extract", desc: "Query table.telemetry rows and parse 82 metrics" },
        { title: "4. Assert Readiness State", desc: "Confirm HTTP 200 & #app-ready visible in DOM" }
      ],
      stepsZh: [
        { title: "1. 挂载 CDP 会话通道", desc: "连接本地 Chromium DevTools Protocol 调试信道" },
        { title: "2. 页面导航与网络空闲等待", desc: "导航至 http://127.0.0.1:9090/metrics 并等待 networkidle0" },
        { title: "3. 语义化 DOM 树提取", desc: "解析 table.telemetry 节点并提取 82 项核心指标" },
        { title: "4. 页面就绪状态断言", desc: "确认 HTTP 200 状态码且 #app-ready 元素可见" }
      ],
      logs: [
        "[12:06:18] CDP_ATTACH: Connected to local Chromium target (ws://127.0.0.1:9222)",
        "[12:06:18] NAVIGATE: http://127.0.0.1:9090/metrics (status=200, wait=networkidle0)",
        "[12:06:19] DOM_EXTRACT: selector='table.telemetry' -> 14 rows, 82 metric cells",
        "[12:06:19] WORLD_STATE: #app-ready visible=true | console_errors=0",
        "[12:06:19] VERIFY_PASS: Certified receipt returned to ChatGPT Web."
      ]
    }
  };

  let currentDemoKey = "blender";
  let currentDemoStep = 4;
  const demoTabs = document.querySelectorAll(".demo-tab-item[data-demo]");
  const demoPromptBox = document.getElementById("demo-prompt-box");
  const demoStepper = document.getElementById("demo-steps-stepper");
  const demoLogsBox = document.getElementById("demo-logs-box");
  const demoResultBadge = document.getElementById("demo-result-badge");
  const btnDemoPlay = document.getElementById("btn-demo-play");

  function renderDemo(demoKey, upToStep = 4) {
    currentDemoKey = demoKey;
    currentDemoStep = upToStep;
    const d = demoCaseData[demoKey];
    if (!d || !demoStepper) return;

    if (demoPromptBox) {
      demoPromptBox.textContent = currentLang === "zh" ? d.promptZh : d.promptEn;
    }
    if (demoResultBadge) {
      demoResultBadge.textContent = currentLang === "zh" ? d.badgeZh : d.badgeEn;
    }

    const steps = currentLang === "zh" ? d.stepsZh : d.stepsEn;
    demoStepper.innerHTML = "";
    steps.forEach((s, idx) => {
      const stepEl = document.createElement("div");
      stepEl.className = "demo-step-item" + (idx < upToStep ? " completed" : "");
      stepEl.innerHTML = `<div class="demo-step-title" style="font-weight:700;color:#f8fafc;">${s.title}</div><div class="demo-step-desc" style="font-size:0.82rem;color:#94a3b8;">${s.desc}</div>`;
      demoStepper.appendChild(stepEl);
    });

    if (demoLogsBox) {
      demoLogsBox.textContent = d.logs.slice(0, upToStep + 1).join("\n");
    }

    demoTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-demo") === demoKey);
    });
  }

  demoTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      renderDemo(tab.getAttribute("data-demo"), 4);
    });
  });

  if (btnDemoPlay) {
    btnDemoPlay.addEventListener("click", () => {
      [1, 2, 3, 4].forEach((stepIdx, i) => {
        setTimeout(() => {
          renderDemo(currentDemoKey, stepIdx);
        }, i * 450);
      });
    });
  }

  // =========================================================================
  // 6. Security Defense Simulator (security.html)
  // =========================================================================
  const simBtns = document.querySelectorAll(".btn-sim");
  const simConsole = document.getElementById("sim-console-output");

  const attackLogs = {
    path: {
      en: [
        { text: "> INCOMING RPC: fs.read({ path: '../../../Windows/System32/sam' })", color: "text-blue" },
        { text: "[KERNEL] Normalizing path via fs.realpathSync.native...", color: "text-muted", delay: 250 },
        { text: "[ENFORCER] Path traversal detected! Attempted to escape workspace sandbox.", color: "text-yellow", delay: 500 },
        { text: "[ENFORCER] Target resolved to: C:\\Windows\\System32\\sam", color: "text-yellow", delay: 650 },
        { text: "💥 BLOCKED: fs.read action denied. Security Policy: SANDBOX_ESCAPE", color: "text-red", delay: 900 },
        { text: "📝 ACTION_LEDGER: Incident logged to write-ahead log (TxID: 9x882a).", color: "text-purple", delay: 1150 }
      ],
      zh: [
        { text: "> 收到 RPC 请求: fs.read({ path: '../../../Windows/System32/sam' })", color: "text-blue" },
        { text: "[KERNEL] 正在通过 fs.realpathSync.native 解析物理规范路径...", color: "text-muted", delay: 250 },
        { text: "[ENFORCER] 检测到路径跨越攻击！试图逃逸已授权工作区沙箱。", color: "text-yellow", delay: 500 },
        { text: "[ENFORCER] 目标真实路径映射为: C:\\Windows\\System32\\sam", color: "text-yellow", delay: 650 },
        { text: "💥 BLOCKED: fs.read 操作已被物理阻断。安全策略: SANDBOX_ESCAPE", color: "text-red", delay: 900 },
        { text: "📝 ACTION_LEDGER: 拦截事件已写入 WAL 审计账本 (TxID: 9x882a)。", color: "text-purple", delay: 1150 }
      ]
    },
    memory: {
      en: [
        { text: "> INCOMING RPC: runtime.execute({ cmd: 'node leak.js' })", color: "text-blue" },
        { text: "[JOB_OBJECT] Wrapping process in Windows JobObject. MaxRAM: 1024MB.", color: "text-muted", delay: 250 },
        { text: "[WATCHDOG] Process started. PID 18992.", color: "text-emerald", delay: 500 },
        { text: "[WATCHDOG] Warning: Memory spiking... (980MB / 1024MB)", color: "text-yellow", delay: 900 },
        { text: "💥 BLOCKED: Process 18992 exceeded JobObject memory quota.", color: "text-red", delay: 1200 },
        { text: "[KERNEL] Hard-terminating process tree and all descendants.", color: "text-muted", delay: 1450 },
        { text: "📝 ACTION_LEDGER: Incident logged. Status: ERROR_QUOTA_EXCEEDED.", color: "text-purple", delay: 1700 }
      ],
      zh: [
        { text: "> 收到 RPC 请求: runtime.execute({ cmd: 'node leak.js' })", color: "text-blue" },
        { text: "[JOB_OBJECT] 已将进程装入 Windows JobObject 隔离容器，内存上限: 1024MB。", color: "text-muted", delay: 250 },
        { text: "[WATCHDOG] 子进程已启动，PID 18992。", color: "text-emerald", delay: 500 },
        { text: "[WATCHDOG] 告警：内存分配激增... (980MB / 1024MB)", color: "text-yellow", delay: 900 },
        { text: "💥 BLOCKED: 进程 18992 触发 JobObject 物理内存硬限额。", color: "text-red", delay: 1200 },
        { text: "[KERNEL] 已从内核级强制终止该进程及其所有衍生子进程。", color: "text-muted", delay: 1450 },
        { text: "📝 ACTION_LEDGER: 审计账本已记录熔断事件 (状态: ERROR_QUOTA_EXCEEDED)。", color: "text-purple", delay: 1700 }
      ]
    },
    env: {
      en: [
        { text: "> INCOMING RPC: fs.read({ path: '/workspace/.env' })", color: "text-blue" },
        { text: "[ENFORCER] Checking sensitive file shield policy...", color: "text-muted", delay: 250 },
        { text: "[ENFORCER] Pattern match: '.env' is marked as SENSITIVE_CREDENTIAL.", color: "text-yellow", delay: 550 },
        { text: "💥 BLOCKED: Denied access to protected credential file.", color: "text-red", delay: 850 },
        { text: "📝 ACTION_LEDGER: Blocked secret read logged to WAL.", color: "text-purple", delay: 1100 }
      ],
      zh: [
        { text: "> 收到 RPC 请求: fs.read({ path: '/workspace/.env' })", color: "text-blue" },
        { text: "[ENFORCER] 正在核查敏感凭据物理屏蔽列表...", color: "text-muted", delay: 250 },
        { text: "[ENFORCER] 规则命中：'.env' 属于受保护凭据文件 (SENSITIVE_CREDENTIAL)。", color: "text-yellow", delay: 550 },
        { text: "💥 BLOCKED: 已物理拒绝读取私密凭据文件。", color: "text-red", delay: 850 },
        { text: "📝 ACTION_LEDGER: 敏感凭据拦截记录已写入 WAL 账本。", color: "text-purple", delay: 1100 }
      ]
    },
    fork: {
      en: [
        { text: "> INCOMING RPC: runtime.execute({ cmd: 'bash fork_bomb.sh' })", color: "text-blue" },
        { text: "[JOB_OBJECT] Active process count limit applied: Max 50.", color: "text-muted", delay: 250 },
        { text: "[WATCHDOG] Rapid process spawning detected (rate: 100/s).", color: "text-yellow", delay: 600 },
        { text: "💥 BLOCKED: JobObject ActiveProcessLimit reached.", color: "text-red", delay: 950 },
        { text: "[KERNEL] Freezing job execution and reaping 50 zombie processes...", color: "text-muted", delay: 1200 },
        { text: "📝 ACTION_LEDGER: Fork bomb neutralized. Host OS unaffected.", color: "text-purple", delay: 1450 }
      ],
      zh: [
        { text: "> 收到 RPC 请求: runtime.execute({ cmd: 'bash fork_bomb.sh' })", color: "text-blue" },
        { text: "[JOB_OBJECT] 已应用活动进程数配额限制：最大 50 个子进程。", color: "text-muted", delay: 250 },
        { text: "[WATCHDOG] 检测到异常高频进程派生 (速率: 100/s)。", color: "text-yellow", delay: 600 },
        { text: "💥 BLOCKED: 已触发 JobObject ActiveProcessLimit 进程数上限。", color: "text-red", delay: 950 },
        { text: "[KERNEL] 冻结作业并一键清理全部 50 个衍生僵尸进程...", color: "text-muted", delay: 1200 },
        { text: "📝 ACTION_LEDGER: 派生炸弹已物理化解，宿主机系统安然无恙。", color: "text-purple", delay: 1450 }
      ]
    }
  };

  function runSimLog(type) {
    if (!simConsole) return;
    const headerMsg =
      currentLang === "zh"
        ? "Nexus 主动防御子系统已就绪。"
        : "Nexus Defense Subsystem Active.";
    simConsole.innerHTML = `<div class="sim-line text-emerald">${headerMsg}</div>`;
    const group = attackLogs[type];
    if (!group) return;
    const logs = group[currentLang] || group.en;

    simBtns.forEach((b) => b.classList.remove("active"));
    const btn = document.querySelector(`.btn-sim[data-attack="${type}"]`);
    if (btn) btn.classList.add("active");

    logs.forEach((logItem) => {
      setTimeout(() => {
        const div = document.createElement("div");
        div.className = `sim-line ${logItem.color}`;

        let html = logItem.text;
        if (html.includes("BLOCKED")) html = html.replace("BLOCKED", "<strong>BLOCKED</strong>");
        if (html.includes("ACTION_LEDGER")) html = html.replace("ACTION_LEDGER", "<strong>ACTION_LEDGER</strong>");
        div.innerHTML = html;

        simConsole.appendChild(div);
        simConsole.scrollTop = simConsole.scrollHeight;
      }, logItem.delay || 0);
    });
  }

  if (simBtns.length > 0) {
    simBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        runSimLog(btn.getAttribute("data-attack"));
      });
    });
  }

  // =========================================================================
  // 7. OS Selector Tabs & FAQ Accordions (download.html & capabilities.html)
  // =========================================================================
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach((q) => {
    q.addEventListener("click", () => {
      const item = q.closest(".faq-item");
      if (item) item.classList.toggle("open");
    });
  });

  const osTabBtns = document.querySelectorAll(".os-tab-btn");
  const osPanes = document.querySelectorAll(".os-pane");
  if (osTabBtns.length > 0) {
    osTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        osTabBtns.forEach((b) => b.classList.remove("active"));
        osPanes.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const targetId = "pane-" + btn.getAttribute("data-os");
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add("active");
      });
    });

    const ua = window.navigator.userAgent.toLowerCase();
    let detectedOS = "win";
    if (ua.includes("mac") || ua.includes("darwin")) detectedOS = "mac";
    else if (ua.includes("linux")) detectedOS = "linux";
    const defaultBtn = document.querySelector(`.os-tab-btn[data-os="${detectedOS}"]`);
    if (defaultBtn) defaultBtn.click();
  }

  const capTabBtns = document.querySelectorAll(".cap-tab-btn");
  const capPanels = document.querySelectorAll(".cap-panel");
  if (capTabBtns.length > 0) {
    capTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        capTabBtns.forEach((b) => b.classList.remove("active"));
        capPanels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const cat = btn.getAttribute("data-cat");
        const panel = document.querySelector(`.cap-panel[data-cat-panel="${cat}"]`);
        if (panel) panel.classList.add("active");
      });
    });
  }

  // =========================================================================
  // 8. Mobile Navigation Drawer
  // =========================================================================
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const navLinksContainer = document.querySelector(".nav-links");
  if (mobileToggle && navLinksContainer) {
    mobileToggle.addEventListener("click", () => {
      navLinksContainer.classList.toggle("mobile-open");
    });
  }

  // =========================================================================
  // 9. Initialize Default States & Apply Language
  // =========================================================================
  setHeroConsoleTask("blender");
  renderTopoNode("gateway");
  setReceipt("1842");
  setSmNode("started");
  renderDemo("blender", 4);
  if (simBtns.length > 0) {
    runSimLog("path");
  }
  applyLanguage(currentLang, false);
});
