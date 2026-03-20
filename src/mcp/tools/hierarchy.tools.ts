import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as hierarchyService from "../../modules/hierarchy/hierarchy.service.js";

export function registerHierarchyTools(server: McpServer): void {
  server.tool("set_agent_parent", "Assign a supervisor to an agent", {
    agent_id: z.string(),
    parent_agent_id: z.string(),
  }, async ({ agent_id, parent_agent_id }) => {
    try {
      hierarchyService.setAgentParent(agent_id, parent_agent_id);
      return { content: [{ type: "text", text: "OK" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("promote_agent", "Promote or demote an agent", {
    agent_id: z.string(),
    new_role: z.enum(["commander", "supervisor", "specialist", "worker"]),
    requesting_agent_id: z.string(),
  }, async ({ agent_id, new_role, requesting_agent_id }) => {
    try {
      hierarchyService.promoteAgent(agent_id, new_role, requesting_agent_id);
      return { content: [{ type: "text", text: "OK" }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("get_subordinates", "List agents under command", {
    agent_id: z.string(),
    depth: z.number().optional(),
  }, async ({ agent_id, depth }) => {
    const subs = hierarchyService.getSubordinates(agent_id, depth);
    return { content: [{ type: "text", text: JSON.stringify(subs, null, 2) }] };
  });

  server.tool("get_chain_of_command", "Get path from agent to Commander", {
    agent_id: z.string(),
  }, async ({ agent_id }) => {
    const chain = hierarchyService.getChainOfCommand(agent_id);
    return { content: [{ type: "text", text: JSON.stringify(chain, null, 2) }] };
  });

  server.tool("get_hierarchy_tree", "Full org chart", {}, async () => {
    const tree = hierarchyService.getHierarchyTree();
    return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
  });
}
