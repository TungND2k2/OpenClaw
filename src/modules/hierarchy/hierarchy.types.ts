export const ROLES = ["commander", "supervisor", "specialist", "worker"] as const;
export type Role = (typeof ROLES)[number];

export const AUTHORITY_LEVELS: Record<Role, number> = {
  commander: 4,
  supervisor: 3,
  specialist: 2,
  worker: 1,
};

export const MAX_SUBORDINATES: Record<Role, number> = {
  commander: Infinity,
  supervisor: 10,
  specialist: 0,
  worker: 0,
};

export type AgentStatus =
  | "registering"
  | "idle"
  | "busy"
  | "suspended"
  | "offline"
  | "deactivated";

export interface HierarchyNode {
  agentId: string;
  name: string;
  role: Role;
  authorityLevel: number;
  status: AgentStatus;
  parentAgentId: string | null;
  depth: number;
  children: HierarchyNode[];
}

export type Action =
  | "create_task_toplevel"
  | "create_task_subtask"
  | "assign_task"
  | "reassign_task"
  | "cancel_task"
  | "read_global_context"
  | "read_subtree_context"
  | "spawn_agent"
  | "kill_agent"
  | "promote_agent"
  | "set_budget"
  | "send_message_down"
  | "send_message_up"
  | "broadcast";

/** Minimum authority level required for each action */
export const ACTION_MIN_AUTHORITY: Record<Action, number> = {
  create_task_toplevel: 4,    // commander only
  create_task_subtask: 2,     // specialist+
  assign_task: 3,             // supervisor+
  reassign_task: 3,           // supervisor+
  cancel_task: 2,             // specialist+ (own scope enforced separately)
  read_global_context: 4,     // commander only
  read_subtree_context: 2,    // specialist+
  spawn_agent: 4,             // commander only
  kill_agent: 4,              // commander only
  promote_agent: 4,           // commander only
  set_budget: 3,              // supervisor+
  send_message_down: 3,       // supervisor+
  send_message_up: 1,         // all
  broadcast: 3,               // supervisor+
};

export interface PromotionRequest {
  agentId: string;
  newRole: Role;
  requestingAgentId: string;
}
