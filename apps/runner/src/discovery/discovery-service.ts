import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  DiscoveryQueryParams,
  DiscoveryQueryResult,
  LaunchApplicationParams,
  LaunchApplicationResult,
  VerifyResourceParams,
  VerifyResourceResult,
  ContentIndexQueryParams,
  ContentIndexQueryResult,
  DiscoveryRefreshParams,
  DiscoveryRefreshResult,
  InspectResourceParams,
  InspectResourceResult,
  LocalResource,
  LocalResourceType,
  SecurityMode,
} from "@localbridge/protocol";
import { isUnrestrictedMode, isSafeMode } from "@localbridge/protocol";
import type { Logger } from "@localbridge/shared";
import type { ProjectRegistry } from "../projects/registry.js";
import type { WindowsNativeCore } from "../computer-use/windows-native-core.js";

import { ApplicationDiscoveryEngine, type DiscoveredApp } from "./application-discovery-engine.js";
import { ContentIndexer } from "./content-indexer.js";
import { LocalResourceRegistry } from "./local-resource-registry.js";
import { SystemVerifier } from "./system-verifier.js";

export class DiscoveryService {
  private readonly appEngine: ApplicationDiscoveryEngine;
  private readonly indexer: ContentIndexer;
  private readonly registry: LocalResourceRegistry;
  private readonly verifier: SystemVerifier;

  private securityMode: SecurityMode = "safe";

  constructor(
    private readonly runnerStateDir: string,
    private readonly projectRegistry?: ProjectRegistry,
    private readonly nativeCore?: WindowsNativeCore,
    private readonly logger?: Logger,
    private readonly workspaceRoot?: string
  ) {
    this.appEngine = new ApplicationDiscoveryEngine(logger);
    this.indexer = new ContentIndexer(runnerStateDir, logger);
    this.registry = new LocalResourceRegistry(runnerStateDir, logger);
    this.verifier = new SystemVerifier(nativeCore, logger, workspaceRoot);
  }

  private isEffectiveUnrestricted(): boolean {
    return (
      isUnrestrictedMode(this.securityMode) ||
      Boolean(this.projectRegistry?.isSafetyLayerDisabled())
    );
  }

  setSecurityMode(mode: SecurityMode): void {
    this.securityMode = mode;
    this.logger?.info({ mode }, `DiscoveryService security mode set to: ${mode}`);
  }

  getSecurityMode(): SecurityMode {
    return this.isEffectiveUnrestricted() ? "UNRESTRICTED" : this.securityMode;
  }

  getRegistry(): LocalResourceRegistry {
    return this.registry;
  }

  getIndexer(): ContentIndexer {
    return this.indexer;
  }

  getVerifier(): SystemVerifier {
    return this.verifier;
  }

  getAppEngine(): ApplicationDiscoveryEngine {
    return this.appEngine;
  }

