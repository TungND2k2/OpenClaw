/**
 * Dynamic Collections — admin creates "tables" via chat, bot stores structured data.
 *
 * Like Google Sheets in DB:
 *   Admin: "tạo bảng đơn tìm vải gồm: mã đơn, loại vải, số lượng, deadline, ảnh, trạng thái"
 *   → Creates collection with schema
 *   Admin: "thêm đơn DV001 sọc xanh trắng 40m"
 *   → Inserts row into collection
 */

import { pgTable, text, integer, bigint, jsonb, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

// ── Collection Definitions (like table schemas) ──────────────

export const collections = pgTable("collections", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),              // "đơn tìm vải", "khách hàng"
  slug: text("slug").notNull(),              // "don-tim-vai", "khach-hang"
  description: text("description"),
  fields: jsonb("fields").notNull(),         // [{name, type, required}]
  createdBy: text("created_by"),             // telegram user id
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// ── Collection Rows (actual data) ────────────────────────────

export const collectionRows = pgTable("collection_rows", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull().references(() => collections.id),
  data: jsonb("data").notNull(),             // {mã_đơn: "DV001", loại_vải: "sọc xanh trắng", ...}
  createdBy: text("created_by"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
