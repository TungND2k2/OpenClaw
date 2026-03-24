/**
 * Feedback Middleware — detects user feedback on previous bot response
 * and applies learning (positive/negative reinforcement).
 */

import { detectFeedback, applyFeedback } from "../../modules/knowledge/knowledge.service.js";
import type { PipelineContext } from "./types.js";

export async function feedbackMiddleware(ctx: PipelineContext): Promise<void> {
  const lastBotMsg = ctx.conversationHistory
    .filter(m => m.role === "assistant")
    .at(-1)?.content ?? "";
  const lastToolsCalled = ctx.lastToolsCalledBySession.get(ctx.sessionId) ?? [];

  if (!lastBotMsg || lastToolsCalled.length === 0) return;

  try {
    const { getConfig: gc } = await import("../../config.js");
    const cfg = gc();
    const feedback = await detectFeedback({
      userMessage: ctx.userMessage,
      prevBotResponse: lastBotMsg,
      workerApiBase: cfg.WORKER_API_BASE!,
      workerApiKey: cfg.WORKER_API_KEY!,
      workerModel: cfg.WORKER_MODEL!,
    });

    if (feedback !== "neutral") {
      await applyFeedback({
        feedback,
        userMessage: ctx.userMessage,
        lastToolsCalled,
        lastBotResponse: lastBotMsg,
      });
    }
  } catch (fbErr: any) {
    console.error(`[Pipeline] Feedback detect skipped: ${fbErr.message}`);
  }
}
