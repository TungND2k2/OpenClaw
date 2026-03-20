/**
 * Agent Bridge — connects Telegram messages to the OpenClaw agent system.
 *
 * Bot is ONLY a transport layer:
 * 1. Receive message from Telegram
 * 2. Create a task in OpenClaw for the Commander
 * 3. Commander (powered by LLM) understands intent
 * 4. Commander decomposes into subtasks, delegates to workers
 * 5. Workers execute via MCP tools (create_workflow, store_knowledge, etc.)
 * 6. Result flows back to user
 *
 * NO hardcoded intents. NO regex matching. Commander decides everything.
 */

import { getConfig } from "../config.js";
import { getDb } from "../db/connection.js";
import { agents } from "../db/schema.js";
import { eq, sql, and } from "drizzle-orm";
import { createTask, completeTask, getTask } from "../modules/tasks/task.service.js";
import { writeLog } from "../modules/logs/log.service.js";
import { listAgents } from "../modules/agents/agent.service.js";
import { notebookWrite, notebookRead, notebookList } from "../modules/notebooks/notebook.service.js";
import { storeKnowledge, retrieveKnowledge } from "../modules/knowledge/knowledge.service.js";
import { getDashboard } from "../modules/monitoring/monitor.service.js";
import { startWorkflow } from "../modules/workflows/workflow-engine.service.js";
import { getFile, listFiles, readFileContent } from "../modules/storage/s3.service.js";
import { getQueueMetrics } from "./telegram.bot.js";
import {
  workflowTemplates, formTemplates, businessRules,
  workflowInstances, tenants, tenantUsers,
} from "../db/schema.js";
import { newId } from "../utils/id.js";
import { nowMs } from "../utils/clock.js";

// ── OpenAI native function calling definitions ───────────────

