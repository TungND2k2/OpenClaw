/**
 * Learn Middleware — self-learning via mergeOrCreateRule after tool usage.
 * Also saves context for feedback detection on next turn.
 */

import { mergeOrCreateRule } from "../../modules/knowledge/knowledge.service.js";
import type { PipelineContext } from "./types.js";

export async function learnMiddleware(ctx: PipelineContext): Promise<void> {
  // ── Self-learning (intent-based, auto-merge) ────────────
  if (ctx.toolCalls.length > 0) {
    try {
      const tools = ctx.toolCalls.map(t => t.tool);
      const { action, ruleId } = await mergeOrCreateRule({
        tools,
        keywords: ctx.keywords,
        sourceAgentId: ctx.commanderAgentId,
        tenantId: ctx.tenantId,
      });
      console.error(`[Pipeline] ✓ Knowledge ${action}: ${[...new Set(tools)].join(",")} (${ruleId.substring(0, 8)})`);
    } catch (ke: any) {
      console.error(`[Pipeline] Knowledge save warn: ${ke.message}`);
    }
  }

  // ── Save context for feedback detection next turn ───────
  ctx.lastToolsCalledBySession.set(ctx.sessionId, ctx.toolCalls.map(t => t.tool));
}
