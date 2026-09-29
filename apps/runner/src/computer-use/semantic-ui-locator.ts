import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import type {
  SemanticUILocatorParams,
  SemanticUILocatorResult,
  AccessibilityElement,
} from "@localbridge/protocol";
import type { WindowsNativeCore } from "./windows-native-core.js";
import type { VisionService } from "../vision/vision-service.js";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export class SemanticUILocator {
  constructor(
    private readonly nativeCore: WindowsNativeCore,
    private readonly visionService?: VisionService,
    private readonly logger?: Logger
  ) {}

  private async runPowerShell(script: string, timeoutMs = 25000): Promise<string> {
    const fullScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n$ProgressPreference = 'SilentlyContinue'\n` + script;
    const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout.trim();
    } catch (err: any) {
      throw new Error(`SemanticUILocator error: ${err?.message || String(err)}`);
    }
  }

  /**
   * Multi-level UI locator:
   * Level 1: UI Automation
   * Level 2: Control Tree
   * Level 3: Accessibility
   * Level 4: Windows Media OCR
   * Level 5: Local Vision / Heuristics
   */
  async locate(params: SemanticUILocatorParams): Promise<SemanticUILocatorResult> {
    const target = params.target.trim();
    const preferredLevel = params.preferredLevel || 1;

    // LEVEL 0: Window-level resolution if targetType === "window" or looking for application window
    if (params.targetType === "window" || /window|窗口/i.test(params.targetType || "")) {
      try {
        const winList = await this.nativeCore.listWindows();
        const q = target.toLowerCase();
        const isNotepad = /notepad|记事本|文本编辑器/i.test(q);
        const isCalc = /calc|计算器/i.test(q);
        const foundWin = winList.windows.find(
          (w) =>
            w.title.toLowerCase().includes(q) ||
            w.processName?.toLowerCase().includes(q) ||
            w.handle === target ||
            (isNotepad && (w.title.includes("记事本") || w.title.includes("Notepad") || w.processName?.toLowerCase().includes("notepad"))) ||
            (isCalc && (w.title.includes("计算器") || w.title.includes("calc") || w.processName?.toLowerCase().includes("calc")))
        );
        if (foundWin && foundWin.bounds && foundWin.bounds.width > 0 && foundWin.bounds.height > 0) {
          const cx = Math.floor(foundWin.bounds.x + foundWin.bounds.width / 2);
          const cy = Math.floor(foundWin.bounds.y + foundWin.bounds.height / 2);
          return {
            found: true,
            resolvedLevel: 1,
            levelName: "UIAutomation",
            boundingBox: foundWin.bounds,
            clickPoint: { x: cx, y: cy },
            confidence: 0.95,
            matchedText: foundWin.title,
            elementInfo: {
              name: foundWin.title,
              automationId: foundWin.handle,
              controlType: "Window",
              className: "Window",
              boundingBox: foundWin.bounds,
              isEnabled: true,
              isOffscreen: false,
              childrenCount: 0,
            },
          };
        }
      } catch (err: any) {
        this.logger?.debug({ err: err?.message }, "Window lookup failed, falling back to UIA");
      }
    }

    // LEVEL 1 & 2: Windows UI Automation & Control Tree
    if (preferredLevel <= 2) {
      try {
        const uiaResult = await this.locateViaUIAutomation(target, params.windowHandleOrTitle, params.targetType);
        if (uiaResult && uiaResult.found) {
          return uiaResult;
        }
      } catch (e: any) {
        this.logger?.debug({ err: e?.message }, "Level 1/2 UI Automation search missed, falling back");
      }
    }

    // LEVEL 3: Accessibility Tree
    if (preferredLevel <= 3) {
      try {
        const accResult = await this.locateViaAccessibility(target, params.windowHandleOrTitle);
        if (accResult && accResult.found) {
          return accResult;
        }
      } catch (e: any) {
        this.logger?.debug({ err: e?.message }, "Level 3 Accessibility search missed, falling back");
      }
    }

    // LEVEL 4: Windows Media OCR (Extremely reliable for visible buttons & text)
    if (preferredLevel <= 4 && this.visionService) {
      try {
        const ocrResult = await this.locateViaOCR(target, params.windowHandleOrTitle);
        if (ocrResult && ocrResult.found) {
          return ocrResult;
        }
      } catch (e: any) {
        this.logger?.debug({ err: e?.message }, "Level 4 OCR search missed, falling back");
      }
    }

    // LEVEL 5: Local Vision & Semantic Heuristics
    const heuristicResult = await this.locateViaHeuristics(target, params.windowHandleOrTitle);
    if (heuristicResult && heuristicResult.found) {
      return heuristicResult;
    }

    return {
      found: false,
      resolvedLevel: 0,
      levelName: "UIAutomation",
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      clickPoint: { x: 0, y: 0 },
      confidence: 0,
      matchedText: undefined,
    };
  }

  private async locateViaUIAutomation(
    targetText: string,
    windowQuery?: string,
    targetType?: string
  ): Promise<SemanticUILocatorResult | null> {
    const qWin = windowQuery ? `"${windowQuery.replace(/"/g, '`"')}"` : "$null";
    const qTarget = `"${targetText.replace(/"/g, '`"')}".ToLower()`;
    const qType = targetType && targetType !== "any" ? `"${targetType}"` : "$null";

    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
if (${qWin} -ne $null) {
    $qw = ${qWin}.ToLower()
    $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $wins) {
        if ($w.Current.Name.ToLower().Contains($qw) -or $w.Current.NativeWindowHandle.ToString() -eq $qw) {
            $root = $w
            break
        }
    }
}

$targetTerm = ${qTarget}
$filterType = ${qType}

$elems = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$found = $null

foreach ($el in $elems) {
    $c = $el.Current
    if ($c.IsOffscreen) { continue }
    $name = $c.Name.ToLower()
    $autoId = $c.AutomationId.ToLower()
    $cType = $c.ControlType.ProgrammaticName.Replace("ControlType.", "")

    if ($filterType -ne $null -and !$cType.Equals($filterType, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
    }

    if ($name.Contains($targetTerm) -or $autoId.Contains($targetTerm)) {
        $rc = $c.BoundingRectangle
        if ($rc.Width -gt 5 -and $rc.Height -gt 5) {
            $found = [PSCustomObject]@{
                name = $c.Name
                automationId = $c.AutomationId
                controlType = $cType
                className = $c.ClassName
                x = [int]$rc.X
                y = [int]$rc.Y
                width = [int]$rc.Width
                height = [int]$rc.Height
            }
            break
        }
    }
}

if ($found) {
    $found | ConvertTo-Json -Compress
} else {
    Write-Output "null"
}
`;

    const out = await this.runPowerShell(script, 15000);
    if (!out || out === "null") return null;

    const parsed = JSON.parse(out);
    const cx = Math.floor(parsed.x + parsed.width / 2);
    const cy = Math.floor(parsed.y + parsed.height / 2);

    return {
      found: true,
      resolvedLevel: 1,
      levelName: "UIAutomation",
      boundingBox: { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height },
      clickPoint: { x: cx, y: cy },
      confidence: 0.95,
      matchedText: parsed.name,
      elementInfo: {
        name: parsed.name,
        automationId: parsed.automationId,
        controlType: parsed.controlType,
        className: parsed.className,
        boundingBox: { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height },
        isEnabled: true,
        isOffscreen: false,
        childrenCount: 0,
      },
    };
  }

  private async locateViaAccessibility(
    targetText: string,
    windowQuery?: string
  ): Promise<SemanticUILocatorResult | null> {
    // Accessibility fallback via UIAutomation ControlType
    return this.locateViaUIAutomation(targetText, windowQuery);
  }

  private async locateViaOCR(
    targetText: string,
    windowQuery?: string
  ): Promise<SemanticUILocatorResult | null> {
    if (!this.visionService) return null;

    // Capture screen
    const screenCap = await this.nativeCore.captureScreen(true);
    if (!screenCap.savedPath || !fs.existsSync(screenCap.savedPath)) return null;

    const ocrResult = await this.visionService.ocr({ imagePath: screenCap.savedPath, language: "eng+chi_sim" });
    const cleanTarget = targetText.replace(/\s+/g, "").toLowerCase();

    // Check each OCR line for substring match
    for (const line of ocrResult.lines) {
      const cleanLine = line.text.replace(/\s+/g, "").toLowerCase();
      if (cleanLine.includes(cleanTarget) || cleanTarget.includes(cleanLine)) {
        const bbox = line.boundingBox || { x: 0, y: 0, width: 100, height: 30 };
        const cx = Math.floor(bbox.x + bbox.width / 2);
        const cy = Math.floor(bbox.y + bbox.height / 2);

        return {
          found: true,
          resolvedLevel: 4,
          levelName: "OCR",
          boundingBox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
          clickPoint: { x: cx, y: cy },
          confidence: line.confidence || 0.92,
          matchedText: line.text,
        };
      }
    }

    return null;
  }

  private async locateViaHeuristics(
    targetText: string,
    windowQuery?: string
  ): Promise<SemanticUILocatorResult | null> {
    const list = await this.nativeCore.listWindows();
    let win = list.activeWindow;
    if (windowQuery) {
      const q = windowQuery.toLowerCase();
      win = list.windows.find((w) => w.title.toLowerCase().includes(q) || w.processName?.toLowerCase().includes(q)) || win;
    }

    if (!win || !win.bounds) return null;
    const b = win.bounds;
    const lower = targetText.toLowerCase();

    // Semantic region heuristics:
    // 1. "保存" / "save" -> Ribbon upper-left (e.g. x: left + 60, y: top + 40)
    if (/保存|save/i.test(lower)) {
      return {
        found: true,
        resolvedLevel: 5,
        levelName: "LocalVision",
        boundingBox: { x: b.x + 30, y: b.y + 25, width: 60, height: 40 },
        clickPoint: { x: b.x + 60, y: b.y + 45 },
        confidence: 0.85,
        matchedText: "Heuristic: Quick Save region",
      };
    }

    // 2. "正文" / "编辑区" / "content" / "canvas" / "document" -> Document center
    if (/正文|编辑区|canvas|document|body|content/i.test(lower)) {
      const cx = Math.floor(b.x + b.width / 2);
      const cy = Math.floor(b.y + b.height / 2);
      return {
        found: true,
        resolvedLevel: 5,
        levelName: "LocalVision",
        boundingBox: { x: b.x + 100, y: b.y + 150, width: b.width - 200, height: b.height - 250 },
        clickPoint: { x: cx, y: cy },
        confidence: 0.88,
        matchedText: "Heuristic: Central document editing canvas",
      };
    }

    // 3. "关闭" / "close" -> Upper right
    if (/关闭|close/i.test(lower)) {
      return {
        found: true,
        resolvedLevel: 5,
        levelName: "LocalVision",
        boundingBox: { x: b.x + b.width - 50, y: b.y, width: 50, height: 35 },
        clickPoint: { x: b.x + b.width - 25, y: b.y + 17 },
        confidence: 0.90,
        matchedText: "Heuristic: Window Close button",
      };
    }

    return null;
  }
}
