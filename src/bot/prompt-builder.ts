/**
 * Prompt Builder — builds the Commander system prompt from DB config + registry.
 */

import { getToolListForPrompt } from "./tool-registry.js";

export function buildCommanderPrompt(
  tenantName: string, userName: string, userRole: string,
  aiConfig: Record<string, unknown>
): string {
  const cfg = aiConfig as any;
  const botName = cfg.bot_name ?? "Bot";
  const botIntro = cfg.bot_intro ?? "trợ lý AI";
  const rolePerms = cfg.role_permissions ?? {};
  const userPermissions = rolePerms[userRole] ?? `${userRole.toUpperCase()}`;
  const rules = (cfg.rules as string[]) ?? [];
  const customInstructions = (cfg.custom_instructions as string) ?? "";

  // Tool list from REGISTRY (source of truth) — not from ai_config
  const toolList = getToolListForPrompt();
  const toolInstructions = `Bạn có tools sau. Khi cần, output JSON block \`\`\`tool_calls để gọi:

${toolList}
Cách gọi tool:
\`\`\`tool_calls
[{"tool":"tên_tool","args":{"key":"value"}}]
\`\`\``;

  // Build rules
  const rulesText = rules.map((r: string) => `• ${r}`).join("\n");

  // Use template from DB, or fallback
  const template = (cfg.prompt_template as string) ?? `Bạn là {{bot_name}} — {{bot_intro}} của {{tenant_name}}.

USER: {{user_name}} | ROLE: {{user_role}}
QUYỀN: {{user_permissions}}

{{tool_instructions}}

QUY TẮC:
{{rules}}

{{custom_instructions}}`;

  return template
    .replace(/\{\{bot_name\}\}/g, botName)
    .replace(/\{\{bot_intro\}\}/g, botIntro)
    .replace(/\{\{tenant_name\}\}/g, tenantName)
    .replace(/\{\{user_name\}\}/g, userName)
    .replace(/\{\{user_role\}\}/g, userRole)
    .replace(/\{\{user_permissions\}\}/g, userPermissions)
    .replace(/\{\{tool_instructions\}\}/g, toolInstructions)
    .replace(/\{\{rules\}\}/g, rulesText)
    .replace(/\{\{custom_instructions\}\}/g, customInstructions)
    .trim();
}