const OPENAI_TOOLS = [
  { type: "function", function: { name: "list_workflows", description: "List all workflow templates", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_workflow", description: "Create new workflow template", parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, domain: { type: "string" }, stages: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string", enum: ["form", "approval", "notification", "action"] }, next_stage_id: { type: "string" } } } } }, required: ["name", "stages"] } } },
  { type: "function", function: { name: "create_form", description: "Create form template", parameters: { type: "object", properties: { name: { type: "string" }, fields: { type: "array", items: { type: "object" } } }, required: ["name", "fields"] } } },
  { type: "function", function: { name: "create_rule", description: "Create business rule", parameters: { type: "object", properties: { name: { type: "string" }, domain: { type: "string" }, rule_type: { type: "string" }, conditions: { type: "object" }, actions: { type: "array", items: { type: "object" } } }, required: ["name", "rule_type", "conditions", "actions"] } } },
  { type: "function", function: { name: "save_tutorial", description: "Save tutorial to knowledge base", parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, target_role: { type: "string" }, domain: { type: "string" } }, required: ["title", "content"] } } },
  { type: "function", function: { name: "save_knowledge", description: "Save knowledge entry", parameters: { type: "object", properties: { type: { type: "string" }, title: { type: "string" }, content: { type: "string" }, domain: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content", "domain"] } } },
  { type: "function", function: { name: "list_tutorials", description: "List saved tutorials", parameters: { type: "object", properties: { domain: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "start_workflow_instance", description: "Start a workflow for user", parameters: { type: "object", properties: { template_id: { type: "string" }, initiated_by: { type: "string" } }, required: ["template_id"] } } },
  { type: "function", function: { name: "get_dashboard", description: "Get system dashboard stats", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "search_knowledge", description: "Search knowledge base", parameters: { type: "object", properties: { domain: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: [] } } },
  { type: "function", function: { name: "set_user_role", description: "Set user role (admin only)", parameters: { type: "object", properties: { channel: { type: "string" }, channel_user_id: { type: "string" }, role: { type: "string", enum: ["admin", "manager", "staff", "user"] }, display_name: { type: "string" } }, required: ["channel", "channel_user_id", "role"] } } },
  { type: "function", function: { name: "list_users", description: "List all tenant users with roles", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "list_files", description: "List uploaded files", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
  { type: "function", function: { name: "get_file", description: "Get file details + S3 URL", parameters: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] } } },
  { type: "function", function: { name: "send_file", description: "Send a file back to user", parameters: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] } } },
];

// ── Tool descriptions for system prompt (fallback) ───────────

const TOOL_DEFINITIONS = `
Available tools you can call (respond with tool_calls JSON):

1. list_workflows(tenant_id) — List all workflow templates
2. create_workflow(tenant_id, name, description, domain, stages[]) — Create new workflow template
   stages: [{id, name, type: "form"|"approval"|"notification"|"action", next_stage_id?}]
3. create_form(tenant_id, name, fields[]) — Create form template
   fields: [{id, label, type: "text"|"number"|"select"|"phone"|"email"|"boolean", required, options?, ai_prompt_hint?}]
4. create_rule(tenant_id, name, domain, rule_type, conditions, actions[]) — Create business rule
5. save_tutorial(title, content, target_role, domain) — Save tutorial to knowledge base
6. save_knowledge(type, title, content, domain, tags[]) — Save knowledge entry
7. list_tutorials(domain?) — List saved tutorials
8. start_workflow_instance(template_id, tenant_id, initiated_by) — Start a workflow for user
9. get_dashboard() — Get system dashboard stats
10. search_knowledge(domain?, tags?) — Search knowledge base
11. set_user_role(channel, channel_user_id, role, display_name?) — Set user role (admin only)
12. list_users() — List all tenant users with roles
13. list_files(limit?) — List uploaded files
14. get_file(file_id) — Get file details + S3 URL
15. read_file_content(file_id) — Read and extract text content from a file (DOCX, TXT, CSV, JSON). Use this to analyze/summarize files.
16. send_file(file_id) — Send a file back to user in chat (image/doc/video)
17. respond(message) — Send a text response to the user (ALWAYS call this)
`;

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

// ── Execute tool calls ───────────────────────────────────────

async function executeTool(tool: string, args: Record<string, unknown>, tenantId: string): Promise<unknown> {
  const db = getDb();
  const now = nowMs();

  switch (tool) {
    case "list_workflows": {
      const rows = db.select({ id: workflowTemplates.id, name: workflowTemplates.name, description: workflowTemplates.description })
        .from(workflowTemplates)
        .where(and(eq(workflowTemplates.tenantId, tenantId), eq(workflowTemplates.status, "active")))
        .all();
      return rows;
    }

    case "create_workflow": {
      const id = newId();
      const stages = ((args.stages as any[]) ?? []).map((s: any, i: number) => ({
        id: s.id ?? `step_${i + 1}`,
        name: s.name,
        type: s.type ?? "form",
        next_stage_id: s.next_stage_id ?? (i < (args.stages as any[]).length - 1 ? (args.stages as any[])[i + 1]?.id ?? `step_${i + 2}` : undefined),
        ...(s.form_id ? { form_id: s.form_id } : {}),
        ...(s.notification_config ? { notification_config: s.notification_config } : {}),
        ...(s.approval_config ? { approval_config: s.approval_config } : {}),
      }));
      db.insert(workflowTemplates).values({
        id, tenantId, name: args.name as string,
        description: (args.description as string) ?? null,
        domain: (args.domain as string) ?? null,
        version: 1, stages: JSON.stringify(stages),
        status: "active", createdAt: now, updatedAt: now,
      }).run();
      return { id, name: args.name, stageCount: stages.length };
    }

    case "create_form": {
      const id = newId();
      db.insert(formTemplates).values({
        id, tenantId, name: args.name as string,
        schema: JSON.stringify({ fields: args.fields ?? [] }),
        version: 1, status: "active", createdAt: now, updatedAt: now,
      }).run();
      return { id, name: args.name };
    }

    case "create_rule": {
      const id = newId();
      db.insert(businessRules).values({
        id, tenantId, name: args.name as string,
        description: (args.description as string) ?? null,
        domain: (args.domain as string) ?? null,
        ruleType: (args.rule_type as any) ?? "validation",
        conditions: JSON.stringify(args.conditions ?? {}),
        actions: JSON.stringify(args.actions ?? []),
        priority: (args.priority as number) ?? 0,
        status: "active", createdAt: now, updatedAt: now,
      }).run();
      return { id, name: args.name };
    }

    case "save_tutorial": {
      storeKnowledge({
        type: "procedure",
        title: args.title as string,
        content: args.content as string,
        domain: (args.domain as string) ?? "general",
        tags: ["tutorial", (args.target_role as string) ?? "general"],
        sourceAgentId: "system",
        scope: `domain:${(args.target_role as string) ?? "general"}`,
      });
      notebookWrite({
        namespace: `tutorial:${tenantId}`,
        key: (args.title as string).toLowerCase().replace(/\s+/g, "-"),
        value: args.content as string,
        contentType: "text/markdown",
      });
      return { saved: true, title: args.title };
    }

    case "save_knowledge": {
      const entry = storeKnowledge({
        type: (args.type as any) ?? "domain_knowledge",
        title: args.title as string,
        content: args.content as string,
        domain: (args.domain as string) ?? "general",
        tags: (args.tags as string[]) ?? [],
        sourceAgentId: "system",
      });
      return { id: entry.id, title: entry.title };
    }

    case "list_tutorials": {
      const results = retrieveKnowledge({
        tags: ["tutorial"],
        capabilities: [],
        domain: (args.domain as string) ?? "general",
        limit: 10,
      });
      return results.map(r => ({ title: r.title, domain: r.domain, content: r.content.substring(0, 100) + "..." }));
    }

    case "start_workflow_instance": {
      const instance = startWorkflow({
        templateId: args.template_id as string,
        tenantId,
        initiatedBy: (args.initiated_by as string) ?? "telegram",
        channel: "telegram",
      });
      return { instanceId: instance.id, status: instance.status };
    }

    case "get_dashboard": {
      const dash = getDashboard();
      const queueMetrics = getQueueMetrics?.() ?? null;
      return { ...dash, queue: queueMetrics };
    }

    case "search_knowledge": {
      return retrieveKnowledge({
        tags: (args.tags as string[]) ?? [],
        capabilities: [],
        domain: (args.domain as string) ?? "general",
        limit: 5,
      }).map(r => ({ title: r.title, content: r.content.substring(0, 200), score: r.matchScore }));
    }

    case "set_user_role": {
      const existingUser = db.select({ id: tenantUsers.id })
        .from(tenantUsers)
        .where(and(
          eq(tenantUsers.tenantId, tenantId),
          eq(tenantUsers.channel, args.channel as string),
          eq(tenantUsers.channelUserId, args.channel_user_id as string),
        )).get();

      if (existingUser) {
        db.update(tenantUsers).set({
          role: args.role as any,
          displayName: (args.display_name as string) ?? undefined,
          updatedAt: now,
        }).where(eq(tenantUsers.id, existingUser.id)).run();
      } else {
        const id = newId();
        db.insert(tenantUsers).values({
          id, tenantId,
          channel: args.channel as string,
          channelUserId: args.channel_user_id as string,
          displayName: (args.display_name as string) ?? null,
          role: (args.role as any) ?? "user",
          isActive: 1, createdAt: now, updatedAt: now,
        }).run();
      }
      return { success: true, role: args.role };
    }

    case "list_users": {
      return db.select({
        channelUserId: tenantUsers.channelUserId,
        channel: tenantUsers.channel,
        displayName: tenantUsers.displayName,
        role: tenantUsers.role,
      }).from(tenantUsers)
        .where(eq(tenantUsers.tenantId, tenantId))
        .all();
    }

    case "read_file_content": {
      const result = await readFileContent(args.file_id as string);
      if (!result) return { error: "File not found or cannot read" };
      return { fileName: result.fileName, mimeType: result.mimeType, content: result.content, truncated: result.truncated };
    }

    case "send_file": {
      const file = getFile(args.file_id as string);
      if (!file) return { error: "File not found" };
      return { __send_file__: true, url: file.s3Url, fileName: file.fileName, mimeType: file.mimeType };
    }

    case "list_files": {
      return listFiles(tenantId, (args.limit as number) ?? 20);
    }

    case "get_file": {
      return getFile(args.file_id as string);
    }

    case "respond": {
      return { message: args.message };
    }

    default:
      return { error: `Unknown tool: ${tool}` };
  }
}

// ── Commander LLM call (Claude native tool use) ─────────────

import { callClaude, callClaudeWithToolResults, isClaudeAvailable, type ToolCall as ClaudeToolCall } from "./llm-client.js";
import type Anthropic from "@anthropic-ai/sdk";

export interface CommanderResponse {
  text: string;
  files: { url: string; fileName: string; mimeType: string }[];
}

export async function processWithCommander(input: {
  userMessage: string;
  userName: string;
  userId: string;
  userRole: string;
  tenantId: string;
  tenantName: string;
  conversationHistory: { role: string; content: string }[];
  aiConfig: Record<string, unknown>;
}): Promise<CommanderResponse> {
  const _files: CommanderResponse["files"] = [];
  const startTime = Date.now();

  console.error(`[Pipeline] ─── START ───────────────────────────`);
  console.error(`[Pipeline] User: ${input.userName} (${input.userRole})`);
  console.error(`[Pipeline] Message: "${input.userMessage}"`);
  console.error(`[Pipeline] Engine: Claude (native tool use)`);
  console.error(`[Pipeline] History: ${input.conversationHistory.length} messages`);

  const systemPrompt = buildCommanderPrompt(input.tenantName, input.userName, input.userRole, input.aiConfig);
  const messages = [
    ...input.conversationHistory.slice(-15),
    { role: "user", content: input.userMessage },
  ];

  try {
    // Step 1: Call Claude
    let response = await callClaude(systemPrompt, messages);
    let fullText = response.text;

    // Step 2: Tool use loop — Claude may call tools, we execute and send results back
    let loopCount = 0;
    const MAX_LOOPS = 5;

    // Build Anthropic message history for tool result follow-ups
    let anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));

    while (response.toolCalls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;
      console.error(`[Pipeline] Tool loop ${loopCount}/${MAX_LOOPS}: ${response.toolCalls.map(t => t.tool).join(", ")}`);

      // Build assistant message with tool use blocks
      const assistantContent: any[] = [];
      if (response.text) assistantContent.push({ type: "text", text: response.text });
      for (const tc of response.toolCalls) {
        assistantContent.push({ type: "tool_use", id: tc.id, name: tc.tool, input: tc.args });
      }
      anthropicMessages.push({ role: "assistant", content: assistantContent });

      // Execute tools and collect results
      const toolResults: { toolUseId: string; result: string }[] = [];

      for (const tc of response.toolCalls) {
        const toolStart = Date.now();
        console.error(`[Pipeline] → ${tc.tool}(${JSON.stringify(tc.args).substring(0, 120)})`);

        const result = await executeTool(tc.tool, tc.args, input.tenantId);
        const toolMs = Date.now() - toolStart;
        const resultStr = JSON.stringify(result);

        console.error(`[Pipeline]   ✓ ${tc.tool} (${toolMs}ms): ${resultStr.substring(0, 150)}`);

        toolResults.push({ toolUseId: tc.id, result: resultStr });

        // Collect files to send
        if (result && typeof result === "object" && (result as any).__send_file__) {
          _files.push({ url: (result as any).url, fileName: (result as any).fileName, mimeType: (result as any).mimeType });
        }
      }

      // Send tool results back to Claude
      response = await callClaudeWithToolResults(systemPrompt, anthropicMessages, toolResults);
      fullText = response.text;
    }

    console.error(`[Pipeline] Final: "${fullText.substring(0, 100)}${fullText.length > 100 ? "..." : ""}"`);
    console.error(`[Pipeline] ─── END (${Date.now() - startTime}ms) ────────────`);

    return { text: fullText, files: _files };
  } catch (e: any) {
    console.error(`[Pipeline] ✗ Error (${Date.now() - startTime}ms): ${e.message}`);
    return { text: `⚠️ Lỗi: ${e.message}`, files: _files };
  }
}

// ── Commander system prompt ──────────────────────────────────

function buildCommanderPrompt(
  tenantName: string, userName: string, userRole: string,
  aiConfig: Record<string, unknown>
): string {
  const customInstructions = (aiConfig.system_prompt as string) ?? "";

  return `Bạn là Commander AI của ${tenantName}, vận hành trên OpenClaw.

USER: ${userName} | ROLE: ${userRole} | QUYỀN: ${userRole === "admin" || userRole === "manager" ? "ADMIN — tạo/sửa quy trình, tutorial, rules, quản lý user" : "USER — sử dụng quy trình có sẵn"}

Bạn có tools để THỰC THI hành động thật. LUÔN dùng tools khi user yêu cầu xem/tạo/sửa dữ liệu — KHÔNG bịa dữ liệu, KHÔNG nói "sẽ kiểm tra" rồi không gọi tool.

Quy tắc:
• Xem quy trình → gọi list_workflows
• Tạo quy trình → gọi create_workflow
• Xem/phân tích file → gọi list_files → get_file hoặc read_file_content
• Tạo tutorial → gọi save_tutorial
• Câu hỏi đơn giản → trả lời text, không cần tool
• Format: dùng markdown (bold, italic). Ngắn gọn, rõ ràng.

${customInstructions}`.trim();
}

// ── Parse tool calls from LLM response ───────────────────────

function parseToolCalls(content: string): ToolCall[] {
  // Look for ```tool_calls ... ``` block
  const match = content.match(/```tool_calls\s*\n?([\s\S]*?)```/);
  if (match) {
    try {
      const calls = JSON.parse(match[1]);
      if (Array.isArray(calls)) return calls;
    } catch (e) {
      console.error("[Commander] Failed to parse tool_calls:", e);
    }
  }

  // Also try ```json with tool array
  const jsonMatch = content.match(/```json\s*\n?(\[[\s\S]*?\])```/);
  if (jsonMatch) {
    try {
      const calls = JSON.parse(jsonMatch[1]);
      if (Array.isArray(calls) && calls[0]?.tool) return calls;
    } catch {}
  }

  return [];
}

// ── Markdown → HTML ──────────────────────────────────────────

function markdownToHtml(text: string): string {
  let result = text;
  // Remove tool_calls blocks from display
  result = result.replace(/```tool_calls[\s\S]*?```/g, "");
  result = result.replace(/```json[\s\S]*?```/g, "");
  // Code blocks
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre>$1</pre>");
  // Inline code
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Italic
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<i>$1</i>");
  // Headers → bold
  result = result.replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
  // List items
  result = result.replace(/^-\s+/gm, "• ");
  // Clean up extra whitespace
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}