  /**
   * Unified discovery query across all resource types
   */
  async query(params: DiscoveryQueryParams): Promise<DiscoveryQueryResult> {
    const isUnrestricted = this.isEffectiveUnrestricted();
    const scope = isUnrestricted ? (params.scope || "local_machine") : "workspace";

    // 1. If in SAFE mode, restrict strictly to authorized project directory
    if (!isUnrestricted) {
      return this.querySafeWorkspace(params);
    }

    // 2. UNRESTRICTED mode: full local access
    const results: LocalResource[] = [];
    const queryStr = (params.query || "").trim();
    const action = params.action || "query";

    // Dispatch based on action or types
    if (action === "find_application") {
      const apps = await this.findApplications(queryStr, params.verify ?? true, params.fresh);
      results.push(...apps);
    } else if (action === "find_file" || action === "find_directory") {
      const files = this.findFilesystem(queryStr, action === "find_directory" ? ["directory"] : ["file"]);
      results.push(...files);
    } else if (action === "search_content") {
      const contentRecords = this.indexer.search(queryStr, { limit: params.limit });
      for (const rec of contentRecords) {
        const idHash = crypto.createHash("sha256").update(rec.path.toLowerCase()).digest("hex").slice(0, 16);
        results.push({
          resourceId: `file:${idHash}`,
          type: "file",
          name: rec.filename,
          aliases: [rec.filename],
          path: rec.path,
          source: "filesystem",
          exists: true,
          accessible: true,
          verified: true,
          size: rec.size,
          modifiedAt: rec.modifiedAt,
          hash: rec.hash,
          metadata: { snippet: rec.snippet, ...rec.metadata },
        });
      }
    } else if (action === "find_process") {
      const procs = await this.findRunningProcesses(queryStr);
      results.push(...procs);
    } else if (action === "find_window") {
      const wins = await this.findDesktopWindows(queryStr);
      results.push(...wins);
    } else {
      // General query: search registry, applications, and index
      // A. Search applications
      const apps = await this.findApplications(queryStr, params.verify ?? true, params.fresh);
      results.push(...apps);

      // B. Search registry for other matching resources
      const regMatches = this.registry.find(queryStr, {
        types: params.resourceTypes,
        limit: params.limit,
        verify: params.verify,
      });
      for (const rm of regMatches) {
        if (!results.some((r) => r.path.toLowerCase() === rm.path.toLowerCase())) {
          results.push(rm);
        }
      }

      // C. Search content index for matching text
      if (queryStr.length >= 2) {
        const contentMatches = this.indexer.search(queryStr, { limit: 10 });
        for (const cm of contentMatches) {
          if (!results.some((r) => r.path.toLowerCase() === cm.path.toLowerCase())) {
            results.push({
              resourceId: `file:${Buffer.from(cm.path).toString("hex").slice(0, 16)}`,
              type: "file",
              name: cm.filename,
              aliases: [cm.filename],
              path: cm.path,
              source: "filesystem",
              exists: true,
              accessible: true,
              verified: true,
              size: cm.size,
              modifiedAt: cm.modifiedAt,
              hash: cm.hash,
              metadata: { snippet: cm.snippet, ...cm.metadata },
            });
          }
        }
      }
    }

    const limit = params.limit ?? 50;
    const finalResources = results.slice(0, limit);
    const cacheAge = this.appEngine.getCacheAge();
    const lastScanTime = this.appEngine.getLastScanTime();

    return {
      resources: finalResources,
      total: finalResources.length,
      scope,
      securityMode: this.getSecurityMode(),
      executionTier: "discovery",
      cached: !params.fresh && this.appEngine.isCached(),
      fresh: Boolean(params.fresh),
      cacheAge,
      lastScanAt: lastScanTime > 0 ? lastScanTime : undefined,
      scanSource: "local_windows_registry_and_filesystem",
      verificationTime: Date.now(),
    };
  }

  /**
   * Safe mode: strictly bounded to authorized workspace
   */
  private async querySafeWorkspace(params: DiscoveryQueryParams): Promise<DiscoveryQueryResult> {
    const results: LocalResource[] = [];
    const queryStr = (params.query || "").trim();

    let authorizedRoot: string | undefined;
    if (params.projectId && this.projectRegistry) {
      const proj = this.projectRegistry.get(params.projectId);
      if (proj) authorizedRoot = (proj as any).path || proj.canonicalRoot || proj.root;
    }
    if (!authorizedRoot && this.projectRegistry) {
      const allProjects = this.projectRegistry.list();
      if (allProjects.length > 0) {
        authorizedRoot = (allProjects[0] as any).path || allProjects[0].canonicalRoot || allProjects[0].root;
      }
    }

    if (authorizedRoot && fs.existsSync(authorizedRoot)) {
      // Only search within authorized root
      const contentMatches = this.indexer.search(queryStr, {
        directories: [authorizedRoot],
        limit: params.limit ?? 20,
      });
      for (const cm of contentMatches) {
        const idHash = crypto.createHash("sha256").update(cm.path.toLowerCase()).digest("hex").slice(0, 16);
        results.push({
          resourceId: `file:${idHash}`,
          type: "file",
          name: cm.filename,
          aliases: [cm.filename],
          path: cm.path,
          source: "filesystem",
          exists: true,
          accessible: true,
          verified: true,
          size: cm.size,
          modifiedAt: cm.modifiedAt,
          hash: cm.hash,
          metadata: { snippet: cm.snippet, ...cm.metadata },
        });
      }
    }

    return {
      resources: results,
      total: results.length,
      scope: "workspace",
      securityMode: this.securityMode,
      executionTier: "discovery",
      cached: false,
    };
  }

  /**
   * Find applications matching natural language query
   */
  private async findApplications(query: string, verify = true, fresh = false): Promise<LocalResource[]> {
    // 1. Run discovery if not yet cached or empty
    const apps = await this.appEngine.discoverApplications(fresh);

    // 2. Register all in registry
    for (const app of apps) {
      const res = this.appEngine.toResource(app);
      this.registry.register(res, false);
    }

    // 3. Query registry with natural language semantic match
    if (!query) {
      return apps.map((a) => this.appEngine.toResource(a));
    }

    return this.registry.find(query, {
      types: ["application"],
      verify,
    });
  }

