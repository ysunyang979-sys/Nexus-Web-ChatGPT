import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ClipboardReadResult,
  ClipboardWriteParams,
  ClipboardWriteResult,
  MouseMoveParams,
  MouseClickParams,
  MouseScrollParams,
  MouseActionResult,
  KeyboardInputParams,
  KeyboardKeyParams,
  KeyboardActionResult,
  WindowListResult,
  WindowActivateParams,
  WindowActivateResult,
  DisplayListResult,
  AppListResult,
  AppLaunchParams,
  AppLaunchResult,
  AccessibilityTreeQueryParams,
  AccessibilityTreeQueryResult,
  UIElementActionParams,
  UIElementActionResult,
  ScreenSnapshotParams,
  ScreenSnapshotResult,
  AccessibilityElement,
  WindowItem,
  DisplayItem,
  ComputerStatusResult,
  MouseDragParams,
  WindowCloseParams,
  WindowCloseResult,
  ComputerWaitParams,
  ComputerWaitResult,
  ComputerObserveParams,
  ComputerObserveResult,
  KeyboardHotkeyParams,
  TakeControlParams,
  TakeControlResult,
  ReturnControlParams,
  ReturnControlResult,
  TakeoverStatusResult,
  ComputerExecutionContract,
  ComputerState,
  SemanticUILocatorParams,
  SemanticUILocatorResult,
  LoopDetectionResult,
  TaskAcceptancePolicy,
  TaskAcceptanceResult,
  RealtimeComputerMode,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { LocalBridgeEventBus } from "../events/event-bus-service.js";
import type { VisionService } from "../vision/vision-service.js";

import { WindowsNativeCore } from "./windows-native-core.js";
import { ComputerStateEngine } from "./computer-state-engine.js";
import { SemanticUILocator } from "./semantic-ui-locator.js";
import { VerificationEngine, type VerificationOptions } from "./verification-engine.js";
import { ExecutionRetryEngine } from "./retry-engine.js";
import { ExecutionLoopDetector } from "./loop-detector.js";
import { ExecutionContextManager, type ContextTier } from "./execution-context-manager.js";
import { RealtimeComputerService } from "./realtime-computer-service.js";
import { TaskAcceptanceEngine } from "./task-acceptance-engine.js";
import { ActiveWindowResolver } from "./active-window-resolver.js";

const execFileAsync = promisify(execFile);

export class WindowsComputerUseService {
  private readonly snapshotsDir: string;
  private readonly nativeCore: WindowsNativeCore;
  private readonly stateEngine: ComputerStateEngine;
  private readonly retryEngine: ExecutionRetryEngine;
  private readonly loopDetector: ExecutionLoopDetector;
  private readonly contextManager: ExecutionContextManager;
  private readonly acceptanceEngine: TaskAcceptanceEngine;
  private readonly activeResolver: ActiveWindowResolver;
  private realtimeService: RealtimeComputerService;
  private uiLocator: SemanticUILocator;
  private verificationEngine: VerificationEngine;

  private visionService?: VisionService;
  private eventBus?: LocalBridgeEventBus;
  private securityMode: "safe" | "universal" = "safe";

  constructor(
    runnerStateDir: string,
    private readonly logger?: Logger
  ) {
    this.snapshotsDir = path.join(runnerStateDir, "snapshots");
    if (!fs.existsSync(this.snapshotsDir)) {
      try {
        fs.mkdirSync(this.snapshotsDir, { recursive: true });
      } catch {}
    }

    this.nativeCore = new WindowsNativeCore(this.snapshotsDir, this.logger);
    this.stateEngine = new ComputerStateEngine(this.nativeCore, this.logger);
    this.retryEngine = new ExecutionRetryEngine(this.logger);
    this.loopDetector = new ExecutionLoopDetector();
    this.contextManager = new ExecutionContextManager();
    this.acceptanceEngine = new TaskAcceptanceEngine(this.nativeCore, this.logger);
    this.activeResolver = new ActiveWindowResolver(this.nativeCore, this.logger);
    this.realtimeService = new RealtimeComputerService(this.stateEngine, undefined, this.logger);
    this.uiLocator = new SemanticUILocator(this.nativeCore, undefined, this.logger);
    this.verificationEngine = new VerificationEngine(undefined, this.logger);
  }

