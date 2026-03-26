/**
 * Compactor — auto-summarize old messages when session grows too long.
 *
 * Pattern from OpenClaw: "flush durable memories" before compaction,
 * summarize older messages, keep recent intact.
 * Summary chains: new_summary = old_summary + summarize(old_messages)
 */

import { getDb } from "../../db/connection.js";
import { conversationSessions } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const COMPACT_THRESHOLD = 30; // trigger when > 30 messages
const KEEP_RECENT = 15;       // keep 15 newest messages after compact

export interface CompactResult {
  compacted: boolean;
  summarizedCount: number;
  keptCount: number;
  newSummary: string;
}

export async function compactSession(
  sessionId: string,
  summarizer: (text: string) => Promise<string>,
): Promise<CompactResult> {
  const db = getDb();

  // Load session
  const session = (await db.select().from(conversationSessions)
    .where(eq(conversationSessions.id, sessionId)).limit(1))[0];
  if (!session) return { compacted: false, summarizedCount: 0, keptCount: 0, newSummary: "" };

  const state = (typeof session.state === "string" ? JSON.parse(session.state) : session.state) as any;
  const messages = state?.messages ?? [];

  // Check threshold
  if (messages.length <= COMPACT_THRESHOLD) {
    return { compacted: false, summarizedCount: 0, keptCount: messages.length, newSummary: state?.summary ?? "" };
  }

  console.error(`[Compactor] Session ${sessionId.substring(0, 8)}: ${messages.length} messages > ${COMPACT_THRESHOLD} threshold → compacting`);

  // Split: old messages to summarize + recent to keep
  const toSummarize = messages.slice(0, -KEEP_RECENT);
  const toKeep = messages.slice(-KEEP_RECENT);

  // Build text to summarize
  const oldSummary = state?.summary ?? "";
  const textToSummarize = [
    oldSummary ? `[Tóm tắt trước đó]: ${oldSummary}` : "",
    ...toSummarize.map((m: any) =>
      `${m.role === "user" ? "User" : "Bot"}: ${(m.content as string).substring(0, 200)}`
    ),
  ].filter(Boolean).join("\n");

  // Summarize using provided summarizer (fast-api, cheap)
  let newSummary: string;
  try {
    newSummary = await summarizer(textToSummarize);
    console.error(`[Compactor] Summary: ${newSummary.length} chars from ${toSummarize.length} messages`);
  } catch (e: any) {
    console.error(`[Compactor] Summarize failed: ${e.message} — keeping messages as-is`);
    return { compacted: false, summarizedCount: 0, keptCount: messages.length, newSummary: oldSummary };
  }

  // Update session: replace messages with recent only + new summary
  const newState = {
    ...state,
    messages: toKeep,
    summary: newSummary,
  };

  await db.update(conversationSessions)
    .set({ state: newState })
    .where(eq(conversationSessions.id, sessionId));

  console.error(`[Compactor] Done: ${toSummarize.length} summarized, ${toKeep.length} kept`);

  return {
    compacted: true,
    summarizedCount: toSummarize.length,
    keptCount: toKeep.length,
    newSummary,
  };
}
