export interface DAGNode {
  taskId: string;
  title: string;
  requiredCapabilities: string[];
  dependsOn: string[]; // other taskIds
}

export interface DAGEdge {
  from: string; // taskId
  to: string; // taskId
}

export interface PlanGraph {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface ExecutionPlanRecord {
  id: string;
  rootTaskId: string;
  createdByAgentId: string;
  strategy: "sequential" | "parallel" | "pipeline" | "mixed";
  planGraph: PlanGraph;
  status: "draft" | "active" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

export interface AgentScore {
  agentId: string;
  score: number;
  capabilityMatch: number;
  availability: number;
  performance: number;
  costEfficiency: number;
}

export interface SubtaskInput {
  title: string;
  description?: string;
  requiredCapabilities?: string[];
  dependsOnIndices?: number[]; // indices into the subtasks array
  estimatedDurationMs?: number;
}

export interface DecomposeInput {
  taskId: string;
  agentId: string;
  subtasks: SubtaskInput[];
  strategy?: "sequential" | "parallel" | "pipeline" | "mixed";
}
