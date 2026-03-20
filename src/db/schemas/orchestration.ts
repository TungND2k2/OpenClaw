import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { agents } from "./agents.js";
import { tasks } from "./tasks.js";

// ============================================================
// messages
// ============================================================
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: [
        "command",
        "report",
        "request",
        "broadcast",
        "escalation",
        "coordination",
      ],
    }).notNull(),
    fromAgentId: text("from_agent_id").notNull(), // no FK — allows "system"
    toAgentId: text("to_agent_id"),
    taskId: text("task_id").references(() => tasks.id),
    priority: integer("priority").notNull().default(3),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status", {
      enum: ["pending", "delivered", "acknowledged", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    deliveredAt: integer("delivered_at"),
    acknowledgedAt: integer("acknowledged_at"),
  },
  (table) => [
    index("idx_messages_to_agent_status").on(table.toAgentId, table.status),
    index("idx_messages_task").on(table.taskId),
    index("idx_messages_created").on(table.createdAt),
  ]
);

// ============================================================
// decisions
// ============================================================
export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(), // no FK — allows "system" as agent
    decisionType: text("decision_type", {
      enum: [
        "decompose",
        "assign",
        "reassign",
        "retry",
        "escalate",
        "cancel",
        "promote",
        "demote",
        "spawn",
        "kill",
      ],
    }).notNull(),
    taskId: text("task_id").references(() => tasks.id),
    targetAgentId: text("target_agent_id"), // no FK — allows "system"
    reasoning: text("reasoning").notNull(),
    inputContext: text("input_context", { mode: "json" }),
    outcome: text("outcome"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_decisions_agent").on(table.agentId),
    index("idx_decisions_task").on(table.taskId),
    index("idx_decisions_type").on(table.decisionType),
    index("idx_decisions_created").on(table.createdAt),
  ]
);

// ============================================================
// execution_plans
// ============================================================
export const executionPlans = sqliteTable(
  "execution_plans",
  {
    id: text("id").primaryKey(),
    rootTaskId: text("root_task_id")
      .notNull()
      .references(() => tasks.id),
    createdByAgentId: text("created_by_agent_id")
      .notNull()
      .references(() => agents.id),
    strategy: text("strategy", {
      enum: ["sequential", "parallel", "pipeline", "mixed"],
    }).notNull(),
    planGraph: text("plan_graph", { mode: "json" }).notNull(),
    status: text("status", {
      enum: ["draft", "active", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_exec_plans_root_task").on(table.rootTaskId),
    index("idx_exec_plans_status").on(table.status),
  ]
);
