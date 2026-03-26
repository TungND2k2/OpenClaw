/**
 * Bot Logger — logs everything the bot thinks, does, and says to DB.
 * Persistent — survives restart. Queryable by tenant + time.
 */

import { getDb } from "../../db/connection.js";
import { sql } from "drizzle-orm";
import { newId } from "../../utils/id.js";

export type LogType =
  | "user_message"      // user nhắn
  | "bot_response"      // bot trả lời
  | "thinking"          // bot đang suy nghĩ
  | "tool_call"         // bot gọi tool
  | "tool_result"       // kết quả tool
  | "knowledge_match"   // knowledge tìm được
  | "persona"           // persona trả lời
  | "error"             // lỗi
  | "system";           // hệ thống (startup, cron...)

export async function botLog(input: {
  tenantId: string;
  tenantName?: string;
  userId?: string;
  userName?: string;
  type: LogType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO bot_logs (id, tenant_id, tenant_name, user_id, user_name, type, content, metadata, created_at)
      VALUES (${newId()}, ${input.tenantId}, ${input.tenantName ?? null}, ${input.userId ?? null}, ${input.userName ?? null}, ${input.type}, ${input.content}, ${JSON.stringify(input.metadata ?? {})}::jsonb, ${Date.now()})
    `);
  } catch {}
}

export async function getLogs(tenantId?: string, limit = 100, sinceTs?: number) {
  const db = getDb();
  let q = `SELECT * FROM bot_logs`;
  const conditions: string[] = [];
  if (tenantId) conditions.push(`tenant_id = '${tenantId}'`);
  if (sinceTs) conditions.push(`created_at > ${sinceTs}`);
  if (conditions.length) q += ` WHERE ${conditions.join(" AND ")}`;
  q += ` ORDER BY created_at DESC LIMIT ${limit}`;
  const result = await db.execute(sql.raw(q));
  return result as any;
}
