/**
 * Telegram Bot — TRANSPORT LAYER with MESSAGE QUEUE.
 *
 * Flow:
 *   Poll updates → enqueue jobs → workers process concurrently → send responses
 *
 * No blocking. No hardcoded intents. Commander decides everything.
 */

import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { getConfig } from "../config.js";
import { processWithCommander } from "./agent-bridge.js";
import { MessageQueue, type QueueJob } from "./message-queue.js";
import { getOrCreateSession, appendMessage } from "../modules/conversations/conversation.service.js";
import { getTenant } from "../modules/tenants/tenant.service.js";
import { getDb } from "../db/connection.js";
import { tenantUsers } from "../db/schema.js";
import { newId } from "../utils/id.js";

const TELEGRAM_API = "https://api.telegram.org/bot";
let _running = false;
let _offset = 0;
let _queue: MessageQueue;

// ── Telegram API ─────────────────────────────────────────────

async function callTelegram(method: string, params: Record<string, unknown>): Promise<any> {
  const token = getConfig().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("No bot token");
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json() as { ok: boolean; result?: any; description?: string };
  if (!body.ok) throw new Error(`Telegram: ${body.description}`);
  return body.result;
}

async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    try {
      await callTelegram("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML" });
    } catch {
      await callTelegram("sendMessage", { chat_id: chatId, text: chunk.replace(/<[^>]*>/g, "") });
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { parts.push(remaining); break; }
    let split = remaining.lastIndexOf("\n", maxLen);
    if (split < maxLen / 2) split = maxLen;
    parts.push(remaining.substring(0, split));
    remaining = remaining.substring(split).trimStart();
  }
  return parts;
}

// ── User role from DB ────────────────────────────────────────

function getUserRole(telegramUserId: string, tenantId: string): string {
  const db = getDb();
  const row = db.select({ role: tenantUsers.role })
    .from(tenantUsers)
    .where(and(
      eq(tenantUsers.tenantId, tenantId),
      eq(tenantUsers.channel, "telegram"),
      eq(tenantUsers.channelUserId, telegramUserId),
      eq(tenantUsers.isActive, 1),
    )).get();
  return row?.role ?? "user";
}

// ── Job handler — processes one message through Commander ─────

async function handleJob(job: QueueJob): Promise<void> {
  const tenant = getTenant(job.tenantId);

  const session = getOrCreateSession({
    tenantId: job.tenantId,
    channel: "telegram",
    channelUserId: job.userId,
    userName: job.userName,
    userRole: job.userRole,
  });

  appendMessage(session.id, { role: "user", content: job.text, at: Date.now() });

  const state = session.state ?? { messages: [] };
  const history = (state.messages ?? []).map((m: any) => ({
    role: m.role as string,
    content: m.content as string,
  }));

  const response = await processWithCommander({
    userMessage: job.text,
    userName: job.userName,
    userId: job.userId,
    userRole: job.userRole,
    tenantId: job.tenantId,
    tenantName: tenant?.name ?? "OpenClaw",
    conversationHistory: history.slice(-15),
    aiConfig: (tenant?.aiConfig ?? {}) as Record<string, unknown>,
  });

  appendMessage(session.id, { role: "assistant", content: response, at: Date.now() });
  await sendTelegramMessage(job.chatId, response);
}

// ── Poll loop — lightweight, just enqueues ───────────────────

async function pollLoop(): Promise<void> {
  const config = getConfig();
  const tenantId = config.TELEGRAM_DEFAULT_TENANT_ID!;

  while (_running) {
    try {
      const updates = await callTelegram("getUpdates", {
        offset: _offset, timeout: 30, allowed_updates: ["message"],
      });

      for (const update of updates ?? []) {
        _offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;

        const userId = String(msg.from.id);
        const userName = msg.from.first_name ?? msg.from.username ?? "User";
        const userRole = getUserRole(userId, tenantId);

        const job: QueueJob = {
          id: newId(),
          chatId: msg.chat.id,
          userId,
          userName,
          userRole,
          text: msg.text.trim(),
          tenantId,
          priority: userRole === "admin" ? 1 : userRole === "manager" ? 2 : 5,
          createdAt: Date.now(),
          retries: 0,
          maxRetries: 2,
        };

        console.error(`[Bot] ${userName}(${userId})[${userRole}]: ${job.text.substring(0, 60)}`);
        _queue.enqueue(job);
      }
    } catch (e: any) {
      if (!e.message?.includes("timeout")) {
        console.error("[Bot] Poll error:", e.message);
      }
    }
  }
}

// ── Start/Stop ───────────────────────────────────────────────

export async function startTelegramBot(): Promise<void> {
  const config = getConfig();
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_DEFAULT_TENANT_ID) {
    console.error("[TelegramBot] Missing token or tenant ID, skipping");
    return;
  }

  try {
    const me = await callTelegram("getMe", {});
    console.error(`[TelegramBot] @${me.username} (${me.first_name}) — ready`);
  } catch (e: any) {
    console.error(`[TelegramBot] Connect failed: ${e.message}`);
    return;
  }

  // Create queue with concurrency
  _queue = new MessageQueue(handleJob, {
    concurrency: 5,
    maxQueueSize: 100,
    jobTimeoutMs: 60000,
  });
  _queue.start();

  _running = true;
  pollLoop().catch((e) => console.error("[TelegramBot] Fatal:", e));
}

export function stopTelegramBot(): void {
  _running = false;
  _queue?.stop();
}

/**
 * Get queue metrics (exposed for monitoring dashboard).
 */
export function getQueueMetrics() {
  return _queue?.getMetrics() ?? null;
}
