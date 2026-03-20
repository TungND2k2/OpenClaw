import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as taskService from "../../modules/tasks/task.service.js";

export function registerTaskTools(server: McpServer): void {
  server.tool("list_tasks", "List tasks with filters", {
    status: z.string().optional(),
    assigned_to: z.string().optional(),
    priority_min: z.number().optional(),
    tags: z.array(z.string()).optional(),
    parent_task_id: z.string().optional(),
    limit: z.number().optional(),
  }, async (params) => {
    const tasks = taskService.listTasks({
      status: params.status as any,
      assignedTo: params.assigned_to,
      priorityMin: params.priority_min,
      tags: params.tags,
      parentTaskId: params.parent_task_id,
      limit: params.limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
  });

  server.tool("get_task", "Get task details with subtasks", {
    task_id: z.string(),
  }, async ({ task_id }) => {
    const task = taskService.getTask(task_id);
    if (!task) return { content: [{ type: "text", text: "Task not found" }], isError: true };
    const subtasks = taskService.getSubtasks(task_id);
    return { content: [{ type: "text", text: JSON.stringify({ ...task, subtasks }, null, 2) }] };
  });

  server.tool("create_task", "Create a new task", {
    title: z.string(),
    description: z.string().optional(),
    priority: z.number().min(1).max(5).optional(),
    urgency: z.number().min(1).max(5).optional(),
    tags: z.array(z.string()).optional(),
    parent_task_id: z.string().optional(),
    required_capabilities: z.array(z.string()).optional(),
    execution_strategy: z.enum(["sequential", "parallel", "pipeline", "swarm"]).optional(),
    deadline: z.number().optional(),
    created_by_agent_id: z.string().optional(),
  }, async (params) => {
    const task = taskService.createTask({
      title: params.title,
      description: params.description,
      priority: params.priority,
      urgency: params.urgency,
      tags: params.tags,
      parentTaskId: params.parent_task_id,
      requiredCapabilities: params.required_capabilities,
      executionStrategy: params.execution_strategy,
      deadline: params.deadline,
      createdByAgentId: params.created_by_agent_id,
    });
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
  });

  server.tool("claim_task", "Agent claims an unassigned task", {
    task_id: z.string(),
    agent_id: z.string(),
  }, async ({ task_id, agent_id }) => {
    try {
      const task = taskService.claimTask(task_id, agent_id);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("start_task", "Start working on an assigned task", {
    task_id: z.string(),
    agent_id: z.string(),
  }, async ({ task_id, agent_id }) => {
    try {
      const task = taskService.startTask(task_id, agent_id);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("complete_task", "Mark task as completed", {
    task_id: z.string(),
    agent_id: z.string(),
    result: z.string(),
  }, async ({ task_id, agent_id, result }) => {
    try {
      const task = taskService.completeTask(task_id, agent_id, result);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("fail_task", "Mark task as failed", {
    task_id: z.string(),
    agent_id: z.string(),
    error: z.string(),
  }, async ({ task_id, agent_id, error }) => {
    try {
      const task = taskService.failTask(task_id, agent_id, error);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });

  server.tool("cancel_task", "Cancel a task", {
    task_id: z.string(),
    reason: z.string().optional(),
  }, async ({ task_id, reason }) => {
    try {
      const task = taskService.cancelTask(task_id, reason);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  });
}
