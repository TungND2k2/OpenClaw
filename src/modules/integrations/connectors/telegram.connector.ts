import type { BaseConnector, ConnectorConfig, SendResult } from "./base.connector.js";

export const telegramConnector: BaseConnector = {
  type: "telegram",

  async send(payload: Record<string, unknown>, config: ConnectorConfig): Promise<SendResult> {
    const botToken = config.bot_token as string;
    const chatId = payload.chat_id ?? config.default_chat_id;
    const text = payload.text as string;

    if (!botToken) return { success: false, error: "No bot_token configured" };
    if (!chatId) return { success: false, error: "No chat_id provided" };
    if (!text) return { success: false, error: "No text provided" };

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: payload.parse_mode ?? "HTML",
        }),
        signal: AbortSignal.timeout(10000),
      });

      const body = await response.json() as { ok: boolean; description?: string };
      return {
        success: response.ok && body.ok,
        response: body,
        error: body.ok ? undefined : body.description,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async test(config: ConnectorConfig): Promise<SendResult> {
    // Just validate token format
    const token = config.bot_token as string;
    if (!token || !token.includes(":")) {
      return { success: false, error: "Invalid bot token format" };
    }
    return { success: true, response: { message: "Token format valid" } };
  },
};
