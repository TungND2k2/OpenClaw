import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as logService from "../../modules/logs/log.service.js";

export function registerLogTools(server: McpServer): void {
  server.tool("write_log", "Append a log entry for a task", {
    task_id: z.string(),
    agent_id: z.string(),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }, async (params) => {
    const entry = logService.writeLog({
      taskId: params.task_id,
      agentId: params.agent_id,
      level: params.level,
      message: params.message,
      metadata: params.metadata,
    });
    return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
  });

  server.tool("get_logs", "Read logs for a task", {
    task_id: z.string(),
    level: z.enum(["debug", "info", "warn", "error"]).optional(),
    limit: z.number().optional(),
    since: z.number().optional(),
  }, async (params) => {
    const logs = logService.getLogs({
      taskId: params.task_id,
      level: params.level,
      limit: params.limit,
      since: params.since,
    });
    return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
  });
}
