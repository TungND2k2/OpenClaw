import "./setup.js";
import { describe, it, expect } from "vitest";
import { registerAgent, heartbeat } from "../src/modules/agents/agent.service.js";
import { createTenant } from "../src/modules/tenants/tenant.service.js";
import { createTask, completeTask, claimTask, startTask } from "../src/modules/tasks/task.service.js";
import { decomposeTask, activatePlan } from "../src/modules/orchestration/decomposer.js";
import { tick } from "../src/modules/orchestration/orchestrator.service.js";
import { getDashboard } from "../src/modules/monitoring/monitor.service.js";
import { recordUsage, checkBudget } from "../src/proxy/cost.tracker.js";
import { startWorkflow, submitFormData, completeWorkflow } from "../src/modules/workflows/workflow-engine.service.js";

describe("E2E: Goal → Decompose → Execute → Complete", () => {
  let cmdrId: string, w1Id: string, w2Id: string;

  it("should setup agents", async () => {
    try {
      const cmdr = registerAgent({ name: "E2E-Cmdr", capabilities: ["orchestration"], role: "commander" });
      cmdrId = cmdr.id;
    } catch {
      // Commander exists from other tests — find it
      const { listAgents: la } = await import("../src/modules/agents/agent.service.js");
      const agents = la({ role: "commander" });
      cmdrId = agents[0].id;
    }
    heartbeat(cmdrId);

    const w1 = registerAgent({ name: "E2E-W1", capabilities: ["coding", "api"], role: "worker", parentAgentId: cmdrId });
    w1Id = w1.id;
    heartbeat(w1Id);

    const w2 = registerAgent({ name: "E2E-W2", capabilities: ["testing"], role: "worker", parentAgentId: cmdrId });
    w2Id = w2.id;
    heartbeat(w2Id);
  });

  it("should decompose and execute a goal", async () => {
    const goal = createTask({ title: "E2E Goal", priority: 5, createdByAgentId: cmdrId });

    const { plan, subtaskIds } = decomposeTask({
      taskId: goal.id,
      agentId: cmdrId,
      subtasks: [
        { title: "Code it", requiredCapabilities: ["coding"] },
        { title: "Test it", requiredCapabilities: ["testing"], dependsOnIndices: [0] },
      ],
      strategy: "sequential",
    });
    activatePlan(plan.id);

    // Tick should assign first subtask
    tick();

    // Manually complete subtasks
    const t1 = subtaskIds[0];
    claimTask(t1, w1Id);
    startTask(t1, w1Id);
    completeTask(t1, w1Id, "coded");

    // Tick to resolve deps + assign second
    tick();

    const t2 = subtaskIds[1];
    claimTask(t2, w2Id);
    startTask(t2, w2Id);
    completeTask(t2, w2Id, "tested");

    // Tick to rollup parent
    tick();

    const { getTask: gt } = await import("../src/modules/tasks/task.service.js");
    const final = gt(goal.id);
    expect(final.status).toBe("completed");
  });
});

describe("E2E: Cost Tracking", () => {
  it("should track costs and enforce budget", () => {
    const agent = registerAgent({ name: "BudgetAgent", capabilities: ["chat"], role: "worker", costBudgetUsd: 5.0 });
    heartbeat(agent.id);

    recordUsage({ agentId: agent.id, model: "claude-sonnet-4-20250514", inputTokens: 100000, outputTokens: 50000 });
    const budget = checkBudget(agent.id);
    expect(budget.withinBudget).toBe(true);
    expect(budget.spent).toBeGreaterThan(0);
  });
});

describe("E2E: Workflow", () => {
  it("should run a basic workflow", async () => {
    const tenant = createTenant({ name: "TestCorp" });

    // Create workflow template with stages via DB
    const { getDb } = await import("../src/db/connection.js");
    const { workflowTemplates } = await import("../src/db/schema.js");
    const { newId } = await import("../src/utils/id.js");
    const db = getDb();
    const tmplId = newId();
    const stagesData = [
      { id: "collect", name: "Collect Info", type: "form" },
      { id: "validate", name: "Validate", type: "validation" },
      { id: "complete", name: "Complete", type: "notification" },
    ];
    db.insert(workflowTemplates).values({
      id: tmplId,
      tenantId: tenant.id,
      name: "Order Flow",
      version: 1,
      stages: JSON.stringify(stagesData),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run();

    const instance = startWorkflow({
      templateId: tmplId,
      tenantId: tenant.id,
      initiatedBy: "test-user",
      channel: "web",
    });

    expect(instance.status).toBe("active");
    expect(instance.currentStageId).toBe("collect");

    // Submit form data
    const { instance: updated } = submitFormData(instance.id, { customer: "Alice", amount: 5000 });
    expect((updated.formData as any).customer).toBe("Alice");

    // Complete workflow
    const completed = completeWorkflow(instance.id);
    expect(completed.status).toBe("completed");
  });
});

describe("Dashboard", () => {
  it("should return system overview", () => {
    const dash = getDashboard();
    expect(dash.agents.total).toBeGreaterThan(0);
    expect(dash.tasks.total).toBeGreaterThan(0);
  });
});
