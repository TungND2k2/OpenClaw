/**
 * Pipeline context shared by all middleware stages.
 */
export interface PipelineContext {
  // Input
  userMessage: string;
  userName: string;
  userId: string;
  userRole: string;
  tenantId: string;
  tenantName: string;
  conversationHistory: { role: string; content: string }[];
  aiConfig: Record<string, unknown>;
  sessionId: string;
  onProgress?: (stage: string) => Promise<void>;
  onPersonaMessage?: (msg: { emoji: string; name: string; content: string }) => Promise<void>;

  // Built during pipeline
  keywords: string[];
  knowledgeContext: string;
  knowledgeEntries: { matchScore: number; title: string; content: string; type: string }[];
  fileContext: string;
  formContext: string;
  onboardingContext: string;
  systemPrompt: string;
  engine: import("../../modules/agents/agent-runner.js").LLMEngine | "";
  personas: any[];

  // Per-request context for form + permission tools (replaces globals)
  currentUser: { id: string; name: string; role: string } | null;

  // Track last tools called per session — for feedback detection
  lastToolsCalledBySession: Map<string, string[]>;

  // Commander agent
  commanderAgentId: string;
  taskId: string | null;

  // Output
  text: string;
  files: { url: string; fileName: string; mimeType: string }[];
  toolCalls: { tool: string; args: any; result?: any }[];
  personaMessages?: { emoji: string; name: string; content: string }[];
  done: boolean;
}
