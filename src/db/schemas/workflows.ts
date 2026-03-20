import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { agents } from "./agents.js";
import { tasks } from "./tasks.js";
import { tenants } from "./tenants.js";

// ============================================================
// workflow_templates
// ============================================================
export const workflowTemplates = sqliteTable(
  "workflow_templates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    domain: text("domain"),
    version: integer("version").notNull().default(1),
    stages: text("stages", { mode: "json" }).notNull(),
    triggerConfig: text("trigger_config", { mode: "json" }),
    config: text("config", { mode: "json" }),
    status: text("status", {
      enum: ["draft", "active", "archived"],
    })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_wf_templates_tenant_name_ver").on(
      table.tenantId,
      table.name,
      table.version
    ),
    index("idx_wf_templates_tenant").on(table.tenantId),
    index("idx_wf_templates_domain").on(table.domain),
  ]
);

// ============================================================
// form_templates
// ============================================================
export const formTemplates = sqliteTable(
  "form_templates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    schema: text("schema", { mode: "json" }).notNull(),
    uiHints: text("ui_hints", { mode: "json" }),
    version: integer("version").notNull().default(1),
    status: text("status", {
      enum: ["active", "archived"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_form_templates_tenant").on(table.tenantId)]
);

// ============================================================
// business_rules
// ============================================================
export const businessRules = sqliteTable(
  "business_rules",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    domain: text("domain"),
    ruleType: text("rule_type", {
      enum: ["validation", "approval", "routing", "calculation", "auto_action"],
    }).notNull(),
    conditions: text("conditions", { mode: "json" }).notNull(),
    actions: text("actions", { mode: "json" }).notNull(),
    priority: integer("priority").notNull().default(0),
    status: text("status", {
      enum: ["active", "disabled"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_business_rules_tenant").on(table.tenantId),
    index("idx_business_rules_domain").on(table.domain),
    index("idx_business_rules_type").on(table.ruleType),
  ]
);

// ============================================================
// workflow_instances
// ============================================================
export const workflowInstances = sqliteTable(
  "workflow_instances",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    initiatedBy: text("initiated_by").notNull(),
    currentStageId: text("current_stage_id"),
    status: text("status", {
      enum: ["active", "paused", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("active"),
    formData: text("form_data", { mode: "json" }).notNull().default("{}"),
    contextData: text("context_data", { mode: "json" })
      .notNull()
      .default("{}"),
    taskId: text("task_id").references(() => tasks.id),
    conversationId: text("conversation_id"),
    channel: text("channel", {
      enum: ["telegram", "web", "api", "slack"],
    }),
    history: text("history", { mode: "json" }).notNull().default("[]"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("idx_wf_instances_template").on(table.templateId),
    index("idx_wf_instances_tenant").on(table.tenantId),
    index("idx_wf_instances_status").on(table.status),
    index("idx_wf_instances_task").on(table.taskId),
  ]
);

// ============================================================
// workflow_approvals
// ============================================================
export const workflowApprovals = sqliteTable(
  "workflow_approvals",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => workflowInstances.id),
    stageId: text("stage_id").notNull(),
    approverId: text("approver_id").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "escalated", "auto_approved"],
    })
      .notNull()
      .default("pending"),
    decisionReason: text("decision_reason"),
    autoApprovedByRuleId: text("auto_approved_by_rule_id").references(
      () => businessRules.id
    ),
    createdAt: integer("created_at").notNull(),
    decidedAt: integer("decided_at"),
  },
  (table) => [
    index("idx_wf_approvals_instance").on(table.instanceId),
    index("idx_wf_approvals_approver").on(table.approverId),
    index("idx_wf_approvals_status").on(table.status),
  ]
);

// ============================================================
// integrations
// ============================================================
export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    type: text("type", {
      enum: [
        "telegram",
        "webhook",
        "email",
        "slack",
        "whatsapp",
        "sms",
        "custom",
      ],
    }).notNull(),
    config: text("config", { mode: "json" }).notNull(),
    status: text("status", {
      enum: ["active", "disabled", "error"],
    })
      .notNull()
      .default("active"),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_integrations_tenant").on(table.tenantId),
    index("idx_integrations_type").on(table.type),
  ]
);

// ============================================================
// conversation_sessions
// ============================================================
export const conversationSessions = sqliteTable(
  "conversation_sessions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    channel: text("channel", {
      enum: ["telegram", "web", "slack"],
    }).notNull(),
    channelUserId: text("channel_user_id").notNull(),
    userName: text("user_name"),
    userRole: text("user_role"),
    activeInstanceId: text("active_instance_id").references(
      () => workflowInstances.id
    ),
    state: text("state", { mode: "json" }).notNull().default("{}"),
    lastMessageAt: integer("last_message_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_conv_sessions_tenant").on(table.tenantId),
    index("idx_conv_sessions_channel_user").on(
      table.channel,
      table.channelUserId
    ),
    index("idx_conv_sessions_active_instance").on(table.activeInstanceId),
  ]
);
