import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { agents } from "./agents.js";

// ============================================================
// tasks
// ============================================================
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: [
        "pending",
        "assigned",
        "in_progress",
        "delegated",
        "blocked",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending"),
    priority: integer("priority").notNull().default(3),
    urgency: integer("urgency").notNull().default(3),
    assignedAgentId: text("assigned_agent_id").references(() => agents.id),
    createdByAgentId: text("created_by_agent_id").references(() => agents.id),
    delegatedByAgentId: text("delegated_by_agent_id"), // no FK — allows "system"
    parentTaskId: text("parent_task_id").references((): any => tasks.id),
    executionStrategy: text("execution_strategy", {
      enum: ["sequential", "parallel", "pipeline", "swarm"],
    }),
    dependencyIds: text("dependency_ids", { mode: "json" }).default("[]"),
    depth: integer("depth").notNull().default(0),
    maxDepth: integer("max_depth").notNull().default(5),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    escalationAgentId: text("escalation_agent_id").references(() => agents.id),
    requiredCapabilities: text("required_capabilities", {
      mode: "json",
    }).default("[]"),
    estimatedDurationMs: integer("estimated_duration_ms"),
    costBudgetUsd: real("cost_budget_usd"),
    costSpentUsd: real("cost_spent_usd").notNull().default(0.0),
    tags: text("tags", { mode: "json" }).default("[]"),
    result: text("result"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    assignedAt: integer("assigned_at"),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    deadline: integer("deadline"),
  },
  (table) => [
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_assigned_agent").on(table.assignedAgentId),
    index("idx_tasks_parent").on(table.parentTaskId),
    index("idx_tasks_priority_urgency").on(table.priority, table.urgency),
    index("idx_tasks_created_by").on(table.createdByAgentId),
  ]
);

// ============================================================
// task_dependencies
// ============================================================
export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => tasks.id),
    status: text("status", {
      enum: ["pending", "satisfied", "failed"],
    })
      .notNull()
      .default("pending"),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnId] }),
    index("idx_task_deps_depends_on").on(table.dependsOnId),
  ]
);

// ============================================================
// task_logs
// ============================================================
export const taskLogs = sqliteTable(
  "task_logs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    level: text("level", {
      enum: ["debug", "info", "warn", "error"],
    }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_task_logs_task").on(table.taskId),
    index("idx_task_logs_agent").on(table.agentId),
    index("idx_task_logs_created").on(table.createdAt),
  ]
);
