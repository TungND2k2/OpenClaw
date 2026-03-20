import "./setup.js";
import { describe, it, expect } from "vitest";
import { registerAgent, heartbeat } from "../src/modules/agents/agent.service.js";
import { createTask, claimTask, startTask, completeTask, failTask, retryTask, getTask, addDependency, areDependenciesSatisfied } from "../src/modules/tasks/task.service.js";

describe("Tasks", () => {
  let agentId: string;

  it("should setup agent", () => {
    // Might already have commander from hierarchy test, use worker
    const w = registerAgent({ name: "TaskWorker", capabilities: ["code"], role: "worker" });
    agentId = w.id;
    heartbeat(agentId);
  });

  it("should create and complete a task", () => {
    const task = createTask({ title: "Test task", priority: 4, tags: ["test"] });
    expect(task.status).toBe("pending");
    expect(task.priority).toBe(4);

    const claimed = claimTask(task.id, agentId);
    expect(claimed.status).toBe("assigned");

    const started = startTask(task.id, agentId);
    expect(started.status).toBe("in_progress");

    const completed = completeTask(task.id, agentId, "done!");
    expect(completed.status).toBe("completed");
    expect(completed.result).toBe("done!");
  });

  it("should handle task failure and retry", () => {
    const task = createTask({ title: "Fail task", maxRetries: 2 });
    claimTask(task.id, agentId);
    startTask(task.id, agentId);
    const failed = failTask(task.id, agentId, "oops");
    expect(failed.status).toBe("failed");

    const retried = retryTask(task.id);
    expect(retried.status).toBe("pending");
    expect(retried.retryCount).toBe(1);
  });

  it("should handle dependencies", () => {
    const t1 = createTask({ title: "Dep 1" });
    const t2 = createTask({ title: "Dep 2" });
    addDependency(t2.id, t1.id);

    expect(areDependenciesSatisfied(t2.id)).toBe(false);

    claimTask(t1.id, agentId);
    startTask(t1.id, agentId);
    completeTask(t1.id, agentId, "ok");

    expect(areDependenciesSatisfied(t2.id)).toBe(true);
  });

  it("should prevent invalid transitions", () => {
    const task = createTask({ title: "Bad transition" });
    expect(() => startTask(task.id, agentId)).toThrow(); // can't start pending task (not assigned)
  });

  it("should enforce depth limit", () => {
    const parent = createTask({ title: "Root" });
    let current = parent;
    for (let i = 0; i < 5; i++) {
      current = createTask({ title: `Level ${i + 1}`, parentTaskId: current.id });
    }
    expect(() => createTask({ title: "Too deep", parentTaskId: current.id })).toThrow(/depth/);
  });
});