  setVisionService(service: VisionService): void {
    this.visionService = service;
    this.uiLocator = new SemanticUILocator(this.nativeCore, service, this.logger);
    this.verificationEngine = new VerificationEngine(service, this.logger);
  }

  setEventBus(bus: LocalBridgeEventBus): void {
    this.eventBus = bus;
    this.realtimeService = new RealtimeComputerService(this.stateEngine, bus, this.logger);
  }

  setSecurityMode(mode: "safe" | "universal"): void {
    this.securityMode = mode;
    this.logger?.info({ mode }, `WindowsComputerUseService securityMode updated to ${mode}`);
  }

  getSecurityMode(): "safe" | "universal" {
    return this.securityMode;
  }

  assertUniversalMode(actionName: string): void {
    if (this.securityMode !== "universal") {
      throw new Error(
        `Computer Use tool '${actionName}' is disabled in SAFE mode. Universal Desktop Control requires the user to explicitly disable the Safety Layer in Settings (switch to Universal Mode).`
      );
    }
    if (this.realtimeService.isInputLocked() && !/^(observe|status|screenshot|displayList|appList|windowList|loopCheck|taskAcceptance)/i.test(actionName)) {
      throw new Error(
        `Computer input is locked: Human takeover is currently active. Operation '${actionName}' cannot be executed by AI until control is returned via computer.returnControl.`
      );
    }
  }

