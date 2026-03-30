/**
 * Token Counter — estimates token count for mixed Vietnamese/English text.
 * ~4 chars per token (safe average for mixed content).
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content) + 4; // overhead per message (role, separators)
  }
  return total;
}

// Budget constants
export const TOKEN_BUDGET = 40000;
export const RESERVED_FOR_RESPONSE = 4096;
export const AVAILABLE_TOKENS = TOKEN_BUDGET - RESERVED_FOR_RESPONSE;
