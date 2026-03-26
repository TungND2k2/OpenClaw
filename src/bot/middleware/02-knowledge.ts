/**
 * Knowledge Middleware — retrieves relevant knowledge entries.
 */

import { retrieveKnowledge } from "../../modules/knowledge/knowledge.service.js";
import { logKnowledge } from "./logger.js";
import type { PipelineContext } from "./types.js";

export async function knowledgeMiddleware(ctx: PipelineContext): Promise<void> {
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
  logKnowledge(knowledge.map(k => ({ score: k.matchScore, title: k.title, type: k.type })));

  if (knowledge.length > 0 && knowledge[0].matchScore > 0.3) {
    ctx.knowledgeContext = `\nKNOWLEDGE:\n${knowledge.map(k => `[${k.type}] ${k.title}: ${k.content.substring(0, 200)}`).join("\n")}`;
  } else {
    ctx.knowledgeContext = "";
  }
}
