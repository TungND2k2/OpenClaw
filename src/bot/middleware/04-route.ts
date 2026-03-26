/**
 * Route Middleware — decides engine + loads personas.
 */

import { getPersonas } from "../../modules/agents/persona-conversation.js";
import type { PipelineContext } from "./types.js";

const GREETING = /^(chào|hi|hello|hey|xin chào|ok|ừ|uh|cảm ơn|thanks|good|tốt|bye|tạm biệt|👋|🤝)[\s!.?]*$/i;

export async function routeMiddleware(ctx: PipelineContext): Promise<void> {
  const msg = ctx.userMessage.trim();

  // Greeting → fast-api
  if (msg.length < 20 && GREETING.test(msg)) {
    ctx.engine = "fast-api";
    ctx.personas = [];
    return;
  }

  // Default → CLI for accuracy
  ctx.engine = "claude-cli";
  ctx.personas = await getPersonas(ctx.tenantId);
}
