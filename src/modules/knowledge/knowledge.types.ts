export const KNOWLEDGE_TYPES = [
  "lesson_learned",
  "best_practice",
  "anti_pattern",
  "domain_knowledge",
  "procedure",
] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

export type KnowledgeScope = "global" | `agent:${string}` | `team:${string}` | `domain:${string}`;

export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  domain: string;
  tags: string[];
  sourceTaskId: string | null;
  sourceAgentId: string;
  scope: string;
  relevanceScore: number;
  confidence: number;
  usageCount: number;
  upvotes: number;
  downvotes: number;
  outcome: "success" | "failure" | "neutral" | null;
  contextSnapshot: Record<string, unknown> | null;
  supersededById: string | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RetrievedKnowledge extends KnowledgeEntry {
  matchScore: number;
  effectiveRelevance: number;
}
