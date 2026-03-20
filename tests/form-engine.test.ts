import { describe, it, expect } from "vitest";
import { validateForm, getRemainingFields, isFieldVisible, type FormSchema } from "../src/modules/workflows/form-engine.service.js";
import { parseFieldResponse, processFormStep } from "../src/modules/conversations/chat-form.service.js";

const orderForm: FormSchema = {
  fields: [
    { id: "customer_name", label: "Customer Name", type: "text", required: true, validation: { min_length: 2 } },
    { id: "email", label: "Email", type: "email", required: true },
    { id: "quantity", label: "Quantity", type: "number", required: true, validation: { min: 1, max: 1000 } },
    { id: "product", label: "Product", type: "select", required: true, options: ["Widget A", "Widget B", "Widget C"] },
    { id: "notes", label: "Notes", type: "text", required: false },
    { id: "rush", label: "Rush Order", type: "boolean", required: true },
    { id: "rush_reason", label: "Rush Reason", type: "text", required: true, depends_on: { field_id: "rush", condition: "equals", value: true } },
  ],
};

describe("Form Engine", () => {
  it("should validate required fields", () => {
    const result = validateForm(orderForm, {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should validate complete form", () => {
    const result = validateForm(orderForm, {
      customer_name: "Test Corp",
      email: "test@example.com",
      quantity: 10,
      product: "Widget A",
      rush: false,
    });
    expect(result.valid).toBe(true);
  });

  it("should validate email format", () => {
    const result = validateForm(orderForm, {
      customer_name: "Test",
      email: "not-an-email",
      quantity: 1,
      product: "Widget A",
      rush: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.fieldId === "email")).toBe(true);
  });

  it("should respect conditional visibility", () => {
    // rush_reason only required when rush=true
    const r1 = validateForm(orderForm, {
      customer_name: "Test",
      email: "t@t.com",
      quantity: 1,
      product: "Widget A",
      rush: false,
    });
    expect(r1.valid).toBe(true); // rush_reason not needed

    const r2 = validateForm(orderForm, {
      customer_name: "Test",
      email: "t@t.com",
      quantity: 1,
      product: "Widget A",
      rush: true,
    });
    expect(r2.valid).toBe(false); // rush_reason needed
  });

  it("should get remaining fields", () => {
    const remaining = getRemainingFields(orderForm, { customer_name: "Test" });
    expect(remaining.some((f) => f.id === "email")).toBe(true);
    expect(remaining.some((f) => f.id === "customer_name")).toBe(false);
  });
});

describe("Chat Form", () => {
  it("should parse number responses", () => {
    expect(parseFieldResponse({ id: "qty", label: "Qty", type: "number", required: true }, "42").value).toBe(42);
    expect(parseFieldResponse({ id: "qty", label: "Qty", type: "number", required: true }, "abc").error).toBeTruthy();
  });

  it("should parse boolean responses", () => {
    expect(parseFieldResponse({ id: "ok", label: "OK", type: "boolean", required: true }, "yes").value).toBe(true);
    expect(parseFieldResponse({ id: "ok", label: "OK", type: "boolean", required: true }, "không").value).toBe(false);
  });

  it("should parse select responses", () => {
    const field = { id: "p", label: "Product", type: "select" as const, required: true, options: ["A", "B", "C"] };
    expect(parseFieldResponse(field, "B").value).toBe("B");
    expect(parseFieldResponse(field, "2").value).toBe("B"); // by index
    expect(parseFieldResponse(field, "D").error).toBeTruthy();
  });

  it("should process form step by step", () => {
    const schema: FormSchema = {
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "age", label: "Age", type: "number", required: true },
      ],
    };

    // Step 1: start
    const s1 = processFormStep(schema, {}, null, null);
    expect(s1.done).toBe(false);
    expect(s1.nextFieldId).toBe("name");

    // Step 2: provide name
    const s2 = processFormStep(schema, s1.updatedData, "name", "Alice");
    expect(s2.done).toBe(false);
    expect(s2.nextFieldId).toBe("age");
    expect(s2.updatedData.name).toBe("Alice");

    // Step 3: provide age
    const s3 = processFormStep(schema, s2.updatedData, "age", "30");
    expect(s3.done).toBe(true);
    expect(s3.updatedData.age).toBe(30);
  });
});
