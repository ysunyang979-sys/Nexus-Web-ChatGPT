import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  UnifiedValidationParams,
  UnifiedValidationResult,
  ValidationCheckResult,
} from "@localbridge/protocol";
import type { ProjectRegistry } from "../projects/index.js";
import type { Logger } from "@localbridge/shared";

const execAsync = promisify(exec);

export class UnifiedValidationService {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly logger?: Logger
  ) {}

  private detectProjectType(root: string): { type: string; tool: string; commands: Record<string, string> } {
    // 1. Rust / Cargo
    if (fs.existsSync(path.join(root, "Cargo.toml"))) {
      return {
        type: "rust",
        tool: "cargo",
        commands: {
          test: "cargo test",
          build: "cargo check",
          lint: "cargo clippy",
          format: "cargo fmt -- --check",
          typecheck: "cargo check",
        },
      };
    }

    // 2. Go
    if (fs.existsSync(path.join(root, "go.mod"))) {
      return {
        type: "go",
        tool: "go",
        commands: {
          test: "go test ./...",
          build: "go build ./...",
          lint: "golangci-lint run",
          format: "gofmt -l .",
          typecheck: "go vet ./...",
        },
      };
    }

    // 3. Java Maven
    if (fs.existsSync(path.join(root, "pom.xml"))) {
      return {
        type: "java-maven",
        tool: "mvn",
        commands: {
          test: "mvn test",
          build: "mvn compile",
          lint: "mvn checkstyle:check",
          format: "mvn fmt:check",
          typecheck: "mvn compile",
        },
      };
    }

    // 4. Java Gradle
    if (fs.existsSync(path.join(root, "build.gradle")) || fs.existsSync(path.join(root, "build.gradle.kts"))) {
      return {
        type: "java-gradle",
        tool: "gradle",
        commands: {
          test: "gradle test",
          build: "gradle build",
          lint: "gradle check",
          format: "gradle spotlessCheck",
          typecheck: "gradle compileJava",
        },
      };
    }

    // 5. Node.js / JavaScript / TypeScript
    if (fs.existsSync(path.join(root, "package.json"))) {
      let pm = "npm";
      if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) pm = "pnpm";
      else if (fs.existsSync(path.join(root, "yarn.lock"))) pm = "yarn";

      let pkg: any = {};
      try {
        pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
      } catch {}

      const scripts = pkg.scripts || {};
      const commands: Record<string, string> = {};

      if (scripts.test) commands.test = `${pm} test`;
      if (scripts.build) commands.build = `${pm} run build`;
      if (scripts.lint) commands.lint = `${pm} run lint`;
      if (scripts.typecheck || scripts["type-check"]) {
        commands.typecheck = `${pm} run ${scripts.typecheck ? "typecheck" : "type-check"}`;
      } else if (fs.existsSync(path.join(root, "tsconfig.json"))) {
        commands.typecheck = "npx tsc --noEmit";
      }
      if (scripts.format) commands.format = `${pm} run format`;

      return {
        type: "node",
        tool: pm,
        commands,
      };
    }

    // 6. Python
    if (
      fs.existsSync(path.join(root, "requirements.txt")) ||
      fs.existsSync(path.join(root, "pyproject.toml")) ||
      fs.existsSync(path.join(root, "setup.py"))
    ) {
      return {
        type: "python",
        tool: "python",
        commands: {
          test: "pytest",
          build: "python -m py_compile",
          lint: "flake8 .",
          typecheck: "mypy .",
          format: "black --check .",
        },
      };
    }

    return {
      type: "generic",
      tool: "shell",
      commands: {},
    };
  }

  async run(params: UnifiedValidationParams): Promise<UnifiedValidationResult> {
    const project = this.projectRegistry.get(params.projectId);
    if (!project) {
      throw new Error(`Project '${params.projectId}' not found`);
    }

    const { type, tool, commands } = this.detectProjectType(project.canonicalRoot);
    const checksToRun: Array<{ checkType: string; cmd: string }> = [];

    if (params.commandOverride) {
      checksToRun.push({ checkType: params.checkType, cmd: params.commandOverride });
    } else if (params.checkType === "all") {
      for (const [ctype, cmd] of Object.entries(commands)) {
        checksToRun.push({ checkType: ctype, cmd });
      }
    } else {
      const cmd = commands[params.checkType];
      if (cmd) {
        checksToRun.push({ checkType: params.checkType, cmd });
      }
    }

    const results: ValidationCheckResult[] = [];
    let overallPassed = true;
    const startTotal = Date.now();

    for (const item of checksToRun) {
      const stepStart = Date.now();
      try {
        const { stdout, stderr } = await execAsync(item.cmd, {
          cwd: project.canonicalRoot,
          timeout: params.timeoutMs || 120000,
          maxBuffer: 5 * 1024 * 1024,
        });

        results.push({
          checkType: item.checkType,
          tool,
          command: item.cmd,
          passed: true,
          exitCode: 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs: Date.now() - stepStart,
        });
      } catch (err: any) {
        overallPassed = false;
        results.push({
          checkType: item.checkType,
          tool,
          command: item.cmd,
          passed: false,
          exitCode: err.code !== undefined ? err.code : 1,
          stdout: (err.stdout || "").trim(),
          stderr: (err.stderr || err.message || String(err)).trim(),
          durationMs: Date.now() - stepStart,
          errorSummary: err.message || "Command failed",
        });
      }
    }

    this.logger?.info(
      {
        projectId: params.projectId,
        overallPassed,
        checkCount: results.length,
      },
      "Unified validation completed"
    );

    return {
      projectId: params.projectId,
      projectType: type,
      overallPassed: checksToRun.length > 0 ? overallPassed : false,
      status: checksToRun.length === 0 ? "NO_CHECKS" : (overallPassed ? "PASSED" : "FAILED"),
      checks: results,
      totalDurationMs: Date.now() - startTotal,
      timestamp: Date.now(),
    };
  }
}
