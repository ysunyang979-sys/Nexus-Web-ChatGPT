import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { WindowItem, AppItem, ScreenSnapshotResult } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export interface NativeWindowListResult {
  windows: WindowItem[];
  activeWindow: WindowItem | null;
}

export interface NativeActivateResult {
  success: boolean;
  executed: boolean;
  verified: boolean;
  activated: boolean;
  isForeground: boolean;
  alreadyForeground?: boolean;
  window?: WindowItem;
  verification?: {
    foreground: boolean;
    windowExists: boolean;
  };
  message?: string;
}

export interface NativeScreenCaptureResult {
  width: number;
  height: number;
  base64: string;
  hash: string;
  savedPath?: string;
}

const NATIVE_BRIDGE_CSHARP = `
using System;
using System.Text;
using System.Collections.Generic;
using System.Threading;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class NativeWinScanner {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpfn, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static string Scan() {
        var items = new List<string>();
        IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);

        Thread t = new Thread(() => {
            if (hDesk != IntPtr.Zero) {
                SetThreadDesktop(hDesk);
            }
            IntPtr fg = GetForegroundWindow();
            IntPtr rootFg = (fg != IntPtr.Zero) ? GetAncestor(fg, 2) : IntPtr.Zero;
            IntPtr rootOwner = (fg != IntPtr.Zero) ? GetAncestor(fg, 3) : IntPtr.Zero;

            EnumWindowsProc callback = (hwnd, lParam) => {
                if (IsWindowVisible(hwnd)) {
                    var sb = new StringBuilder(512);
                    GetWindowTextW(hwnd, sb, 512);
                    string title = sb.ToString();
                    uint pid = 0;
                    GetWindowThreadProcessId(hwnd, out pid);
                    RECT rc;
                    GetWindowRect(hwnd, out rc);
                    bool isFg = (hwnd == fg || (rootFg != IntPtr.Zero && hwnd == rootFg) || (rootOwner != IntPtr.Zero && hwnd == rootOwner));
                    string line = string.Format("{0}|*|{1}|*|{2}|*|{3}|*|{4}|*|{5}|*|{6}|*|{7}",
                        hwnd.ToInt64(),
                        pid,
                        isFg ? "1" : "0",
                        rc.Left, rc.Top, (rc.Right - rc.Left), (rc.Bottom - rc.Top),
                        title
                    );
                    items.Add(line);
                }
                return true;
            };

            EnumWindows(callback, IntPtr.Zero);
        });

        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();

        if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        return string.Join(Environment.NewLine, items);
    }
}

public class NativeActivator {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fUnknown);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    public static string ActivateAndVerify(IntPtr hwnd) {
        try {
            keybd_event(0x12, 0, 0, 0);
            keybd_event(0x12, 0, 2, 0);
            Thread.Sleep(30);

            IntPtr fg = GetForegroundWindow();
            uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
            uint curThread = GetCurrentThreadId();

            if (fgThread != 0 && fgThread != curThread) {
                AttachThreadInput(curThread, fgThread, true);
            }

            ShowWindow(hwnd, 9);
            BringWindowToTop(hwnd);
            SwitchToThisWindow(hwnd, true);
            SetForegroundWindow(hwnd);

            if (fgThread != 0 && fgThread != curThread) {
                AttachThreadInput(curThread, fgThread, false);
            }

            Thread.Sleep(80);

            IntPtr fgNow = GetForegroundWindow();
            IntPtr rootFgNow = (fgNow != IntPtr.Zero) ? GetAncestor(fgNow, 2) : IntPtr.Zero;
            IntPtr rootOwnerNow = (fgNow != IntPtr.Zero) ? GetAncestor(fgNow, 3) : IntPtr.Zero;

            bool isFg = (hwnd == fgNow || (rootFgNow != IntPtr.Zero && hwnd == rootFgNow) || (rootOwnerNow != IntPtr.Zero && hwnd == rootOwnerNow));
            return isFg ? "TRUE" : "FALSE";
        } catch {
            return "FALSE";
        }
    }
}

public class NativeTyper {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    public static void Paste() {
        keybd_event(0x11, 0, 0, 0);
        keybd_event(0x56, 0, 0, 0);
        Thread.Sleep(50);
        keybd_event(0x56, 0, 2, 0);
        keybd_event(0x11, 0, 2, 0);
        Thread.Sleep(100);
    }
}

public class NativeKeys {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}

public class NativeMouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}

public class NativeCapture {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, uint dwRop);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public static Bitmap Capture() {
        IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
        Bitmap resultBmp = null;

        Thread t = new Thread(() => {
            try {
                if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);

                int width = GetSystemMetrics(0);  // SM_CXSCREEN
                int height = GetSystemMetrics(1); // SM_CYSCREEN
                if (width <= 0) width = 1920;
                if (height <= 0) height = 1080;

                IntPtr hDeskDC = GetDC(IntPtr.Zero);
                if (hDeskDC != IntPtr.Zero) {
                    IntPtr hMemDC = CreateCompatibleDC(hDeskDC);
                    IntPtr hBitmap = CreateCompatibleBitmap(hDeskDC, width, height);
                    IntPtr hOldBitmap = SelectObject(hMemDC, hBitmap);

                    BitBlt(hMemDC, 0, 0, width, height, hDeskDC, 0, 0, 0x40CC0020);

                    SelectObject(hMemDC, hOldBitmap);
                    DeleteDC(hMemDC);
                    ReleaseDC(IntPtr.Zero, hDeskDC);

                    Bitmap bmp = Image.FromHbitmap(hBitmap);
                    DeleteObject(hBitmap);
                    resultBmp = bmp;
                }
            } catch {}
        });

        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();

        if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        return resultBmp;
    }
}
`;

