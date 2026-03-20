import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { tasks, taskDependencies } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";
import {
  type TaskStatus,
  type TaskRecord,
  type CreateTaskInput,
  VALID_TRANSITIONS,
} from "./task.types.js";

// ── Helpers ──────────────────────────────────────────────────

function toRecord(row: any): TaskRecord {
  return {
    ...row,
    dependencyIds: row.dependencyIds ?? [],
    requiredCapabilities: row.requiredCapabilities ?? [],
    tags: row.tags ?? [],
  } as TaskRecord;
}

function assertTransition(current: TaskStatus, next: TaskStatus): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new Error(
      `Invalid transition: ${current} → ${next}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}

// ── CRUD ─────────────────────────────────────────────────────

export function createTask(input: CreateTaskInput): TaskRecord {
  const db = getDb();
  const now = nowMs();
  const id = newId();

  // Calculate depth from parent
  let depth = 0;
  if (input.parentTaskId) {
    const parent = db
      .select({ depth: tasks.depth, maxDepth: tasks.maxDepth })
      .from(tasks)
      .where(eq(tasks.id, input.parentTaskId))
      .get();
    if (!parent) throw new Error(`Parent task ${input.parentTaskId} not found`);
    depth = parent.depth + 1;
    if (depth > parent.maxDepth) {
      throw new Error(
        `Max decomposition depth ${parent.maxDepth} exceeded (depth would be ${depth})`
      );
    }
  }

  const record = {
    id,
    title: input.title,
    description: input.description ?? null,
    status: "pending" as const,
    priority: input.priority ?? 3,
    urgency: input.urgency ?? 3,
    assignedAgentId: null,
    createdByAgentId: input.createdByAgentId ?? null,
    delegatedByAgentId: null,
    parentTaskId: input.parentTaskId ?? null,
    executionStrategy: input.executionStrategy ?? null,
    dependencyIds: "[]",
    depth,
    maxDepth: 5,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    escalationAgentId: null,
    requiredCapabilities: JSON.stringify(input.requiredCapabilities ?? []),
    estimatedDurationMs: input.estimatedDurationMs ?? null,
    costBudgetUsd: input.costBudgetUsd ?? null,
    costSpentUsd: 0.0,
    tags: JSON.stringify(input.tags ?? []),
    result: null,
    error: null,
    createdAt: now,
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    deadline: input.deadline ?? null,
  };

  db.insert(tasks).values(record).run();

  return toRecord({ ...record, dependencyIds: [], requiredCapabilities: input.requiredCapabilities ?? [], tags: input.tags ?? [] });
}

export function getTask(taskId: string): TaskRecord | null {
  const db = getDb();
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  return row ? toRecord(row) : null;
}

export function listTasks(filters?: {
  status?: TaskStatus;
  assignedTo?: string;
  priorityMin?: number;
  tags?: string[];
  parentTaskId?: string;
  limit?: number;
}): TaskRecord[] {
  const db = getDb();
  const conditions: any[] = [];

  if (filters?.status) {
    conditions.push(eq(tasks.status, filters.status));
  }
  if (filters?.assignedTo) {
    conditions.push(eq(tasks.assignedAgentId, filters.assignedTo));
  }
  if (filters?.priorityMin) {
    conditions.push(sql`${tasks.priority} >= ${filters.priorityMin}`);
  }
  if (filters?.parentTaskId) {
    conditions.push(eq(tasks.parentTaskId, filters.parentTaskId));
  }

  let query = db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.priority), desc(tasks.urgency))
    .limit(filters?.limit ?? 100);

  const rows = query.all();

  let result = rows;
  if (filters?.tags && filters.tags.length > 0) {
    result = rows.filter((r) => {
      const taskTags = (r.tags as unknown as string[]) ?? [];
      return filters.tags!.some((t) => taskTags.includes(t));
    });
  }

  return result.map(toRecord);
}

// ── Lifecycle transitions ────────────────────────────────────

/**
 * Agent claims an unassigned pending task.
 * Uses optimistic concurrency: only updates if status is still 'pending'.
 */
export function claimTask(taskId: string, agentId: string): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.status !== "pending") {
    throw new Error(`Task ${taskId} is ${task.status}, cannot claim`);
  }

  const result = db
    .update(tasks)
    .set({
      status: "assigned" as const,
      assignedAgentId: agentId,
      assignedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, "pending")))
    .run();

  if (result.changes === 0) {
    throw new Error(`Task ${taskId} was claimed by another agent`);
  }

  return getTask(taskId)!;
}

/**
 * Assign task to a specific agent (by commander/supervisor).
 */
export function assignTask(
  taskId: string,
  agentId: string,
  delegatedByAgentId: string
): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  assertTransition(task.status, "assigned");

  db.update(tasks)
    .set({
      status: "assigned" as const,
      assignedAgentId: agentId,
      delegatedByAgentId,
      assignedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Start working on an assigned task.
 */
export function startTask(taskId: string, agentId: string): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.assignedAgentId !== agentId) {
    throw new Error(`Task ${taskId} is not assigned to agent ${agentId}`);
  }
  assertTransition(task.status, "in_progress");

  db.update(tasks)
    .set({ status: "in_progress" as const, startedAt: now })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Complete a task with result.
 */
export function completeTask(
  taskId: string,
  agentId: string,
  result: string
): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.assignedAgentId !== agentId) {
    throw new Error(`Task ${taskId} is not assigned to agent ${agentId}`);
  }
  assertTransition(task.status, "completed");

  db.update(tasks)
    .set({
      status: "completed" as const,
      result,
      completedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  // Satisfy dependencies that depend on this task
  db.update(taskDependencies)
    .set({ status: "satisfied" as const })
    .where(eq(taskDependencies.dependsOnId, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Fail a task with error.
 */
export function failTask(
  taskId: string,
  agentId: string,
  error: string
): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.assignedAgentId !== agentId) {
    throw new Error(`Task ${taskId} is not assigned to agent ${agentId}`);
  }
  assertTransition(task.status, "failed");

  db.update(tasks)
    .set({
      status: "failed" as const,
      error,
      completedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  // Mark dependencies as failed
  db.update(taskDependencies)
    .set({ status: "failed" as const })
    .where(eq(taskDependencies.dependsOnId, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Cancel a task.
 */
export function cancelTask(taskId: string, reason?: string): TaskRecord {
  const db = getDb();
  const now = nowMs();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  assertTransition(task.status, "cancelled");

  db.update(tasks)
    .set({
      status: "cancelled" as const,
      error: reason ?? "cancelled",
      completedAt: now,
    })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Retry a failed task — resets to pending with incremented retry count.
 */
export function retryTask(taskId: string): TaskRecord {
  const db = getDb();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.status !== "failed") {
    throw new Error(`Task ${taskId} is ${task.status}, only failed tasks can be retried`);
  }
  if (task.retryCount >= task.maxRetries) {
    throw new Error(
      `Task ${taskId} has exhausted retries (${task.retryCount}/${task.maxRetries})`
    );
  }

  db.update(tasks)
    .set({
      status: "pending" as const,
      assignedAgentId: null,
      delegatedByAgentId: null,
      retryCount: task.retryCount + 1,
      error: null,
      assignedAt: null,
      startedAt: null,
      completedAt: null,
    })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Mark task as delegated (has subtasks).
 */
export function delegateTask(taskId: string): TaskRecord {
  const db = getDb();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  assertTransition(task.status, "delegated");

  db.update(tasks)
    .set({ status: "delegated" as const })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

/**
 * Mark task as blocked.
 */
export function blockTask(taskId: string): TaskRecord {
  const db = getDb();

  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  assertTransition(task.status, "blocked");

  db.update(tasks)
    .set({ status: "blocked" as const })
    .where(eq(tasks.id, taskId))
    .run();

  return getTask(taskId)!;
}

// ── Dependencies ─────────────────────────────────────────────

/**
 * Add a dependency: taskId depends on dependsOnId.
 */
export function addDependency(taskId: string, dependsOnId: string): void {
  const db = getDb();
  db.insert(taskDependencies)
    .values({ taskId, dependsOnId, status: "pending" })
    .run();
}

/**
 * Check if all dependencies of a task are satisfied.
 */
export function areDependenciesSatisfied(taskId: string): boolean {
  const db = getDb();
  const pending = db
    .select({ count: sql<number>`count(*)` })
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.taskId, taskId),
        sql`${taskDependencies.status} != 'satisfied'`
      )
    )
    .get();
  return (pending?.count ?? 0) === 0;
}

/**
 * Get subtasks of a parent task.
 */
export function getSubtasks(parentTaskId: string): TaskRecord[] {
  const db = getDb();
  const rows = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentTaskId, parentTaskId))
    .all();
  return rows.map(toRecord);
}
