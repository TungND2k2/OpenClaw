/**
 * Knowledge Middleware — retrieves relevant knowledge entries for the user message.
 */

import { retrieveKnowledge } from "../../modules/knowledge/knowledge.service.js";
import type { PipelineContext } from "./types.js";

export async function knowledgeMiddleware(ctx: PipelineContext): Promise<void> {
  await ctx.onProgress?.("🔍 Đang tìm kiếm kiến thức...");

  ctx.keywords = ctx.userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const knowledge = await retrieveKnowledge({
    tags: ctx.keywords,
    capabilities: [],
    domain: "general",
    scope: ["global", `domain:sales`, `domain:general`],
    limit: 3,
    tenantId: ctx.tenantId,
  });

  ctx.knowledgeEntries = knowledge;

  if (knowledge.length > 0 && knowledge[0].matchScore > 0.3) {
    console.error(`[Pipeline] Knowledge: ${knowledge.length} entries (top: ${knowledge[0].matchScore.toFixed(2)})`);
    ctx.knowledgeContext = `\n\nKNOWLEDGE BASE (đã học, ưu tiên dùng):\n${knowledge.map(k => {
      const rejected = (k.content ?? "").includes("⚠️ REJECTED");
      return `[${k.type}${rejected ? " ⚠️ BỊ REJECT" : ""}] ${k.title}: ${k.content.substring(0, 300)}`;
    }).join("\n\n")}`;
  } else {
    console.error(`[Pipeline] Knowledge: none`);
    ctx.knowledgeContext = "";
  }
}
