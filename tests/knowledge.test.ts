import "./setup.js";
import { describe, it, expect } from "vitest";
import { registerAgent, heartbeat } from "../src/modules/agents/agent.service.js";
import { storeKnowledge, retrieveKnowledge, extractFromTask } from "../src/modules/knowledge/knowledge.service.js";
import { computeEffectiveRelevance, computeMatchScore } from "../src/modules/knowledge/knowledge.scorer.js";

describe("Knowledge System", () => {
  let agentId: string;

  it("should setup agent", () => {
    try {
      const a = registerAgent({ name: "KnowledgeAgent", capabilities: ["learn"], role: "worker" });
      agentId = a.id;
    } catch {
      // Commander might already exist from other tests
      const a = registerAgent({ name: "KnowledgeAgent2", capabilities: ["learn"], role: "specialist" });
      agentId = a.id;
    }
    heartbeat(agentId);
  });

  it("should store and retrieve knowledge", () => {
    storeKnowledge({
      type: "best_practice",
      title: "Always validate inputs",
      content: "Validate all API inputs before processing",
      domain: "api",
      tags: ["validation", "api", "security"],
      sourceAgentId: agentId,
    });

    storeKnowledge({
      type: "anti_pattern",
      title: "Never skip error handling",
      content: "Always handle errors in async operations",
      domain: "api",
      tags: ["error-handling", "api"],
      sourceAgentId: agentId,
    });

    const results = retrieveKnowledge({
      tags: ["api", "validation"],
      capabilities: [],
      domain: "api",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchScore).toBeGreaterThan(0);
  });

  it("should extract knowledge from task outcome", async () => {
    const { createTask } = await import("../src/modules/tasks/task.service.js");
    const t = createTask({ title: "Knowledge test task" });
    const entry = extractFromTask({
      taskId: t.id,
      taskTitle: "Build API endpoint",
      taskTags: ["api", "backend"],
      domain: "api",
      agentId,
      outcome: "failure",
      error: "Timeout connecting to database",
    });

    expect(entry).not.toBeNull();
    expect(entry!.type).toBe("anti_pattern");
    expect(entry!.content).toContain("Timeout");
  });
});

describe("Knowledge Scorer", () => {
  it("should compute effective relevance with time decay", () => {
    const recent = computeEffectiveRelevance({
      relevanceScore: 0.8,
      upvotes: 5,
      downvotes: 1,
      usageCount: 10,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
    });

    const old = computeEffectiveRelevance({
      relevanceScore: 0.8,
      upvotes: 5,
      downvotes: 1,
      usageCount: 10,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 300, // 300 days ago
    });

    expect(recent).toBeGreaterThan(old);
  });

  it("should boost by votes", () => {
    const upvoted = computeEffectiveRelevance({
      relevanceScore: 0.5, upvotes: 10, downvotes: 0, usageCount: 0, createdAt: Date.now(),
    });
    const downvoted = computeEffectiveRelevance({
      relevanceScore: 0.5, upvotes: 0, downvotes: 10, usageCount: 0, createdAt: Date.now(),
    });
    expect(upvoted).toBeGreaterThan(downvoted);
  });
});
