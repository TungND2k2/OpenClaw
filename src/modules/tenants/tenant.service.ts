import { eq } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { tenants } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";

export interface TenantRecord {
  id: string;
  name: string;
  config: Record<string, unknown>;
  aiConfig: Record<string, unknown>;
  status: "active" | "suspended" | "archived";
  createdAt: number;
  updatedAt: number;
}

export function createTenant(input: {
  name: string;
  config?: Record<string, unknown>;
  aiConfig?: Record<string, unknown>;
}): TenantRecord {
  const db = getDb();
  const now = nowMs();
  const id = newId();
  db.insert(tenants).values({
    id,
    name: input.name,
    config: JSON.stringify(input.config ?? {}),
    aiConfig: JSON.stringify(input.aiConfig ?? {}),
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).run();
  return { id, name: input.name, config: input.config ?? {}, aiConfig: input.aiConfig ?? {}, status: "active", createdAt: now, updatedAt: now };
}

export function getTenant(tenantId: string): TenantRecord | null {
  const db = getDb();
  const row = db.select().from(tenants).where(eq(tenants.id, tenantId)).get();
  if (!row) return null;
  return { ...row, config: row.config as any, aiConfig: row.aiConfig as any, status: row.status as any };
}

export function updateTenant(tenantId: string, updates: Partial<Pick<TenantRecord, "config" | "aiConfig" | "status">>): void {
  const db = getDb();
  const set: Record<string, any> = { updatedAt: nowMs() };
  if (updates.config) set.config = JSON.stringify(updates.config);
  if (updates.aiConfig) set.aiConfig = JSON.stringify(updates.aiConfig);
  if (updates.status) set.status = updates.status;
  db.update(tenants).set(set).where(eq(tenants.id, tenantId)).run();
}
