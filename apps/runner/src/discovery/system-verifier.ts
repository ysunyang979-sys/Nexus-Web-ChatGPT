import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  VerifyResourceParams,
  VerifyResourceResult,
  LaunchApplicationParams,
  LaunchApplicationResult,
} from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { WindowsNativeCore } from "../computer-use/windows-native-core.js";

const execFileAsync = promisify(execFile);

export class SystemVerifier {
  constructor(
    private readonly nativeCore?: WindowsNativeCore,
    private readonly logger?: Logger,
    private readonly workspaceRoot?: string
  ) {}

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async runPowerShell(script: string, timeoutMs = 15000): Promise<string> {
    const fullScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
${script}
`;
    const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }
      );
      return stdout.replace(/#<\s*CLIXML[\s\S]*?<\/Objs>/gi, "").trim();
    } catch {
      return "";
    }
  }

  /**
   * Verify file existence, accessibility, size, and hash
   */
  async verifyFile(
    filePath: string,
    options?: { minSize?: number; hash?: string }
  ): Promise<VerifyResourceResult> {
    const resolved = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : this.workspaceRoot
        ? path.resolve(this.workspaceRoot, filePath)
        : path.resolve(process.cwd(), filePath);
        
    if (!fs.existsSync(resolved)) {
      return {
        verified: false,
        resourceType: "file",
        target: filePath,
        message: `File does not exist: ${resolved}`,
      };
    }

    try {
      const stat = fs.statSync(resolved);
      if (options?.minSize !== undefined && stat.size < options.minSize) {
        return {
          verified: false,
          resourceType: "file",
          target: filePath,
          actualState: { size: stat.size, expectedMinSize: options.minSize },
          message: `File size ${stat.size} is less than required ${options.minSize}`,
        };
      }

      let actualHash = "";
      if (options?.hash) {
        const content = fs.readFileSync(resolved);
        actualHash = crypto.createHash("sha256").update(content).digest("hex");
        if (actualHash.toLowerCase() !== options.hash.toLowerCase()) {
          return {
            verified: false,
            resourceType: "file",
            target: filePath,
            actualState: { hash: actualHash, expectedHash: options.hash },
            message: `File hash mismatch`,
          };
        }
      }

      return {
        verified: true,
        resourceType: "file",
        target: filePath,
        actualState: {
          path: resolved,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          hash: actualHash || undefined,
        },
        message: "File verified successfully",
      };
    } catch (err: any) {
      return {
        verified: false,
        resourceType: "file",
        target: filePath,
        message: `Failed to inspect file: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Verify if a process is running on the host
   */
  async verifyProcess(
    target: string | number,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<VerifyResourceResult> {
    const timeout = options?.timeoutMs ?? 4000;
    const interval = options?.pollIntervalMs ?? 300;
    const startTime = Date.now();

    const isPid = typeof target === "number" || /^\d+$/.test(String(target));
    const targetPid = isPid ? parseInt(String(target), 10) : null;
    const targetName = isPid ? "" : String(target).replace(/\.exe$/i, "").toLowerCase();

    while (Date.now() - startTime <= timeout) {
      try {
        let script = "";
        if (targetPid) {
          script = `Get-Process -Id ${targetPid} -ErrorAction SilentlyContinue | Select-Object -First 1 Id, ProcessName, Path | ConvertTo-Json -Compress`;
        } else {
          script = `Get-Process -Name "${targetName}" -ErrorAction SilentlyContinue | Select-Object -First 1 Id, ProcessName, Path | ConvertTo-Json -Compress`;
        }

        const out = await this.runPowerShell(script, 4000);
        if (out) {
          try {
            const parsed = JSON.parse(out);
            if (parsed && (parsed.Id || parsed.ProcessName)) {
              return {
                verified: true,
                resourceType: "process",
                target: String(target),
                actualState: {
                  pid: parsed.Id,
                  processName: parsed.ProcessName,
                  path: parsed.Path,
                },
                message: `Process verified running (PID: ${parsed.Id}, Name: ${parsed.ProcessName})`,
              };
            }
          } catch {}
        }
      } catch {}

      await this.sleep(interval);
    }

    return {
      verified: false,
      resourceType: "process",
      target: String(target),
      message: `Process not verified within ${timeout}ms: ${target}`,
    };
  }

  /**
   * Verify if a window with title containing target is open
   */
  async verifyWindow(
    titleOrSubstring: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<VerifyResourceResult> {
    const timeout = options?.timeoutMs ?? 5000;
    const interval = options?.pollIntervalMs ?? 400;
    const startTime = Date.now();
    const targetLower = titleOrSubstring.toLowerCase().trim();

    while (Date.now() - startTime <= timeout) {
      // 1. Try native core if available
      if (this.nativeCore) {
        try {
          const list = await this.nativeCore.listWindows();
          const match = list.windows.find(
            (w) => w.title && w.title.toLowerCase().includes(targetLower)
          );
          if (match) {
            const handle = (match as any).hwnd || match.handle;
            return {
              verified: true,
              resourceType: "window",
              target: titleOrSubstring,
              actualState: {
                hwnd: handle,
                title: match.title,
                pid: match.pid,
                processName: match.processName,
              },
              message: `Window verified: "${match.title}" (HWND: ${handle})`,
            };
          }
        } catch {}
      }

      // 2. Fallback to PowerShell User32 window search
      const script = `
Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -match [regex]::Escape("${targetLower}") } | Select-Object -First 1 Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json -Compress
`;
      const out = await this.runPowerShell(script, 3000);
      if (out) {
        try {
          const parsed = JSON.parse(out);
          if (parsed && parsed.MainWindowTitle) {
            return {
              verified: true,
              resourceType: "window",
              target: titleOrSubstring,
              actualState: {
                hwnd: parsed.MainWindowHandle ? String(parsed.MainWindowHandle) : undefined,
                title: parsed.MainWindowTitle,
                pid: parsed.Id,
                processName: parsed.ProcessName,
              },
              message: `Window verified: "${parsed.MainWindowTitle}" (PID: ${parsed.Id})`,
            };
          }
        } catch {}
      }

      await this.sleep(interval);
    }

    return {
      verified: false,
      resourceType: "window",
      target: titleOrSubstring,
      message: `Window not verified within ${timeout}ms: ${titleOrSubstring}`,
    };
  }

  /**
   * Unified Resource Verification entrypoint
   */
  async verifyResource(params: VerifyResourceParams): Promise<VerifyResourceResult> {
    switch (params.resourceType) {
      case "file":
        return this.verifyFile(params.target, {
          minSize: params.expectedState?.minSize,
          hash: params.expectedState?.hash,
        });
      case "directory": {
        const resolved = path.isAbsolute(params.target)
          ? path.resolve(params.target)
          : this.workspaceRoot
            ? path.resolve(this.workspaceRoot, params.target)
            : path.resolve(process.cwd(), params.target);
        const exists = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
        return {
          verified: exists,
          resourceType: "directory",
          target: params.target,
          actualState: { exists, path: resolved },
          message: exists ? "Directory verified exists" : "Directory does not exist",
        };
      }
      case "process":
        return this.verifyProcess(params.target, { timeoutMs: params.timeoutMs });
      case "window":
        return this.verifyWindow(params.target, { timeoutMs: params.timeoutMs });
      case "application": {
        const fileVer = await this.verifyFile(params.target);
        if (!fileVer.verified) {
          return {
            verified: false,
            resourceType: "application",
            target: params.target,
            message: `Application executable does not exist: ${params.target}`,
          };
        }
        return {
          verified: true,
          resourceType: "application",
          target: params.target,
          actualState: fileVer.actualState,
          message: "Application executable verified on disk",
        };
      }
      default:
        return {
          verified: false,
          resourceType: params.resourceType,
          target: params.target,
          message: `Unknown verification resource type: ${params.resourceType}`,
        };
    }
  }

  /**
   * Execution Layer: launch application and inspect real OS state (process and window)
   */
  async launchAndVerify(
    resolvedExecutablePath: string,
    args: string[] = [],
    options?: { timeoutMs?: number; workingDirectory?: string; appName?: string }
  ): Promise<LaunchApplicationResult> {
    const timeout = options?.timeoutMs ?? 8000;
    const resolved = path.resolve(resolvedExecutablePath);

    // 1. Verify executable exists on disk before launching
    if (!fs.existsSync(resolved)) {
      return {
        launched: false,
        executablePath: resolved,
        verified: false,
        verificationDetails: {
          processExists: false,
          windowExists: false,
          error: `Executable not found: ${resolved}`,
        },
        message: `无法启动：可执行文件不存在: ${resolved}`,
      };
    }

    const exeBase = path.basename(resolved, path.extname(resolved));
    const workDir = options?.workingDirectory || path.dirname(resolved);

    // 2. Launch child process detached
    let spawnedPid: number | undefined;
    try {
      const child = spawn(resolved, args, {
        cwd: workDir,
        detached: true,
        stdio: "ignore",
      });
      spawnedPid = child.pid;
      child.unref();
    } catch (err: any) {
      return {
        launched: false,
        executablePath: resolved,
        verified: false,
        verificationDetails: {
          processExists: false,
          windowExists: false,
          error: err?.message || String(err),
        },
        message: `启动进程失败: ${err?.message || String(err)}`,
      };
    }

    // 3. Verification phase: Poll OS state for Process and Window
    // Do NOT rely merely on spawn returning without error!
    let procCheck = await this.verifyProcess(spawnedPid || exeBase, {
      timeoutMs: Math.min(timeout, 3000),
      pollIntervalMs: 250,
    });

    if (!procCheck.verified && exeBase) {
      procCheck = await this.verifyProcess(exeBase, {
        timeoutMs: Math.min(timeout, 2000),
        pollIntervalMs: 250,
      });
    }

    const windowCheck = await this.verifyWindow(options?.appName || exeBase, {
      timeoutMs: Math.min(timeout, 3000),
      pollIntervalMs: 300,
    });

    const processVerified = procCheck.verified;
    const windowVerified = windowCheck.verified;
    const overallVerified = processVerified || windowVerified;

    if (!overallVerified) {
      return {
        launched: true,
        executablePath: resolved,
        pid: spawnedPid,
        verified: false,
        verificationDetails: {
          processExists: false,
          windowExists: false,
          error: "进程与窗口均未在系统状态中检测到",
        },
        message: `已执行启动，但未验证到 ${options?.appName || exeBase} 进程/窗口。`,
      };
    }

    const windowTitle = windowCheck.actualState?.title;
    const windowHandle = windowCheck.actualState?.hwnd;
    const finalPid = procCheck.actualState?.pid || spawnedPid;

    return {
      launched: true,
      executablePath: resolved,
      pid: finalPid,
      windowHandle,
      windowTitle,
      verified: true,
      verificationDetails: {
        processExists: processVerified,
        windowExists: windowVerified,
      },
      message: `启动并成功验证 ${options?.appName || exeBase} (PID: ${finalPid}${windowTitle ? `, 窗口: "${windowTitle}"` : ""})`,
    };
  }
}
