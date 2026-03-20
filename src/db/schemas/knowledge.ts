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
// knowledge_entries
// ============================================================
export const knowledgeEntries = sqliteTable(
  "knowledge_entries",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: [
        "lesson_learned",
        "best_practice",
        "anti_pattern",
        "domain_knowledge",
        "procedure",
      ],
    }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    domain: text("domain").notNull(),
    tags: text("tags", { mode: "json" }).notNull().default("[]"),
    sourceTaskId: text("source_task_id").references(() => tasks.id),
    sourceAgentId: text("source_agent_id")
      .notNull()
      .references(() => agents.id),
    scope: text("scope").notNull(),
    relevanceScore: real("relevance_score").notNull().default(0.5),
    confidence: real("confidence").notNull().default(0.5),
    usageCount: integer("usage_count").notNull().default(0),
    upvotes: integer("upvotes").notNull().default(0),
    downvotes: integer("downvotes").notNull().default(0),
    outcome: text("outcome", {
      enum: ["success", "failure", "neutral"],
    }),
    contextSnapshot: text("context_snapshot", { mode: "json" }),
    supersededById: text("superseded_by_id").references(
      (): any => knowledgeEntries.id
    ),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_knowledge_domain").on(table.domain),
    index("idx_knowledge_scope").on(table.scope),
    index("idx_knowledge_type").on(table.type),
    index("idx_knowledge_source_agent").on(table.sourceAgentId),
  ]
);

// ============================================================
// knowledge_votes
// ============================================================
export const knowledgeVotes = sqliteTable(
  "knowledge_votes",
  {
    id: text("id").primaryKey(),
    knowledgeId: text("knowledge_id")
      .notNull()
      .references(() => knowledgeEntries.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    vote: integer("vote").notNull(),
    comment: text("comment"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_knowledge_votes_unique").on(
      table.knowledgeId,
      table.agentId
    ),
  ]
);

// ============================================================
// knowledge_applications
// ============================================================
export const knowledgeApplications = sqliteTable(
  "knowledge_applications",
  {
    id: text("id").primaryKey(),
    knowledgeId: text("knowledge_id")
      .notNull()
      .references(() => knowledgeEntries.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    wasHelpful: integer("was_helpful"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_knowledge_apps_knowledge").on(table.knowledgeId),
    index("idx_knowledge_apps_task").on(table.taskId),
  ]
);
