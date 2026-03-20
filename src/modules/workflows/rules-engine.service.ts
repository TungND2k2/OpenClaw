/**
 * Declarative rules engine — evaluates JSON condition trees.
 * SECURITY: No eval(), no arbitrary code execution.
 */

export interface RuleCondition {
  type: "AND" | "OR" | "NOT" | "comparison";
  children?: RuleCondition[];
  field?: string;
  operator?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "matches";
  value?: unknown;
}

export interface RuleAction {
  type: "approve" | "reject" | "escalate" | "set_field" | "notify" | "route_to_stage";
  params: Record<string, unknown>;
}

export interface RuleDefinition {
  conditions: RuleCondition;
  actions: RuleAction[];
}

function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((obj: any, key) => obj?.[key], data);
}

function resolveValue(value: unknown, data: Record<string, unknown>): unknown {
  if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
    const path = value.slice(2, -1);
    return getNestedValue(data, path);
  }
  return value;
}

function compare(fieldValue: unknown, operator: string, value: unknown): boolean {
  switch (operator) {
    case "eq": return fieldValue === value;
    case "neq": return fieldValue !== value;
    case "gt": return (fieldValue as number) > (value as number);
    case "gte": return (fieldValue as number) >= (value as number);
    case "lt": return (fieldValue as number) < (value as number);
    case "lte": return (fieldValue as number) <= (value as number);
    case "in": return Array.isArray(value) && value.includes(fieldValue);
    case "not_in": return Array.isArray(value) && !value.includes(fieldValue);
    case "contains": return typeof fieldValue === "string" && fieldValue.includes(value as string);
    case "matches": return typeof fieldValue === "string" && new RegExp(value as string).test(fieldValue);
    default: return false;
  }
}

/**
 * Evaluate a condition tree against data.
 */
export function evaluateCondition(condition: RuleCondition, data: Record<string, unknown>): boolean {
  switch (condition.type) {
    case "AND":
      return (condition.children ?? []).every((c) => evaluateCondition(c, data));
    case "OR":
      return (condition.children ?? []).some((c) => evaluateCondition(c, data));
    case "NOT":
      return !evaluateCondition(condition.children![0], data);
    case "comparison": {
      const fieldValue = getNestedValue(data, condition.field ?? "");
      const compareValue = resolveValue(condition.value, data);
      return compare(fieldValue, condition.operator ?? "eq", compareValue);
    }
    default:
      return false;
  }
}

/**
 * Evaluate a rule — if conditions match, return actions.
 */
export function evaluateRule(
  rule: RuleDefinition,
  data: Record<string, unknown>
): { matched: boolean; actions: RuleAction[] } {
  const matched = evaluateCondition(rule.conditions, data);
  return { matched, actions: matched ? rule.actions : [] };
}

/**
 * Evaluate multiple rules in priority order, return all matches.
 */
export function evaluateRules(
  rules: (RuleDefinition & { id: string; name: string; priority: number })[],
  data: Record<string, unknown>
): { ruleId: string; name: string; matched: boolean; actions: RuleAction[] }[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  return sorted.map((rule) => {
    const result = evaluateRule(rule, data);
    return { ruleId: rule.id, name: rule.name, ...result };
  });
}
