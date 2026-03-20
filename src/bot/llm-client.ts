/**
 * LLM Client — uses Claude Max (via stored credentials) with native tool use.
 * Falls back to OpenAI-compatible API if Claude unavailable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let _anthropic: Anthropic | null = null;

function getClaudeToken(): string | null {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const creds = JSON.parse(readFileSync(credPath, "utf-8"));
    return creds.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

function getAnthropicClient(): Anthropic | null {
  if (_anthropic) return _anthropic;

  const token = getClaudeToken();
  const config = getConfig();
  const apiKey = config.COMMANDER_API_KEY ?? token;

  if (!apiKey) return null;

  _anthropic = new Anthropic({
    apiKey,
    baseURL: config.COMMANDER_API_BASE ?? "https://api.anthropic.com",
  });
  return _anthropic;
}

// ── Tool definitions for Anthropic API ──────────────────────

export const CLAUDE_TOOLS: Anthropic.Tool[] = [
  { name: "list_workflows", description: "List all workflow templates for the tenant", input_schema: { type: "object" as const, properties: {}, required: [] } },
  { name: "create_workflow", description: "Create a new workflow template with stages", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Workflow name" }, description: { type: "string" }, domain: { type: "string" }, stages: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string", enum: ["form", "approval", "notification", "action"] } } }, description: "Workflow stages" } }, required: ["name", "stages"] } },
  { name: "create_form", description: "Create a form template with fields", input_schema: { type: "object" as const, properties: { name: { type: "string" }, fields: { type: "array", items: { type: "object" } } }, required: ["name", "fields"] } },
  { name: "create_rule", description: "Create a business rule", input_schema: { type: "object" as const, properties: { name: { type: "string" }, domain: { type: "string" }, rule_type: { type: "string" }, conditions: { type: "object" }, actions: { type: "array", items: { type: "object" } } }, required: ["name", "rule_type", "conditions", "actions"] } },
  { name: "save_tutorial", description: "Save a tutorial to the knowledge base", input_schema: { type: "object" as const, properties: { title: { type: "string" }, content: { type: "string" }, target_role: { type: "string" }, domain: { type: "string" } }, required: ["title", "content"] } },
  { name: "save_knowledge", description: "Save a knowledge entry", input_schema: { type: "object" as const, properties: { type: { type: "string" }, title: { type: "string" }, content: { type: "string" }, domain: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content", "domain"] } },
  { name: "list_tutorials", description: "List saved tutorials", input_schema: { type: "object" as const, properties: { domain: { type: "string" } }, required: [] } },
  { name: "start_workflow_instance", description: "Start a workflow instance for user", input_schema: { type: "object" as const, properties: { template_id: { type: "string" }, initiated_by: { type: "string" } }, required: ["template_id"] } },
  { name: "get_dashboard", description: "Get system dashboard stats", input_schema: { type: "object" as const, properties: {}, required: [] } },
  { name: "search_knowledge", description: "Search knowledge base", input_schema: { type: "object" as const, properties: { domain: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: [] } },
  { name: "set_user_role", description: "Set user role (admin only)", input_schema: { type: "object" as const, properties: { channel: { type: "string" }, channel_user_id: { type: "string" }, role: { type: "string", enum: ["admin", "manager", "staff", "user"] }, display_name: { type: "string" } }, required: ["channel", "channel_user_id", "role"] } },
  { name: "list_users", description: "List all tenant users with roles", input_schema: { type: "object" as const, properties: {}, required: [] } },
  { name: "list_files", description: "List uploaded files", input_schema: { type: "object" as const, properties: { limit: { type: "number" } }, required: [] } },
  { name: "get_file", description: "Get file metadata and S3 URL", input_schema: { type: "object" as const, properties: { file_id: { type: "string" } }, required: ["file_id"] } },
  { name: "read_file_content", description: "Read and extract text content from a file (DOCX, TXT, CSV, JSON). Use this to analyze or summarize file contents.", input_schema: { type: "object" as const, properties: { file_id: { type: "string", description: "File ID to read" } }, required: ["file_id"] } },
  { name: "send_file", description: "Send a file back to user in chat", input_schema: { type: "object" as const, properties: { file_id: { type: "string" } }, required: ["file_id"] } },
];

// ── Call Claude with native tool use ─────────────────────────

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  id: string;
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

export async function callClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  model?: string
): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) throw new Error("Claude not configured");

  const config = getConfig();
  const useModel = model ?? config.COMMANDER_MODEL ?? "claude-sonnet-4-20250514";

  // Convert to Anthropic message format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
  }));

  const startMs = Date.now();
  console.error(`[Claude] Calling ${useModel}...`);

  const response = await client.messages.create({
    model: useModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
    tools: CLAUDE_TOOLS,
  });

  const elapsed = Date.now() - startMs;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  console.error(`[Claude] ✓ ${elapsed}ms [${inputTokens}→${outputTokens} tokens] stop=${response.stop_reason}`);

  // Extract text and tool calls
  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        tool: block.name,
        args: block.input as Record<string, unknown>,
        id: block.id,
      });
    }
  }

  if (toolCalls.length > 0) {
    console.error(`[Claude] Tool calls: ${toolCalls.map(t => t.tool).join(", ")}`);
  }

  return { text, toolCalls, inputTokens, outputTokens };
}

/**
 * Continue conversation after tool results — send results back to Claude.
 */
export async function callClaudeWithToolResults(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  toolResults: { toolUseId: string; result: string }[],
  model?: string
): Promise<LLMResponse> {
  const client = getAnthropicClient();
  if (!client) throw new Error("Claude not configured");

  const config = getConfig();
  const useModel = model ?? config.COMMANDER_MODEL ?? "claude-sonnet-4-20250514";

  // Add tool results as user message
  const toolResultBlocks: Anthropic.ToolResultBlockParam[] = toolResults.map((tr) => ({
    type: "tool_result" as const,
    tool_use_id: tr.toolUseId,
    content: tr.result,
  }));

  const fullMessages: Anthropic.MessageParam[] = [
    ...messages,
    { role: "user", content: toolResultBlocks },
  ];

  const startMs = Date.now();
  console.error(`[Claude] Follow-up with ${toolResults.length} tool results...`);

  const response = await client.messages.create({
    model: useModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: fullMessages,
    tools: CLAUDE_TOOLS,
  });

  const elapsed = Date.now() - startMs;
  console.error(`[Claude] ✓ Follow-up ${elapsed}ms [${response.usage.input_tokens}→${response.usage.output_tokens}]`);

  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    else if (block.type === "tool_use") {
      toolCalls.push({ tool: block.name, args: block.input as Record<string, unknown>, id: block.id });
    }
  }

  return { text, toolCalls, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

/**
 * Check if Claude is available.
 */
export function isClaudeAvailable(): boolean {
  return getClaudeToken() !== null || getConfig().COMMANDER_API_KEY !== undefined;
}
