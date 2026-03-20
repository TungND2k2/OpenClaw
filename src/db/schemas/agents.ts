import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

// ============================================================
// agents
// ============================================================
export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role", {
      enum: ["commander", "supervisor", "specialist", "worker"],
    }).notNull(),
    authorityLevel: integer("authority_level").notNull(),
    capabilities: text("capabilities", { mode: "json" })
      .notNull()
      .default("[]"),
    parentAgentId: text("parent_agent_id").references(
      (): any => agents.id
    ),
    status: text("status", {
      enum: [
        "registering",
        "idle",
        "busy",
        "suspended",
        "offline",
        "deactivated",
      ],
    })
      .notNull()
      .default("registering"),
    performanceScore: real("performance_score").notNull().default(0.5),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    tasksFailed: integer("tasks_failed").notNull().default(0),
    maxConcurrentTasks: integer("max_concurrent_tasks").notNull().default(1),
    costBudgetUsd: real("cost_budget_usd"),
    costSpentUsd: real("cost_spent_usd").notNull().default(0.0),
    config: text("config", { mode: "json" }).default("{}"),
    lastHeartbeat: integer("last_heartbeat"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_agents_status").on(table.status),
    index("idx_agents_role").on(table.role),
    index("idx_agents_parent").on(table.parentAgentId),
  ]
);

// ============================================================
// agent_hierarchy (closure table)
// ============================================================
export const agentHierarchy = sqliteTable(
  "agent_hierarchy",
  {
    ancestorId: text("ancestor_id")
      .notNull()
      .references(() => agents.id),
    descendantId: text("descendant_id")
      .notNull()
      .references(() => agents.id),
    depth: integer("depth").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ancestorId, table.descendantId] }),
    index("idx_hierarchy_descendant").on(table.descendantId),
    index("idx_hierarchy_depth").on(table.depth),
  ]
);
