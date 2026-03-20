export const MESSAGE_TYPES = [
  "command",
  "report",
  "request",
  "broadcast",
  "escalation",
  "coordination",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = [
  "pending",
  "delivered",
  "acknowledged",
  "expired",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface CommandPayload {
  action: string;
  taskId?: string;
  parameters?: Record<string, unknown>;
}

export interface ReportPayload {
  taskId: string;
  status: string;
  progressPct?: number;
  details?: string;
}

export interface RequestPayload {
  requestType: string;
  taskId?: string;
  details: string;
}

export interface EscalationPayload {
  taskId: string;
  error: string;
  attemptedRemedies?: string[];
}

export interface CoordinationPayload {
  taskId: string;
  sharedState?: Record<string, unknown>;
  action: string;
}

export type MessagePayload =
  | CommandPayload
  | ReportPayload
  | RequestPayload
  | EscalationPayload
  | CoordinationPayload
  | Record<string, unknown>;

export interface MessageRecord {
  id: string;
  type: MessageType;
  fromAgentId: string;
  toAgentId: string | null;
  taskId: string | null;
  priority: number;
  payload: MessagePayload;
  status: MessageStatus;
  expiresAt: number | null;
  createdAt: number;
  deliveredAt: number | null;
  acknowledgedAt: number | null;
}

export interface SendMessageInput {
  fromAgentId: string;
  toAgentId?: string;
  type: MessageType;
  taskId?: string;
  payload: MessagePayload;
  priority?: number;
  expiresAt?: number;
}
