import child_process from "node:child_process";
import nodeModule from "node:module";
import type { LiveProcessInfo } from "@localbridge/security";

const req = nodeModule.createRequire(import.meta.url);

export interface ProcessInspectorDetails extends LiveProcessInfo {
  memoryBytes?: number;
  cpuTimeMs?: number;
  state: string;
}

export class ProcessInspector {
  private static k32: any = null;
  private static OpenProcess: any;
  private static CloseHandle: any;
  private static GetProcessTimes: any;
  private static initializedKoffi = false;

  private static initKoffi(): boolean {
    if (this.initializedKoffi) return !!this.k32;
    this.initializedKoffi = true;

    if (process.platform !== "win32") return false;

    try {
      const koffi = req("koffi");
      this.k32 = koffi.load("kernel32.dll");
      this.OpenProcess = this.k32.func("void* OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)");
      this.CloseHandle = this.k32.func("int CloseHandle(void* hObject)");
      koffi.struct("FILETIME_INSPECTOR", {
        dwLowDateTime: "uint32",
        dwHighDateTime: "uint32",
      });
      this.GetProcessTimes = this.k32.func(
        "int GetProcessTimes(void* hProcess, _Out_ FILETIME_INSPECTOR* lpCreationTime, _Out_ FILETIME_INSPECTOR* lpExitTime, _Out_ FILETIME_INSPECTOR* lpKernelTime, _Out_ FILETIME_INSPECTOR* lpUserTime)"
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get microsecond-precise process creation time string on Windows to prevent PID reuse.
   */
  static getProcessStartTime(pid: number): string | undefined {
    if (process.platform !== "win32") {
      return undefined;
    }

    if (this.initKoffi() && this.OpenProcess) {
      try {
        const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        const hProc = this.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if (hProc) {
          const creationTime: any = {};
          const exitTime: any = {};
          const kernelTime: any = {};
          const userTime: any = {};
          const ok = this.GetProcessTimes(hProc, creationTime, exitTime, kernelTime, userTime);
          this.CloseHandle(hProc);
          if (ok && creationTime.dwHighDateTime !== undefined) {
            const raw = (BigInt(creationTime.dwHighDateTime) << 32n) | BigInt(creationTime.dwLowDateTime);
            return raw.toString();
          }
        }
      } catch {}
    }

    return undefined;
  }

  /**
   * List all running processes on the system.
   */
  static async listProcesses(): Promise<ProcessInspectorDetails[]> {
    if (process.platform === "win32") {
      return this.listWindowsProcesses();
    } else {
      return this.listPosixProcesses();
    }
  }

  private static async listWindowsProcesses(): Promise<ProcessInspectorDetails[]> {
    return new Promise((resolve) => {
      const psCommand =
        "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate, WorkingSetSize | ConvertTo-Json -Compress";

      const proc = child_process.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      proc.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const items = Array.isArray(parsed) ? parsed : [parsed];
          const results: ProcessInspectorDetails[] = [];

          for (const item of items) {
            const pid = Number(item.ProcessId);
            if (!Number.isInteger(pid) || pid <= 0) continue;

            let startTime: string | undefined;
            if (item.CreationDate) {
              const match = /\/Date\((\d+)\)\//.exec(String(item.CreationDate));
              if (match && match[1]) {
                startTime = match[1];
              } else {
                startTime = String(item.CreationDate);
              }
            }

            results.push({
              pid,
              ppid: item.ParentProcessId ? Number(item.ParentProcessId) : undefined,
              name: String(item.Name || "unknown"),
              commandLine: item.CommandLine ? String(item.CommandLine) : undefined,
              executablePath: item.ExecutablePath ? String(item.ExecutablePath) : undefined,
              memoryBytes: item.WorkingSetSize ? Number(item.WorkingSetSize) : undefined,
              state: "running",
              startTime,
            });
          }

          resolve(results);
        } catch {
          resolve([]);
        }
      });

      proc.on("error", () => resolve([]));
    });
  }

  private static async listPosixProcesses(): Promise<ProcessInspectorDetails[]> {
    return new Promise((resolve) => {
      const proc = child_process.spawn("ps", ["-eo", "pid,ppid,comm,args,rss"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      proc.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          resolve([]);
          return;
        }

        const lines = stdout.trim().split("\n").slice(1);
        const results: ProcessInspectorDetails[] = [];

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 5) continue;

          const pid = Number(parts[0]);
          const ppid = Number(parts[1]);
          const name = parts[2];
          const memoryKb = Number(parts[4]);
          const commandLine = parts.slice(3).join(" ");

          if (Number.isInteger(pid) && pid > 0) {
            results.push({
              pid,
              ppid: Number.isInteger(ppid) ? ppid : undefined,
              name: name || "unknown",
              commandLine,
              memoryBytes: Number.isInteger(memoryKb) ? memoryKb * 1024 : undefined,
              state: "running",
            });
          }
        }

        resolve(results);
      });

      proc.on("error", () => resolve([]));
    });
  }
}
