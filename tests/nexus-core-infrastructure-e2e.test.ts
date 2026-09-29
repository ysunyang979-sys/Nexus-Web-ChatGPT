import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BrowserAutomationService } from "../apps/runner/src/browser/browser-service.js";
import { AgentPlanService } from "../apps/runner/src/agent-plan/plan-service.js";
import { LocalBridgeEventBus } from "../apps/runner/src/events/event-bus-service.js";
import { LocalBridgeObservabilityService } from "../apps/runner/src/trace/trace-service.js";
import { ProjectRegistry } from "../apps/runner/src/projects/registry.js";
import { createLogger } from "@localbridge/shared";

describe("Nexus Four Core Infrastructure End-to-End Suite", () => {
  let testServer: http.Server;
  let serverPort: number;
  let testBaseUrl: string;
  let tmpDir: string;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let browserService: BrowserAutomationService;
  let agentPlanService: AgentPlanService;
  let eventBus: LocalBridgeEventBus;
  let observabilityService: LocalBridgeObservabilityService;

  const logger = createLogger({ level: "error" });

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-infra-test-"));
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    // Dummy project file
    fs.writeFileSync(
      path.join(projectDir, "test-file.txt"),
      "Hello from Nexus project sandbox file",
      "utf-8"
    );

    const projectsFile = path.join(tmpDir, "projects.json");
    fs.writeFileSync(
      projectsFile,
      JSON.stringify([
        {
          id: "proj_infra_test",
          root: projectDir,
          enabled: true,
          mode: "read-write",
        },
      ]),
      "utf-8"
    );

    projectRegistry = new ProjectRegistry(projectsFile, logger);

    // Start local HTTP server serving a real test page
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${serverPort}`);

      if (url.pathname === "/download") {
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="downloaded-artifact.dat"',
        });
        res.end("REAL_BROWSER_DOWNLOAD_VERIFICATION_PAYLOAD_12345");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Nexus Infrastructure Test Page</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .box { margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <h1 id="page-title">Nexus Browser Test Suite</h1>
          <div class="box">
            <input id="input-username" type="text" placeholder="Type username..." />
            <button id="btn-submit" onclick="submitForm()">Submit</button>
            <span id="output-message">Awaiting input</span>
          </div>
          <div class="box">
            <select id="select-framework">
              <option value="react">React</option>
              <option value="vue">Vue</option>
              <option value="nexus">Nexus</option>
            </select>
          </div>
          <div class="box">
            <input id="input-file" type="file" />
          </div>
          <div style="height: 1500px;">
            <p>Scrollable area</p>
          </div>
          <script>
            function submitForm() {
              const val = document.getElementById('input-username').value;
              document.getElementById('output-message').innerText = 'Processed: ' + val;
              console.log('User form submitted: ' + val);
            }
          </script>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address() as any;
        serverPort = addr.port;
        testBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    browserService = new BrowserAutomationService(tmpDir, projectRegistry, logger);
    agentPlanService = new AgentPlanService(tmpDir, logger);
    eventBus = new LocalBridgeEventBus(tmpDir, logger);
    observabilityService = new LocalBridgeObservabilityService(tmpDir, logger);
  });

  afterAll(async () => {
    testServer.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================
  // 1. Browser Automation Infrastructure E2E
  // ==========================================
  describe("1. Browser Automation Infrastructure", () => {
    let browserSessionId: string;

    it("launches real Chromium/Edge instance with persistent session and CDP", async () => {
      const res = await browserService.launch({
        projectId: "proj_infra_test",
        name: "e2e-browser-test",
        headless: true,
        browserType: "auto",
      });

      expect(res.browserSessionId).toBeDefined();
      expect(res.status).toBe("ready");
      expect(res.pid).toBeGreaterThan(0);
      browserSessionId = res.browserSessionId;
    }, 45000);

    it("inspects session status and list", async () => {
      const statusRes = await browserService.status({ browserSessionId });
      expect(statusRes.status).toBe("ready");
      expect(statusRes.pid).toBeGreaterThan(0);
      expect(statusRes.tabs.length).toBeGreaterThanOrEqual(1);

      const listRes = await browserService.list({ projectId: "proj_infra_test" });
      expect(listRes.total).toBeGreaterThanOrEqual(1);
      expect(listRes.sessions.some((s) => s.browserSessionId === browserSessionId)).toBe(true);
    });

    it("navigates to test page and retrieves title and URL", async () => {
      const openRes = await browserService.open({
        browserSessionId,
        url: testBaseUrl,
      });

      expect(openRes.url).toContain(String(serverPort));
      expect(openRes.title).toBe("Nexus Infrastructure Test Page");
    }, 20000);

    it("snapshots DOM tree and locates interactive elements", async () => {
      const snapRes = await browserService.snapshot({ browserSessionId });
      expect(snapRes.title).toBe("Nexus Infrastructure Test Page");
      expect(snapRes.interactiveElements.length).toBeGreaterThan(0);
    });

    it("finds elements and inspects their state", async () => {
      const findRes = await browserService.find({
        browserSessionId,
        selector: "#input-username",
      });
      expect(findRes.totalFound).toBe(1);
      expect(findRes.elements[0].tagName).toBe("input");

      const stateRes = await browserService.elementState({
        browserSessionId,
        selector: "#input-username",
      });
      expect(stateRes.exists).toBe(true);
      expect(stateRes.visible).toBe(true);
      expect(stateRes.enabled).toBe(true);
    });

    it("types text into input and clicks submit button triggering real page changes", async () => {
      const typeRes = await browserService.type({
        browserSessionId,
        selector: "#input-username",
        text: "AgentNexus",
        clearFirst: true,
      });
      expect(typeRes.typed).toBe(true);

      const clickRes = await browserService.click({
        browserSessionId,
        selector: "#btn-submit",
      });
      expect(clickRes.clicked).toBe(true);

      // Verify that DOM updated
      const extractRes = await browserService.extract({
        browserSessionId,
        selector: "#output-message",
      });
      expect(extractRes.items[0]?.text).toBe("Processed: AgentNexus");
    });

    it("selects options in dropdown element", async () => {
      const selectRes = await browserService.select({
        browserSessionId,
        selector: "#select-framework",
        values: ["nexus"],
      });
      expect(selectRes.selectedValues).toContain("nexus");
    });

    it("scrolls page", async () => {
      const scrollRes = await browserService.scroll({
        browserSessionId,
        deltaY: 200,
      });
      expect(scrollRes.scrolled).toBe(true);
    });

    it("captures high-resolution screenshot as base64", async () => {
      const shotRes = await browserService.screenshot({
        browserSessionId,
        format: "png",
      });
      expect(shotRes.dataBase64.length).toBeGreaterThan(100);
      expect(shotRes.mimeType).toBe("image/png");
    });

    it("creates, switches, and closes tabs", async () => {
      const newTabRes = await browserService.tabCreate({
        browserSessionId,
        url: `${testBaseUrl}/?tab=2`,
      });
      expect(newTabRes.tabId).toBeDefined();

      const tabsRes = await browserService.tabs({ browserSessionId });
      expect(tabsRes.tabs.length).toBe(2);

      const closeTabRes = await browserService.tabClose({
        browserSessionId,
        tabId: newTabRes.tabId,
      });
      expect(closeTabRes.closedTabId).toBe(newTabRes.tabId);
      expect(closeTabRes.remainingCount).toBe(1);
    });

    it("manages cookies and localStorage", async () => {
      const setCookieRes = await browserService.cookies({
        browserSessionId,
        action: "set",
        cookies: [{ name: "session_token", value: "tok_xyz_987" }],
      });
      expect(setCookieRes.count).toBeGreaterThanOrEqual(1);

      const setStorageRes = await browserService.storage({
        browserSessionId,
        type: "local",
        action: "set",
        key: "client_id",
        value: "nexus_agent_1",
      });
      expect(setStorageRes.action).toBe("set");

      const getStorageRes = await browserService.storage({
        browserSessionId,
        type: "local",
        action: "get",
      });
      expect(getStorageRes.data["client_id"]).toBe("nexus_agent_1");
    });

    it("downloads file into sandboxed project directory", async () => {
      const targetDownloadPath = path.join(projectDir, "downloaded-test-file.dat");
      const dlRes = await browserService.download({
        browserSessionId,
        url: `${testBaseUrl}/download`,
        destinationPath: targetDownloadPath,
      });

      expect(dlRes.sizeBytes).toBeGreaterThan(0);
      expect(fs.existsSync(targetDownloadPath)).toBe(true);
      const content = fs.readFileSync(targetDownloadPath, "utf-8");
      expect(content).toContain("REAL_BROWSER_DOWNLOAD_VERIFICATION_PAYLOAD_12345");
    });

    it("uploads sandboxed project file into input file element", async () => {
      const uploadSourcePath = path.join(projectDir, "test-file.txt");
      const upRes = await browserService.upload({
        browserSessionId,
        selector: "#input-file",
        sourcePath: uploadSourcePath,
      });

      expect(upRes.uploaded).toBe(true);
      expect(upRes.fileName).toBe("test-file.txt");
    });

    it("retrieves console logs recorded during browser session", async () => {
      const consoleRes = await browserService.console({ browserSessionId });
      expect(consoleRes.logs.some((l) => l.text.includes("User form submitted"))).toBe(true);
    });

    it("closes browser session and terminates process", async () => {
      const closeRes = await browserService.close({
        browserSessionId,
        force: true,
      });
      expect(closeRes.closed).toBe(true);
    });
  });

  // ==========================================
  // 2. Agent Plan, Todo, Delegation, Supervisor
  // ==========================================
  describe("2. Agent Plan, Todo, Delegation, Supervisor, and Budget", () => {
    let createdPlanId: string;
    let step1Id: string;
    let step2Id: string;
    let createdTodoId: string;

    it("creates multi-step plan with dependency chain", async () => {
      const res = await agentPlanService.createPlan({
        title: "Build Nexus Feature",
        goal: "Implement and verify end-to-end functionality",
        steps: [
          { title: "Design Architecture", priority: "high" },
          { title: "Implement Core Service", priority: "critical", dependencies: [] },
        ],
      });

      expect(res.plan.planId).toBeDefined();
      expect(res.plan.steps.length).toBe(2);
      expect(res.plan.steps[0].status).toBe("ready");

      createdPlanId = res.plan.planId;
      step1Id = res.plan.steps[0].stepId;
      step2Id = res.plan.steps[1].stepId;
      res.plan.steps[1].dependencies = [step1Id];
    });

    it("retrieves and updates plan steps", async () => {
      const getRes = await agentPlanService.getPlan({ planId: createdPlanId });
      expect(getRes.plan.title).toBe("Build Nexus Feature");

      // Mark step 1 completed, verify step 2 becomes ready
      getRes.plan.steps[0].status = "completed";
      getRes.plan.completedSteps.push(step1Id);

      const updateRes = await agentPlanService.updatePlan({
        planId: createdPlanId,
        steps: getRes.plan.steps,
      });
      expect(updateRes.plan.steps[0].status).toBe("completed");
    });

    it("completes plan with output artifacts", async () => {
      const compRes = await agentPlanService.completePlan({
        planId: createdPlanId,
        artifacts: ["nexus-report.md"],
      });
      expect(compRes.plan.status).toBe("completed");

      const listRes = await agentPlanService.listPlans({});
      expect(listRes.plans.some((p) => p.planId === createdPlanId)).toBe(true);
    });

    it("manages agent todo lifecycle", async () => {
      const createRes = await agentPlanService.createTodo({
        title: "Write documentation",
        planId: createdPlanId,
        priority: "high",
      });
      expect(createRes.todo.todoId).toBeDefined();
      createdTodoId = createRes.todo.todoId;

      const updateRes = await agentPlanService.updateTodo({
        todoId: createdTodoId,
        notes: "Drafted first version",
      });
      expect(updateRes.todo.notes).toBe("Drafted first version");

      const compRes = await agentPlanService.completeTodo({
        todoId: createdTodoId,
      });
      expect(compRes.todo.status).toBe("completed");

      const listRes = await agentPlanService.listTodos({ planId: createdPlanId });
      expect(listRes.total).toBe(1);
    });

    it("delegates sub-task to specialized child agent role", async () => {
      const delRes = await agentPlanService.delegate({
        parentAgentId: "agent_main_supervisor",
        childAgentRole: "BackendEngineer",
        taskTitle: "Implement API endpoints",
      });
      expect(delRes.delegationId).toBeDefined();
      expect(delRes.childAgentId).toContain("backendengineer");
      expect(delRes.status).toBe("assigned");
    });

    it("forks agent with isolated memory and quotas", async () => {
      const forkRes = await agentPlanService.fork({
        parentAgentId: "agent_main_supervisor",
        inheritTasks: true,
        isolatedMemory: true,
        quota: { maxToolCalls: 50 },
      });
      expect(forkRes.forkedAgentId).toBeDefined();
      expect(forkRes.parentAgentId).toBe("agent_main_supervisor");

      const joinRes = await agentPlanService.join({
        parentAgentId: "agent_main_supervisor",
        childAgentIds: [forkRes.forkedAgentId],
      });
      expect(joinRes.allJoined).toBe(true);
    });

    it("manages agent execution dependencies", async () => {
      const depRes = await agentPlanService.createDependency({
        agentId: "agent_frontend",
        dependsOnAgentId: "agent_backend",
        reason: "Needs backend APIs deployed",
      });
      expect(depRes.dependency.dependencyId).toBeDefined();

      const listRes = await agentPlanService.listDependencies({ agentId: "agent_frontend" });
      expect(listRes.total).toBe(1);

      const remRes = await agentPlanService.removeDependency({
        dependencyId: depRes.dependency.dependencyId,
      });
      expect(remRes.removed).toBe(true);
    });

    it("supervises agent heartbeats and health status", async () => {
      agentPlanService.recordHeartbeat("agent_worker_1");

      const supRes = await agentPlanService.supervise({
        supervisorAgentId: "agent_main_supervisor",
        targetAgentIds: ["agent_worker_1"],
        action: "status",
      });
      expect(supRes.supervisedAgents[0].healthy).toBe(true);
      expect(supRes.overallHealth).toBe("healthy");
    });

    it("enforces agent budget quotas and detects limit violations", async () => {
      await agentPlanService.setBudget({
        targetId: "agent_budget_tester",
        quota: {
          maxToolCalls: 5,
        },
      });

      // Normal increment within quota
      const check1 = await agentPlanService.checkBudget({
        targetId: "agent_budget_tester",
        increment: { toolCalls: 3 },
      });
      expect(check1.allowed).toBe(true);
      expect(check1.status).toBe("normal");

      // Increment exceeding quota
      const check2 = await agentPlanService.checkBudget({
        targetId: "agent_budget_tester",
        increment: { toolCalls: 5 }, // Total 8 > 5
      });
      expect(check2.allowed).toBe(false);
      expect(check2.status).toBe("exceeded");
      expect(check2.exceededFields).toContain("maxToolCalls");
      expect(check2.actionRequired).toBe("approval_required");
    });
  });

  // ==========================================
  // 3. Event Bus Infrastructure E2E
  // ==========================================
  describe("3. Event Bus Infrastructure", () => {
    let subId: string;

    it("creates event subscription with wildcard topic pattern", async () => {
      const res = await eventBus.subscribe({
        subscriberId: "agent_auditor_sub",
        topicPattern: "agent.*",
      });
      expect(res.subscription.subscriptionId).toBeDefined();
      subId = res.subscription.subscriptionId;
    });

    it("publishes events and routes them to active subscribers", async () => {
      const pub1 = await eventBus.publish({
        topic: "agent.created",
        payload: { agentId: "agent_001", name: "Worker" },
      });
      expect(pub1.published).toBe(true);
      expect(pub1.recipientCount).toBeGreaterThanOrEqual(1);

      const pub2 = await eventBus.publish({
        topic: "agent.task.completed",
        payload: { taskId: "task_001", status: "success" },
      });
      expect(pub2.published).toBe(true);

      // Topic that doesn't match agent.*
      const pub3 = await eventBus.publish({
        topic: "system.heartbeat",
        payload: { time: Date.now() },
      });
      expect(pub3.published).toBe(true);
    });

    it("polls queued events from subscription", async () => {
      const pollRes = await eventBus.poll({
        subscriptionId: subId,
        limit: 10,
      });

      expect(pollRes.totalRetrieved).toBe(2);
      expect(pollRes.events[0].topic).toBe("agent.created");
      expect(pollRes.events[1].topic).toBe("agent.task.completed");
    });

    it("queries durable event history by topic filter", async () => {
      const histRes = await eventBus.history({
        topicPattern: "agent.*",
      });
      expect(histRes.totalFound).toBeGreaterThanOrEqual(2);
    });

    it("replays past events into subscription", async () => {
      const replayRes = await eventBus.replay({
        topicPattern: "agent.*",
        fromTimestamp: 0,
        targetSubscriptionId: subId,
      });
      expect(replayRes.replayedCount).toBeGreaterThanOrEqual(2);

      const pollRes = await eventBus.poll({
        subscriptionId: subId,
        limit: 10,
      });
      expect(pollRes.totalRetrieved).toBeGreaterThanOrEqual(2);
    });

    it("unsubscribes active subscription", async () => {
      const unsubRes = await eventBus.unsubscribe({ subscriptionId: subId });
      expect(unsubRes.unsubscribed).toBe(true);
    });
  });

  // ==========================================
  // 4. Trace & Observability Infrastructure E2E
  // ==========================================
  describe("4. Trace and Observability Infrastructure", () => {
    let traceId: string;
    let rootSpanId: string;
    let childSpanId: string;

    it("starts distributed trace with root span and child span", async () => {
      const rootRes = await observabilityService.startTrace({
        name: "ExecuteAgentWorkflow",
        service: "nexus-server",
        attributes: { projectId: "proj_infra_test" },
      });
      expect(rootRes.traceId).toBeDefined();
      traceId = rootRes.traceId;
      rootSpanId = rootRes.spanId;

      const childRes = await observabilityService.startTrace({
        name: "InvokeBrowserAutomation",
        service: "nexus-runner",
        traceId,
        parentSpanId: rootSpanId,
        attributes: { action: "open_page" },
      });
      expect(childRes.traceId).toBe(traceId);
      childSpanId = childRes.spanId;
    });

    it("records events inside active trace span", async () => {
      const recRes = await observabilityService.recordEvent({
        spanId: childSpanId,
        name: "dom_content_loaded",
        attributes: { durationMs: 120 },
      });
      expect(recRes.recorded).toBe(true);
    });

    it("ends child and root spans and calculates duration", async () => {
      const endChild = await observabilityService.endTrace({
        spanId: childSpanId,
        status: "ok",
      });
      expect(endChild.status).toBe("ok");
      expect(endChild.durationMs).toBeGreaterThanOrEqual(0);

      const endRoot = await observabilityService.endTrace({
        spanId: rootSpanId,
        status: "ok",
      });
      expect(endRoot.status).toBe("ok");
    });

    it("retrieves full trace span tree by traceId", async () => {
      const getRes = await observabilityService.getTrace({ traceId });
      expect(getRes.traceId).toBe(traceId);
      expect(getRes.totalSpans).toBe(2);
      expect(getRes.spans.some((s) => s.spanId === rootSpanId)).toBe(true);
      expect(getRes.spans.some((s) => s.spanId === childSpanId)).toBe(true);
      expect(getRes.spans.find((s) => s.spanId === childSpanId)?.events.length).toBe(1);
    });

    it("lists recent traces", async () => {
      const listRes = await observabilityService.listTraces({});
      expect(listRes.total).toBeGreaterThanOrEqual(1);
      expect(listRes.traces.some((t) => t.traceId === traceId)).toBe(true);
    });

    it("gathers system metrics including latency percentiles", async () => {
      const metricsRes = await observabilityService.getMetrics({ category: "all" });
      expect(metricsRes.metrics.memoryUsageMb).toBeGreaterThan(0);
      expect(metricsRes.metrics.totalToolCalls).toBeGreaterThanOrEqual(2);
      expect(metricsRes.metrics.p50LatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("generates comprehensive observability summary report", async () => {
      const summaryRes = await observabilityService.getSummary({ timeWindowMinutes: 60 });
      expect(summaryRes.summary.totalTraces).toBeGreaterThanOrEqual(1);
      expect(summaryRes.summary.topSlowestOperations.length).toBeGreaterThan(0);
      expect(summaryRes.summary.activeComponents.spansTracked).toBeGreaterThanOrEqual(2);
    });
  });
});
