import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { agents, tasks, tokenUsage } from "../../db/schema.js";
import { nowMs } from "../../utils/clock.js";
import { updateAgentStatus } from "../agents/agent.service.js";
import { recordDecision } from "../decisions/decision.service.js";
import { sendMessage } from "../messaging/message.service.js";

/**
 * Suspend an agent — freeze it and reassign its tasks.
 */
export function suspendAgent(
  agentId: string,
  reason: string,
  requestingAgentId: string
): { reassignedTaskIds: string[] } {
  const db = getDb();
  updateAgentStatus(agentId, "suspended");

  // Reassign active tasks
  const activeTasks = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.assignedAgentId, agentId),
        sql`${tasks.status} IN ('assigned', 'in_progress')`
      )
    )
    .all();

  const reassignedTaskIds: string[] = [];
  for (const task of activeTasks) {
    db.update(tasks)
      .set({
        status: "pending" as const,
        assignedAgentId: null,
        assignedAt: null,
        startedAt: null,
      })
      .where(eq(tasks.id, task.id))
      .run();
    reassignedTaskIds.push(task.id);
  }

  recordDecision({
    agentId: requestingAgentId,
    decisionType: "kill",
    targetAgentId: agentId,
    reasoning: `Suspended: ${reason}. ${reassignedTaskIds.length} tasks reassigned.`,
  });

  return { reassignedTaskIds };
}

/**
 * Permanently deactivate an agent.
 */
export function killAgent(
  agentId: string,
  reason: string,
  requestingAgentId: string
): void {
  const result = suspendAgent(agentId, reason, requestingAgentId);
  updateAgentStatus(agentId, "deactivated");
}

/**
 * Set cost budget for an agent.
 */
export function setAgentBudget(
  agentId: string,
  budgetUsd: number
): void {
  const db = getDb();
  db.update(agents)
    .set({ costBudgetUsd: budgetUsd, updatedAt: nowMs() })
    .where(eq(agents.id, agentId))
    .run();
}

/**
 * Get a dashboard summary of the system.
 */
export function getDashboard(): {
  agents: {
    total: number;
    byStatus: Record<string, number>;
    byRole: Record<string, number>;
  };
  tasks: {
    total: number;
    byStatus: Record<string, number>;
  };
  costs: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
} {
  const db = getDb();

  // Agent stats
  const allAgents = db
    .select({ status: agents.status, role: agents.role })
    .from(agents)
    .all();

  const agentsByStatus: Record<string, number> = {};
  const agentsByRole: Record<string, number> = {};
  for (const a of allAgents) {
    agentsByStatus[a.status] = (agentsByStatus[a.status] ?? 0) + 1;
    agentsByRole[a.role] = (agentsByRole[a.role] ?? 0) + 1;
  }

  // Task stats
  const allTasks = db
    .select({ status: tasks.status })
    .from(tasks)
    .all();

  const tasksByStatus: Record<string, number> = {};
  for (const t of allTasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
  }

  // Cost stats
  const costRow = db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      totalInput: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
    })
    .from(tokenUsage)
    .get();

  return {
    agents: {
      total: allAgents.length,
      byStatus: agentsByStatus,
      byRole: agentsByRole,
    },
    tasks: {
      total: allTasks.length,
      byStatus: tasksByStatus,
    },
    costs: {
      totalCostUsd: costRow?.totalCost ?? 0,
      totalInputTokens: costRow?.totalInput ?? 0,
      totalOutputTokens: costRow?.totalOutput ?? 0,
    },
  };
}

/**
 * Find stale tasks (in_progress for too long).
 */
export function findStaleTasks(
  thresholdMs: number = 600000 // 10 minutes default
): { id: string; title: string; assignedAgentId: string | null; startedAt: number }[] {
  const db = getDb();
  const cutoff = nowMs() - thresholdMs;

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      assignedAgentId: tasks.assignedAgentId,
      startedAt: tasks.startedAt,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "in_progress"),
        sql`${tasks.startedAt} IS NOT NULL AND ${tasks.startedAt} < ${cutoff}`
      )
    )
    .all() as any[];
}
