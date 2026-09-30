import os from "node:os";
import child_process from "node:child_process";
import type { RunnerSystemInfo, RunnerTools } from "@localbridge/protocol";

export function probeToolVersion(command: string, args: string[] = ["--version"]): string | null {
  try {
    const fullCmd = `${command} ${args.join(" ")}`;
    const output = child_process.execSync(fullCmd, {
      timeout: 1500,
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf-8",
      windowsHide: true,
    });
    const firstLine = output.trim().split(/\r?\n/)[0];
    return firstLine ? firstLine.replace(/^[a-zA-Z\s]+version\s+/i, "").trim() : null;
  } catch {
    return null;
  }
}

let cachedTools: RunnerTools | null = null;
let cachedToolsAt = 0;
const TOOLS_CACHE_TTL_MS = 300_000; // 5 minutes

export function detectTools(forceRefresh = false): RunnerTools {
  const now = Date.now();
  if (!forceRefresh && cachedTools && now - cachedToolsAt < TOOLS_CACHE_TTL_MS) {
    return cachedTools;
  }
  cachedTools = {
    git: probeToolVersion("git", ["--version"]),
    node: process.version ? process.version.replace(/^v/i, "") : probeToolVersion("node", ["-v"]),
    npm: probeToolVersion("npm", ["-v"]),
    pnpm: probeToolVersion("pnpm", ["-v"]),
    python: probeToolVersion("python", ["--version"]) ?? probeToolVersion("python3", ["--version"]),
    docker: probeToolVersion("docker", ["--version"]),
  };
  cachedToolsAt = now;
  return cachedTools;
}

export function collectSystemInfo(): RunnerSystemInfo {
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    nodeVersion: process.version,
    tools: detectTools(),
  };
}
