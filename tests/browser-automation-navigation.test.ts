import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BrowserAutomationService } from "../apps/runner/src/browser/browser-service.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Browser Automation Navigation and Targeting Guardrails", () => {
  let tmpDir: string;
  let browserService: BrowserAutomationService;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-browser-test-"));
    browserService = new BrowserAutomationService(tmpDir);
  });

  afterAll(async () => {
    try {
      await browserService.shutdown();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("strictly rejects dangerous generic '<a>' and unverified container selectors", async () => {
    // 1. Naked anchor tag 'a'
    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "a",
      })
    ).rejects.toThrow(/Dangerous generic selector 'a' rejected/);

    // 2. Whitespace-padded anchor tag '  a  '
    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "  a  ",
      })
    ).rejects.toThrow(/Dangerous generic selector ' {2}a {2}' rejected/);

    // 3. 'a:first-child'
    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "a:first-child",
      })
    ).rejects.toThrow(/Dangerous generic selector 'a:first-child' rejected/);

    // 4. 'a:first-of-type'
    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "a:first-of-type",
      })
    ).rejects.toThrow(/Dangerous generic selector 'a:first-of-type' rejected/);

    // 5. Naked container 'div', 'span', 'p'
    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "div",
      })
    ).rejects.toThrow(/Dangerous generic selector 'div' rejected/);

    await expect(
      browserService.click({
        browserSessionId: "non-existent-session",
        selector: "span",
      })
    ).rejects.toThrow(/Dangerous generic selector 'span' rejected/);
  });

  it("extracts specific video selectors and protects against homepage redirect in simulated DOM", async () => {
    let session: any;
    try {
      session = await browserService.launch({
        headless: true,
        timeoutMs: 15000,
      });

      // Load a test HTML page mimicking Bilibili search page structure
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Bilibili Search Results</title></head>
        <body>
          <div class="header">
            <a class="entry-title" href="https://www.bilibili.com/">Bilibili Home Logo</a>
          </div>
          <div class="search-page-result">
            <div class="bili-video-card">
              <a href="https://www.bilibili.com/video/BV1xx411c7mD" target="_blank" title="清风明月 第一回">
                <span class="title">清风明月 第一回</span>
              </a>
            </div>
            <div class="bili-video-card">
              <a href="https://www.bilibili.com/video/BV2yy411c8kE" target="_blank" title="清风明月 第二回">
                <span class="title">清风明月 第二回</span>
              </a>
            </div>
          </div>
          <div class="player-test">
            <video width="320" height="240" src="data:video/mp4;base64,AAAA"></video>
          </div>
        </body>
        </html>
      `;
      const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await browserService.open({
        browserSessionId: session.browserSessionId,
        url: dataUri,
      });

      // 1. Test Snapshot
      const snap = await browserService.snapshot({
        browserSessionId: session.browserSessionId,
      });

      expect(snap.interactiveElements.length).toBeGreaterThan(0);
      const videoLinks = snap.interactiveElements.filter((el) =>
        el.selector.includes("/video/BV")
      );
      expect(videoLinks.length).toBe(2);
      expect(videoLinks[0].selector).toBe('a[href*="/video/BV1xx411c7mD"]');
      expect(videoLinks[0].attributes?.href).toBe("https://www.bilibili.com/video/BV1xx411c7mD");

      // Verify no naked "a" was emitted anywhere in interactiveElements
      for (const el of snap.interactiveElements) {
        expect(el.selector).not.toBe("a");
      }

      // 2. Test Find
      const findRes = await browserService.find({
        browserSessionId: session.browserSessionId,
        selector: 'a[href*="/video/BV"]',
      });
      expect(findRes.totalFound).toBe(2);
      expect(findRes.elements[0].selector).toBe('a[href*="/video/BV1xx411c7mD"]');
      expect(findRes.elements[1].selector).toBe('a[href*="/video/BV2yy411c8kE"]');

      // 3. Test ElementState on <video>
      const videoState = await browserService.elementState({
        browserSessionId: session.browserSessionId,
        selector: "video",
      });
      expect(videoState.exists).toBe(true);
      expect(videoState.value).toBeDefined();
      const parsedVal = JSON.parse(videoState.value || "{}");
      expect(parsedVal).toHaveProperty("paused");

      // 4. Test ambiguous homepage link click rejection
      await expect(
        browserService.click({
          browserSessionId: session.browserSessionId,
          selector: ".header a",
        })
      ).rejects.toThrow(/Refusing fallback redirect to homepage/);

      // 5. Test clicking real video link
      const clickRes = await browserService.click({
        browserSessionId: session.browserSessionId,
        selector: videoLinks[0].selector,
      });
      expect(clickRes.clicked).toBe(true);
    } finally {
      if (session) {
        await browserService.close({
          browserSessionId: session.browserSessionId,
          force: true,
        });
      }
    }
  });
});
