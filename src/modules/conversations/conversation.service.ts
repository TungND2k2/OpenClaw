import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { conversationSessions } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  at: number;
}

export interface ConversationSession {
  id: string;
  tenantId: string;
  channel: string;
  channelUserId: string;
  userName: string | null;
  userRole: string | null;
  activeInstanceId: string | null;
  state: { messages: ChatMessage[]; [key: string]: unknown };
  lastMessageAt: number;
  createdAt: number;
}

function toSession(row: any): ConversationSession {
  let state = row.state;
  if (typeof state === "string") {
    try { state = JSON.parse(state); } catch { state = { messages: [] }; }
  }
  return { ...row, state: state ?? { messages: [] } };
}

/**
 * Find or create a conversation session.
 */
export function getOrCreateSession(input: {
  tenantId: string;
  channel: "telegram" | "web" | "slack";
  channelUserId: string;
  userName?: string;
  userRole?: string;
}): ConversationSession {
  const db = getDb();

  const existing = db.select().from(conversationSessions).where(
    and(
      eq(conversationSessions.tenantId, input.tenantId),
      eq(conversationSessions.channel, input.channel),
      eq(conversationSessions.channelUserId, input.channelUserId),
    )
  ).get();

  if (existing) return toSession(existing);

  const now = nowMs();
  const id = newId();
  db.insert(conversationSessions).values({
    id,
    tenantId: input.tenantId,
    channel: input.channel,
    channelUserId: input.channelUserId,
    userName: input.userName ?? null,
    userRole: input.userRole ?? null,
    state: JSON.stringify({ messages: [] }),
    lastMessageAt: now,
    createdAt: now,
  }).run();

  return toSession(db.select().from(conversationSessions).where(eq(conversationSessions.id, id)).get()!);
}

/**
 * Append a message to session.
 */
export function appendMessage(sessionId: string, message: ChatMessage): ConversationSession {
  const db = getDb();
  const now = nowMs();
  const session = db.select().from(conversationSessions).where(eq(conversationSessions.id, sessionId)).get();
  if (!session) throw new Error(`Session ${sessionId} not found`);

  let state = session.state as any;
  if (typeof state === "string") {
    try { state = JSON.parse(state); } catch { state = { messages: [] }; }
  }
  state = state ?? { messages: [] };
  state.messages = state.messages ?? [];
  state.messages.push(message);

  db.update(conversationSessions).set({
    state: JSON.stringify(state),
    lastMessageAt: now,
  }).where(eq(conversationSessions.id, sessionId)).run();

  return toSession(db.select().from(conversationSessions).where(eq(conversationSessions.id, sessionId)).get()!);
}

/**
 * Link session to a workflow instance.
 */
export function linkToWorkflow(sessionId: string, instanceId: string): void {
  const db = getDb();
  db.update(conversationSessions).set({
    activeInstanceId: instanceId,
  }).where(eq(conversationSessions.id, sessionId)).run();
}

/**
 * Get session by ID.
 */
export function getSession(sessionId: string): ConversationSession | null {
  const db = getDb();
  const row = db.select().from(conversationSessions).where(eq(conversationSessions.id, sessionId)).get();
  return row ? toSession(row) : null;
}