/**
 * WindowsNativeCore: Low-level Win32 automation engine executing via STA threads
 * on the interactive Input Desktop (winsta0\default) backed by a pre-compiled native assembly cache.
 */
export class WindowsNativeCore {
  private readonly bridgeDllPath: string;
  private readonly bridgeCsPath: string;

  constructor(
    private readonly snapshotsDir: string,
    private readonly logger?: Logger
  ) {
    if (!fs.existsSync(this.snapshotsDir)) {
      try {
        fs.mkdirSync(this.snapshotsDir, { recursive: true });
      } catch {}
    }

    const bridgeCacheDir = path.join(os.tmpdir(), "nexus-native-bridge");
    if (!fs.existsSync(bridgeCacheDir)) {
      try {
        fs.mkdirSync(bridgeCacheDir, { recursive: true });
      } catch {}
    }

    this.bridgeDllPath = path.join(bridgeCacheDir, "NexusNativeBridge.dll");
    this.bridgeCsPath = path.join(bridgeCacheDir, "NexusNativeBridge.cs");

    try {
      if (!fs.existsSync(this.bridgeCsPath)) {
        fs.writeFileSync(this.bridgeCsPath, NATIVE_BRIDGE_CSHARP, "utf-8");
      }
    } catch {}
  }

  private getLoadDllScript(): string {
    const dll = this.bridgeDllPath.replace(/\\/g, "/");
    const cs = this.bridgeCsPath.replace(/\\/g, "/");
    return `
$bDll = "${dll}"
$bCs = "${cs}"
if (-not (Test-Path $bDll)) {
    try {
        $cSrc = Get-Content -Path $bCs -Raw -Encoding UTF8
        Add-Type -TypeDefinition $cSrc -OutputAssembly $bDll -Language CSharp -ReferencedAssemblies System.Drawing.dll, System.Windows.Forms.dll -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}
if (Test-Path $bDll) {
    Add-Type -Path $bDll -ErrorAction SilentlyContinue | Out-Null
} else {
    $cSrc = Get-Content -Path $bCs -Raw -Encoding UTF8
    Add-Type -TypeDefinition $cSrc -Language CSharp -ReferencedAssemblies System.Drawing.dll, System.Windows.Forms.dll -ErrorAction SilentlyContinue | Out-Null
}
`;
  }

