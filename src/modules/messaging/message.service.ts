import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { messages } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";
import {
  type MessageRecord,
  type MessageType,
  type MessageStatus,
  type SendMessageInput,
} from "./message.types.js";
import { getDescendants } from "../hierarchy/hierarchy.queries.js";

function toRecord(row: any): MessageRecord {
  return {
    ...row,
    payload: row.payload as any,
  };
}

/**
 * Send a message to another agent.
 */
export function sendMessage(input: SendMessageInput): MessageRecord {
  const db = getDb();
  const now = nowMs();
  const id = newId();

  const record = {
    id,
    type: input.type,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId ?? null,
    taskId: input.taskId ?? null,
    priority: input.priority ?? 3,
    payload: JSON.stringify(input.payload),
    status: "pending" as const,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    deliveredAt: null,
    acknowledgedAt: null,
  };

  db.insert(messages).values(record).run();

  return {
    ...record,
    payload: input.payload,
    status: "pending",
  };
}

/**
 * Poll pending messages for an agent.
 */
export function checkMessages(filters: {
  agentId: string;
  type?: MessageType;
  since?: number;
  limit?: number;
}): MessageRecord[] {
  const db = getDb();
  const now = nowMs();
  const conditions: any[] = [
    eq(messages.toAgentId, filters.agentId),
    eq(messages.status, "pending"),
  ];

  if (filters.type) {
    conditions.push(eq(messages.type, filters.type));
  }
  if (filters.since) {
    conditions.push(sql`${messages.createdAt} >= ${filters.since}`);
  }

  // Expire old messages first
  db.update(messages)
    .set({ status: "expired" as const })
    .where(
      and(
        eq(messages.status, "pending"),
        sql`${messages.expiresAt} IS NOT NULL AND ${messages.expiresAt} < ${now}`
      )
    )
    .run();

  const rows = db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.priority), messages.createdAt)
    .limit(filters.limit ?? 20)
    .all();

  // Mark as delivered
  for (const row of rows) {
    db.update(messages)
      .set({ status: "delivered" as const, deliveredAt: now })
      .where(eq(messages.id, row.id))
      .run();
  }

  return rows.map(toRecord);
}

/**
 * Acknowledge a message.
 */
export function acknowledgeMessage(
  messageId: string,
  agentId: string
): void {
  const db = getDb();
  const now = nowMs();

  const msg = db
    .select({ toAgentId: messages.toAgentId, status: messages.status })
    .from(messages)
    .where(eq(messages.id, messageId))
    .get();

  if (!msg) throw new Error(`Message ${messageId} not found`);
  if (msg.toAgentId !== agentId) {
    throw new Error(`Message ${messageId} is not addressed to agent ${agentId}`);
  }

  db.update(messages)
    .set({ status: "acknowledged" as const, acknowledgedAt: now })
    .where(eq(messages.id, messageId))
    .run();
}

/**
 * Broadcast a message to all agents in a scope.
 * Scope: 'all' | 'subordinates' | 'level:worker' | 'level:specialist' etc.
 */
export function broadcast(
  fromAgentId: string,
  scope: string,
  payload: Record<string, unknown>,
  taskId?: string
): MessageRecord[] {
  const db = getDb();
  let targetIds: string[] = [];

  if (scope === "all") {
    // All agents except sender — get from hierarchy
    const allDesc = getDescendants(fromAgentId);
    targetIds = allDesc.map((d) => d.descendantId);
  } else if (scope === "subordinates") {
    const descendants = getDescendants(fromAgentId);
    targetIds = descendants.map((d) => d.descendantId);
  } else if (scope.startsWith("level:")) {
    const level = scope.replace("level:", "");
    // Get subordinates then filter by role
    const { agents } = require("../../db/schema.js");
    const descendants = getDescendants(fromAgentId);
    const descIds = descendants.map((d) => d.descendantId);
    const agentRows = db
      .select({ id: agents.id, role: agents.role })
      .from(agents)
      .all()
      .filter((a: any) => descIds.includes(a.id) && a.role === level);
    targetIds = agentRows.map((a: any) => a.id);
  }

  const sent: MessageRecord[] = [];
  for (const toId of targetIds) {
    sent.push(
      sendMessage({
        fromAgentId,
        toAgentId: toId,
        type: "broadcast",
        taskId,
        payload,
        priority: 2,
      })
    );
  }

  return sent;
}

/**
 * Get message by ID.
 */
export function getMessage(messageId: string): MessageRecord | null {
  const db = getDb();
  const row = db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .get();
  return row ? toRecord(row) : null;
}
