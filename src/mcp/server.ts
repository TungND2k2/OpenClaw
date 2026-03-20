import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTaskTools } from "./tools/task.tools.js";
import { registerAgentTools } from "./tools/agent.tools.js";
import { registerHierarchyTools } from "./tools/hierarchy.tools.js";
import { registerOrchestrationTools } from "./tools/orchestration.tools.js";
import { registerMessageTools } from "./tools/message.tools.js";
import { registerMonitoringTools } from "./tools/monitoring.tools.js";
import { registerLogTools } from "./tools/log.tools.js";
import { registerNotebookTools } from "./tools/notebook.tools.js";
import { registerAnalyticsTools } from "./tools/analytics.tools.js";
import { registerKnowledgeTools } from "./tools/knowledge.tools.js";
import { registerWorkflowTools } from "./tools/workflow.tools.js";
import { registerTenantTools } from "./tools/tenant.tools.js";
import { registerRulesTools } from "./tools/rules.tools.js";
import { registerIntegrationTools } from "./tools/integration.tools.js";
import { registerConversationTools } from "./tools/conversation.tools.js";
import { registerTaskResources } from "./resources/task.resources.js";
import { registerHierarchyResources } from "./resources/hierarchy.resources.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "openclaw",
    version: "0.1.0",
  });

  // Register all tools (63 total)
  registerTaskTools(server);
  registerAgentTools(server);
  registerHierarchyTools(server);
  registerOrchestrationTools(server);
  registerMessageTools(server);
  registerMonitoringTools(server);
  registerLogTools(server);
  registerNotebookTools(server);
  registerAnalyticsTools(server);
  registerKnowledgeTools(server);
  registerWorkflowTools(server);
  registerTenantTools(server);
  registerRulesTools(server);
  registerIntegrationTools(server);
  registerConversationTools(server);

  // Register resources (11 total)
  registerTaskResources(server);
  registerHierarchyResources(server);

  return server;
}
