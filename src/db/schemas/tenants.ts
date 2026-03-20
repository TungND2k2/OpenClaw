import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// ============================================================
// tenants
// ============================================================
export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).notNull().default("{}"),
    aiConfig: text("ai_config", { mode: "json" }).notNull().default("{}"),
    status: text("status", {
      enum: ["active", "suspended", "archived"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_tenants_status").on(table.status)]
);

// ============================================================
// tenant_users — maps external users (telegram, etc.) to roles
// ============================================================
export const tenantUsers = sqliteTable(
  "tenant_users",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    channel: text("channel").notNull(), // "telegram", "web", "slack"
    channelUserId: text("channel_user_id").notNull(), // telegram user ID, etc.
    displayName: text("display_name"),
    role: text("role", {
      enum: ["admin", "manager", "staff", "user"],
    })
      .notNull()
      .default("user"),
    permissions: text("permissions", { mode: "json" }).default("[]"), // granular permissions
    isActive: integer("is_active").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_tenant_users_channel_user").on(
      table.tenantId,
      table.channel,
      table.channelUserId
    ),
    index("idx_tenant_users_tenant").on(table.tenantId),
    index("idx_tenant_users_role").on(table.role),
  ]
);
