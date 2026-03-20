import type { BaseConnector, ConnectorConfig, SendResult } from "./base.connector.js";

export const webhookConnector: BaseConnector = {
  type: "webhook",

  async send(payload: Record<string, unknown>, config: ConnectorConfig): Promise<SendResult> {
    const url = config.url as string;
    if (!url) return { success: false, error: "No URL configured" };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.auth_header) headers["Authorization"] = config.auth_header as string;
      if (config.headers) Object.assign(headers, config.headers);

      const response = await fetch(url, {
        method: (config.method as string) ?? "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }

      return {
        success: response.ok,
        response: { status: response.status, body },
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async test(config: ConnectorConfig): Promise<SendResult> {
    return this.send({ test: true, timestamp: Date.now() }, config);
  },
};
