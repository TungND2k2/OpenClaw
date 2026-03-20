/**
 * Form engine — validates data against JSON schema definitions.
 */

export interface FormField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multi_select" | "phone" | "email" | "address" | "file" | "boolean";
  required: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    min_length?: number;
    max_length?: number;
    pattern?: string;
    custom_rule_id?: string;
  };
  default_value?: unknown;
  ai_prompt_hint?: string;
  depends_on?: {
    field_id: string;
    condition: "equals" | "not_equals" | "greater_than" | "less_than" | "contains";
    value: unknown;
  };
  group?: string;
}

export interface FormSchema {
  fields: FormField[];
}

export interface ValidationError {
  fieldId: string;
  message: string;
}

/**
 * Check if a field should be visible based on depends_on.
 */
export function isFieldVisible(field: FormField, data: Record<string, unknown>): boolean {
  if (!field.depends_on) return true;

  const depValue = data[field.depends_on.field_id];
  switch (field.depends_on.condition) {
    case "equals": return depValue === field.depends_on.value;
    case "not_equals": return depValue !== field.depends_on.value;
    case "greater_than": return (depValue as number) > (field.depends_on.value as number);
    case "less_than": return (depValue as number) < (field.depends_on.value as number);
    case "contains": return typeof depValue === "string" && depValue.includes(field.depends_on.value as string);
    default: return true;
  }
}

/**
 * Validate a single field value.
 */
export function validateField(field: FormField, value: unknown): ValidationError | null {
  // Required check
  if (field.required && (value === undefined || value === null || value === "")) {
    return { fieldId: field.id, message: `${field.label} is required` };
  }

  if (value === undefined || value === null || value === "") return null;

  // Type checks that don't need validation config
  if (field.type === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) {
      return { fieldId: field.id, message: `${field.label} must be a valid email` };
    }
  }

  if (field.type === "select" && field.options) {
    if (!field.options.includes(String(value))) {
      return { fieldId: field.id, message: `${field.label} must be one of: ${field.options.join(", ")}` };
    }
  }

  const v = field.validation;
  if (!v) return null;

  // Type-specific validation
  if (field.type === "number") {
    const num = Number(value);
    if (isNaN(num)) return { fieldId: field.id, message: `${field.label} must be a number` };
    if (v.min !== undefined && num < v.min) return { fieldId: field.id, message: `${field.label} must be >= ${v.min}` };
    if (v.max !== undefined && num > v.max) return { fieldId: field.id, message: `${field.label} must be <= ${v.max}` };
  }

  if (field.type === "text" || field.type === "email" || field.type === "phone") {
    const str = String(value);
    if (v.min_length !== undefined && str.length < v.min_length) {
      return { fieldId: field.id, message: `${field.label} must be at least ${v.min_length} characters` };
    }
    if (v.max_length !== undefined && str.length > v.max_length) {
      return { fieldId: field.id, message: `${field.label} must be at most ${v.max_length} characters` };
    }
    if (v.pattern && !new RegExp(v.pattern).test(str)) {
      return { fieldId: field.id, message: `${field.label} format is invalid` };
    }
  }

  return null;
}

/**
 * Validate entire form data against schema.
 */
export function validateForm(
  schema: FormSchema,
  data: Record<string, unknown>
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    if (!isFieldVisible(field, data)) continue;
    const error = validateField(field, data[field.id]);
    if (error) errors.push(error);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get remaining unfilled required fields.
 */
export function getRemainingFields(
  schema: FormSchema,
  data: Record<string, unknown>
): FormField[] {
  return schema.fields.filter((f) => {
    if (!isFieldVisible(f, data)) return false;
    if (!f.required) return false;
    const val = data[f.id];
    return val === undefined || val === null || val === "";
  });
}

/**
 * Generate AI prompt hint for a field.
 */
export function getFieldPrompt(field: FormField): string {
  if (field.ai_prompt_hint) return field.ai_prompt_hint;
  if (field.type === "select" && field.options) {
    return `Please select ${field.label}: ${field.options.join(", ")}`;
  }
  return `Please provide ${field.label}`;
}
