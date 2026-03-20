/**
 * Telegram Bot — TRANSPORT LAYER ONLY.
 * Receives messages → delegates to Commander agent → returns response.
 * NO hardcoded intents, NO regex matching. Commander decides everything.
 */

import { getConfig } from "../config.js";
import { eq, and } from "drizzle-orm";
import { processWithCommander } from "./agent-bridge.js";
import { getOrCreateSession, appendMessage } from "../modules/conversations/conversation.service.js";
import { getTenant } from "../modules/tenants/tenant.service.js";
import { getDb } from "../db/connection.js";
import { tenantUsers } from "../db/schema.js";

const TELEGRAM_API = "https://api.telegram.org/bot";
let _running = false;
let _offset = 0;

// ── Telegram API helpers ─────────────────────────────────────

async function callTelegram(method: string, params: Record<string, unknown>): Promise<any> {
  const config = getConfig();
  const token = config.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json() as { ok: boolean; result?: any; description?: string };
  if (!body.ok) throw new Error(`Telegram API: ${body.description}`);
  return body.result;
}

async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  // Telegram limit: 4096 chars
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    try {
      await callTelegram("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML" });
    } catch {
      // Fallback without HTML if parse fails
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

async function getUpdates(offset: number): Promise<any[]> {
  try {
    return await callTelegram("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] }) ?? [];
  } catch (e: any) {
    if (!e.message?.includes("timeout")) console.error("[TelegramBot] Poll error:", e.message);
    return [];
  }
}

// ── Get user role from DB ────────────────────────────────────

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

// ── Message handler — delegates everything to Commander ──────

async function handleMessage(msg: any): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const userId = String(msg.from.id);
  const userName = msg.from.first_name ?? msg.from.username ?? "User";

  if (!text) return;

  const config = getConfig();
  const tenantId = config.TELEGRAM_DEFAULT_TENANT_ID;
  if (!tenantId) {
    await sendTelegramMessage(chatId, "⚠️ Bot chưa cấu hình. Liên hệ admin.");
    return;
  }

  const userRole = getUserRole(userId, tenantId);
  const tenant = getTenant(tenantId);

  // Get or create session
  const session = getOrCreateSession({
    tenantId,
    channel: "telegram",
    channelUserId: userId,
    userName,
    userRole,
  });

  console.error(`[Bot] ${userName}(${userId})[${userRole}]: ${text.substring(0, 60)}`);

  // Save user message
  appendMessage(session.id, { role: "user", content: text, at: Date.now() });

  // Get conversation history
  const state = session.state ?? { messages: [] };
  const history = (state.messages ?? []).map((m: any) => ({
    role: m.role as string,
    content: m.content as string,
  }));

  // Delegate to Commander — the agent decides everything
  const response = await processWithCommander({
    userMessage: text,
    userName,
    userId,
    userRole,
    tenantId,
    tenantName: tenant?.name ?? "OpenClaw",
    conversationHistory: history.slice(-15),
    aiConfig: (tenant?.aiConfig ?? {}) as Record<string, unknown>,
  });

  // Save assistant response
  appendMessage(session.id, { role: "assistant", content: response, at: Date.now() });

  // Send to Telegram
  await sendTelegramMessage(chatId, response);
}

// ── Long-polling loop ────────────────────────────────────────

async function pollLoop(): Promise<void> {
  while (_running) {
    const updates = await getUpdates(_offset);
    for (const update of updates) {
      _offset = update.update_id + 1;
      if (update.message) {
        try {
          await handleMessage(update.message);
        } catch (e: any) {
          console.error("[Bot] Error:", e.message);
          try { await sendTelegramMessage(update.message.chat.id, `⚠️ ${e.message}`); } catch {}
        }
      }
    }
  }
}

/**
 * Start Telegram bot.
 */
export async function startTelegramBot(): Promise<void> {
  const config = getConfig();
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.error("[TelegramBot] No token, skipping");
    return;
  }
  if (!config.TELEGRAM_DEFAULT_TENANT_ID) {
    console.error("[TelegramBot] No tenant ID, skipping");
    return;
  }

  try {
    const me = await callTelegram("getMe", {});
    console.error(`[TelegramBot] @${me.username} (${me.first_name}) — ready`);
  } catch (e: any) {
    console.error(`[TelegramBot] Connect failed: ${e.message}`);
    return;
  }

  _running = true;
  pollLoop().catch((e) => console.error("[TelegramBot] Fatal:", e));
}

/**
 * Stop Telegram bot.
 */
export function stopTelegramBot(): void {
  _running = false;
}
