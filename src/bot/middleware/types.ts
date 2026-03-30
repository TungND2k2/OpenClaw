/**
 * Pipeline context shared across pipeline stages and logging.
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

  // Built during pipeline (for logging)
  knowledgeContext: string;
  fileContext: string;
  formContext: string;
  systemPrompt: string;

  // Per-request context for tool execution
  currentUser: { id: string; name: string; role: string } | null;

  // Output
  text: string;
  files: { url: string; fileName: string; mimeType: string }[];
  toolCalls: { tool: string; args: any; result?: any }[];
}
