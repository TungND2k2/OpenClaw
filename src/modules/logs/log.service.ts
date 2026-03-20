import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { taskLogs } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  taskId: string;
  agentId: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

/**
 * Append a log entry for a task.
 */
export function writeLog(input: {
  taskId: string;
  agentId: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}): LogEntry {
  const db = getDb();
  const now = nowMs();
  const id = newId();

  const record = {
    id,
    taskId: input.taskId,
    agentId: input.agentId,
    level: input.level,
    message: input.message,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: now,
  };

  db.insert(taskLogs).values(record).run();

  return {
    id,
    taskId: input.taskId,
    agentId: input.agentId,
    level: input.level,
    message: input.message,
    metadata: input.metadata ?? null,
    createdAt: now,
  };
}

/**
 * Get logs for a task with optional filters.
 */
export function getLogs(filters: {
  taskId: string;
  level?: LogLevel;
  limit?: number;
  since?: number;
}): LogEntry[] {
  const db = getDb();
  const conditions: any[] = [eq(taskLogs.taskId, filters.taskId)];

  if (filters.level) {
    conditions.push(eq(taskLogs.level, filters.level));
  }
  if (filters.since) {
    conditions.push(sql`${taskLogs.createdAt} >= ${filters.since}`);
  }

  const rows = db
    .select()
    .from(taskLogs)
    .where(and(...conditions))
    .orderBy(desc(taskLogs.createdAt))
    .limit(filters.limit ?? 50)
    .all();

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    agentId: r.agentId,
    level: r.level as LogLevel,
    message: r.message,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}

/**
 * Get recent logs across all tasks for an agent.
 */
export function getAgentLogs(
  agentId: string,
  limit: number = 20
): LogEntry[] {
  const db = getDb();
  const rows = db
    .select()
    .from(taskLogs)
    .where(eq(taskLogs.agentId, agentId))
    .orderBy(desc(taskLogs.createdAt))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    agentId: r.agentId,
    level: r.level as LogLevel,
    message: r.message,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}
