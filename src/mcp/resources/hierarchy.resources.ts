import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getHierarchyTree } from "../../modules/hierarchy/hierarchy.service.js";
import { getDashboard } from "../../modules/monitoring/monitor.service.js";

export function registerHierarchyResources(server: McpServer): void {
  server.resource("hierarchy-tree", "openclaw://hierarchy/tree", async () => {
    const tree = getHierarchyTree();
    return {
      contents: [{
        uri: "openclaw://hierarchy/tree",
        mimeType: "application/json",
        text: JSON.stringify(tree, null, 2),
      }],
    };
  });

  server.resource("monitoring-dashboard", "openclaw://monitoring/dashboard", async () => {
    const dash = getDashboard();
    return {
      contents: [{
        uri: "openclaw://monitoring/dashboard",
        mimeType: "application/json",
        text: JSON.stringify(dash, null, 2),
      }],
    };
  });
}
