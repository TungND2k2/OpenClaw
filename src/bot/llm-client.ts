/**
 * LLM Client — Hybrid approach:
 * - Fast API (x-or/OpenAI) for simple chat (1-2s)
 * - Claude CLI for complex tool-calling tasks (when tools needed)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "../config.js";

const execFileAsync = promisify(execFile);

export interface LLMResponse {
  text: string;
}

// ── Fast API call (x-or.cloud / OpenAI compatible) ──────────

async function callFastAPI(
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const config = getConfig();
  const apiBase = config.WORKER_API_BASE;
  const apiKey = config.WORKER_API_KEY;
  const model = config.WORKER_MODEL;

  if (!apiBase || !apiKey) throw new Error("Worker API not configured");

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-15),
  ];

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: apiMessages, max_tokens: 2048, temperature: 0.7 }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Claude CLI call (for tool-heavy tasks) ───────────────────

async function callClaudeCLI(systemPrompt: string, userMessage: string): Promise<string> {
  const { stdout } = await execFileAsync("claude", [
    "--print",
    "--system-prompt", systemPrompt,
    userMessage,
  ], {
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
  });
  return stdout.trim();
}

// ── Parse tool calls from text ───────────────────────────────

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

function parseToolCalls(content: string): ToolCall[] {
  const match = content.match(/```tool_calls\s*\n?([\s\S]*?)```/);
  if (match) {
    try {
      const calls = JSON.parse(match[1]);
      if (Array.isArray(calls)) return calls;
    } catch {}
  }
  const jsonMatch = content.match(/```json\s*\n?(\[[\s\S]*?\])```/);
  if (jsonMatch) {
    try {
      const calls = JSON.parse(jsonMatch[1]);
      if (Array.isArray(calls) && calls[0]?.tool) return calls;
    } catch {}
  }
  return [];
}

// ── Main entry point ─────────────────────────────────────────

export async function processMessage(input: {
  userMessage: string;
  systemPrompt: string;
  conversationHistory?: { role: string; content: string }[];
  executeTool: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
}): Promise<{ text: string; toolResults: { tool: string; result: unknown }[] }> {
  const startMs = Date.now();
  const toolResults: { tool: string; result: unknown }[] = [];

  // Build messages for API
  const messages = [
    ...(input.conversationHistory ?? []).slice(-10),
    { role: "user", content: input.userMessage },
  ];

  // Step 1: Try fast API first
  console.error(`[LLM] Fast API call...`);
  let text: string;
  try {
    text = await callFastAPI(input.systemPrompt, messages);
    console.error(`[LLM] ✓ Fast API (${Date.now() - startMs}ms)`);
  } catch (e: any) {
    console.error(`[LLM] Fast API failed: ${e.message}, falling back to Claude CLI`);
    text = await callClaudeCLI(input.systemPrompt, input.userMessage);
    console.error(`[LLM] ✓ Claude CLI fallback (${Date.now() - startMs}ms)`);
  }

  // Step 2: Check for tool calls
  let loopCount = 0;
  while (loopCount < 3) {
    const toolCalls = parseToolCalls(text);
    if (toolCalls.length === 0) break;

    loopCount++;
    console.error(`[LLM] Tool loop ${loopCount}: ${toolCalls.map(t => t.tool).join(", ")}`);

    // Execute tools
    const results: string[] = [];
    for (const tc of toolCalls) {
      const toolStart = Date.now();
      console.error(`[LLM] → ${tc.tool}(${JSON.stringify(tc.args).substring(0, 100)})`);
      const result = await input.executeTool(tc.tool, tc.args);
      const resultStr = JSON.stringify(result);
      results.push(`${tc.tool} result: ${resultStr}`);
      toolResults.push({ tool: tc.tool, result });
      console.error(`[LLM]   ✓ ${tc.tool} (${Date.now() - toolStart}ms)`);
    }

    // Follow-up with tool results — use fast API
    const followUpMsg = `Tool results:\n${results.join("\n")}\n\nBased on these results, provide the final response to the user. Be concise.`;
    console.error(`[LLM] Follow-up call...`);
    try {
      text = await callFastAPI(input.systemPrompt, [
        ...messages,
        { role: "assistant", content: "I'll check that for you." },
        { role: "user", content: followUpMsg },
      ]);
    } catch {
      text = await callClaudeCLI(input.systemPrompt, followUpMsg);
    }
    console.error(`[LLM] ✓ Follow-up (${Date.now() - startMs}ms)`);
  }

  // Clean tool_calls blocks from final output
  text = text.replace(/```tool_calls[\s\S]*?```/g, "").trim();

  console.error(`[LLM] Done (${Date.now() - startMs}ms, ${toolResults.length} tools)`);
  return { text, toolResults };
}
