import { eq, and, sql, like } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { notebooks } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";

export type ContentType = "text/markdown" | "application/json" | "text/plain";

export interface NotebookEntry {
  id: string;
  namespace: string;
  key: string;
  value: string;
  contentType: ContentType;
  createdByAgentId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Write or update a notebook entry (upsert by namespace + key).
 */
export function notebookWrite(input: {
  namespace: string;
  key: string;
  value: string;
  contentType?: ContentType;
  agentId?: string;
}): NotebookEntry {
  const db = getDb();
  const now = nowMs();
  const contentType = input.contentType ?? "text/plain";

  // Check if entry exists
  const existing = db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(
      and(
        eq(notebooks.namespace, input.namespace),
        eq(notebooks.key, input.key)
      )
    )
    .get();

  if (existing) {
    db.update(notebooks)
      .set({
        value: input.value,
        contentType,
        updatedAt: now,
      })
      .where(eq(notebooks.id, existing.id))
      .run();

    return notebookRead(input.namespace, input.key)!;
  }

  const id = newId();
  const record = {
    id,
    namespace: input.namespace,
    key: input.key,
    value: input.value,
    contentType,
    createdByAgentId: input.agentId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(notebooks).values(record).run();

  return {
    ...record,
    contentType: contentType as ContentType,
  };
}

/**
 * Read a notebook entry by namespace + key.
 */
export function notebookRead(
  namespace: string,
  key: string
): NotebookEntry | null {
  const db = getDb();
  const row = db
    .select()
    .from(notebooks)
    .where(
      and(eq(notebooks.namespace, namespace), eq(notebooks.key, key))
    )
    .get();

  if (!row) return null;

  return {
    ...row,
    contentType: row.contentType as ContentType,
  };
}

/**
 * List entries in a namespace, optionally filtered by key prefix.
 */
export function notebookList(
  namespace: string,
  keyPrefix?: string
): { key: string; contentType: ContentType; updatedAt: number }[] {
  const db = getDb();
  const conditions: any[] = [eq(notebooks.namespace, namespace)];

  if (keyPrefix) {
    conditions.push(like(notebooks.key, `${keyPrefix}%`));
  }

  const rows = db
    .select({
      key: notebooks.key,
      contentType: notebooks.contentType,
      updatedAt: notebooks.updatedAt,
    })
    .from(notebooks)
    .where(and(...conditions))
    .all();

  return rows.map((r) => ({
    key: r.key,
    contentType: r.contentType as ContentType,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Delete a notebook entry.
 */
export function notebookDelete(namespace: string, key: string): boolean {
  const db = getDb();
  const result = db
    .delete(notebooks)
    .where(
      and(eq(notebooks.namespace, namespace), eq(notebooks.key, key))
    )
    .run();
  return result.changes > 0;
}
