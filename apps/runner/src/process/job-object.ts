import child_process from "node:child_process";
import nodeModule from "node:module";
import { type Logger } from "@localbridge/shared";

const req = nodeModule.createRequire(import.meta.url);

export class WindowsJobObject {
  private handle: any = null;
  private readonly pids = new Set<number>();
  private static k32: any = null;
  private static initialized = false;

  private static CreateJobObjectW: any;
  private static AssignProcessToJobObject: any;
  private static SetInformationJobObject: any;
  private static TerminateJobObject: any;
  private static OpenProcess: any;
  private static CloseHandle: any;

  private static initKoffi(): boolean {
    if (this.initialized) return !!this.k32;
    this.initialized = true;

    if (process.platform !== "win32") {
      return false;
    }

    try {
      // Dynamic import / require of koffi
      const koffi = req("koffi");
      this.k32 = koffi.load("kernel32.dll");

      this.CreateJobObjectW = this.k32.func("void* CreateJobObjectW(void* lpJobAttributes, const char16_t* lpName)");
      this.AssignProcessToJobObject = this.k32.func("int AssignProcessToJobObject(void* hJob, void* hProcess)");
      this.SetInformationJobObject = this.k32.func("int SetInformationJobObject(void* hJob, int JobObjectInformationClass, void* lpJobObjectInformation, uint32_t cbJobObjectInformationLength)");
      this.TerminateJobObject = this.k32.func("int TerminateJobObject(void* hJob, uint32_t uExitCode)");
      this.OpenProcess = this.k32.func("void* OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)");
      this.CloseHandle = this.k32.func("int CloseHandle(void* hObject)");
      return true;
    } catch {
      return false;
    }
  }

  constructor(public readonly name: string, private readonly logger?: Logger) {
    if (WindowsJobObject.initKoffi()) {
      try {
        this.handle = WindowsJobObject.CreateJobObjectW(null, name);
        if (this.handle) {
          // Configure JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
          // struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
          // In koffi we can set up basic limit
          const JobObjectExtendedLimitInformation = 9;
          const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

          // A 112-byte buffer for JOBOBJECT_EXTENDED_LIMIT_INFORMATION on x64
          const buf = Buffer.alloc(112);
          // LimitFlags offset in JOBOBJECT_BASIC_LIMIT_INFORMATION is 16 on x64 (after 2 int64s)
          buf.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, 16);

          WindowsJobObject.SetInformationJobObject(
            this.handle,
            JobObjectExtendedLimitInformation,
            buf,
            buf.length
          );
        }
      } catch (err) {
        this.logger?.warn({ err, name }, "Failed to configure Windows Job Object");
      }
    }
  }

  assignProcess(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    this.pids.add(pid);

    if (this.handle && WindowsJobObject.k32) {
      try {
        const PROCESS_SET_QUOTA = 0x0100;
        const PROCESS_TERMINATE = 0x0001;
        const access = PROCESS_SET_QUOTA | PROCESS_TERMINATE;
        const hProc = WindowsJobObject.OpenProcess(access, 0, pid);
        if (hProc) {
          const ok = WindowsJobObject.AssignProcessToJobObject(this.handle, hProc);
          WindowsJobObject.CloseHandle(hProc);
          return !!ok;
        }
      } catch (err) {
        this.logger?.debug({ err, pid, name: this.name }, "Could not assign process to Job Object");
      }
    }
    return false;
  }

  async terminate(exitCode = 1): Promise<void> {
    let terminatedViaJob = false;
    if (this.handle && WindowsJobObject.k32) {
      try {
        const ok = WindowsJobObject.TerminateJobObject(this.handle, exitCode);
        if (ok) terminatedViaJob = true;
      } catch (err) {
        this.logger?.debug({ err, name: this.name }, "TerminateJobObject failed");
      }
    }
    if (terminatedViaJob) {
      this.logger?.debug({ name: this.name }, "Job object terminated successfully");
    }

    // Always fallback/reinforce with taskkill for every assigned PID if needed
    for (const pid of this.pids) {
      if (process.platform === "win32") {
        await new Promise<void>((resolve) => {
          try {
            const proc = child_process.spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
              shell: false,
            });
            proc.on("close", () => resolve());
            proc.on("error", () => resolve());
          } catch {
            resolve();
          }
        });
      } else {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // Already dead
          }
        }
      }
    }
  }

  dispose(): void {
    if (this.handle && WindowsJobObject.k32) {
      try {
        WindowsJobObject.CloseHandle(this.handle);
      } catch {}
      this.handle = null;
    }
    this.pids.clear();
  }
}