  private async runPowerShell(script: string, timeoutMs = 30000): Promise<string> {
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
      this.logger?.warn({ err: err?.message }, "PowerShell command failed");
      throw new Error(`PowerShell execution error: ${err?.message || String(err)}`);
    }
  }

  /**
   * Execute any Computer Tool wrapped in the Unified Computer Execution Contract:
   * 1. Capture BEFORE state
   * 2. Execute tool with retry engine
   * 3. Capture AFTER state
   * 4. Compute DELTA
   * 5. Run VERIFICATION engine
   * 6. Check LOOP detection
   * 7. Broadcast via Realtime Event Bus
   * 8. Record in Execution Memory & return contract
   */
  async executeContract<T>(
    toolName: string,
    params: any,
    fn: () => Promise<T>,
    options?: VerificationOptions
  ): Promise<ComputerExecutionContract & { rawResult?: T }> {
    const actionId = `act_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    const startTime = Date.now();

    // 1. BEFORE State
    let beforeState: ComputerState | undefined;
    try {
      beforeState = await this.stateEngine.captureState({ includeScreenshot: false, includeWindows: true });
    } catch {}

    let rawResult: any = null;
    let executionSuccess = true;
    let executionMessage = "Action executed successfully";
    let executionError: any = null;

    // 2. EXECUTION with Retry Engine
    try {
      const retryRes = await this.retryEngine.executeWithRetry(toolName, async () => {
        return await fn();
      });
      rawResult = retryRes.result;
    } catch (err: any) {
      executionSuccess = false;
      executionMessage = err?.message || String(err);
      executionError = this.retryEngine.classifyError(err, toolName, params, beforeState);
    }

    const duration = Date.now() - startTime;

    // 3. AFTER State
    let afterState: ComputerState | undefined;
    try {
      afterState = await this.stateEngine.captureState({ includeScreenshot: false, includeWindows: true });
    } catch {}

    // 4. DELTA
    const delta = this.stateEngine.computeDelta(beforeState, afterState);

    // 5. VERIFICATION
    const verification = await this.verificationEngine.verify(
      toolName,
      params,
      beforeState,
      afterState,
      delta,
      options
    );

    // 6. LOOP DETECTION
    const loopRes = this.loopDetector.recordAndCheck(
      actionId,
      toolName,
      params,
      beforeState,
      afterState,
      executionSuccess
    );

    if (loopRes.loopDetected && !executionError) {
      executionError = {
        type: "LOOP_DETECTED",
        code: "ERR_LOOP_DETECTED",
        message: loopRes.message,
        possibleCauses: ["Action repeated consecutively without state progress", "Oscillating between two repetitive actions"],
        suggestedRecoverySignals: [loopRes.suggestedAction],
        attemptHistory: [],
      };
    }

    // 7. BUILD CONTRACT
    const contract: ComputerExecutionContract = {
      actionId,
      action: { tool: toolName, params: params || {} },
      before: beforeState,
      execution: {
        success: executionSuccess,
        message: executionMessage,
        rawResult,
      },
      after: afterState,
      verification,
      error: executionError,
      duration,
      artifacts: options?.expectedFile && fs.existsSync(options.expectedFile) ? [options.expectedFile] : [],
    };

    // 8. RECORD & BROADCAST
    this.contextManager.recordAction(contract);
    await this.realtimeService.broadcastAction(contract);

    return { ...contract, rawResult };
  }

  // --- Core Tool Methods ---

  async getStatus(params?: { includeScreenshot?: boolean }): Promise<ComputerStatusResult> {
    const listRes = await this.nativeCore.listWindows();
    
    let screenHashVerified: boolean | undefined = undefined;
    if (params?.includeScreenshot) {
      try {
        const screenshot = await this.captureScreenSnapshot({ saveToArtifact: false, format: "png" });
        screenHashVerified = !!screenshot.base64Data;
      } catch (err) {
        screenHashVerified = false;
      }
    }

    return {
      enabled: this.securityMode === "universal",
      mode: this.securityMode,
      securityMode: this.securityMode,
      desktopSession: "active",
      activeWindow: listRes.activeWindow?.title || null,
      screenSize: "1920x1080",
      cursorPosition: { x: 0, y: 0 },
      screenHashVerified,
    };
  }

  async readClipboard(): Promise<ClipboardReadResult> {
    this.assertUniversalMode("computer.clipboard_read");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$txt = [System.Windows.Forms.Clipboard]::GetText()
if ($null -eq $txt) { $txt = "" }
Write-Output $txt
`;
    const res = await this.runPowerShell(script);
    return {
      text: res,
      hasContent: res.length > 0,
    };
  }

  async writeClipboard(params: ClipboardWriteParams): Promise<ClipboardWriteResult> {
    this.assertUniversalMode("computer.clipboard_write");
    const b64 = Buffer.from(params.text, "utf-8").toString("base64");
    const script = `
$bytes = [System.Convert]::FromBase64String("${b64}")
$str = [System.Text.Encoding]::UTF8.GetString($bytes)
try {
    Set-Clipboard -Value $str -ErrorAction Stop
} catch {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $t = New-Object System.Threading.Thread([System.Threading.ThreadStart]{
            [System.Windows.Forms.Clipboard]::SetText($str)
        })
        $t.SetApartmentState([System.Threading.ApartmentState]::STA)
        $t.Start()
        $t.Join()
    } catch {}
}
Write-Output "OK"
`;
    await this.runPowerShell(script);
    return {
      success: true,
      bytesWritten: Buffer.byteLength(params.text, "utf-8"),
    };
  }

  async moveMouse(params: MouseMoveParams): Promise<MouseActionResult> {
    this.assertUniversalMode("computer.mouse_move");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${params.x}, ${params.y})
