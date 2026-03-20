import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { agents } from "./agents.js";
import { tasks } from "./tasks.js";

// ============================================================
// notebooks
// ============================================================
export const notebooks = sqliteTable(
  "notebooks",
  {
    id: text("id").primaryKey(),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    contentType: text("content_type", {
      enum: ["text/markdown", "application/json", "text/plain"],
    })
      .notNull()
      .default("text/plain"),
    createdByAgentId: text("created_by_agent_id").references(() => agents.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_notebooks_ns_key").on(table.namespace, table.key),
    index("idx_notebooks_namespace").on(table.namespace),
  ]
);

// ============================================================
// token_usage
// ============================================================
export const tokenUsage = sqliteTable(
  "token_usage",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    taskId: text("task_id").references(() => tasks.id),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: real("cost_usd").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_token_usage_agent").on(table.agentId),
    index("idx_token_usage_task").on(table.taskId),
    index("idx_token_usage_created").on(table.createdAt),
  ]
);
