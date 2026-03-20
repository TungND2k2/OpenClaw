import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as agentService from "../../modules/agents/agent.service.js";

export function registerAgentTools(server: McpServer): void {
  server.tool("register_agent", "Register a new agent", {
    name: z.string(),
    capabilities: z.array(z.string()),
    role: z.enum(["commander", "supervisor", "specialist", "worker"]).optional(),
    parent_agent_id: z.string().optional(),
    max_concurrent_tasks: z.number().optional(),
    cost_budget_usd: z.number().optional(),
  }, async (params) => {
    try {
      const agent = agentService.registerAgent({
        name: params.name,
        capabilities: params.capabilities,
        role: params.role,
        parentAgentId: params.parent_agent_id,
        maxConcurrentTasks: params.max_concurrent_tasks,
        costBudgetUsd: params.cost_budget_usd,
      });
      return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("agent_heartbeat", "Signal agent is alive", {
    agent_id: z.string(),
  }, async ({ agent_id }) => {
    try {
      agentService.heartbeat(agent_id);
      return { content: [{ type: "text", text: "OK" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("get_agent_status", "Get agent info and current tasks", {
    agent_id: z.string(),
  }, async ({ agent_id }) => {
    const agent = agentService.getAgent(agent_id);
    if (!agent) return { content: [{ type: "text", text: "Agent not found" }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
  });

  server.tool("list_agents", "List all agents", {
    status: z.string().optional(),
    role: z.string().optional(),
  }, async (params) => {
    const agents = agentService.listAgents({
      status: params.status,
      role: params.role,
    });
    return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
  });
}
