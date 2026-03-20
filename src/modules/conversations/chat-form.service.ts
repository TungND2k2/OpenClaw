import { type FormField, type FormSchema, validateField, isFieldVisible, getFieldPrompt, getRemainingFields } from "../workflows/form-engine.service.js";

/**
 * Parse user response into a typed value based on field type.
 */
export function parseFieldResponse(field: FormField, response: string): { value: unknown; error?: string } {
  const trimmed = response.trim();

  switch (field.type) {
    case "number": {
      const num = Number(trimmed);
      if (isNaN(num)) return { value: null, error: `"${trimmed}" is not a valid number` };
      return { value: num };
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (["yes", "y", "true", "1", "có", "đúng"].includes(lower)) return { value: true };
      if (["no", "n", "false", "0", "không", "sai"].includes(lower)) return { value: false };
      return { value: null, error: `Please answer yes or no` };
    }
    case "select": {
      if (field.options) {
        // Try exact match
        if (field.options.includes(trimmed)) return { value: trimmed };
        // Try case-insensitive
        const match = field.options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
        if (match) return { value: match };
        // Try index
        const idx = parseInt(trimmed);
        if (!isNaN(idx) && idx >= 1 && idx <= field.options.length) {
          return { value: field.options[idx - 1] };
        }
        return { value: null, error: `Please choose: ${field.options.join(", ")}` };
      }
      return { value: trimmed };
    }
    case "multi_select": {
      const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      if (field.options) {
        const valid = parts.filter((p) => field.options!.includes(p));
        if (valid.length === 0) return { value: null, error: `Please choose from: ${field.options.join(", ")}` };
        return { value: valid };
      }
      return { value: parts };
    }
    case "date": {
      const date = new Date(trimmed);
      if (isNaN(date.getTime())) return { value: null, error: `"${trimmed}" is not a valid date` };
      return { value: trimmed };
    }
    default:
      return { value: trimmed };
  }
}

/**
 * Process one step of conversational form collection.
 * Returns the next prompt or completion status.
 */
export function processFormStep(
  schema: FormSchema,
  currentData: Record<string, unknown>,
  currentFieldId: string | null,
  userResponse: string | null
): {
  done: boolean;
  nextFieldId: string | null;
  prompt: string | null;
  error: string | null;
  updatedData: Record<string, unknown>;
} {
  const data = { ...currentData };

  // Process user response for current field
  if (currentFieldId && userResponse !== null) {
    const field = schema.fields.find((f) => f.id === currentFieldId);
    if (field) {
      const parsed = parseFieldResponse(field, userResponse);
      if (parsed.error) {
        return {
          done: false,
          nextFieldId: currentFieldId,
          prompt: `${parsed.error}. ${getFieldPrompt(field)}`,
          error: parsed.error,
          updatedData: data,
        };
      }
      data[currentFieldId] = parsed.value;

      // Validate
      const validationError = validateField(field, parsed.value);
      if (validationError) {
        return {
          done: false,
          nextFieldId: currentFieldId,
          prompt: `${validationError.message}. ${getFieldPrompt(field)}`,
          error: validationError.message,
          updatedData: data,
        };
      }
    }
  }

  // Find next unfilled required field
  const remaining = getRemainingFields(schema, data);
  if (remaining.length === 0) {
    return { done: true, nextFieldId: null, prompt: null, error: null, updatedData: data };
  }

  const nextField = remaining[0];
  return {
    done: false,
    nextFieldId: nextField.id,
    prompt: getFieldPrompt(nextField),
    error: null,
    updatedData: data,
  };
}
