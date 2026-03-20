import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as monitorService from "../../modules/monitoring/monitor.service.js";
import { queryDecisions } from "../../modules/decisions/decision.service.js";

export function registerMonitoringTools(server: McpServer): void {
  server.tool("suspend_agent", "Freeze agent and reassign tasks", {
    agent_id: z.string(),
    reason: z.string(),
    requesting_agent_id: z.string(),
  }, async ({ agent_id, reason, requesting_agent_id }) => {
    try {
      const result = monitorService.suspendAgent(agent_id, reason, requesting_agent_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("kill_agent", "Permanently deactivate agent", {
    agent_id: z.string(),
    reason: z.string(),
    requesting_agent_id: z.string(),
  }, async ({ agent_id, reason, requesting_agent_id }) => {
    try {
      monitorService.killAgent(agent_id, reason, requesting_agent_id);
      return { content: [{ type: "text", text: "Agent deactivated" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("set_agent_budget", "Set cost limit for agent", {
    agent_id: z.string(),
    budget_usd: z.number(),
  }, async ({ agent_id, budget_usd }) => {
    monitorService.setAgentBudget(agent_id, budget_usd);
    return { content: [{ type: "text", text: "OK" }] };
  });

  server.tool("get_hierarchy_dashboard", "Full system status view", {}, async () => {
    const dash = monitorService.getDashboard();
    return { content: [{ type: "text", text: JSON.stringify(dash, null, 2) }] };
  });

  server.tool("get_decision_audit", "View decision history", {
    agent_id: z.string().optional(),
    task_id: z.string().optional(),
    decision_type: z.string().optional(),
    limit: z.number().optional(),
  }, async (params) => {
    const decs = queryDecisions({
      agentId: params.agent_id,
      taskId: params.task_id,
      decisionType: params.decision_type as any,
      limit: params.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(decs, null, 2) }] };
  });
}
