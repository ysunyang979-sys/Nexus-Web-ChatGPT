import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LocalResource } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";

const execFileAsync = promisify(execFile);

export interface DiscoveredApp {
  name: string;
  aliases: string[];
  executablePath: string;
  installPath?: string;
  version?: string;
  publisher?: string;
  source: "registry" | "start_menu" | "path" | "filesystem" | "custom";
  exists: boolean;
  launchable: boolean;
  metadata?: Record<string, any>;
}

export class ApplicationDiscoveryEngine {
  private cachedApps: Map<string, DiscoveredApp> = new Map();
  private lastScanTime: number = 0;
  private readonly ttlMs: number = 3600000; // 1 hour cache to prevent heavy re-scans

  constructor(private readonly logger?: Logger) {}

  private async runPowerShell(script: string, timeoutMs = 25000): Promise<string> {
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
        { timeout: timeoutMs, maxBuffer: 15 * 1024 * 1024 }
      );
      // Strip any PowerShell clixml progress lines if present
      const clean = stdout.replace(/#<\s*CLIXML[\s\S]*?<\/Objs>/gi, "").trim();
      return clean;
    } catch (err: any) {
      this.logger?.warn({ err: err?.message }, "PowerShell discovery execution warning");
      return "";
    }
  }

  /**
   * Discover applications from all system sources:
   * 1. Windows Registry (HKLM, WOW6432Node, HKCU)
   * 2. Start Menu (.lnk shortcuts, .exe)
   * 3. PATH environment directories
   * 4. Standard and accessible drive tool directories (e.g. C:\, D:\, E:\Tools, etc.)
   */
  async discoverApplications(forceRefresh = false): Promise<DiscoveredApp[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedApps.size > 0 && now - this.lastScanTime < this.ttlMs) {
      return Array.from(this.cachedApps.values());
    }

    const appMap = new Map<string, DiscoveredApp>();

    // 1. Scan App Paths Registry (HKLM/HKCU Windows CurrentVersion\App Paths)
    try {
      const appPathApps = await this.scanAppPathsRegistry();
      for (const app of appPathApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "App Paths registry scan failed");
    }

    // 2. Scan Uninstall Registry
    try {
      const regApps = await this.scanRegistry();
      for (const app of regApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "Registry scan failed");
    }

    // 3. Scan Dedicated Office and Known Application Directories
    try {
      const officeApps = this.scanOfficeAndKnownApps();
      for (const app of officeApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "Office known apps scan failed");
    }

    // 4. Scan Start Menu
    try {
      const startMenuApps = await this.scanStartMenu();
      for (const app of startMenuApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "Start menu scan failed");
    }

    // 5. Scan PATH
    try {
      const pathApps = this.scanPath();
      for (const app of pathApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "PATH scan failed");
    }

    // 6. Scan Running Processes reverse lookup
    try {
      const runningApps = await this.scanRunningProcesses();
      for (const app of runningApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "Running processes scan failed");
    }

    // 7. Scan Accessible Drive Locations (e.g. E:\Tools\maya2022, E:\Tools\Blender, etc.)
    try {
      const driveApps = this.scanAccessibleDrives();
      for (const app of driveApps) {
        this.addOrMergeApp(appMap, app);
      }
    } catch (e: any) {
      this.logger?.warn({ err: e?.message }, "Drive scan failed");
    }

    this.cachedApps = appMap;
    this.lastScanTime = now;
    return Array.from(appMap.values());
  }

  public getLastScanTime(): number {
    return this.lastScanTime;
  }

  public getCacheAge(): number {
    return this.lastScanTime > 0 ? Date.now() - this.lastScanTime : 0;
  }

  public isCached(): boolean {
    return this.cachedApps.size > 0 && Date.now() - this.lastScanTime < this.ttlMs;
  }

  /**
   * Add or merge discovered application
   */
  private addOrMergeApp(appMap: Map<string, DiscoveredApp>, app: DiscoveredApp): void {
    if (!app.executablePath) return;
    const normalizedKey = app.executablePath.toLowerCase().replace(/\\/g, "/");

    if (appMap.has(normalizedKey)) {
      const existing = appMap.get(normalizedKey)!;
      // Merge aliases
      const mergedAliases = Array.from(new Set([...existing.aliases, ...app.aliases]));
      existing.aliases = mergedAliases;
      if (!existing.version && app.version) existing.version = app.version;
      if (!existing.publisher && app.publisher) existing.publisher = app.publisher;
      if (!existing.installPath && app.installPath) existing.installPath = app.installPath;
    } else {
      appMap.set(normalizedKey, app);
    }
  }

  /**
   * Scan Windows Registry App Paths keys (HKLM & HKCU)
   */
  private async scanAppPathsRegistry(): Promise<DiscoveredApp[]> {
    const psScript = `
$keys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*'
)
$items = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.'(default)' } | Select-Object PSChildName, '(default)', Path
$items | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(psScript);
    if (!out) return [];

    let items: any[] = [];
    try {
      const parsed = JSON.parse(out);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }

    const apps: DiscoveredApp[] = [];
    for (const item of items) {
      const rawTarget = item["(default)"];
      if (!rawTarget || typeof rawTarget !== "string") continue;
      let targetPath = rawTarget.trim();
      if (targetPath.startsWith('"') && targetPath.endsWith('"')) {
        targetPath = targetPath.slice(1, -1);
      }
      if (!fs.existsSync(targetPath)) continue;

      const baseExe = item.PSChildName || path.basename(targetPath);
      const cleanName = baseExe.replace(/\.exe$/i, "");
      const aliases = this.generateAliases(cleanName, targetPath);

      apps.push({
        name: cleanName,
        aliases,
        executablePath: targetPath,
        installPath: item.Path || path.dirname(targetPath),
        source: "registry",
        exists: true,
        launchable: true,
        metadata: { registryType: "App Paths", psChildName: baseExe },
      });
    }

    return apps;
  }

  /**
   * Scan Office Dedicated Paths & Standard Tool Directories
   */
  private scanOfficeAndKnownApps(): DiscoveredApp[] {
    const discovered: DiscoveredApp[] = [];
    const programFiles = [
      process.env.ProgramFiles || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    ];

    const officeVersions = ["root\\Office16", "Office16", "Office15", "Office14"];
    const officeApps = [
      { exe: "WINWORD.EXE", name: "Microsoft Word", aliases: ["word", "winword", "winword.exe", "ms word", "office word"] },
      { exe: "EXCEL.EXE", name: "Microsoft Excel", aliases: ["excel", "excel.exe", "ms excel", "office excel"] },
      { exe: "POWERPNT.EXE", name: "Microsoft PowerPoint", aliases: ["powerpoint", "powerpnt", "powerpnt.exe", "ms powerpoint", "office powerpoint", "ppt"] },
      { exe: "MSACCESS.EXE", name: "Microsoft Access", aliases: ["access", "msaccess", "ms access"] },
      { exe: "OUTLOOK.EXE", name: "Microsoft Outlook", aliases: ["outlook", "outlook.exe", "ms outlook"] },
      { exe: "ONENOTE.EXE", name: "Microsoft OneNote", aliases: ["onenote", "onenote.exe", "ms onenote"] },
    ];

    for (const pf of programFiles) {
      for (const ver of officeVersions) {
        for (const app of officeApps) {
          const fullPath = path.join(pf, "Microsoft Office", ver, app.exe);
          if (fs.existsSync(fullPath)) {
            const allAliases = Array.from(new Set([app.name.toLowerCase(), ...app.aliases, app.exe.toLowerCase()]));
            discovered.push({
              name: app.name,
              aliases: allAliases,
              executablePath: fullPath,
              installPath: path.dirname(fullPath),
              version: ver.includes("16") ? "16.0" : "15.0",
              publisher: "Microsoft Corporation",
              source: "filesystem",
              exists: true,
              launchable: true,
              metadata: { officeSuite: true, versionPath: ver },
            });
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Reverse lookup from currently running processes
   */
  private async scanRunningProcesses(): Promise<DiscoveredApp[]> {
    const psScript = `
Get-Process | Where-Object { $_.Path } | Select-Object -Property ProcessName, Path, Company, ProductVersion -Unique | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(psScript);
    if (!out) return [];

    let items: any[] = [];
    try {
      const parsed = JSON.parse(out);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }

    const apps: DiscoveredApp[] = [];
    for (const item of items) {
      const targetPath = item.Path;
      if (!targetPath || typeof targetPath !== "string") continue;
      if (!fs.existsSync(targetPath)) continue;

      const baseName = item.ProcessName || path.basename(targetPath, ".exe");
      const aliases = this.generateAliases(baseName, targetPath);

      apps.push({
        name: baseName,
        aliases,
        executablePath: targetPath,
        installPath: path.dirname(targetPath),
        version: item.ProductVersion,
        publisher: item.Company,
        source: "custom",
        exists: true,
        launchable: true,
        metadata: { runningProcess: true },
      });
    }

    return apps;
  }

  /**
   * Scan Windows Registry Uninstall keys
   */
  private async scanRegistry(): Promise<DiscoveredApp[]> {
    const psScript = `
$keys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, DisplayIcon, UninstallString
$items | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(psScript);
    if (!out) return [];

    let items: any[] = [];
    try {
      const parsed = JSON.parse(out);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }

    const apps: DiscoveredApp[] = [];

    for (const item of items) {
      const displayName = String(item.DisplayName || "").trim();
      if (!displayName) continue;
      // Skip updates or patches
      if (/^KB\d+|Security Update|Hotfix/i.test(displayName)) continue;

      let exePath = "";
      let installLocation = item.InstallLocation ? String(item.InstallLocation).trim() : "";

      // 1. Check DisplayIcon
      if (item.DisplayIcon) {
        let rawIcon = String(item.DisplayIcon).trim();
        // Remove icon index (e.g. "path\to\app.exe,0")
        rawIcon = rawIcon.replace(/,\s*-?\d+$/, "").replace(/^"|"$/g, "").trim();
        if (rawIcon.toLowerCase().endsWith(".exe") && fs.existsSync(rawIcon)) {
          exePath = rawIcon;
        }
      }

      // 2. Check InstallLocation for executables
      if (!exePath && installLocation && fs.existsSync(installLocation)) {
        exePath = this.findExecutableInDirectory(installLocation, displayName);
      }

      // If we found a valid executable
      if (exePath && fs.existsSync(exePath)) {
        const aliases = this.generateAliases(displayName, exePath);
        apps.push({
          name: displayName,
          aliases,
          executablePath: exePath,
          installPath: installLocation || path.dirname(exePath),
          version: item.DisplayVersion ? String(item.DisplayVersion).trim() : undefined,
          publisher: item.Publisher ? String(item.Publisher).trim() : undefined,
          source: "registry",
          exists: true,
          launchable: true,
          metadata: {
            registryName: displayName,
            uninstallString: item.UninstallString,
          },
        });
      }
    }

    return apps;
  }

  /**
   * Scan Start Menu shortcuts (.lnk) and targets
   */
  private async scanStartMenu(): Promise<DiscoveredApp[]> {
    const psScript = `
$dirs = @(
  [System.IO.Path]::Combine($env:ProgramData, 'Microsoft\\Windows\\Start Menu\\Programs'),
  [System.IO.Path]::Combine($env:AppData, 'Microsoft\\Windows\\Start Menu\\Programs')
)
$wsh = New-Object -ComObject WScript.Shell
$results = @()
foreach ($d in $dirs) {
  if (Test-Path $d) {
    Get-ChildItem -Path $d -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $sc = $wsh.CreateShortcut($_.FullName)
        if ($sc.TargetPath -and $sc.TargetPath.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
          $results += [PSCustomObject]@{
            name = $_.BaseName
            lnkPath = $_.FullName
            targetPath = $sc.TargetPath
            arguments = $sc.Arguments
            workingDir = $sc.WorkingDirectory
          }
        }
      } catch {}
    }
  }
}
$results | ConvertTo-Json -Compress
`;
    const out = await this.runPowerShell(psScript);
    if (!out) return [];

    let items: any[] = [];
    try {
      const parsed = JSON.parse(out);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }

    const apps: DiscoveredApp[] = [];

    for (const item of items) {
      const name = String(item.name || "").trim();
      const targetPath = String(item.targetPath || "").trim();
      if (!targetPath || !targetPath.toLowerCase().endsWith(".exe")) continue;
      // Skip uninstallers
      if (/uninstall|卸载|unins\d+|setup/i.test(name) || /uninstall|卸载|unins\d+/i.test(path.basename(targetPath))) {
        continue;
      }

      const exists = fs.existsSync(targetPath);
      if (!exists) continue;

      const aliases = this.generateAliases(name, targetPath);
      apps.push({
        name,
        aliases,
        executablePath: targetPath,
        installPath: item.workingDir || path.dirname(targetPath),
        source: "start_menu",
        exists: true,
        launchable: true,
        metadata: {
          lnkPath: item.lnkPath,
          arguments: item.arguments,
        },
      });
    }

    return apps;
  }

  /**
   * Scan PATH environment directories for executables
   */
  private scanPath(): DiscoveredApp[] {
    const pathEnv = process.env.PATH || "";
    const dirs = pathEnv.split(path.delimiter).map((d) => d.trim()).filter(Boolean);
    const apps: DiscoveredApp[] = [];

    const allowedExts = new Set([".exe", ".cmd", ".bat"]);

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (allowedExts.has(ext)) {
              const fullPath = path.join(dir, entry.name);
              const baseName = path.basename(entry.name, ext);
              const aliases = this.generateAliases(baseName, fullPath);
              apps.push({
                name: baseName,
                aliases,
                executablePath: fullPath,
                installPath: dir,
                source: "path",
                exists: true,
                launchable: true,
                metadata: {
                  inPath: true,
                },
              });
            }
          }
        }
      } catch {}
    }

    return apps;
  }

  /**
   * Scan accessible drives for common tool and software installations
   * (e.g. E:\Tools\maya2022\Maya2022\bin\maya.exe, E:\Tools\Blender\blender.exe)
   */
  private scanAccessibleDrives(): DiscoveredApp[] {
    const drives = this.getAvailableDrives();
    const apps: DiscoveredApp[] = [];

    const searchSubfolders = [
      "Tools",
      "Software",
      "Programs",
      "Program Files",
      "Program Files (x86)",
      "Apps",
    ];

    for (const drive of drives) {
      for (const sub of searchSubfolders) {
        const candidateDir = path.join(drive, sub);
        if (!fs.existsSync(candidateDir)) continue;

        try {
          const entries = fs.readdirSync(candidateDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const appDir = path.join(candidateDir, entry.name);
              const exe = this.findExecutableInDirectory(appDir, entry.name);
              if (exe && fs.existsSync(exe)) {
                const aliases = this.generateAliases(entry.name, exe);
                apps.push({
                  name: entry.name,
                  aliases,
                  executablePath: exe,
                  installPath: appDir,
                  source: "filesystem",
                  exists: true,
                  launchable: true,
                  metadata: {
                    driveScan: true,
                    discoveredFrom: candidateDir,
                  },
                });
              }
            }
          }
        } catch {}
      }
    }

    return apps;
  }

  /**
   * Find available Windows drive roots (e.g. ['C:\\', 'D:\\', 'E:\\'])
   */
  getAvailableDrives(): string[] {
    const drives: string[] = [];
    const letters = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    for (const letter of letters) {
      const root = `${letter}:\\`;
      try {
        if (fs.existsSync(root)) {
          drives.push(root);
        }
      } catch {}
    }
    return drives;
  }

  /**
   * Find main executable in directory tree (up to 3 levels deep)
   */
  private findExecutableInDirectory(dir: string, appName: string): string {
    const cleanAppName = appName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Direct match: <dir>/<name>.exe
    const directExe = path.join(dir, `${appName}.exe`);
    if (fs.existsSync(directExe)) return directExe;

    // 2. Direct match in <dir>/bin/<name>.exe
    const binDir = path.join(dir, "bin");
    if (fs.existsSync(binDir)) {
      const binExe = path.join(binDir, `${appName}.exe`);
      if (fs.existsSync(binExe)) return binExe;
    }

    // 3. Scan directory entries
    try {
      const queue: { dir: string; depth: number }[] = [{ dir, depth: 0 }];
      const maxDepth = 3;
      let candidates: { path: string; score: number }[] = [];

      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.depth > maxDepth) continue;

        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(item.dir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const e of entries) {
          const full = path.join(item.dir, e.name);
          if (e.isDirectory()) {
            if (!/uninstall|cache|log|temp|doc|help/i.test(e.name) && item.depth < maxDepth) {
              queue.push({ dir: full, depth: item.depth + 1 });
            }
          } else if (e.isFile() && e.name.toLowerCase().endsWith(".exe")) {
            // Ignore setup/uninstall helpers
            if (/unins|uninstall|setup|crash|update|helper|error/i.test(e.name)) {
              continue;
            }
            const cleanExeName = path.basename(e.name, ".exe").toLowerCase().replace(/[^a-z0-9]/g, "");
            let score = 0;

            if (cleanExeName === cleanAppName) {
              score = 100;
            } else if (cleanAppName.includes(cleanExeName) || cleanExeName.includes(cleanAppName)) {
              score = 70;
            } else if (/bin[\\/]/i.test(full)) {
              score = 40;
            } else {
              score = 20;
            }

            candidates.push({ path: full, score });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].path;
      }
    } catch {}

    return "";
  }

  /**
   * Generate aliases for natural language matching
   * e.g. "Autodesk Maya 2022" -> ["maya", "maya 2022", "autodesk maya", "autodesk maya 2022", "maya.exe"]
   */
  generateAliases(name: string, exePath: string): string[] {
    const aliases = new Set<string>();

    const rawLower = name.toLowerCase().trim();
    aliases.add(rawLower);

    const exeBase = path.basename(exePath, path.extname(exePath)).toLowerCase();
    const exeFull = path.basename(exePath).toLowerCase();
    aliases.add(exeBase);
    aliases.add(exeFull);

    // Stripping vendor names (e.g. Autodesk, Microsoft, Adobe, Blender Foundation)
    const strippedVendor = rawLower
      .replace(/^autodesk\s+/i, "")
      .replace(/^microsoft\s+/i, "")
      .replace(/^adobe\s+/i, "")
      .replace(/\s+foundation$/i, "")
      .trim();
    if (strippedVendor) {
      aliases.add(strippedVendor);
    }

    // Stripping year or version (e.g. 2022, 3.6, v1.0)
    const strippedVersion = strippedVendor
      .replace(/\s+\d+(\.\d+)*$/i, "")
      .replace(/\s+20\d\d$/i, "")
      .trim();
    if (strippedVersion) {
      aliases.add(strippedVersion);
    }

    // Normalized alphanumeric form
    const alphaOnly = rawLower.replace(/[^a-z0-9]/g, "");
    if (alphaOnly) aliases.add(alphaOnly);

    // Special cases:
    if (/word/i.test(name) || /winword/i.test(exeBase)) {
      aliases.add("word");
      aliases.add("winword");
      aliases.add("winword.exe");
      aliases.add("microsoft word");
      aliases.add("ms word");
      aliases.add("office word");
    }
    if (/excel/i.test(name) || /excel/i.test(exeBase)) {
      aliases.add("excel");
      aliases.add("excel.exe");
      aliases.add("microsoft excel");
      aliases.add("ms excel");
      aliases.add("office excel");
    }
    if (/powerpoint|powerpnt|ppt/i.test(name) || /powerpnt/i.test(exeBase)) {
      aliases.add("powerpoint");
      aliases.add("powerpnt");
      aliases.add("powerpnt.exe");
      aliases.add("microsoft powerpoint");
      aliases.add("ms powerpoint");
      aliases.add("ppt");
    }
    if (/code|vscode/i.test(name) || /code/i.test(exeBase)) {
      aliases.add("vscode");
      aliases.add("code");
      aliases.add("visual studio code");
    }
    if (/notepad\+\+|notepadplusplus/i.test(name) || /notepad\+\+/i.test(exeBase)) {
      aliases.add("notepad++");
      aliases.add("npp");
      aliases.add("notepad-plus-plus");
    }
    if (/chrome/i.test(name) || /chrome/i.test(exeBase)) {
      aliases.add("chrome");
      aliases.add("google chrome");
    }
    if (/edge/i.test(name) || /msedge/i.test(exeBase)) {
      aliases.add("edge");
      aliases.add("msedge");
      aliases.add("microsoft edge");
    }
    if (/maya/i.test(name) && !/extension|plugin|library|usd|bifrost|mtoa|substance/i.test(name)) {
      aliases.add("maya");
      aliases.add("autodesk maya");
      aliases.add("maya 2022");
      aliases.add("maya.exe");
    }
    if (/blender/i.test(name) && !/addon|plugin|library/i.test(name)) {
      aliases.add("blender");
      aliases.add("blender 3.6");
      aliases.add("blender 3.x");
      aliases.add("blender 4.x");
      aliases.add("blender.exe");
    }

    return Array.from(aliases);
  }

  /**
   * Convert DiscoveredApp to unified LocalResource
   */
  toResource(app: DiscoveredApp): LocalResource {
    const idHash = crypto.createHash("sha256").update(app.executablePath.toLowerCase()).digest("hex").slice(0, 16);
    return {
      resourceId: `app:${idHash}`,
      type: "application",
      name: app.name,
      aliases: app.aliases,
      path: app.executablePath,
      parent: app.installPath,
      source: app.source,
      exists: app.exists,
      accessible: true,
      verified: app.exists,
      executablePath: app.executablePath,
      installPath: app.installPath,
      version: app.version,
      publisher: app.publisher,
      launchable: app.launchable,
      metadata: app.metadata,
    };
  }
}