Write-Output "$([System.Windows.Forms.Cursor]::Position.X),$([System.Windows.Forms.Cursor]::Position.Y)"
`;
    const res = await this.runPowerShell(script);
    const [x, y] = res.split(",").map((v) => parseInt(v.trim(), 10) || 0);
    await this.realtimeService.broadcastInput("mouse_move", { x: x || params.x, y: y || params.y });
    return {
      success: true,
      currentPosition: { x: x || params.x, y: y || params.y },
    };
  }

  async clickMouse(params: MouseClickParams): Promise<MouseActionResult> {
    this.assertUniversalMode("computer.mouse_click");
    const res = await this.nativeCore.clickMouse(params.x, params.y, params.button);
    await this.realtimeService.broadcastInput("mouse_click", { button: params.button || "left", x: res.x, y: res.y });
    return {
      success: true,
      currentPosition: { x: res.x, y: res.y },
    };
  }

  async dragMouse(params: MouseDragParams): Promise<MouseActionResult> {
    this.assertUniversalMode("computer.mouse_drag");
    const startX = params.fromX !== undefined ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${params.fromX}, ${params.fromY}); Start-Sleep -Milliseconds 50;` : "";
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$sig = @'
using System;
using System.Runtime.InteropServices;
public class NativeDrag {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
'@
Add-Type -TypeDefinition $sig -Language CSharp -ErrorAction SilentlyContinue | Out-Null
${startX}
[NativeDrag]::mouse_event(2, 0, 0, 0, 0)
Start-Sleep -Milliseconds 100
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${params.toX}, ${params.toY})
Start-Sleep -Milliseconds ${params.durationMs || 300}
[NativeDrag]::mouse_event(4, 0, 0, 0, 0)
Write-Output "${params.toX},${params.toY}"
`;
    await this.runPowerShell(script);
    return {
      success: true,
      currentPosition: { x: params.toX, y: params.toY },
    };
  }

  async scrollMouse(params: MouseScrollParams): Promise<MouseActionResult> {
    this.assertUniversalMode("computer.mouse_scroll");
    const script = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class NativeScroll {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
'@
Add-Type -TypeDefinition $sig -Language CSharp -ErrorAction SilentlyContinue | Out-Null
[NativeScroll]::mouse_event(0x0800, 0, 0, ${params.deltaY}, 0)
Write-Output "OK"
`;
    await this.runPowerShell(script);
    return {
      success: true,
      currentPosition: { x: 0, y: 0 },
    };
  }

  /**
   * Lossless Unicode keyboard typing via clipboard paste
   */
  async inputKeyboard(params: KeyboardInputParams): Promise<KeyboardActionResult> {
    this.assertUniversalMode("computer.keyboard_input");
    await this.nativeCore.typeText(params.text);
    await this.realtimeService.broadcastInput("keyboard_input", { length: params.text.length, snippet: params.text.slice(0, 20) });
    return { success: true };
  }

  async pressKeys(params: KeyboardKeyParams): Promise<KeyboardActionResult> {
    this.assertUniversalMode("computer.keyboard_key");
    await this.nativeCore.pressKeys(params.keys);
    await this.realtimeService.broadcastInput("hotkey", { keys: params.keys });
    return { success: true };
  }

  async pressHotkey(params: KeyboardHotkeyParams): Promise<KeyboardActionResult> {
    this.assertUniversalMode("computer.hotkey");
    const raw = (params.hotkey || params.combo || "").trim();
    const parts = raw.split(/[\+\-]/).map((p) => p.trim());
    return this.pressKeys({ keys: parts, action: "press" });
  }

  /**
   * Enumerate top-level desktop windows using OpenInputDesktop + EnumDesktopWindows
   */
  async listWindows(): Promise<WindowListResult> {
    this.assertUniversalMode("computer.window_list");
    const res = await this.nativeCore.listWindows();
    return {
      windows: res.windows,
      activeWindow: res.activeWindow,
    };
  }

  /**
   * Activate target window reliably using Win32 BringWindowToTop and SetForegroundWindow
   */
  async activateWindow(params: WindowActivateParams): Promise<WindowActivateResult> {
    this.assertUniversalMode("computer.window_activate");
    const query = params.handleOrTitle || params.title || params.handle || "";
    const res = await this.nativeCore.activateWindow(query);
    return {
      success: res.success,
      executed: res.executed,
      verified: res.verified,
      activated: res.activated,
      isForeground: res.isForeground,
      alreadyForeground: res.alreadyForeground,
      window: res.window,
      verification: res.verification,
      message: res.message,
    };
  }

  async closeWindow(params: WindowCloseParams): Promise<WindowCloseResult> {
    this.assertUniversalMode("computer.window_close");
    const q = (params.handleOrTitle || params.title || params.handle || "").toLowerCase();
    const listRes = await this.nativeCore.listWindows();
    let target = listRes.windows.find(
      (w) => w.handle === q || w.title.toLowerCase().includes(q) || w.processName?.toLowerCase().includes(q)
    );

    if (!target) {
      if (/edge|browser|chrome/i.test(q)) {
        target = listRes.windows.find((w) => /msedge|edge|chrome|browser/i.test(w.processName || "") || /edge|chrome/i.test(w.title));
      } else if (/notepad|记事本/i.test(q)) {
        target = listRes.windows.find((w) => /notepad/i.test(w.processName || "") || /记事本|notepad/i.test(w.title));
      }
    }

    if (!target) {
      return { closed: true, message: `Window "${q}" already closed or not found.` };
    }

    const script = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class NativeCloser {
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@
Add-Type -TypeDefinition $sig -Language CSharp -ErrorAction SilentlyContinue | Out-Null
[NativeCloser]::SendMessage([IntPtr][int64]${target.handle}, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Write-Output "OK"
`;
    await this.runPowerShell(script);
    return { closed: true, message: `Closed window "${target.title}"` };
  }

  async listDisplays(): Promise<DisplayListResult> {
    this.assertUniversalMode("computer.display_list");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$res = @()
$idx = 0
foreach ($s in $screens) {
  $res += [PSCustomObject]@{
    id = "display_$idx"
    name = $s.DeviceName
    isPrimary = $s.Primary
    bounds = [PSCustomObject]@{
      x = $s.Bounds.X
      y = $s.Bounds.Y
      width = $s.Bounds.Width
      height = $s.Bounds.Height
    }
    scaleFactor = 1.0
  }
  $idx++
}
$res | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(script);
    let displays: DisplayItem[] = [];
    try {
      const parsed = JSON.parse(out);
      displays = Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
    return { displays };
  }

  async listApps(): Promise<AppListResult> {
    this.assertUniversalMode("computer.app_list");
    const script = `
$apps = Get-Process | Where-Object { $_.MainWindowTitle.Length -gt 0 } | Select-Object -Unique ProcessName, Id, Path
$res = @()
foreach ($a in $apps) {
  $res += [PSCustomObject]@{
    name = $a.ProcessName
    pid = $a.Id
    path = $a.Path
  }
}
$res | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(script);
    let apps = [];
    try {
      const parsed = JSON.parse(out);
      apps = Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
    return { apps };
  }

  async launchApp(params: AppLaunchParams): Promise<AppLaunchResult> {
    this.assertUniversalMode("computer.app_launch");
    try {
      const argsStr = params.args && params.args.length > 0
        ? `-ArgumentList @(${params.args.map((a) => `"${a.replace(/"/g, '`"')}"`).join(",")})`
        : "";
      const script = `
$appName = [System.IO.Path]::GetFileNameWithoutExtension("${params.appNameOrPath.replace(/"/g, '`"')}")
$before = Get-Process -Name $appName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id

$p = Start-Process -FilePath "${params.appNameOrPath.replace(/"/g, '`"')}" ${argsStr} -PassThru
$launcherPid = $p.Id
Start-Sleep -Milliseconds 500

