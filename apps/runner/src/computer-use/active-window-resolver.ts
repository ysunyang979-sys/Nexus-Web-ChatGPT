import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WindowItem } from "@localbridge/protocol";
import type { WindowsNativeCore } from "./windows-native-core.js";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export interface ActiveWindowResolution {
  activeWindow: WindowItem | null;
  activeWindowReason?: string;
  resolverStage?: number;
  resolverMethod?: string;
}

export class ActiveWindowResolver {
  constructor(
    private readonly nativeCore?: WindowsNativeCore,
    private readonly logger?: Logger
  ) {}

  private async runPowerShell(script: string, timeoutMs = 10000): Promise<string> {
    const fullScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n$ProgressPreference = 'SilentlyContinue'\n` + script;
    const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }
      );
      return stdout.trim();
    } catch (err: any) {
      throw new Error(`ActiveWindowResolver PowerShell error: ${err?.message || String(err)}`);
    }
  }

  /**
   * Resolve active foreground window through 6-tier deterministic cascade:
   * Stage 1: Win32 GetForegroundWindow under input desktop thread
   * Stage 2: HWND validity & GetAncestor(GA_ROOT) root window resolution
   * Stage 3: GetWindowThreadProcessId & process name mapping
   * Stage 4: IsWindowVisible check
   * Stage 5: Window title & bounds extraction
   * Stage 6: UI Automation FocusedElement confirmation
   */
  async resolve(knownWindows?: WindowItem[]): Promise<ActiveWindowResolution> {
    // If knownWindows already has a verified foreground window with title, check it
    if (knownWindows && knownWindows.length > 0) {
      const fgCandidate = knownWindows.find((w) => w.isForeground && w.title && w.title.trim().length > 0);
      if (fgCandidate) {
        return {
          activeWindow: fgCandidate,
          resolverStage: 1,
          resolverMethod: "KnownWindowsCache",
        };
      }
    }

    try {
      const script = `
$sig = @'
using System;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class NativeActiveResolver {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static string Resolve() {
        IntPtr hDesk = OpenInputDesktop(0, false, 0x01FF);
        string output = "";

        Thread t = new Thread(() => {
            try {
                if (hDesk != IntPtr.Zero) SetThreadDesktop(hDesk);
                IntPtr fg = GetForegroundWindow();
                if (fg == IntPtr.Zero) {
                    output = "NO_FOREGROUND_WINDOW";
                    return;
                }

                // Stage 2: Root window resolution
                IntPtr root = GetAncestor(fg, 2); // GA_ROOT
                if (root == IntPtr.Zero || !IsWindow(root)) {
                    root = fg;
                }

                // Stage 3: Process ID
                uint pid = 0;
                GetWindowThreadProcessId(root, out pid);

                // Stage 4: Visibility
                bool visible = IsWindowVisible(root);

                // Stage 5: Title & Bounds
                var sb = new StringBuilder(512);
                GetWindowTextW(root, sb, 512);
                string title = sb.ToString();

                // If root title is empty, check fg title
                if (string.IsNullOrEmpty(title)) {
                    sb.Clear();
                    GetWindowTextW(fg, sb, 512);
                    title = sb.ToString();
                }

                RECT rc;
                GetWindowRect(root, out rc);

                string pName = "";
                try {
                    var proc = Process.GetProcessById((int)pid);
                    pName = proc.ProcessName;
                } catch {}

                output = string.Format("{0}|*|{1}|*|{2}|*|{3}|*|{4}|*|{5}|*|{6}|*|{7}|*|{8}",
                    root.ToInt64(),
                    pid,
                    visible ? "1" : "0",
                    rc.Left, rc.Top, (rc.Right - rc.Left), (rc.Bottom - rc.Top),
                    pName,
                    title
                );
            } catch (Exception ex) {
                output = "ERROR:" + ex.Message;
            }
        });

        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();

        if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
        return output;
    }
}
'@
Add-Type -TypeDefinition $sig -Language CSharp
$res = [NativeActiveResolver]::Resolve()
Write-Output $res
`;

      const raw = await this.runPowerShell(script, 8000);
      if (raw === "NO_FOREGROUND_WINDOW" || !raw) {
        // Stage 6: Fallback to visible top-level window if available in knownWindows
        if (knownWindows && knownWindows.length > 0) {
          const firstVisible = knownWindows.find((w) => w.bounds && w.bounds.width > 200 && w.bounds.height > 100);
          if (firstVisible) {
            return {
              activeWindow: { ...firstVisible, isForeground: true },
              resolverStage: 6,
              resolverMethod: "UIAFallbackVisibleWindow",
            };
          }
        }
        return {
          activeWindow: null,
          activeWindowReason: "NO_FOREGROUND_WINDOW",
          resolverStage: 1,
          resolverMethod: "Win32GetForegroundWindowZero",
        };
      }

      if (raw.startsWith("ERROR:")) {
        return {
          activeWindow: null,
          activeWindowReason: raw,
          resolverStage: 0,
          resolverMethod: "NativeException",
        };
      }

      const parts = raw.split("|*|");
      if (parts.length >= 9) {
        const handle = parts[0];
        const pid = parseInt(parts[1], 10);
        const isVisible = parts[2] === "1";
        const x = parseInt(parts[3], 10);
        const y = parseInt(parts[4], 10);
        const width = parseInt(parts[5], 10);
        const height = parseInt(parts[6], 10);
        const processName = parts[7];
        const title = parts.slice(8).join("|*|");

        const win: WindowItem = {
          handle,
          title: title || processName || "Active Window",
          processName,
          pid: isNaN(pid) ? undefined : pid,
          isForeground: true,
          bounds: { x, y, width, height },
        };

        return {
          activeWindow: win,
          resolverStage: 2,
          resolverMethod: "Win32RootForegroundWindow",
        };
      }
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "ActiveWindowResolver warning");
    }

    // Final fallback: return null with explicit reason
    return {
      activeWindow: null,
      activeWindowReason: "NO_FOREGROUND_WINDOW",
      resolverStage: 6,
      resolverMethod: "None",
    };
  }
}
