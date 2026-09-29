import type Database from "better-sqlite3";
import type { EventEmitter } from "node:events";
import { IntelligenceStore } from "./store.js";
import { VersionedSkillRegistry } from "./skill/versioned-registry.js";
import { SkillCandidateManager } from "./skill/candidate-manager.js";
import { MemoryRuntime } from "./memory/runtime.js";
import { GlobalRuleRegistry } from "./rules/rule-registry.js";
import { KnowledgeImporter } from "./knowledge/importer.js";
import { ContextBuilder } from "./context/builder.js";
import { IntelligenceEventPipeline } from "./events/pipeline.js";
import { SkillLearningPipeline } from "./skill/pipeline.js";
import type { Logger } from "@localbridge/shared";

export class IntelligenceRuntime {
  public readonly store: IntelligenceStore;
  public readonly skillRegistry: VersionedSkillRegistry;
  public readonly skillCandidateManager: SkillCandidateManager;
  public readonly skillLearner: SkillLearningPipeline;
  public readonly memoryRuntime: MemoryRuntime;
  public readonly ruleRegistry: GlobalRuleRegistry;
  public readonly knowledgeImporter: KnowledgeImporter;
  public readonly contextBuilder: ContextBuilder;
  public readonly eventPipeline: IntelligenceEventPipeline;

  constructor(
    db: Database.Database,
    private readonly logger?: Logger
  ) {
    this.store = new IntelligenceStore(db);
    this.skillRegistry = new VersionedSkillRegistry(this.store, this.logger);
    this.skillCandidateManager = new SkillCandidateManager(this.store, this.skillRegistry, this.logger);
    this.skillLearner = new SkillLearningPipeline(this.skillCandidateManager, this.skillRegistry, this.logger);
    this.memoryRuntime = new MemoryRuntime(this.store, this.logger);
    this.ruleRegistry = new GlobalRuleRegistry(this.store, this.logger);
    this.knowledgeImporter = new KnowledgeImporter(
      this.store,
      this.memoryRuntime,
      this.ruleRegistry,
      this.skillRegistry,
      this.logger
    );
    this.contextBuilder = new ContextBuilder(
      this.store,
      this.ruleRegistry,
      this.memoryRuntime,
      this.skillRegistry,
      this.knowledgeImporter,
      this.logger
    );
    this.eventPipeline = new IntelligenceEventPipeline(this.memoryRuntime, this.logger);

    // Initialize core system rules
    this.initSystemRules();
  }

  attachEventBus(eventBus: EventEmitter): void {
    this.eventPipeline.attach(eventBus);
  }

  private initSystemRules(): void {
    const existing = this.ruleRegistry.listRules({ scope: "GLOBAL" });
    if (!existing.some((r) => r.ruleId === "sys_boundary_protection")) {
      this.ruleRegistry.addRule({
        ruleId: "sys_boundary_protection",
        name: "Project Boundary Protection",
        content: "File mutations outside authorized project roots are strictly forbidden.",
        scope: "GLOBAL",
        priority: "SYSTEM",
        tags: ["system", "security"],
        provenance: { source: "system", author: "nexus-core" },
      });
    }
  }
}
