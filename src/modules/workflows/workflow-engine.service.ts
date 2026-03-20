import { eq } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { workflowTemplates, workflowInstances, workflowApprovals } from "../../db/schema.js";
import { newId } from "../../utils/id.js";
import { nowMs } from "../../utils/clock.js";
import { evaluateCondition, type RuleCondition } from "./rules-engine.service.js";
import { validateForm, type FormSchema } from "./form-engine.service.js";

export interface WorkflowStage {
  id: string;
  name: string;
  type: "form" | "validation" | "approval" | "action" | "notification" | "conditional";
  form_id?: string;
  rules_id?: string;
  approval_config?: { approver_role: string; auto_approve_rules_id?: string; escalation_timeout_ms?: number };
  action_config?: { integration_id: string; action_type: string; payload_template: Record<string, unknown> };
  notification_config?: { channel: string; template: string; recipients: string[] };
  conditional_config?: { rules_id: string; true_next: string; false_next: string };
  next_stage_id?: string;
  timeout_ms?: number;
}

export interface WorkflowInstance {
  id: string;
  templateId: string;
  tenantId: string;
  initiatedBy: string;
  currentStageId: string | null;
  status: "active" | "paused" | "completed" | "failed" | "cancelled";
  formData: Record<string, unknown>;
  contextData: Record<string, unknown>;
  channel: string | null;
  history: { stage: string; action: string; at: number }[];
}

function loadInstance(instanceId: string): WorkflowInstance | null {
  const db = getDb();
  const row = db.select().from(workflowInstances).where(eq(workflowInstances.id, instanceId)).get();
  if (!row) return null;

  const parseJson = (val: unknown) => {
    if (typeof val === "string") try { return JSON.parse(val); } catch { return val; }
    return val ?? {};
  };

  return {
    ...row,
    formData: parseJson(row.formData),
    contextData: parseJson(row.contextData),
    history: parseJson(row.history) ?? [],
    status: row.status as any,
  };
}

function loadStages(templateId: string): WorkflowStage[] {
  const db = getDb();
  const tmpl = db.select().from(workflowTemplates).where(eq(workflowTemplates.id, templateId)).get();
  if (!tmpl) return [];
  const raw = tmpl.stages;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as WorkflowStage[]; } catch { return []; }
  }
  return (raw as unknown as WorkflowStage[]) ?? [];
}

/**
 * Start a new workflow instance.
 */
export function startWorkflow(input: {
  templateId: string;
  tenantId: string;
  initiatedBy: string;
  channel?: string;
  initialData?: Record<string, unknown>;
}): WorkflowInstance {
  const db = getDb();
  const now = nowMs();
  const id = newId();

  const stages = loadStages(input.templateId);
  const firstStageId = stages.length > 0 ? stages[0].id : null;

  db.insert(workflowInstances).values({
    id,
    templateId: input.templateId,
    tenantId: input.tenantId,
    initiatedBy: input.initiatedBy,
    currentStageId: firstStageId,
    status: "active",
    formData: JSON.stringify(input.initialData ?? {}),
    contextData: "{}",
    channel: (input.channel as "telegram" | "web" | "api" | "slack") ?? null,
    history: JSON.stringify([{ stage: firstStageId, action: "started", at: now }]),
    createdAt: now,
    updatedAt: now,
  }).run();

  return loadInstance(id)!;
}

/**
 * Advance workflow to the next stage.
 */
export function advanceStage(
  instanceId: string,
  nextStageId: string
): WorkflowInstance {
  const db = getDb();
  const now = nowMs();
  const instance = loadInstance(instanceId);
  if (!instance) throw new Error(`Instance ${instanceId} not found`);

  const history = [...instance.history, { stage: nextStageId, action: "advanced", at: now }];

  db.update(workflowInstances).set({
    currentStageId: nextStageId,
    history: JSON.stringify(history),
    updatedAt: now,
  }).where(eq(workflowInstances.id, instanceId)).run();

  return loadInstance(instanceId)!;
}

/**
 * Complete a workflow instance.
 */
export function completeWorkflow(instanceId: string): WorkflowInstance {
  const db = getDb();
  const now = nowMs();
  const instance = loadInstance(instanceId);
  if (!instance) throw new Error(`Instance ${instanceId} not found`);

  const history = [...instance.history, { stage: "end", action: "completed", at: now }];

  db.update(workflowInstances).set({
    status: "completed" as const,
    completedAt: now,
    history: JSON.stringify(history),
    updatedAt: now,
  }).where(eq(workflowInstances.id, instanceId)).run();

  return loadInstance(instanceId)!;
}

/**
 * Submit form data and validate.
 */
export function submitFormData(
  instanceId: string,
  formData: Record<string, unknown>,
  formSchema?: FormSchema
): { instance: WorkflowInstance; valid: boolean; errors: { fieldId: string; message: string }[] } {
  const db = getDb();
  const now = nowMs();
  const instance = loadInstance(instanceId);
  if (!instance) throw new Error(`Instance ${instanceId} not found`);

  const merged = { ...instance.formData, ...formData };

  let valid = true;
  let errors: { fieldId: string; message: string }[] = [];
  if (formSchema) {
    const result = validateForm(formSchema, merged);
    valid = result.valid;
    errors = result.errors;
  }

  db.update(workflowInstances).set({
    formData: JSON.stringify(merged),
    updatedAt: now,
  }).where(eq(workflowInstances.id, instanceId)).run();

  return { instance: loadInstance(instanceId)!, valid, errors };
}

/**
 * Create an approval request for a workflow stage.
 */
export function requestApproval(input: {
  instanceId: string;
  stageId: string;
  approverId: string;
}): string {
  const db = getDb();
  const now = nowMs();
  const id = newId();
  db.insert(workflowApprovals).values({
    id,
    instanceId: input.instanceId,
    stageId: input.stageId,
    approverId: input.approverId,
    status: "pending",
    createdAt: now,
  }).run();
  return id;
}

/**
 * Process approval decision.
 */
export function processApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  reason?: string
): { status: string } {
  const db = getDb();
  const now = nowMs();
  db.update(workflowApprovals).set({
    status: decision,
    decisionReason: reason ?? null,
    decidedAt: now,
  }).where(eq(workflowApprovals.id, approvalId)).run();
  return { status: decision };
}

/**
 * Get the current stage of a workflow.
 */
export function getCurrentStage(instanceId: string): WorkflowStage | null {
  const instance = loadInstance(instanceId);
  if (!instance || !instance.currentStageId) return null;
  const stages = loadStages(instance.templateId);
  return stages.find((s) => s.id === instance.currentStageId) ?? null;
}
