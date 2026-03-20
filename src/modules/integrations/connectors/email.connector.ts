import type { BaseConnector, ConnectorConfig, SendResult } from "./base.connector.js";

export const emailConnector: BaseConnector = {
  type: "email",

  async send(payload: Record<string, unknown>, config: ConnectorConfig): Promise<SendResult> {
    // Email sending requires an external service (SendGrid, SES, SMTP)
    // This is a stub that logs the intent — real implementation plugs in here
    const to = payload.to as string;
    const subject = payload.subject as string;
    const body = payload.body as string;

    if (!to) return { success: false, error: "No recipient (to)" };
    if (!subject) return { success: false, error: "No subject" };

    const provider = config.provider as string ?? "stub";

    if (provider === "webhook") {
      // Forward to a webhook-based email service
      const webhookUrl = config.webhook_url as string;
      if (!webhookUrl) return { success: false, error: "No webhook_url for email provider" };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject, body, ...payload }),
          signal: AbortSignal.timeout(15000),
        });
        return { success: response.ok, response: { status: response.status } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    // Stub mode — just return success for local testing
    return {
      success: true,
      response: { provider: "stub", to, subject, message: "Email queued (stub mode)" },
    };
  },

  async test(config: ConnectorConfig): Promise<SendResult> {
    return { success: true, response: { provider: config.provider ?? "stub", status: "config_valid" } };
  },
};