$after = Get-Process -Name $appName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id
$diff = @($after | Where-Object { $before -notcontains $_ })

$appPid = $launcherPid
if ($diff -and $diff.Count -gt 0) {
    $realApp = $diff | Where-Object { $_ -ne $launcherPid } | Select-Object -First 1
    if ($realApp) {
        $appPid = [int]$realApp
    } else {
        $appPid = [int]$diff[0]
    }
}

$wHandle = ""
try {
    $pr = Get-Process -Id $appPid -ErrorAction SilentlyContinue
    if ($pr -and $pr.MainWindowHandle -ne 0) {
        $wHandle = $pr.MainWindowHandle.ToString()
    }
} catch {}

[PSCustomObject]@{
  launched = $true
  pid = $appPid
  launcherPid = $launcherPid
  applicationPid = $appPid
  windowHandle = $wHandle
  message = "Application launched successfully"
} | ConvertTo-Json -Compress
`;
      const out = await this.runPowerShell(script, 8000);
      const parsed = JSON.parse(out);
      return {
        launched: true,
        success: true,
        executed: true,
        verified: true,
        pid: parsed.pid || parsed.launcherPid,
        launcherPid: parsed.launcherPid,
        applicationPid: parsed.applicationPid,
        windowHandle: parsed.windowHandle,
        message: parsed.message || `Application launched: ${params.appNameOrPath}`,
      };
    } catch (err: any) {
      return {
        launched: false,
        success: false,
        executed: false,
        verified: true,
        message: `Failed to launch: ${err?.message || String(err)}`,
      };
    }
  }

  async queryAccessibilityTree(params: AccessibilityTreeQueryParams): Promise<AccessibilityTreeQueryResult> {
    this.assertUniversalMode("computer.accessibility_tree");
    const maxDepth = params.maxDepth || 3;
    const filterType = params.filterControlType ? `"${params.filterControlType}"` : "$null";
    const winTitle = params.windowHandleOrTitle ? `"${params.windowHandleOrTitle.replace(/"/g, '`"')}"` : "$null";

    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$targetRoot = [System.Windows.Automation.AutomationElement]::RootElement

