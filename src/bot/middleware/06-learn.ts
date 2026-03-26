/**
 * Learn Middleware — NO auto-learn. Only explicit saves via tools.
 *
 * Pattern from OpenClaw: "If you want something to stick, ask the bot to write it."
 * User says "nhớ cái này" → bot calls save_knowledge tool → stored.
 * Bot does NOT auto-save every tool call as knowledge.
 */

import type { PipelineContext } from "./types.js";

export async function learnMiddleware(ctx: PipelineContext): Promise<void> {
  // Auto-learn REMOVED — was creating garbage knowledge entries.
  // Knowledge only saved when:
  //   1. User explicitly says "nhớ/lưu/ghi nhớ" → bot calls save_knowledge tool
  //   2. Bot calls update_instructions tool → updates tenant instructions
  //   3. Admin teaches bot via chat → bot calls save_knowledge

  // ── Save last tools for feedback detection next turn ───
  if (ctx.toolCalls.length > 0) {
    ctx.lastToolsCalledBySession.set(ctx.sessionId, ctx.toolCalls.map(t => t.tool));
  }

  // ── Embed new knowledge entries (if any were created via tools) ──
  // This runs async, non-blocking — embeddings for vector search
  if (ctx.toolCalls.some(t => t.tool === "save_knowledge")) {
    try {
      const { embedAndStore } = await import("../../modules/context/embedding.js");
      const resultId = ctx.toolCalls.find(t => t.tool === "save_knowledge")?.result?.id;
      const resultContent = ctx.toolCalls.find(t => t.tool === "save_knowledge")?.args?.content;
      if (resultId && resultContent) {
        embedAndStore(resultId, resultContent as string).catch(() => {});
        console.error(`[Learn] Embedding queued for knowledge ${(resultId as string).substring(0, 8)}`);
      }
    } catch {}
  }
}
