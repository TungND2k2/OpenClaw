/**
 * Context Middleware — builds system prompt, file/form/resource context.
 */

import { listFiles } from "../../modules/storage/s3.service.js";
import { getFormState } from "../../modules/conversations/conversation.service.js";
import { getResourceSummary, buildResourceSummary, formatSummaryForPrompt } from "../../modules/cache/resource-cache.js";
import { buildCommanderPrompt } from "../prompt-builder.js";
import { estimateTokens } from "../../modules/context/token-counter.js";
import type { PipelineContext } from "./types.js";

export async function contextMiddleware(ctx: PipelineContext): Promise<void> {
  // ── Resource cache ──────────────────────────────────
  let summary = getResourceSummary(ctx.tenantId);
  if (!summary) {
    summary = await buildResourceSummary(ctx.tenantId);
  }
  const resourceContext = formatSummaryForPrompt(summary);
  const resLog = `${summary.forms.length} forms, ${summary.collections.length} collections, ${summary.filesCount} files`;
  // logged by structured logger in execute middleware
  await ctx.onProgress?.(`📋 Context: ${resLog}`);

  // ── File list ───────────────────────────────────────
  const uploadedFiles = await listFiles(ctx.tenantId, 20);
  ctx.fileContext = uploadedFiles.length > 0
    ? `\nFILES:\n${uploadedFiles.map((f: any) => `• ${f.fileName} (ID: ${f.id})`).join("\n")}`
    : "";
  ctx.fileContext += resourceContext;

  // ── Form state ──────────────────────────────────────
  ctx.formContext = "";
  if (ctx.sessionId) {
    const formState = await getFormState(ctx.sessionId);
    if (formState && formState.status === "in_progress") {
      const filled = Object.entries(formState.data)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v], i) => `  ${i + 1}. ${k}: ${v} ✅`)
        .join("\n");
      const pending = formState.pendingFields
        .map((f, i) => `  ${Object.keys(formState.data).length + i + 1}. ${f}${i === 0 ? " ← ĐANG CHỜ" : ""}`)
        .join("\n");
      ctx.formContext = `\nFORM ĐANG NHẬP: "${formState.formName}" (bước ${formState.currentStep}/${formState.totalSteps})
ĐÃ ĐIỀN:\n${filled || "  (chưa có)"}
ĐANG CHỜ:\n${pending || "  (hoàn thành)"}`;
    }
  }

  // ── Onboarding (simplified) ─────────────────────────
  ctx.onboardingContext = "";
  const isNewBot = summary.collections.length === 0 && summary.filesCount === 0;
  if (isNewBot) {
    ctx.onboardingContext = "\nBot mới — chưa có data. Hỏi user cần gì.";
  }

  // ── Build system prompt ─────────────────────────────
  ctx.systemPrompt = buildCommanderPrompt(ctx.tenantName, ctx.userName, ctx.userRole, ctx.aiConfig)
    + ctx.fileContext + ctx.formContext + ctx.onboardingContext;

  // ── Log token estimate ──────────────────────────────
  const promptTokens = estimateTokens(ctx.systemPrompt);
  const historyTokens = estimateTokens(ctx.conversationHistory.map(m => m.content).join(""));
  // token counts logged in execute middleware
}