  /**
   * Search filesystem drives for matching files or directories
   */
  private findFilesystem(query: string, types: LocalResourceType[] = ["file", "directory"]): LocalResource[] {
    const qLower = query.toLowerCase().trim();
    const results: LocalResource[] = [];

    // Check registry first
    const fromRegistry = this.registry.find(query, { types });
    results.push(...fromRegistry);

    // If query is an exact path on disk
    if (path.isAbsolute(query) && fs.existsSync(query)) {
      const stat = fs.statSync(query);
      const isDir = stat.isDirectory();
      const idHash = crypto.createHash("sha256").update(query.toLowerCase()).digest("hex").slice(0, 16);
      results.push({
        resourceId: `fs:${idHash}`,
        type: isDir ? "directory" : "file",
        name: path.basename(query),
        aliases: [path.basename(query)],
        path: path.resolve(query),
        source: "filesystem",
        exists: true,
        accessible: true,
        verified: true,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    return results;
  }

  /**
   * Find running processes matching query
   */
  private async findRunningProcesses(query: string): Promise<LocalResource[]> {
    const script = `Get-Process | Select-Object Id, ProcessName, Path | ConvertTo-Json -Compress`;
    const out = await this.verifier["runPowerShell"](script, 4000);
    const results: LocalResource[] = [];
    if (!out) return results;

    try {
      const parsed = JSON.parse(out);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const qLower = query.toLowerCase();

      for (const p of list) {
        const name = String(p.ProcessName || "");
        if (!query || name.toLowerCase().includes(qLower)) {
          results.push({
            resourceId: `proc:${p.Id}`,
            type: "process",
            name,
            aliases: [name, `${name}.exe`],
            path: p.Path || "",
            source: "process",
            exists: true,
            accessible: true,
            verified: true,
            metadata: { pid: p.Id },
          });
        }
      }
    } catch {}

    return results;
  }

  /**
   * Find desktop windows matching query
   */
  private async findDesktopWindows(query: string): Promise<LocalResource[]> {
    const results: LocalResource[] = [];
    const qLower = query.toLowerCase();

    if (this.nativeCore) {
      try {
        const list = await this.nativeCore.listWindows();
        for (const w of list.windows) {
          const handle = (w as any).hwnd || w.handle;
          if (!query || (w.title && w.title.toLowerCase().includes(qLower))) {
            results.push({
              resourceId: `win:${handle}`,
              type: "window",
              name: w.title || `Window ${handle}`,
              aliases: w.title ? [w.title] : [],
              path: "",
              source: "window",
              exists: true,
              accessible: true,
              verified: true,
              metadata: {
                hwnd: handle,
                pid: w.pid,
                processName: w.processName,
                bounds: w.bounds,
              },
            });
          }
        }
      } catch {}
    }

    return results;
  }

  /**
   * Execution Layer: launch application with verification
   */
  async launch(params: LaunchApplicationParams): Promise<LaunchApplicationResult> {
    if (!this.isEffectiveUnrestricted()) {
      throw new Error(
        `Launch application is blocked in ${this.securityMode.toUpperCase()} mode. Disable safety layer (UNRESTRICTED mode) to launch local applications.`
      );
    }

    const appNameOrPath = params.appNameOrPath.trim();
    let targetExePath = "";
    let appDisplayName = appNameOrPath;

    // 1. Direct path check
    if (path.isAbsolute(appNameOrPath) && fs.existsSync(appNameOrPath)) {
      targetExePath = path.resolve(appNameOrPath);
    } else {
      // 1b. Check in PATH environment directories (e.g. notepad.exe, cmd.exe)
      const pathDirs = (process.env.PATH || "").split(path.delimiter).map((d) => d.trim()).filter(Boolean);
      const candidates = [appNameOrPath];
      if (!appNameOrPath.toLowerCase().endsWith(".exe")) {
        candidates.push(`${appNameOrPath}.exe`);
      }
      for (const p of pathDirs) {
        for (const cand of candidates) {
          const full = path.join(p, cand);
          if (fs.existsSync(full)) {
            targetExePath = full;
            break;
          }
        }
        if (targetExePath) break;
      }

      // 2. Discover via application engine and registry
      if (!targetExePath) {
        const discovered = await this.findApplications(appNameOrPath, true);
        const qClean = appNameOrPath.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matched = discovered.find((d) => {
          const nameClean = d.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const exeClean = path
            .basename(d.executablePath || "", path.extname(d.executablePath || ""))
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const aliasMatch = d.aliases?.some((a) => {
            const aClean = a.toLowerCase().replace(/[^a-z0-9]/g, "");
            return aClean === qClean || aClean.includes(qClean) || qClean.includes(aClean);
          });
          return (
            nameClean === qClean ||
            nameClean.includes(qClean) ||
            qClean.includes(nameClean) ||
            exeClean === qClean ||
            aliasMatch
          );
        });

        if (matched && matched.executablePath && fs.existsSync(matched.executablePath)) {
          targetExePath = matched.executablePath;
          appDisplayName = matched.name;
        }
      }
    }

    if (!targetExePath || !fs.existsSync(targetExePath)) {
      return {
        launched: false,
        executablePath: targetExePath || appNameOrPath,
        verified: false,
        verificationDetails: {
          processExists: false,
          windowExists: false,
          error: `Could not discover valid executable for: ${appNameOrPath}`,
        },
        message: `无法找到或验证软件的可执行文件: ${appNameOrPath}`,
      };
    }

    // 3. Launch and execute real OS state verification
    return this.verifier.launchAndVerify(targetExePath, params.args, {
      timeoutMs: params.timeoutMs,
      workingDirectory: params.workingDirectory,
      appName: appDisplayName,
    });
  }

  /**
   * Verification Layer: verify real OS resource state
   */
  async verify(params: VerifyResourceParams): Promise<VerifyResourceResult> {
    return this.verifier.verifyResource(params);
  }

  /**
   * Inspect single resource
   */
  async inspect(params: InspectResourceParams): Promise<InspectResourceResult> {
    const res = this.registry.getByPath(params.resourceIdOrPath) || this.registry.getById(params.resourceIdOrPath);
    if (!res) {
      if (fs.existsSync(params.resourceIdOrPath)) {
        const stat = fs.statSync(params.resourceIdOrPath);
        const resource: LocalResource = {
          resourceId: `fs:${Buffer.from(params.resourceIdOrPath).toString("hex").slice(0, 16)}`,
          type: stat.isDirectory() ? "directory" : "file",
          name: path.basename(params.resourceIdOrPath),
          aliases: [path.basename(params.resourceIdOrPath)],
          path: path.resolve(params.resourceIdOrPath),
          source: "filesystem",
          exists: true,
          accessible: true,
          verified: true,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
        return { resource, found: true };
      }
      return { found: false, message: `Resource not found: ${params.resourceIdOrPath}` };
    }

    // Update verified status
    if (res.executablePath) {
      res.exists = fs.existsSync(res.executablePath);
      res.verified = res.exists;
    } else if (res.path) {
      res.exists = fs.existsSync(res.path);
      res.verified = res.exists;
    }

    return { resource: res, found: true };
  }

  /**
   * Content Index Search
   */
  searchContent(params: ContentIndexQueryParams): ContentIndexQueryResult {
    const records = this.indexer.search(params.query, {
      extensions: params.extensions,
      directories: params.directories,
      limit: params.limit,
    });
    return {
      records,
      total: records.length,
      query: params.query,
    };
  }

  /**
   * Refresh discovery cache and synchronize registry
   */
  async refresh(params: DiscoveryRefreshParams = { deep: false }): Promise<DiscoveryRefreshResult> {
    const startTime = Date.now();
    const isUnrestricted = this.isEffectiveUnrestricted();

    if (!isUnrestricted) {
      return {
        discovered: 0,
        success: true,
        scope: "workspace",
        durationMs: Date.now() - startTime,
      };
    }

    // Deep discovery: apps + drives
    const apps = await this.appEngine.discoverApplications(true);
    for (const app of apps) {
      const res = this.appEngine.toResource(app);
      this.registry.register(res, false);
    }

    // Register drives
    const drives = this.appEngine.getAvailableDrives();
    for (const d of drives) {
      this.registry.register(
        {
          resourceId: `drive:${d.slice(0, 1).toLowerCase()}`,
          type: "drive",
          name: `Local Disk (${d})`,
          aliases: [d, d.slice(0, 1), `drive-${d.slice(0, 1).toLowerCase()}`],
          path: d,
          source: "drive",
          exists: true,
          accessible: true,
          verified: true,
        },
        false
      );
    }

    this.registry.save();

    return {
      discovered: apps.length + drives.length,
      success: true,
      scope: "local_machine",
      durationMs: Date.now() - startTime,
    };
  }
}