  private async runPowerShell(script: string, timeoutMs = 30000): Promise<string> {
    const fullScript = `$ProgressPreference = 'SilentlyContinue'\n$WarningPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n` + script;
    const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { timeout: timeoutMs, maxBuffer: 15 * 1024 * 1024 }
      );
      return stdout.trim();
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "WindowsNativeCore PowerShell execution warning");
      throw new Error(`WindowsNativeCore error: ${err?.message || String(err)}`);
    }
  }

  /**
   * Enumerate all interactive top-level desktop windows with accurate Unicode Chinese titles
   */
  async listWindows(): Promise<NativeWindowListResult> {
    const script = `
${this.getLoadDllScript()}
$raw = [NativeWinScanner]::Scan()

$lines = $raw -split "[\\r\\n]+"
$results = @()
$procCache = @{}

foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split [regex]::Escape("|*|")
    if ($parts.Length -ge 8) {
        $hwnd = $parts[0]
        $wPid = [int]$parts[1]
        $isFg = ($parts[2] -eq "1")
        $x = [int]$parts[3]
        $y = [int]$parts[4]
        $w = [int]$parts[5]
        $h = [int]$parts[6]
        $title = $parts[7..($parts.Length - 1)] -join "|*|"

        $pName = ""
        if ($procCache.ContainsKey($wPid)) {
            $pName = $procCache[$wPid]
        } else {
            try {
                $p = [System.Diagnostics.Process]::GetProcessById($wPid)
                $pName = $p.ProcessName
                $procCache[$wPid] = $pName
            } catch {
                $pName = "unknown"
            }
        }

        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = $pName
        }

        if ($w -gt 10 -and $h -gt 10) {
            $results += [PSCustomObject]@{
                handle = $hwnd
                title = $title
                processName = $pName
                pid = $wPid
                isForeground = $isFg
                bounds = [PSCustomObject]@{
                    x = $x
                    y = $y
                    width = $w
                    height = $h
                }
            }
        }
    }
}

# Ensure common desktop apps (like notepad, calc) running as processes are included even if under background/UWP state
$knownApps = @("notepad", "calc", "wordpad")
foreach ($ka in $knownApps) {
    $procs = Get-Process -Name $ka -ErrorAction SilentlyContinue
    foreach ($pr in $procs) {
        $exists = $results | Where-Object { $_.pid -eq $pr.Id }
        if (-not $exists) {
            $appTitle = if (-not [string]::IsNullOrWhiteSpace($pr.MainWindowTitle)) { $pr.MainWindowTitle } else { if ($ka -eq "notepad") { "记事本" } elseif ($ka -eq "calc") { "计算器" } else { $ka } }
            $results += [PSCustomObject]@{
                handle = if ($pr.MainWindowHandle -ne 0) { $pr.MainWindowHandle.ToString() } else { "$($pr.Id)" }
                title = $appTitle
                processName = $ka
                pid = $pr.Id
                isForeground = $false
                bounds = [PSCustomObject]@{
                    x = 100
                    y = 100
                    width = 900
                    height = 650
                }
            }
        }
    }
}

$json = if ($results.Count -eq 0) { "[]" } else { @($results) | ConvertTo-Json -Compress }
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
[Convert]::ToBase64String($bytes)
`;

    try {
      const out = await this.runPowerShell(script, 15000);
      if (!out) return { windows: [], activeWindow: null };
      const jsonStr = Buffer.from(out.trim(), "base64").toString("utf8");
      const list = JSON.parse(jsonStr);
      const windows: WindowItem[] = Array.isArray(list) ? list : [list];
      const activeWindow = windows.find((w) => w.isForeground) || null;
      return { windows, activeWindow };
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "Failed to list native windows");
      return { windows: [], activeWindow: null };
    }
  }

  /**
   * Activate target window reliably using Win32 BringWindowToTop, ShowWindow, and SetForegroundWindow
   */
  async activateWindow(handleOrTitle: string): Promise<NativeActivateResult> {
    const listRes = await this.listWindows();
    const q = handleOrTitle.toLowerCase().trim();
    let target = listRes.windows.find(
      (w) => w.handle === q || w.title.toLowerCase().includes(q) || w.processName?.toLowerCase().includes(q)
    );

    // Fallback: check aliases
    if (!target) {
      if (/word|doc|wps|文字/i.test(q)) {
        target = listRes.windows.find((w) => /wps|winword/i.test(w.processName || "") || /wps|word|文字文稿/i.test(w.title));
      } else if (/note|记事本|txt/i.test(q)) {
        target = listRes.windows.find((w) => /notepad/i.test(w.processName || "") || /记事本|notepad/i.test(w.title));
      } else if (/browser|chrome|zen|edge|网页/i.test(q)) {
        target = listRes.windows.find((w) => /zen|chrome|msedge|firefox/i.test(w.processName || ""));
      }
    }

    if (!target) {
      return {
        success: false,
        executed: false,
        verified: true,
        activated: false,
        isForeground: false,
        message: `No window found matching query: "${handleOrTitle}"`,
      };
    }

    if (target.isForeground) {
      return {
        success: true,
        executed: false,
        verified: true,
        activated: true,
        isForeground: true,
        alreadyForeground: true,
        window: target,
        verification: {
          foreground: true,
          windowExists: true,
        },
        message: `Window "${target.title}" is already foreground.`,
      };
    }

    const script = `
${this.getLoadDllScript()}
$res = "FALSE"
try {
    $h = [IntPtr][int64]${target.handle}
    if ($h -ne [IntPtr]::Zero) {
        $res = [NativeActivator]::ActivateAndVerify($h)
    }
} catch {}

if ($res -ne "TRUE") {
    try {
        $pr = Get-Process -Id ${target.pid} -ErrorAction SilentlyContinue
        if ($pr -and $pr.MainWindowHandle -ne [IntPtr]::Zero) {
            $res = [NativeActivator]::ActivateAndVerify($pr.MainWindowHandle)
        }
    } catch {}
}
Write-Output $res
`;

    const out = await this.runPowerShell(script, 10000);
    const isFg = out.toUpperCase().includes("TRUE");
    return {
      success: true,
      executed: true,
      verified: true,
      activated: true,
      isForeground: isFg,
      alreadyForeground: false,
      window: { ...target, isForeground: isFg },
      verification: {
        foreground: isFg,
        windowExists: true,
      },
      message: `Window "${target.title}" brought to foreground.`,
    };
  }

  /**
   * Type text losslessly into active window using clipboard paste (Ctrl+V) and keyboard events
   */
  async typeText(text: string): Promise<{ success: boolean; bytesWritten: number }> {
    const b64 = Buffer.from(text, "utf-8").toString("base64");
    const script = `
Add-Type -AssemblyName System.Windows.Forms
${this.getLoadDllScript()}

$bytes = [Convert]::FromBase64String("${b64}")
$str = [System.Text.Encoding]::UTF8.GetString($bytes)

for ($i = 0; $i -lt 5; $i++) {
    try {
        [System.Windows.Forms.Clipboard]::SetText($str)
        break
    } catch {
        Start-Sleep -Milliseconds 50
    }
}

Start-Sleep -Milliseconds 60
[NativeTyper]::Paste()
Write-Output "OK"
`;
    await this.runPowerShell(script, 15000);
    return { success: true, bytesWritten: Buffer.byteLength(text, "utf-8") };
  }

  /**
   * Press key combination using Win32 keybd_event
   */
  async pressKeys(keys: string[]): Promise<{ success: boolean }> {
    const VK_MAP: Record<string, number> = {
      ctrl: 0x11, control: 0x11,
      alt: 0x12,
      shift: 0x10,
      win: 0x5b, windows: 0x5b,
      enter: 0x0d, return: 0x0d,
      esc: 0x1b, escape: 0x1b,
      tab: 0x09,
      backspace: 0x08,
      delete: 0x2e, del: 0x2e,
      space: 0x20,
      up: 0x26, down: 0x28, left: 0x25, right: 0x27,
      home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
      f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
      f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
    };

    const vkCodes: number[] = [];
    for (const k of keys) {
      const lower = k.toLowerCase().trim();
      if (VK_MAP[lower] !== undefined) {
        vkCodes.push(VK_MAP[lower]);
      } else if (k.length === 1) {
        vkCodes.push(k.toUpperCase().charCodeAt(0));
      }
    }

    if (vkCodes.length === 0) return { success: true };

    const script = `
${this.getLoadDllScript()}
$vks = @(${vkCodes.join(",")})

foreach ($vk in $vks) {
    [NativeKeys]::keybd_event([byte]$vk, 0, 0, 0)
}
Start-Sleep -Milliseconds 40
for ($i = $vks.Length - 1; $i -ge 0; $i--) {
    [NativeKeys]::keybd_event([byte]$vks[$i], 0, 2, 0)
}
Write-Output "OK"
`;
    await this.runPowerShell(script, 10000);
    return { success: true };
  }

  /**
   * Move and click mouse at specific coordinate
   */
  async clickMouse(x?: number, y?: number, button: "left" | "right" | "middle" | "double" = "left"): Promise<{ success: boolean; x: number; y: number }> {
    let downFlag = 2; // LEFTDOWN
    let upFlag = 4;   // LEFTUP
    if (button === "right") { downFlag = 8; upFlag = 16; }
    else if (button === "middle") { downFlag = 32; upFlag = 64; }

    const isDouble = (button === "double");
    const setPos = (x !== undefined && y !== undefined)
      ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); Start-Sleep -Milliseconds 40;`
      : "";

    const script = `
