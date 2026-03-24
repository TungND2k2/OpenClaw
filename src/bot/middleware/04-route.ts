/**
 * Route Middleware — detects engine (fast-api vs CLI) and loads persona list.
 */

import { getPersonas } from "../../modules/agents/persona-conversation.js";
import { detectEngine } from "../../modules/agents/agent-runner.js";
import type { PipelineContext } from "./types.js";

export async function routeMiddleware(ctx: PipelineContext): Promise<void> {
  await ctx.onProgress?.("🤖 Commander đang suy nghĩ...");

  // Hybrid routing — simple questions → fast-api (2s), complex → CLI (15s)
  const topScore = ctx.knowledgeEntries.length > 0 ? ctx.knowledgeEntries[0].matchScore : 0;
  ctx.engine = detectEngine(ctx.userMessage, topScore, true);
  console.error(`[Pipeline] Engine: ${ctx.engine} (score: ${topScore.toFixed(2)})`);

  // Load personas for potential multi-persona conversation
  ctx.personas = await getPersonas(ctx.tenantId);
  console.error(`[Pipeline] Personas found: ${ctx.personas.length} (${ctx.personas.map((p: any) => p.name).join(", ")})`);
}