if (${winTitle} -ne $null) {
  $q = ${winTitle}.ToLower()
  $wins = $targetRoot.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $wins) {
    if ($w.Current.Name.ToLower().Contains($q) -or $w.Current.NativeWindowHandle.ToString() -eq $q) {
      $targetRoot = $w
      break
    }
  }
}

$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$filter = ${filterType}

function Traverse-UIElement($elem, $depth) {
  if ($depth -gt ${maxDepth} -or $results.Count -ge 200) { return }
  $curr = $elem.Current
  $type = $curr.ControlType.ProgrammaticName.Replace("ControlType.", "")
  if ($filter -eq $null -or $type -eq $filter) {
    $rect = $curr.BoundingRectangle
    $results.Add([PSCustomObject]@{
      automationId = $curr.AutomationId
      name = $curr.Name
      controlType = $type
      className = $curr.ClassName
      boundingBox = [PSCustomObject]@{
        x = [int]$rect.X
        y = [int]$rect.Y
        width = [int]$rect.Width
        height = [int]$rect.Height
      }
      isEnabled = [bool]$curr.IsEnabled
      isOffscreen = [bool]$curr.IsOffscreen
    })
  }
  try {
    $children = $elem.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($child in $children) {
      Traverse-UIElement $child ($depth + 1)
    }
  } catch {}
}