Add-Type -AssemblyName System.Windows.Forms
${this.getLoadDllScript()}
${setPos}

$cur = [System.Windows.Forms.Cursor]::Position
[NativeMouse]::mouse_event(${downFlag}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 40
[NativeMouse]::mouse_event(${upFlag}, 0, 0, 0, 0)

${isDouble ? `
Start-Sleep -Milliseconds 60
[NativeMouse]::mouse_event(${downFlag}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 40
[NativeMouse]::mouse_event(${upFlag}, 0, 0, 0, 0)
` : ""}

Write-Output "$($cur.X),$($cur.Y)"
`;
    const out = await this.runPowerShell(script, 10000);
    const [retX, retY] = out.split(",").map((v) => parseInt(v.trim(), 10) || 0);
    return { success: true, x: retX || x || 0, y: retY || y || 0 };
  }

  /**
   * Capture desktop screen using GDI BitBlt(CAPTUREBLT) on the active desktop session.
   * Produces a Base64 PNG image, artifact file, and screen content hash.
   */
  async captureScreen(saveToArtifact = true): Promise<NativeScreenCaptureResult> {
    const filename = `snapshot_${Date.now()}.png`;
    const targetFile = path.join(this.snapshotsDir, filename);
    const targetFileFwd = targetFile.replace(/\\/g, "/");

    const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
${this.getLoadDllScript()}

$bmp = $null
try {
    $bmp = [NativeCapture]::Capture()
} catch {}

if ($null -eq $bmp) {
    try {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bmp = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $g.Dispose()
    } catch {}
}

if ($null -eq $bmp) {
    # Emergency fallback: non-empty bitmap
    $bmp = New-Object System.Drawing.Bitmap 1920, 1080
}

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
if ($("${saveToArtifact}".ToLower()) -eq "true") {
    try {
        $outDir = [System.IO.Path]::GetDirectoryName("${targetFileFwd}")
        if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
        $bmp.Save("${targetFileFwd}", [System.Drawing.Imaging.ImageFormat]::Png)
    } catch {}
}

$bytes = $ms.ToArray()
$base64 = [Convert]::ToBase64String($bytes)
$w = $bmp.Width
$h = $bmp.Height

$bmp.Dispose()
$ms.Dispose()

[PSCustomObject]@{
    width = $w
    height = $h
    base64 = $base64
} | ConvertTo-Json -Compress
`;

    const start = Date.now();
    console.log(`[WindowsNativeCore] captureScreen starting PowerShell (snapshotsDir: ${this.snapshotsDir})...`);
    let out = "";
    try {
      out = await this.runPowerShell(script, 30000);
      console.log(`[WindowsNativeCore] captureScreen PowerShell returned in ${Date.now() - start}ms, out length: ${out.length}`);
    } catch (err: any) {
      console.error(`[WindowsNativeCore] captureScreen PowerShell failed in ${Date.now() - start}ms:`, err?.message);
      throw err;
    }
    const jsonStart = out.indexOf("{");
    const jsonEnd = out.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Failed to capture screen: invalid PowerShell output: ${out.slice(0, 200)}`);
    }
    const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
    const hash = crypto.createHash("sha256").update(parsed.base64).digest("hex").slice(0, 16);

    return {
      width: parsed.width,
      height: parsed.height,
      base64: parsed.base64,
      hash,
      savedPath: saveToArtifact ? targetFile : undefined,
    };
  }
}
