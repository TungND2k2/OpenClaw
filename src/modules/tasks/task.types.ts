export const TASK_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "delegated",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const EXECUTION_STRATEGIES = [
  "sequential",
  "parallel",
  "pipeline",
  "swarm",
] as const;
export type ExecutionStrategy = (typeof EXECUTION_STRATEGIES)[number];

/** Valid state transitions */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["assigned", "delegated", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["delegated", "completed", "failed", "cancelled"],
  delegated: ["completed", "blocked"],
  blocked: ["pending", "cancelled"],
  completed: [],
  failed: ["pending"], // retry
  cancelled: [],
};

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
  urgency?: number;
  tags?: string[];
  parentTaskId?: string;
  requiredCapabilities?: string[];
  executionStrategy?: ExecutionStrategy;
  estimatedDurationMs?: number;
  costBudgetUsd?: number;
  maxRetries?: number;
  deadline?: number;
  createdByAgentId?: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  urgency: number;
  assignedAgentId: string | null;
  createdByAgentId: string | null;
  delegatedByAgentId: string | null;
  parentTaskId: string | null;
  executionStrategy: ExecutionStrategy | null;
  dependencyIds: string[];
  depth: number;
  maxDepth: number;
  retryCount: number;
  maxRetries: number;
  escalationAgentId: string | null;
  requiredCapabilities: string[];
  estimatedDurationMs: number | null;
  costBudgetUsd: number | null;
  costSpentUsd: number;
  tags: string[];
  result: string | null;
  error: string | null;
  createdAt: number;
  assignedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  deadline: number | null;
}
