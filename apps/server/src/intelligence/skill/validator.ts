import {
  CANONICAL_TOOL_DEFINITIONS,
  type SkillVersion,
  type SkillValidationReport,
} from "@localbridge/protocol";

export class SkillValidator {
  private readonly availableToolNames = new Set<string>([
    ...CANONICAL_TOOL_DEFINITIONS.flatMap((t) => [t.id, t.name, t.rpcMethod]),
    "filesystem.read",
    "filesystem.write",
    "filesystem.stat",
    "filesystem.delete",
    "filesystem.search",
    "filesystem.grep",
    "file.create",
    "file.read",
    "file.write",
    "file.delete",
    "file.stat",
    "file.patch",
    "directory.list",
    "git.status",
    "git.diff",
    "git.commit",
    "git.stage",
    "git.unstage",
    "command.run",
    "terminal.start",
    "terminal.write",
    "terminal.read",
    "process.list",
    "computer.mouse_click",
    "computer.keyboard_type",
    "computer.screenshot",
    "computer.observe",
    "browser.navigate",
    "browser.click",
    "browser.screenshot",
    "validation.run",
  ]);

  registerKnownTools(toolNames: string[]): void {
    for (const t of toolNames) {
      this.availableToolNames.add(t);
    }
  }

  validate(skill: {
    skillId?: string;
    version?: SkillVersion | string;
    [key: string]: any;
  }): SkillValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const v: any = (typeof skill.version === "object" && skill.version !== null) ? skill.version : skill;
    const versionStr = typeof skill.version === "string" ? skill.version : v?.version;

    // 1. Schema Validation
    let schemaValid = true;
    if (!versionStr || !/^\d+\.\d+\.\d+/.test(versionStr)) {
      errors.push(`Version '${versionStr}' must follow SemVer format (e.g. 1.0.0)`);
      schemaValid = false;
    }
    if (!v.name || (typeof v.name === "string" && v.name.trim().length === 0)) {
      errors.push("Skill name is required and cannot be empty");
      schemaValid = false;
    }
    const stepsList: any[] = Array.isArray(v.steps) ? v.steps : [];
    if (stepsList.length === 0) {
      warnings.push("Skill has no defined execution steps");
    }

    // 2. Dependency Validation
    let dependenciesValid = true;
    if (v.dependencies && Array.isArray(v.dependencies)) {
      for (const dep of v.dependencies) {
        if (typeof dep !== "string" || dep.trim().length === 0) {
          errors.push(`Invalid dependency identifier: ${JSON.stringify(dep)}`);
          dependenciesValid = false;
        }
      }
    }

    // 3. Tool Existence Validation
    let toolsValid = true;
    const referencedTools = new Set<string>([...(v.tools || []), ...stepsList.map((s: any) => s.toolName).filter(Boolean)]);
    for (const tool of referencedTools) {
      if (!this.availableToolNames.has(tool) && !tool.startsWith("localbridge_")) {
        warnings.push(`Tool '${tool}' is not a recognized built-in or registered localbridge tool`);
      }
    }

    // 4. Parameter Validation
    let parametersValid = true;
    if (v.parameters && typeof v.parameters !== "object") {
      errors.push("Parameters must be a key-value schema object");
      parametersValid = false;
    }

    // 5. Security Validation
    let securityValid = true;
    const textToCheck = `${v.instructions || ""} ${JSON.stringify(stepsList)} ${JSON.stringify(v.parameters || {})}`;
    const maliciousPatterns = [
      { pattern: /\bcurl\b.*\|\s*(?:bash|sh|powershell)/i, desc: "Remote script piping into shell" },
      { pattern: /\brm\s+-rf\s+\/(?:[\s"']|$)/i, desc: "Root deletion attempt" },
      { pattern: /\bformat\s+[c-z]:/i, desc: "Disk format attempt" },
      { pattern: /(?:\.\.[\\/]){3,}/i, desc: "Excessive path traversal" },
    ];

    for (const { pattern, desc } of maliciousPatterns) {
      if (pattern.test(textToCheck)) {
        errors.push(`Security check violation: ${desc}`);
        securityValid = false;
      }
    }

    // 6. Dry-Run / Safe Validation
    let dryRunValid = true;
    for (const step of stepsList) {
      if (step.stepNumber <= 0) {
        errors.push(`Step ${step.actionName}: stepNumber must be positive`);
        dryRunValid = false;
      }
      if (!step.actionName || !step.toolName) {
        errors.push(`Step ${step.stepNumber}: actionName and toolName are required`);
        dryRunValid = false;
      }
    }

    const validationStatus: "valid" | "invalid" | "warning" =
      errors.length > 0 ? "invalid" : warnings.length > 0 ? "warning" : "valid";

    return {
      skillId: skill.skillId || v.skillId || "unknown",
      version: versionStr || "1.0.0",
      validationStatus,
      schemaValid,
      dependenciesValid,
      toolsValid,
      parametersValid,
      securityValid,
      dryRunValid,
      validationErrors: errors,
      validationWarnings: warnings,
      validatedAt: Date.now(),
      validatorVersion: "1.0.0",
    };
  }
}
