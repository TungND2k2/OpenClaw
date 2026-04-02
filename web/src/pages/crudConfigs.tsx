import { Badge, statusVariant } from "../components/Badge";
import type { CrudPageConfig } from "./CrudPage";

export const formsConfig: CrudPageConfig = {
  title: "Forms",
  icon: "◫",
  description: "Form templates used by bots to collect structured user input",
  listEndpoint:   (b) => `/bots/${b}/forms`,
  createEndpoint: (b) => `/bots/${b}/forms`,
  updateEndpoint: (id) => `/forms/${id}`,
  deleteEndpoint: (id) => `/forms/${id}`,
  columns: [
    { key: "name",    label: "Name",    render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
    { key: "version", label: "Version", render: (v) => <span className="text-[#8b949e]">v{v}</span> },
    { key: "status",  label: "Status",  render: (v) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "createdAt", label: "Created", render: (v) => v ? <span className="text-[#8b949e] text-xs">{new Date(v).toLocaleDateString()}</span> : "—" },
  ],
  formFields: [
    { key: "name",   label: "Name",        type: "text",   required: true, placeholder: "e.g. Contact Form" },
    { key: "schema", label: "Schema (JSON)", type: "json", defaultValue: '{"fields":[]}', placeholder: '{"fields":[]}' },
    { key: "status", label: "Status",      type: "select", options: ["active", "draft", "archived"], defaultValue: "active" },
  ],
};

export const workflowsConfig: CrudPageConfig = {
  title: "Workflows",
  icon: "◈",
  description: "Automated workflow templates that bots can execute",
  listEndpoint:   (b) => `/bots/${b}/workflows`,
  createEndpoint: (b) => `/bots/${b}/workflows`,
  updateEndpoint: (id) => `/workflows/${id}`,
  deleteEndpoint: (id) => `/workflows/${id}`,
  columns: [
    { key: "name",        label: "Name",        render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
    { key: "domain",      label: "Domain",      render: (v) => v ? <Badge variant="blue">{v}</Badge> : <span className="text-[#8b949e]/40">—</span> },
    { key: "status",      label: "Status",      render: (v) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "description", label: "Description", render: (v) => <span className="text-[#8b949e] text-xs truncate block max-w-48">{v ?? "—"}</span> },
  ],
  formFields: [
    { key: "name",        label: "Name",          type: "text",     required: true, placeholder: "e.g. Onboarding Flow" },
    { key: "description", label: "Description",   type: "textarea", placeholder: "What this workflow does…" },
    { key: "domain",      label: "Domain",        type: "text",     placeholder: "e.g. sales, support" },
    { key: "stages",      label: "Stages (JSON)", type: "json",     defaultValue: "[]", placeholder: "[]" },
    { key: "status",      label: "Status",        type: "select",   options: ["draft", "active", "archived"], defaultValue: "draft" },
  ],
};

export const rulesConfig: CrudPageConfig = {
  title: "Rules",
  icon: "◭",
  description: "Business rules that govern bot behaviour and decision making",
  listEndpoint:   (b) => `/bots/${b}/rules`,
  createEndpoint: (b) => `/bots/${b}/rules`,
  updateEndpoint: (id) => `/rules/${id}`,
  deleteEndpoint: (id) => `/rules/${id}`,
  columns: [
    { key: "name",     label: "Name",     render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
    { key: "ruleType", label: "Type",     render: (v) => <Badge variant="purple">{v}</Badge> },
    { key: "priority", label: "Priority", render: (v) => <span className="text-[#e3b341] font-mono text-xs">{v}</span> },
    { key: "status",   label: "Status",   render: (v) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "domain",   label: "Domain",   render: (v) => <span className="text-[#8b949e]">{v ?? "—"}</span> },
  ],
  formFields: [
    { key: "name",        label: "Name",               type: "text",     required: true },
    { key: "description", label: "Description",        type: "textarea" },
    { key: "domain",      label: "Domain",             type: "text",     placeholder: "sales, hr, support…" },
    { key: "ruleType",    label: "Rule Type",          type: "select",   options: ["condition", "validation", "routing", "escalation", "notification"], defaultValue: "condition" },
    { key: "priority",    label: "Priority",           type: "number",   defaultValue: "0" },
    { key: "conditions",  label: "Conditions (JSON)",  type: "json",     defaultValue: "[]" },
    { key: "actions",     label: "Actions (JSON)",     type: "json",     defaultValue: "[]" },
    { key: "status",      label: "Status",             type: "select",   options: ["active", "inactive", "draft"] },
  ],
};

export const agentsConfig: CrudPageConfig = {
  title: "Agents",
  icon: "◯",
  description: "Agent templates defining roles, capabilities, and system prompts",
  listEndpoint:   (b) => `/bots/${b}/agents`,
  createEndpoint: (b) => `/bots/${b}/agents`,
  updateEndpoint: (id) => `/agents/${id}`,
  deleteEndpoint: (id) => `/agents/${id}`,
  columns: [
    { key: "name",   label: "Name",        render: (v) => <span className="font-medium text-[#e6edf3]">{v}</span> },
    { key: "role",   label: "Role",        render: (v) => <Badge variant="purple">{v}</Badge> },
    { key: "engine", label: "Engine",      render: (v) => <span className="text-[#8b949e] text-xs font-mono">{v}</span> },
    { key: "status", label: "Status",      render: (v) => <Badge variant={statusVariant(v)}>{v}</Badge> },
    { key: "maxConcurrentTasks", label: "Concurrency", render: (v) => <span className="text-[#8b949e]">{v}</span> },
  ],
  formFields: [
    { key: "name",         label: "Name",                type: "text",     required: true },
    { key: "role",         label: "Role",                type: "text",     required: true, placeholder: "assistant, analyst, writer…" },
    { key: "systemPrompt", label: "System Prompt",       type: "textarea", placeholder: "You are a helpful assistant…" },
    { key: "engine",       label: "Engine",              type: "select",   options: ["fast-api", "claude-code", "gpt4o"], defaultValue: "fast-api" },
    { key: "capabilities", label: "Capabilities (JSON)", type: "json",     defaultValue: "[]", placeholder: '["read","write"]' },
    { key: "tools",        label: "Tools (JSON)",        type: "json",     defaultValue: "[]", placeholder: "[]" },
    { key: "status",       label: "Status",              type: "select",   options: ["active", "inactive"] },
  ],
};