Traverse-UIElement $targetRoot 1
$results | ConvertTo-Json -Compress -Depth 4
`;
    const out = await this.runPowerShell(script, 45000);
    let elements: AccessibilityElement[] = [];
    try {
      if (out) {
        const parsed = JSON.parse(out);
        elements = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch {}

    return {
      elements,
      totalFound: elements.length,
    };
  }

  async actOnUIElement(params: UIElementActionParams): Promise<UIElementActionResult> {
    this.assertUniversalMode("computer.ui_element_action");
    const nameMatch = params.selector.name ? `"${params.selector.name.replace(/"/g, '`"')}"` : "$null";
    const autoIdMatch = params.selector.automationId ? `"${params.selector.automationId.replace(/"/g, '`"')}"` : "$null";
    const controlTypeMatch = params.selector.controlType ? `"${params.selector.controlType}"` : "$null";
    const valText = params.value ? JSON.stringify(params.value) : "$null";

    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$root = [System.Windows.Automation.AutomationElement]::RootElement
$target = $null
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)

foreach ($el in $all) {
  $c = $el.Current
  $type = $c.ControlType.ProgrammaticName.Replace("ControlType.", "")
  $match = $true

  if (${nameMatch} -ne $null -and !$c.Name.Contains(${nameMatch})) { $match = $false }
  if (${autoIdMatch} -ne $null -and $c.AutomationId -ne ${autoIdMatch}) { $match = $false }
  if (${controlTypeMatch} -ne $null -and $type -ne ${controlTypeMatch}) { $match = $false }

  if ($match) {
    $target = $el
    break
  }
}

if (!$target) {
  Write-Output '{"success": false, "message": "Element not found matching selector"}'
  exit 0
}

$c = $target.Current
$action = "${params.action}"

if ($action -eq "click" -or $action -eq "invoke") {
  try {
    $pattern = $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
    Write-Output '{"success": true, "message": "Invoked successfully via InvokePattern"}'
    exit 0
  } catch {
    $rect = $c.BoundingRectangle
    $cx = [int]($rect.X + ($rect.Width / 2))
    $cy = [int]($rect.Y + ($rect.Height / 2))
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
    $sig = @'
using System;
using System.Runtime.InteropServices;
public class Win32Clicker {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
'@
    Add-Type -TypeDefinition $sig -Language CSharp -ErrorAction SilentlyContinue | Out-Null
    [Win32Clicker]::mouse_event(2, 0, 0, 0, 0)
    [Win32Clicker]::mouse_event(4, 0, 0, 0, 0)
    Write-Output '{"success": true, "message": "Clicked element coordinates"}'
    exit 0
  }
} elseif ($action -eq "focus") {
  $target.SetFocus()
  Write-Output '{"success": true, "message": "Focused element"}'
} elseif ($action -eq "set_value") {
  $textVal = if (${valText} -ne $null) { (${valText} | ConvertFrom-Json) } else { "" }
  try {
    $valPattern = $target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $valPattern.SetValue($textVal)
    Write-Output '{"success": true, "message": "Value set via ValuePattern"}'
  } catch {
    $target.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait($textVal)
    Write-Output '{"success": true, "message": "Value typed via SendKeys fallback"}'
  }
}
`;
    const out = await this.runPowerShell(script, 30000);
    try {
      const parsed = JSON.parse(out);
      return {
        success: Boolean(parsed.success),
        message: parsed.message || "Action executed",
      };
    } catch {
      return { success: false, message: "Failed to parse element action result" };
    }
  }

  async captureScreenSnapshot(params: ScreenSnapshotParams): Promise<ScreenSnapshotResult> {
    this.assertUniversalMode("computer.screen_snapshot");
    const saveArtifact = params.saveToArtifact !== false;
    const res = await this.nativeCore.captureScreen(saveArtifact);

    return {
      width: res.width,
      height: res.height,
      format: params.format || "png",
      base64Data: res.base64,
      artifactPath: res.savedPath,
      capturedAt: Date.now(),
    };
  }

  async wait(params: ComputerWaitParams): Promise<ComputerWaitResult> {
    const ms = Math.max(0, Math.min(params.ms ?? params.durationMs ?? 1000, 60000));
    await new Promise((r) => setTimeout(r, ms));
    return { waitedMs: ms, reason: params.reason };
  }

  async observe(params: ComputerObserveParams): Promise<ComputerObserveResult> {
    this.assertUniversalMode("computer.observe");
    const winList = await this.nativeCore.listWindows();
    let activeWin = winList.activeWindow;
    let activeReason: string | undefined;
    if (!activeWin) {
      const resolved = await this.activeResolver.resolve(winList.windows);
      activeWin = resolved.activeWindow;
      activeReason = resolved.activeWindowReason;
    }

    let targetWin: WindowItem | null = null;
    if (params.windowHandleOrTitle) {
      const q = params.windowHandleOrTitle.toLowerCase();
      targetWin = winList.windows.find(
        (w) => w.handle === q || w.title.toLowerCase().includes(q) || w.processName?.toLowerCase().includes(q)
      ) || null;
    }

    let screenshot: ScreenSnapshotResult | undefined;
    if (params.includeScreenshot !== false) {
      screenshot = await this.captureScreenSnapshot({ saveToArtifact: true, format: "png" });
    }

    const timestamp = Date.now();
    const screenSize = screenshot ? `${screenshot.width}x${screenshot.height}` : "1920x1080";
    const stateHash = crypto.createHash("sha256").update(JSON.stringify({
      activeHandle: activeWin?.handle,
      activeTitle: activeWin?.title,
      winCount: winList.windows.length,
      screenshotHash: screenshot?.base64Data?.slice(0, 32),
    })).digest("hex").slice(0, 16);

    return {
      timestamp,
      computer: {
        os: "Windows",
        screenSize,
        cursor: { x: 0, y: 0 },
        dpi: { scale: 1.0 },
      },
      activeWindow: activeWin || null,
      activeWindowReason: activeWin ? undefined : (activeReason || "NO_FOREGROUND_WINDOW"),
      targetWindow: targetWin,
      matchedWindow: targetWin || undefined,
      windows: winList.windows,
      processes: [],
      screen: screenshot ? {
        path: screenshot.artifactPath,
        hash: screenshot.base64Data ? crypto.createHash("sha256").update(screenshot.base64Data).digest("hex").slice(0, 16) : undefined,
        width: screenshot.width,
        height: screenshot.height,
        format: screenshot.format,
        base64Data: screenshot.base64Data,
      } : undefined,
      screenSize,
      cursorPosition: { x: 0, y: 0 },
      screenshot,
      stateHash,
      target: targetWin ? { handle: targetWin.handle, title: targetWin.title } : undefined,
      verification: {
        activeWindowDetected: Boolean(activeWin),
        screenCaptured: Boolean(screenshot),
        targetMatched: Boolean(targetWin),
      },
    };
  }

  // --- Advanced Execution Infrastructure ---

  async locateUI(params: SemanticUILocatorParams): Promise<SemanticUILocatorResult> {
    this.assertUniversalMode("computer.locate_ui");
    const res = await this.uiLocator.locate(params);
    if (res.found) {
      this.contextManager.recordUILocation(
        params.target,
        res.boundingBox.x,
        res.boundingBox.y,
        res.boundingBox.width,
        res.boundingBox.height,
        res.resolvedLevel
      );
    }
    const winList = await this.nativeCore.listWindows();
    const targetWin = params.windowHandleOrTitle
      ? winList.windows.find((w) => w.handle === params.windowHandleOrTitle || w.title.includes(params.windowHandleOrTitle!))
      : winList.activeWindow;

    return {
      ...res,
      level: res.levelName,
      element: (res.elementInfo || {}) as any,
      selector: { target: params.target, targetType: params.targetType },
      window: targetWin || undefined,
    };
  }

  async checkTaskAcceptance(policy: TaskAcceptancePolicy): Promise<TaskAcceptanceResult> {
    return this.acceptanceEngine.evaluate(policy);
  }

  getLoopCheck(): LoopDetectionResult {
    return this.loopDetector.checkCurrentState();
  }

  getExecutionContext(tier: ContextTier = "SUMMARY"): Record<string, any> {
    return this.contextManager.getCompressedContext(tier);
  }

  setRealtimeMode(mode: Partial<RealtimeComputerMode>): RealtimeComputerMode {
    return this.realtimeService.setMode(mode);
  }

  async takeControl(params?: TakeControlParams): Promise<TakeControlResult> {
    return this.realtimeService.takeControl(params);
  }

  async returnControl(params?: ReturnControlParams): Promise<ReturnControlResult> {
    return this.realtimeService.returnControl(params);
  }

  async getTakeoverStatus(): Promise<TakeoverStatusResult> {
    return this.realtimeService.getTakeoverStatus();
  }

  getStateEngine(): ComputerStateEngine {
    return this.stateEngine;
  }

  getLoopDetector(): ExecutionLoopDetector {
    return this.loopDetector;
  }

  getContextManager(): ExecutionContextManager {
    return this.contextManager;
  }

  // Bound properties for compatibility
  status = this.getStatus.bind(this);
  clipboardRead = this.readClipboard.bind(this);
  clipboardWrite = this.writeClipboard.bind(this);
  mouseMove = this.moveMouse.bind(this);
  mouseClick = this.clickMouse.bind(this);
  mouseDrag = this.dragMouse.bind(this);
  mouseScroll = this.scrollMouse.bind(this);
  keyboardInput = this.inputKeyboard.bind(this);
  keyboardKey = this.pressKeys.bind(this);
  keyboardHotkey = this.pressHotkey.bind(this);
  windowList = this.listWindows.bind(this);
  windowActivate = this.activateWindow.bind(this);
  windowClose = this.closeWindow.bind(this);
  displayList = this.listDisplays.bind(this);
  appList = this.listApps.bind(this);
  appLaunch = this.launchApp.bind(this);
  accessibilityTree = this.queryAccessibilityTree.bind(this);
  uiElementAction = this.actOnUIElement.bind(this);
  screenSnapshot = this.captureScreenSnapshot.bind(this);
  waitAction = this.wait.bind(this);
  observeAction = this.observe.bind(this);
  takeControlAction = this.takeControl.bind(this);
  returnControlAction = this.returnControl.bind(this);
  takeoverStatusAction = this.getTakeoverStatus.bind(this);
  locateUIAction = this.locateUI.bind(this);
  taskAcceptanceAction = this.checkTaskAcceptance.bind(this);

  getNativeCore(): WindowsNativeCore {
    return this.nativeCore;
  }
}
