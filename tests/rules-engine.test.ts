import { describe, it, expect } from "vitest";
import { evaluateCondition, evaluateRule, type RuleCondition } from "../src/modules/workflows/rules-engine.service.js";

describe("Rules Engine", () => {
  it("should evaluate simple comparison", () => {
    const condition: RuleCondition = { type: "comparison", field: "amount", operator: "gt", value: 100 };
    expect(evaluateCondition(condition, { amount: 150 })).toBe(true);
    expect(evaluateCondition(condition, { amount: 50 })).toBe(false);
  });

  it("should evaluate AND conditions", () => {
    const condition: RuleCondition = {
      type: "AND",
      children: [
        { type: "comparison", field: "amount", operator: "gt", value: 100 },
        { type: "comparison", field: "status", operator: "eq", value: "active" },
      ],
    };
    expect(evaluateCondition(condition, { amount: 150, status: "active" })).toBe(true);
    expect(evaluateCondition(condition, { amount: 150, status: "inactive" })).toBe(false);
  });

  it("should evaluate OR conditions", () => {
    const condition: RuleCondition = {
      type: "OR",
      children: [
        { type: "comparison", field: "role", operator: "eq", value: "admin" },
        { type: "comparison", field: "role", operator: "eq", value: "manager" },
      ],
    };
    expect(evaluateCondition(condition, { role: "admin" })).toBe(true);
    expect(evaluateCondition(condition, { role: "manager" })).toBe(true);
    expect(evaluateCondition(condition, { role: "worker" })).toBe(false);
  });

  it("should evaluate NOT conditions", () => {
    const condition: RuleCondition = {
      type: "NOT",
      children: [{ type: "comparison", field: "blocked", operator: "eq", value: true }],
    };
    expect(evaluateCondition(condition, { blocked: false })).toBe(true);
    expect(evaluateCondition(condition, { blocked: true })).toBe(false);
  });

  it("should evaluate nested conditions", () => {
    const condition: RuleCondition = {
      type: "AND",
      children: [
        { type: "comparison", field: "form_data.order_total", operator: "gt", value: 10000000 },
        {
          type: "OR",
          children: [
            { type: "comparison", field: "form_data.payment_method", operator: "eq", value: "credit" },
            { type: "comparison", field: "form_data.payment_method", operator: "eq", value: "loan" },
          ],
        },
      ],
    };
    expect(evaluateCondition(condition, { form_data: { order_total: 15000000, payment_method: "credit" } })).toBe(true);
    expect(evaluateCondition(condition, { form_data: { order_total: 5000000, payment_method: "credit" } })).toBe(false);
  });

  it("should evaluate 'in' operator", () => {
    const condition: RuleCondition = { type: "comparison", field: "region", operator: "in", value: ["north", "south"] };
    expect(evaluateCondition(condition, { region: "north" })).toBe(true);
    expect(evaluateCondition(condition, { region: "west" })).toBe(false);
  });

  it("should evaluate 'contains' operator", () => {
    const condition: RuleCondition = { type: "comparison", field: "name", operator: "contains", value: "Corp" };
    expect(evaluateCondition(condition, { name: "ABC Corp Ltd" })).toBe(true);
    expect(evaluateCondition(condition, { name: "XYZ Inc" })).toBe(false);
  });

  it("should return actions when rule matches", () => {
    const result = evaluateRule({
      conditions: { type: "comparison", field: "amount", operator: "gt", value: 1000 },
      actions: [{ type: "escalate", params: { to_role: "manager" } }],
    }, { amount: 5000 });

    expect(result.matched).toBe(true);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("escalate");
  });
});
