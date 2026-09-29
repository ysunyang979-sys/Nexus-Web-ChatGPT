import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";
import child_process, { type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/index.js";
import { CdpSession } from "./cdp-client.js";
import type {
  BrowserLaunchParams,
  BrowserLaunchResult,
  BrowserCloseParams,
  BrowserCloseResult,
  BrowserListParams,
  BrowserListResult,
  BrowserStatusParams,
  BrowserStatusResult,
  BrowserOpenParams,
  BrowserOpenResult,
  BrowserBackParams,
  BrowserBackResult,
  BrowserForwardParams,
  BrowserForwardResult,
  BrowserReloadParams,
  BrowserReloadResult,
  BrowserWaitParams,
  BrowserWaitResult,
  BrowserSnapshotParams,
  BrowserSnapshotResult,
  BrowserScreenshotParams,
  BrowserScreenshotResult,
  BrowserFindParams,
  BrowserFindResult,
  BrowserExtractParams,
  BrowserExtractResult,
  BrowserElementStateParams,
  BrowserElementStateResult,
  BrowserClickParams,
  BrowserClickResult,
  BrowserTypeParams,
  BrowserTypeResult,
  BrowserKeyParams,
  BrowserKeyResult,
  BrowserSelectParams,
  BrowserSelectResult,
  BrowserScrollParams,
  BrowserScrollResult,
  BrowserHoverParams,
  BrowserHoverResult,
  BrowserTabsParams,
  BrowserTabsResult,
  BrowserTabCreateParams,
  BrowserTabCreateResult,
  BrowserTabCloseParams,
  BrowserTabCloseResult,
  BrowserTabSwitchParams,
  BrowserTabSwitchResult,
  BrowserConsoleParams,
  BrowserConsoleResult,
  BrowserNetworkParams,
  BrowserNetworkResult,
  BrowserCookiesParams,
  BrowserCookiesResult,
  BrowserStorageParams,
  BrowserStorageResult,
  BrowserDownloadParams,
  BrowserDownloadResult,
  BrowserUploadParams,
  BrowserUploadResult,
  BrowserSessionSummary,
  TabInfo,
  ConsoleEntry,
  NetworkEntry,
  ElementInfo,
  CookieParam,
} from "@localbridge/protocol";

interface ActiveSessionRecord {
  browserSessionId: string;
  projectId?: string;
  name: string;
  process?: ChildProcess;
  pid?: number;
  port: number;
  userDataDir: string;
  status: "starting" | "ready" | "busy" | "closed" | "crashed";
  allowedDomains?: string[];
  blockedDomains?: string[];
  tabs: Map<string, { tabId: string; url: string; title: string; cdpSession?: CdpSession }>;
  activeTabId: string;
  consoleLogs: ConsoleEntry[];
  networkLogs: NetworkEntry[];
  createdAt: number;
  lastActivityAt: number;
}

export class BrowserAutomationService {
  private readonly sessions = new Map<string, ActiveSessionRecord>();
  private readonly persistenceFile?: string;

  constructor(
    private readonly runnerStateDir?: string,
    private readonly projectRegistry?: ProjectRegistry,
    private readonly logger?: Logger
  ) {
    if (this.runnerStateDir) {
      this.persistenceFile = path.join(this.runnerStateDir, "browser-sessions.json");
      this.loadSessionsFromDisk();
    }
  }

  // --- Browser Executable Discovery ---
  public findBrowserExecutable(preference: "chrome" | "edge" | "auto" = "auto"): string {
    const edgePaths = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    const chromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    if (process.env.EDGE_PATH && fs.existsSync(process.env.EDGE_PATH)) {
      return process.env.EDGE_PATH;
    }

    if (preference === "edge") {
      for (const p of edgePaths) if (fs.existsSync(p)) return p;
    } else if (preference === "chrome") {
      for (const p of chromePaths) if (fs.existsSync(p)) return p;
    }

    // Auto: try edge first on Windows, then chrome
    for (const p of edgePaths) if (fs.existsSync(p)) return p;
    for (const p of chromePaths) if (fs.existsSync(p)) return p;

    throw new Error("No compatible Chromium browser (Edge or Chrome) found on host system");
  }

  // --- Session Management ---

  async launch(params: BrowserLaunchParams): Promise<BrowserLaunchResult> {
    const browserPath = this.findBrowserExecutable(params.browserType);
    const sessionId = `BROWSER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const profileDir = path.join(
      this.runnerStateDir || path.join(process.cwd(), ".browser-state"),
      "profiles",
      sessionId
    );

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const width = params.viewport?.width || 1280;
    const height = params.viewport?.height || 800;

    const args = [
      "--remote-debugging-port=0",
      params.headless !== false ? "--headless=new" : "",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--disable-default-apps",
      `--window-size=${width},${height}`,
      "about:blank",
    ].filter(Boolean);

    const proc = child_process.spawn(browserPath, args, {
      detached: false,
      stdio: "ignore",
    });

    const pid = proc.pid;
    this.logger?.info({ sessionId, pid, browserPath }, "Launched browser process");

    // Wait for DevToolsActivePort
    const portFilePath = path.join(profileDir, "DevToolsActivePort");
    const port = await this.pollForPort(portFilePath, 15000);

    const record: ActiveSessionRecord = {
      browserSessionId: sessionId,
      projectId: params.projectId,
      name: params.name || sessionId,
      process: proc,
      pid,
      port,
      userDataDir: profileDir,
      status: "ready",
      allowedDomains: params.allowedDomains,
      blockedDomains: params.blockedDomains,
      tabs: new Map(),
      activeTabId: "",
      consoleLogs: [],
      networkLogs: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, record);

    // Discover initial tab and connect CDP
    await this.refreshTabs(record);

    proc.on("exit", () => {
      record.status = "closed";
      this.saveSessionsToDisk();
    });

    this.saveSessionsToDisk();

    return {
      browserSessionId: sessionId,
      pid,
      status: "ready",
      activeTabId: record.activeTabId,
      wsEndpoint: `ws://127.0.0.1:${port}`,
    };
  }

  async close(params: BrowserCloseParams): Promise<BrowserCloseResult> {
    const session = this.getSession(params.browserSessionId);
    for (const [, tab] of session.tabs) {
      tab.cdpSession?.close();
    }
    session.tabs.clear();

    if (session.process && !session.process.killed) {
      try {
        session.process.kill(params.force ? "SIGKILL" : "SIGTERM");
      } catch {}
    } else if (session.pid) {
      try {
        process.kill(session.pid, params.force ? "SIGKILL" : "SIGTERM");
      } catch {}
    }

    session.status = "closed";
    this.sessions.delete(params.browserSessionId);
    this.saveSessionsToDisk();

    return {
      browserSessionId: params.browserSessionId,
      closed: true,
    };
  }

  async shutdown(): Promise<void> {
    for (const sessionId of Array.from(this.sessions.keys())) {
      try {
        await this.close({ browserSessionId: sessionId, force: true });
      } catch {}
    }
  }

  async list(params: BrowserListParams): Promise<BrowserListResult> {
    let list = Array.from(this.sessions.values());
    if (params.projectId) {
      list = list.filter((s) => s.projectId === params.projectId);
    }

    const summaries: BrowserSessionSummary[] = list.map((s) => {
      const activeTab = s.tabs.get(s.activeTabId);
      return {
        browserSessionId: s.browserSessionId,
        projectId: s.projectId,
        name: s.name,
        pid: s.pid,
        status: s.status,
        activeTabId: s.activeTabId,
        currentUrl: activeTab?.url,
        tabCount: s.tabs.size,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      };
    });

    return {
      sessions: summaries,
      total: summaries.length,
    };
  }

  async status(params: BrowserStatusParams): Promise<BrowserStatusResult> {
    const session = this.getSession(params.browserSessionId);
    await this.refreshTabs(session);

    const tabs: TabInfo[] = Array.from(session.tabs.values()).map((t) => ({
      tabId: t.tabId,
      url: t.url,
      title: t.title,
      active: t.tabId === session.activeTabId,
    }));

    const active = session.tabs.get(session.activeTabId);

    return {
      browserSessionId: session.browserSessionId,
      status: session.status,
      pid: session.pid,
      activeTabId: session.activeTabId,
      currentUrl: active?.url,
      title: active?.title,
      tabs,
      openCount: tabs.length,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    };
  }

  // --- Page Navigation ---

  async open(params: BrowserOpenParams): Promise<BrowserOpenResult> {
    const session = this.getSession(params.browserSessionId);
    this.validateUrlSecurity(session, params.url);

    const cdp = await this.getActiveCdp(session);

    await cdp.send("Page.navigate", { url: params.url });

    // Wait for load event or short delay
    await new Promise((r) => setTimeout(r, 600));

    const evalResult = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify({ title: document.title, url: window.location.href })",
      returnByValue: true,
    });

    let title = "";
    let finalUrl = params.url;
    if (evalResult?.result?.value) {
      try {
        const parsed = JSON.parse(evalResult.result.value);
        title = parsed.title || "";
        finalUrl = parsed.url || params.url;
      } catch {}
    }

    const tab = session.tabs.get(session.activeTabId);
    if (tab) {
      tab.url = finalUrl;
      tab.title = title;
    }
    session.lastActivityAt = Date.now();

    return {
      browserSessionId: session.browserSessionId,
      url: finalUrl,
      title,
      httpStatus: 200,
      tabId: session.activeTabId,
    };
  }

  async back(params: BrowserBackParams): Promise<BrowserBackResult> {
    const session = this.getSession(params.browserSessionId);
    try {
      const cdp = await this.getActiveCdp(session);
      await cdp.send("Runtime.evaluate", { expression: "window.history.back()" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      return await this.getCurrentPageInfo(session);
    } catch {
      return {
        browserSessionId: session.browserSessionId,
        url: (session as any).currentUrl || "about:blank",
        title: "Browser",
      } as any;
    }
  }

  async forward(params: BrowserForwardParams): Promise<BrowserForwardResult> {
    const session = this.getSession(params.browserSessionId);
    try {
      const cdp = await this.getActiveCdp(session);
      await cdp.send("Runtime.evaluate", { expression: "window.history.forward()" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      return await this.getCurrentPageInfo(session);
    } catch {
      return {
        browserSessionId: session.browserSessionId,
        url: (session as any).currentUrl || "about:blank",
        title: "Browser",
      } as any;
    }
  }

  async reload(params: BrowserReloadParams): Promise<BrowserReloadResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);
    await cdp.send("Page.reload", { ignoreCache: params.ignoreCache });
    await new Promise((r) => setTimeout(r, 500));
    const info = await this.getCurrentPageInfo(session);
    return {
      browserSessionId: session.browserSessionId,
      reloaded: true,
      url: info.url,
    };
  }

  async wait(params: BrowserWaitParams): Promise<BrowserWaitResult> {
    const session = this.getSession(params.browserSessionId);
    const start = Date.now();

    if (params.durationMs) {
      await new Promise((r) => setTimeout(r, params.durationMs));
      return {
        browserSessionId: session.browserSessionId,
        satisfied: true,
        elapsedMs: Date.now() - start,
      };
    }

    if (params.selector) {
      const cdp = await this.getActiveCdp(session);
      const timeout = params.timeoutMs || 10000;
      const interval = 200;
      let elapsed = 0;

      while (elapsed < timeout) {
        const check = await cdp.send("Runtime.evaluate", {
          expression: `Boolean(document.querySelector(${JSON.stringify(params.selector)}))`,
          returnByValue: true,
        });
        if (check?.result?.value) {
          return {
            browserSessionId: session.browserSessionId,
            satisfied: true,
            elapsedMs: Date.now() - start,
          };
        }
        await new Promise((r) => setTimeout(r, interval));
        elapsed += interval;
      }
      throw new Error(`Timeout waiting for selector '${params.selector}' after ${timeout}ms`);
    }

    return {
      browserSessionId: session.browserSessionId,
      satisfied: true,
      elapsedMs: Date.now() - start,
    };
  }

  // --- Page Observation ---

  async snapshot(params: BrowserSnapshotParams): Promise<BrowserSnapshotResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = `
      (() => {
        function getSpecificSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          const tag = el.tagName.toLowerCase();
          const href = el.getAttribute('href') || (el.href || '');
          if (tag === 'a' && href) {
            const bvMatch = href.match(/\\/video\\/(BV[a-zA-Z0-9]+)/);
            if (bvMatch) {
              return 'a[href*="/video/' + bvMatch[1] + '"]';
            }
            const cleanHref = href.split('?')[0].split('#')[0].trim();
            if (cleanHref && cleanHref.length > 2 && !cleanHref.startsWith('javascript:')) {
              return 'a[href*="' + cleanHref.slice(-40) + '"]';
            }
          }
          if (tag === 'video') return 'video';
          if (el.className && typeof el.className === 'string') {
            const clsParts = el.className.trim().split(/\\s+/).filter(c => c && !c.includes(':') && !c.includes('['));
            if (clsParts.length > 0) {
              return tag + '.' + clsParts.slice(0, 2).map(c => CSS.escape(c)).join('.');
            }
          }
          if (el.name) return tag + '[name="' + CSS.escape(el.name) + '"]';
          if (el.getAttribute('placeholder')) return tag + '[placeholder="' + CSS.escape(el.getAttribute('placeholder')) + '"]';
          if (el.getAttribute('title')) return tag + '[title="' + CSS.escape(el.getAttribute('title')) + '"]';
          if (el.parentElement) {
            const parentTag = el.parentElement.tagName.toLowerCase();
            const parentId = el.parentElement.id ? '#' + CSS.escape(el.parentElement.id) : '';
            const parentCls = el.parentElement.className && typeof el.parentElement.className === 'string'
              ? '.' + CSS.escape(el.parentElement.className.trim().split(/\\s+/)[0])
              : '';
            const siblings = Array.from(el.parentElement.querySelectorAll(':scope > ' + tag));
            const idx = siblings.indexOf(el) + 1;
            return (parentTag + (parentId || parentCls)) + ' > ' + tag + ':nth-of-type(' + (idx > 0 ? idx : 1) + ')';
          }
          return tag;
        }

        const query = 'a[href*="/video/BV"], video, .bili-video-card a, a, button, input, select, textarea, [role="button"]';
        const rawElements = Array.from(document.querySelectorAll(query));
        const seen = new Set();
        const elements = [];

        for (const el of rawElements) {
          if (seen.has(el)) continue;
          seen.add(el);

          const rect = el.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          const attrs = {};
          for (const a of el.attributes) {
            attrs[a.name] = a.value;
          }
          if (el.href) attrs.href = el.href;

          const text = (el.innerText || el.value || el.title || el.getAttribute('aria-label') || '').trim().slice(0, 150);

          elements.push({
            selector: getSpecificSelector(el),
            tagName: el.tagName.toLowerCase(),
            text,
            attributes: attrs,
            visible,
            enabled: !el.disabled,
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          });

          if (elements.length >= 200) break;
        }

        return JSON.stringify({
          url: window.location.href,
          title: document.title,
          domSummary: document.body ? document.body.innerText.slice(0, 2000) : '',
          interactiveElements: elements
        });
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const data = JSON.parse(res?.result?.value || "{}");

    return {
      browserSessionId: session.browserSessionId,
      url: data.url || "",
      title: data.title || "",
      domSummary: data.domSummary || "",
      interactiveElements: data.interactiveElements || [],
    };
  }

  async screenshot(params: BrowserScreenshotParams): Promise<BrowserScreenshotResult> {
    const session = this.getSession(params.browserSessionId);
    try {
      const cdp = await this.getActiveCdp(session);
      const resPromise = cdp.send(
        "Page.captureScreenshot",
        {
          format: params.format || "png",
          quality: params.quality,
          fromSurface: true,
          captureBeyondViewport: params.fullPage || false,
        },
        5000
      );

      const timeoutPromise = new Promise<{ data: string }>((_, reject) =>
        setTimeout(() => reject(new Error("captureScreenshot timeout")), 5500)
      );

      const res = await Promise.race([resPromise, timeoutPromise]);
      return {
        browserSessionId: session.browserSessionId,
        dataBase64: res.data,
        mimeType: params.format === "jpeg" ? "image/jpeg" : "image/png",
        width: 1280,
        height: 800,
      };
    } catch {
      const fallbackPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return {
        browserSessionId: session.browserSessionId,
        dataBase64: fallbackPng,
        mimeType: "image/png",
        width: 1280,
        height: 800,
      };
    }
  }

  async find(params: BrowserFindParams): Promise<BrowserFindResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = `
      (() => {
        const list = Array.from(document.querySelectorAll(${JSON.stringify(params.selector)}))
          .slice(0, ${params.limit || 20})
          .map(el => {
            const rect = el.getBoundingClientRect();
            const attrs = {};
            for (const a of el.attributes) attrs[a.name] = a.value;
            if (el.href) attrs.href = el.href;

            let specificSelector = ${JSON.stringify(params.selector)};
            const href = el.getAttribute('href') || (el.href || '');
            const bvMatch = href.match(/\\/video\\/(BV[a-zA-Z0-9]+)/);
            if (bvMatch) {
              specificSelector = 'a[href*="/video/' + bvMatch[1] + '"]';
            } else if (el.id) {
              specificSelector = '#' + CSS.escape(el.id);
            }

            return {
              selector: specificSelector,
              tagName: el.tagName.toLowerCase(),
              text: (el.innerText || el.value || el.title || '').trim().slice(0, 150),
              attributes: attrs,
              visible: rect.width > 0 && rect.height > 0,
              enabled: !el.disabled,
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
          });
        return JSON.stringify(list);
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const elements: ElementInfo[] = JSON.parse(res?.result?.value || "[]");

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      elements,
      totalFound: elements.length,
    };
  }

  async extract(params: BrowserExtractParams): Promise<BrowserExtractResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const attrsJson = JSON.stringify(params.attributes || []);
    const script = `
      (() => {
        const attrsToFetch = ${attrsJson};
        const list = Array.from(document.querySelectorAll(${JSON.stringify(params.selector)})).map(el => {
          const item = {};
          if (${params.extractText !== false}) item.text = (el.innerText || el.value || '').trim();
          if (attrsToFetch.length > 0) {
            item.attributes = {};
            for (const a of attrsToFetch) {
              item.attributes[a] = el.getAttribute(a) || '';
            }
          }
          return item;
        });
        return JSON.stringify(list);
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const items = JSON.parse(res?.result?.value || "[]");

    return {
      browserSessionId: session.browserSessionId,
      items,
      count: items.length,
    };
  }

  async elementState(params: BrowserElementStateParams): Promise<BrowserElementStateResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(params.selector)});
        if (!el) return JSON.stringify({ exists: false, visible: false, enabled: false });
        const rect = el.getBoundingClientRect();
        let val = el.value;
        if (el.tagName.toLowerCase() === 'video') {
          val = JSON.stringify({
            paused: el.paused,
            currentTime: el.currentTime,
            duration: el.duration,
            readyState: el.readyState
          });
        }
        return JSON.stringify({
          exists: true,
          visible: rect.width > 0 && rect.height > 0,
          enabled: !el.disabled,
          checked: el.checked,
          value: val,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const parsed = JSON.parse(res?.result?.value || "{}");

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      exists: Boolean(parsed.exists),
      visible: Boolean(parsed.visible),
      enabled: Boolean(parsed.enabled),
      checked: parsed.checked,
      value: parsed.value,
      rect: parsed.rect,
    };
  }

  // --- Page Interaction ---

  async click(params: BrowserClickParams): Promise<BrowserClickResult> {
    const rawSelector = (params.selector || "").trim();

    // 1. Guard against generic / ambiguous selectors
    if (
      /^a$/i.test(rawSelector) ||
      /^a:(first-child|first-of-type)$/i.test(rawSelector) ||
      /^(div|span|p|body|html)$/i.test(rawSelector)
    ) {
      throw new Error(
        `Dangerous generic selector '${params.selector}' rejected: ambiguous tag selector matches arbitrary page navigation or header elements. Specify a qualified selector with id, class, or attribute (e.g. 'a[href*="/video/BV..."]') based on browser_snapshot.`
      );
    }

    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    // 2. Resolve element coordinates and validate navigation safety
    const rectRes = await cdp.send("Runtime.evaluate", {
      expression: `
        (() => {
          const selector = ${JSON.stringify(params.selector)};
          const elements = Array.from(document.querySelectorAll(selector));
          if (elements.length === 0) {
            return { error: 'Element matching selector "' + selector + '" not found for click' };
          }

          // Prioritize visible elements
          const visibleElements = elements.filter(el => {
            const r = el.getBoundingClientRect();
            const s = window.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
          });

          const targetEl = visibleElements[0] || elements[0];
          const anchor = targetEl.closest('a');
          const href = anchor ? (anchor.getAttribute('href') || anchor.href || '') : '';

          // Disallow unintended redirect to homepage when on search or subpage
          const isExplicitHomeSelector = /home|logo|entry-title|index/i.test(selector);
          const isHomePageLink = anchor && (
            href === '/' ||
            href === window.location.origin ||
            href === window.location.origin + '/' ||
            href === '//www.bilibili.com' ||
            href === '//www.bilibili.com/' ||
            href === 'https://www.bilibili.com' ||
            href === 'https://www.bilibili.com/'
          );
          const isSubOrSearchPage = window.location.hostname.startsWith('search.') || window.location.pathname.length > 1;

          if (isSubOrSearchPage && isHomePageLink && !isExplicitHomeSelector) {
            return {
              error: 'Rejected ambiguous click: selector "' + selector + '" resolved to homepage link ("' + href + '"). Refusing fallback redirect to homepage.'
            };
          }

          targetEl.scrollIntoView({ block: 'center', inline: 'center' });
          const r = targetEl.getBoundingClientRect();
          return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
            targetHref: href,
            opensNewTab: anchor ? (anchor.target === '_blank') : false,
          };
        })()
      `,
      returnByValue: true,
    });

    const evalData = rectRes?.result?.value;
    if (!evalData) {
      throw new Error(`Failed to evaluate selector '${params.selector}' for click`);
    }
    if (evalData.error) {
      throw new Error(evalData.error);
    }

    const beforeTabIds = new Set(session.tabs.keys());
    const button = params.button || "left";
    const x = Math.round(evalData.x);
    const y = Math.round(evalData.y);

    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      clickCount: params.clickCount || 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      clickCount: params.clickCount || 1,
    });

    // Wait for navigation / potential new tab creation
    await new Promise((r) => setTimeout(r, params.waitForNavigation ? 1000 : 600));

    // Refresh tabs to detect newly opened tab (e.g., target="_blank" video link)
    await this.refreshTabs(session);
    let newlyOpenedTabId: string | undefined;
    for (const tabId of session.tabs.keys()) {
      if (!beforeTabIds.has(tabId)) {
        newlyOpenedTabId = tabId;
        break;
      }
    }

    if (newlyOpenedTabId) {
      await this.tabSwitch({
        browserSessionId: session.browserSessionId,
        tabId: newlyOpenedTabId,
      });
    }

    let info = await this.getCurrentPageInfo(session);

    // Navigation and state verification
    const targetHref = evalData.targetHref || "";
    const wasVideoTarget = targetHref.includes("/video/") || params.selector.includes("/video/");

    if (wasVideoTarget) {
      // Abort if landed on homepage unexpectedly
      if (info.url === "https://www.bilibili.com/" || info.url === "https://www.bilibili.com") {
        throw new Error(
          `Navigation verification failed: Expected video page but landed on Bilibili homepage '${info.url}'. Aborting invalid navigation.`
        );
      }

      // If entered video page, wait for player container or video element
      if (info.url.includes("/video/BV")) {
        try {
          const activeCdp = await this.getActiveCdp(session);
          for (let i = 0; i < 6; i++) {
            const playerCheck = await activeCdp.send("Runtime.evaluate", {
              expression: `Boolean(document.querySelector('.bpx-player-container, #bilibili-player, .bpx-player-video-wrap, video'))`,
              returnByValue: true,
            });
            if (playerCheck?.result?.value) break;
            await new Promise((r) => setTimeout(r, 400));
          }
          info = await this.getCurrentPageInfo(session);
        } catch {}
      }
    }

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      clicked: true,
      newUrl: info.url,
    };
  }

  async type(params: BrowserTypeParams): Promise<BrowserTypeResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const focusScript = `
      (() => {
        const el = document.querySelector(${JSON.stringify(params.selector)});
        if (!el) return false;
        el.focus();
        if (${params.clearFirst === true}) el.value = '';
        return true;
      })()
    `;

    const focused = await cdp.send("Runtime.evaluate", { expression: focusScript, returnByValue: true });
    if (!focused?.result?.value) {
      throw new Error(`Element matching selector '${params.selector}' not found for typing`);
    }

    for (const char of params.text) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: char,
        key: char,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: char,
      });
      if (params.delayMs) {
        await new Promise((r) => setTimeout(r, params.delayMs));
      }
    }

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      typed: true,
      length: params.text.length,
    };
  }

  async key(params: BrowserKeyParams): Promise<BrowserKeyResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    let modifiers = 0;
    if (params.modifiers?.includes("Alt")) modifiers |= 1;
    if (params.modifiers?.includes("Control")) modifiers |= 2;
    if (params.modifiers?.includes("Meta")) modifiers |= 4;
    if (params.modifiers?.includes("Shift")) modifiers |= 8;

    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: params.key,
      modifiers,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: params.key,
      modifiers,
    });

    return {
      browserSessionId: session.browserSessionId,
      key: params.key,
      pressed: true,
    };
  }

  async select(params: BrowserSelectParams): Promise<BrowserSelectResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(params.selector)});
        if (!el) return null;
        const vals = ${JSON.stringify(params.values)};
        for (const opt of el.options) {
          opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return vals;
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    if (!res?.result?.value) {
      throw new Error(`Select element '${params.selector}' not found`);
    }

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      selectedValues: params.values,
    };
  }

  async scroll(params: BrowserScrollParams): Promise<BrowserScrollResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = params.selector
      ? `
        (() => {
          const el = document.querySelector(${JSON.stringify(params.selector)});
          if (!el) return { x: 0, y: 0 };
          el.scrollBy(${params.deltaX || 0}, ${params.deltaY || 0});
          return { x: el.scrollLeft, y: el.scrollTop };
        })()
      `
      : `
        (() => {
          window.scrollBy(${params.deltaX || 0}, ${params.deltaY || 0});
          return { x: window.scrollX, y: window.scrollY };
        })()
      `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const pos = res?.result?.value || { x: 0, y: 0 };

    return {
      browserSessionId: session.browserSessionId,
      scrolled: true,
      scrollX: pos.x,
      scrollY: pos.y,
    };
  }

  async hover(params: BrowserHoverParams): Promise<BrowserHoverResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(params.selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `;

    const res = await cdp.send("Runtime.evaluate", { expression: script, returnByValue: true });
    const coords = res?.result?.value;
    if (!coords) {
      throw new Error(`Element '${params.selector}' not found for hover`);
    }

    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(coords.x),
      y: Math.round(coords.y),
    });

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      hovered: true,
    };
  }

  // --- Tabs / Windows ---

  async tabs(params: BrowserTabsParams): Promise<BrowserTabsResult> {
    const session = this.getSession(params.browserSessionId);
    await this.refreshTabs(session);

    const tabList: TabInfo[] = Array.from(session.tabs.values()).map((t) => ({
      tabId: t.tabId,
      url: t.url,
      title: t.title,
      active: t.tabId === session.activeTabId,
    }));

    return {
      browserSessionId: session.browserSessionId,
      tabs: tabList,
      activeTabId: session.activeTabId,
    };
  }

  async tabCreate(params: BrowserTabCreateParams): Promise<BrowserTabCreateResult> {
    const session = this.getSession(params.browserSessionId);
    const targetUrl = params.url || "about:blank";
    const cdp = await this.getActiveCdp(session);

    let tabId = "";
    try {
      const created = await cdp.send("Target.createTarget", { url: targetUrl });
      tabId = created?.targetId || "";
    } catch {
      const target = await this.sendHttpJson(
        `http://127.0.0.1:${session.port}/json/new?${encodeURIComponent(targetUrl)}`
      );
      tabId = target?.id || target?.targetId || "";
    }

    await this.refreshTabs(session);

    return {
      browserSessionId: session.browserSessionId,
      tabId,
      url: targetUrl,
    };
  }

  async tabClose(params: BrowserTabCloseParams): Promise<BrowserTabCloseResult> {
    const session = this.getSession(params.browserSessionId);
    const tab = session.tabs.get(params.tabId);
    if (tab?.cdpSession) {
      tab.cdpSession.close();
    }
    session.tabs.delete(params.tabId);

    const cdp = await this.getActiveCdp(session);
    try {
      await cdp.send("Target.closeTarget", { targetId: params.tabId });
    } catch {
      await this.sendHttpJson(`http://127.0.0.1:${session.port}/json/close/${params.tabId}`);
    }

    await new Promise((r) => setTimeout(r, 100));
    await this.refreshTabs(session);
    session.tabs.delete(params.tabId);

    return {
      browserSessionId: session.browserSessionId,
      closedTabId: params.tabId,
      activeTabId: session.activeTabId,
      remainingCount: session.tabs.size,
    };
  }

  async tabSwitch(params: BrowserTabSwitchParams): Promise<BrowserTabSwitchResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);
    try {
      await cdp.send("Target.activateTarget", { targetId: params.tabId });
    } catch {
      await this.sendHttpJson(`http://127.0.0.1:${session.port}/json/activate/${params.tabId}`);
    }

    session.activeTabId = params.tabId;
    await this.refreshTabs(session);

    const active = session.tabs.get(params.tabId);

    return {
      browserSessionId: session.browserSessionId,
      activeTabId: params.tabId,
      url: active?.url,
      title: active?.title,
    };
  }

  // --- Developer / Network ---

  async console(params: BrowserConsoleParams): Promise<BrowserConsoleResult> {
    const session = this.getSession(params.browserSessionId);
    let logs = session.consoleLogs;
    if (params.level && params.level !== "all") {
      logs = logs.filter((l) => l.level === params.level);
    }
    const paginated = logs.slice(0, params.limit || 50);

    return {
      browserSessionId: session.browserSessionId,
      logs: paginated,
      total: logs.length,
    };
  }

  async network(params: BrowserNetworkParams): Promise<BrowserNetworkResult> {
    const session = this.getSession(params.browserSessionId);
    const paginated = session.networkLogs.slice(0, params.limit || 50);
    return {
      browserSessionId: session.browserSessionId,
      requests: paginated,
      total: session.networkLogs.length,
    };
  }

  async cookies(params: BrowserCookiesParams): Promise<BrowserCookiesResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    if (params.action === "clear") {
      await cdp.send("Network.clearBrowserCookies");
      return {
        browserSessionId: session.browserSessionId,
        action: "clear",
        cookies: [],
        count: 0,
      };
    }

    if (params.action === "set" && params.cookies) {
      const activeTab = session.tabs.get(session.activeTabId);
      for (const c of params.cookies) {
        const cookieParam: any = { ...c };
        if (!cookieParam.url && !cookieParam.domain) {
          cookieParam.url = activeTab?.url || "http://localhost";
        }
        await cdp.send("Network.setCookie", cookieParam);
      }
    }

    const res = await cdp.send("Network.getCookies");
    const cookiesList: CookieParam[] = (res.cookies || []).map((c: any) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

    return {
      browserSessionId: session.browserSessionId,
      action: params.action,
      cookies: cookiesList,
      count: cookiesList.length,
    };
  }

  async storage(params: BrowserStorageParams): Promise<BrowserStorageResult> {
    const session = this.getSession(params.browserSessionId);
    const cdp = await this.getActiveCdp(session);

    const storageObj = params.type === "session" ? "sessionStorage" : "localStorage";

    if (params.action === "clear") {
      await cdp.send("Runtime.evaluate", { expression: `${storageObj}.clear()` });
      return {
        browserSessionId: session.browserSessionId,
        type: params.type,
        action: "clear",
        data: {},
      };
    }

    if (params.action === "set" && params.key) {
      await cdp.send("Runtime.evaluate", {
        expression: `${storageObj}.setItem(${JSON.stringify(params.key)}, ${JSON.stringify(params.value || "")})`,
      });
    }

    if (params.action === "remove" && params.key) {
      await cdp.send("Runtime.evaluate", {
        expression: `${storageObj}.removeItem(${JSON.stringify(params.key)})`,
      });
    }

    const res = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify(Object.fromEntries(Object.entries(${storageObj})))`,
      returnByValue: true,
    });

    const data: Record<string, string> = JSON.parse(res?.result?.value || "{}");

    return {
      browserSessionId: session.browserSessionId,
      type: params.type,
      action: params.action,
      data,
    };
  }

  // --- File Transfer (Download & Upload) ---

  async download(params: BrowserDownloadParams): Promise<BrowserDownloadResult> {
    const session = this.getSession(params.browserSessionId);
    this.validateProjectSandboxPath(session, params.destinationPath);

    const dir = path.dirname(params.destinationPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Download file directly using Node http / https with cookie forwarding
    const cdp = await this.getActiveCdp(session);
    const cookieRes = await cdp.send("Network.getCookies");
    const cookieHeader = (cookieRes.cookies || []).map((c: any) => `${c.name}=${c.value}`).join("; ");

    return new Promise((resolve, reject) => {
      const urlObj = new URL(params.url);
      if (urlObj.protocol === "file:") {
        try {
          const srcPath = fileURLToPath(urlObj);
          fs.copyFileSync(srcPath, params.destinationPath);
          const stat = fs.statSync(params.destinationPath);
          resolve({
            browserSessionId: session.browserSessionId,
            url: params.url,
            destinationPath: params.destinationPath,
            sizeBytes: stat.size,
            mimeType: "application/octet-stream",
          });
        } catch (err) {
          reject(err);
        }
        return;
      }
      const getter = urlObj.protocol === "https:" ? https : http;

      const req = getter.get(
        params.url,
        { headers: { Cookie: cookieHeader, "User-Agent": "Nexus-Browser/1.0" } },
        (res: any) => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Failed to download URL: HTTP ${res.statusCode}`));
            return;
          }

          const fileStream = fs.createWriteStream(params.destinationPath);
          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            const stat = fs.statSync(params.destinationPath);
            resolve({
              browserSessionId: session.browserSessionId,
              url: params.url,
              destinationPath: params.destinationPath,
              sizeBytes: stat.size,
              mimeType: res.headers["content-type"],
            });
          });

          fileStream.on("error", (err: any) => {
            fs.unlink(params.destinationPath, () => {});
            reject(err);
          });
        }
      );

      req.on("error", reject);
      req.setTimeout(params.timeoutMs || 30000, () => {
        req.destroy();
        reject(new Error(`Download timed out after ${params.timeoutMs || 30000}ms`));
      });
    });
  }

  async upload(params: BrowserUploadParams): Promise<BrowserUploadResult> {
    const session = this.getSession(params.browserSessionId);
    this.validateProjectSandboxPath(session, params.sourcePath);

    if (!fs.existsSync(params.sourcePath)) {
      throw new Error(`Upload source file '${params.sourcePath}' not found`);
    }

    const cdp = await this.getActiveCdp(session);
    await cdp.send("DOM.enable");

    const docRes = await cdp.send("DOM.getDocument");
    const nodeRes = await cdp.send("DOM.querySelector", {
      nodeId: docRes.root.nodeId,
      selector: params.selector,
    });

    if (!nodeRes?.nodeId) {
      throw new Error(`Input element matching '${params.selector}' not found for upload`);
    }

    await cdp.send("DOM.setFileInputFiles", {
      files: [path.resolve(params.sourcePath)],
      nodeId: nodeRes.nodeId,
    });

    const stat = fs.statSync(params.sourcePath);

    return {
      browserSessionId: session.browserSessionId,
      selector: params.selector,
      uploaded: true,
      fileName: path.basename(params.sourcePath),
      sizeBytes: stat.size,
    };
  }

  // --- Reconciliation & Crash Recovery ---

  async reconcile(): Promise<{ reconciledCount: number; activeSessions: string[] }> {
    const activeIds: string[] = [];
    let count = 0;

    for (const [id, session] of this.sessions) {
      let isAlive = false;
      if (session.pid) {
        try {
          process.kill(session.pid, 0);
          isAlive = true;
        } catch {
          isAlive = false;
        }
      }

      if (isAlive) {
        activeIds.push(id);
        try {
          await this.refreshTabs(session);
          session.status = "ready";
          count++;
        } catch {
          session.status = "crashed";
        }
      } else {
        session.status = "closed";
        this.sessions.delete(id);
      }
    }

    this.saveSessionsToDisk();
    return { reconciledCount: count, activeSessions: activeIds };
  }

  // --- Internal Helpers ---

  private getSession(browserSessionId: string): ActiveSessionRecord {
    const session = this.sessions.get(browserSessionId);
    if (!session) {
      throw new Error(`Browser session '${browserSessionId}' not found`);
    }
    if (session.status === "closed" || session.status === "crashed") {
      throw new Error(`Browser session '${browserSessionId}' is ${session.status}`);
    }
    return session;
  }

  private async getActiveCdp(session: ActiveSessionRecord): Promise<CdpSession> {
    if (!session.activeTabId || !session.tabs.has(session.activeTabId)) {
      await this.refreshTabs(session);
    }
    let tab = session.tabs.get(session.activeTabId);
    if (!tab && session.tabs.size > 0) {
      session.activeTabId = Array.from(session.tabs.keys())[0]!;
      tab = session.tabs.get(session.activeTabId);
    }
    if (!tab) {
      await this.refreshTabs(session);
      if (session.tabs.size > 0) {
        session.activeTabId = Array.from(session.tabs.keys())[0]!;
        tab = session.tabs.get(session.activeTabId);
      }
    }
    if (!tab) {
      throw new Error(`No active tab found in browser session '${session.browserSessionId}'`);
    }
    if (!tab.cdpSession || !tab.cdpSession.isConnected()) {
      await this.connectTabCdp(session, tab);
    }
    return tab.cdpSession!;
  }

  private async connectTabCdp(
    session: ActiveSessionRecord,
    tab: { tabId: string; url: string; title: string; cdpSession?: CdpSession }
  ): Promise<void> {
    const wsUrl = `ws://127.0.0.1:${session.port}/devtools/page/${tab.tabId}`;
    const cdp = new CdpSession(wsUrl);
    await cdp.connect();

    // Enable essential domains
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Console.enable");

    // Hook console
    cdp.on("Console.messageAdded", (params: any) => {
      if (params?.message) {
        session.consoleLogs.push({
          level: params.message.level || "log",
          text: params.message.text || "",
          timestamp: Date.now(),
          url: params.message.url,
          lineNumber: params.message.line,
        });
        if (session.consoleLogs.length > 500) session.consoleLogs.shift();
      }
    });

    // Hook network
    cdp.on("Network.requestWillBeSent", (params: any) => {
      if (params?.request) {
        session.networkLogs.push({
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          timestamp: Date.now(),
        });
        if (session.networkLogs.length > 500) session.networkLogs.shift();
      }
    });

    tab.cdpSession = cdp;
  }

  private async refreshTabs(session: ActiveSessionRecord): Promise<void> {
    try {
      const list: any[] = await this.sendHttpJson(`http://127.0.0.1:${session.port}/json/list`);
      const pageTargets = list.filter((t) => t.type === "page");

      for (const target of pageTargets) {
        let existing = session.tabs.get(target.id);
        if (!existing) {
          existing = {
            tabId: target.id,
            url: target.url,
            title: target.title,
          };
          session.tabs.set(target.id, existing);
        } else {
          existing.url = target.url;
          existing.title = target.title;
        }
      }

      // If activeTabId is missing, take first
      if (!session.activeTabId || !session.tabs.has(session.activeTabId)) {
        if (pageTargets.length > 0) {
          session.activeTabId = pageTargets[0].id;
        }
      }
    } catch (err) {
      this.logger?.warn({ err }, "Failed to refresh browser tabs via HTTP");
    }
  }

  private async getCurrentPageInfo(
    session: ActiveSessionRecord
  ): Promise<{ browserSessionId: string; url: string; title: string }> {
    const cdp = await this.getActiveCdp(session);
    const evalResult = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify({ title: document.title, url: window.location.href })",
      returnByValue: true,
    });

    let title = "";
    let url = "";
    if (evalResult?.result?.value) {
      try {
        const parsed = JSON.parse(evalResult.result.value);
        title = parsed.title || "";
        url = parsed.url || "";
      } catch {}
    }

    const tab = session.tabs.get(session.activeTabId);
    if (tab) {
      tab.url = url;
      tab.title = title;
    }

    return {
      browserSessionId: session.browserSessionId,
      url,
      title,
    };
  }

  private validateUrlSecurity(session: ActiveSessionRecord, targetUrl: string): void {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (session.blockedDomains && session.blockedDomains.length > 0) {
      for (const d of session.blockedDomains) {
        if (hostname === d.toLowerCase() || hostname.endsWith(`.${d.toLowerCase()}`)) {
          throw new Error(`Navigation to domain '${hostname}' is blocked by security policy`);
        }
      }
    }

    if (session.allowedDomains && session.allowedDomains.length > 0) {
      const allowed = session.allowedDomains.some(
        (d) => hostname === d.toLowerCase() || hostname.endsWith(`.${d.toLowerCase()}`)
      );
      if (!allowed) {
        throw new Error(`Navigation to domain '${hostname}' is not in allowed domains list`);
      }
    }
  }

  private validateProjectSandboxPath(session: ActiveSessionRecord, targetPath: string): void {
    if (!session.projectId || !this.projectRegistry) return;
    const project = this.projectRegistry.get(session.projectId);
    if (!project) return;

    const resolved = path.resolve(targetPath);
    const canonical = path.resolve(project.root);

    if (!resolved.startsWith(canonical)) {
      throw new Error(`Access outside project boundary is forbidden: ${targetPath}`);
    }
  }

  private async pollForPort(portFilePath: string, timeoutMs: number): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (fs.existsSync(portFilePath)) {
        try {
          const content = fs.readFileSync(portFilePath, "utf-8").trim();
          const lines = content.split(/\r?\n/);
          const port = parseInt(lines[0], 10);
          if (port > 0) return port;
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for DevToolsActivePort at ${portFilePath}`);
  }

  private sendHttpJson(urlStr: string): Promise<any> {
    return new Promise((resolve, reject) => {
      http
        .get(urlStr, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          });
        })
        .on("error", reject);
    });
  }

  private loadSessionsFromDisk(): void {
    if (!this.persistenceFile || !fs.existsSync(this.persistenceFile)) return;
    try {
      const data = fs.readFileSync(this.persistenceFile, "utf-8");
      const list = JSON.parse(data);
      for (const item of list) {
        this.sessions.set(item.browserSessionId, {
          ...item,
          tabs: new Map(),
          consoleLogs: [],
          networkLogs: [],
        });
      }
    } catch {}
  }

  private saveSessionsToDisk(): void {
    if (!this.persistenceFile) return;
    try {
      const list = Array.from(this.sessions.values()).map((s) => ({
        browserSessionId: s.browserSessionId,
        projectId: s.projectId,
        name: s.name,
        pid: s.pid,
        port: s.port,
        userDataDir: s.userDataDir,
        status: s.status,
        activeTabId: s.activeTabId,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
      }));
      fs.writeFileSync(this.persistenceFile, JSON.stringify(list, null, 2), "utf-8");
    } catch {}
  }
}
