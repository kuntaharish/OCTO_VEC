/**
 * Agent Todo Tool — lightweight per-agent, per-task checklist.
 *
 * Each task gets its own isolated todo list. When an agent starts a new task,
 * calling todo() with that task_id automatically replaces the previous list.
 * The dashboard only shows the CURRENT (latest) task's todos.
 *
 * State lives in the chat history (tool result details) so it survives
 * context compaction and branching. A snapshot is broadcast via SSE.
 */

import { Type, StringEnum } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { AgentInterrupt } from "../../atp/agentInterrupt.js";
import { publishTodoUpdate } from "../../atp/agentStreamBus.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
}

export interface TodoSnapshot {
  taskId: string;
  todos: TodoItem[];
}

export interface TodoDetails {
  taskId: string;
  todos: TodoItem[];
}

// ── In-memory snapshot per agent (for API/SSE) ────────────────────────────────
// Keyed by agentId → { taskId, todos } — only the CURRENT task's list.

const _agentTodos: Map<string, TodoSnapshot> = new Map();

/** Get the latest todo snapshot for an agent (used by dashboard API). */
export function getAgentTodos(agentId: string): TodoSnapshot | null {
  return _agentTodos.get(agentId) ?? null;
}

/** Get all agents' todos (used by dashboard API). */
export function getAllAgentTodos(): Record<string, TodoSnapshot> {
  const out: Record<string, TodoSnapshot> = {};
  for (const [id, snap] of _agentTodos) {
    if (snap.todos.length > 0) out[id] = snap;
  }
  return out;
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function getTodoTool(agentId: string): AgentTool {
  return {
    name: "todo",
    label: "Todo",
    description:
      "Manage your personal todo list for the CURRENT task. " +
      "You MUST pass the task_id you are working on — this scopes the list to that task. " +
      "Pass the FULL todo list each time (not a diff). " +
      "When you start a new task, call todo() with the new task_id — the old list is automatically replaced. " +
      "Use for multi-step work: create todos when you start, mark in_progress as you work, " +
      "and completed when done. Only one item should be in_progress at a time. " +
      "Mark tasks complete IMMEDIATELY after finishing — don't batch completions.",
    parameters: Type.Object({
      task_id: Type.String({ description: "The ATP task ID this todo list belongs to (e.g. 'TASK-001')" }),
      todos: Type.Array(
        Type.Object({
          id: Type.String({ description: "Short unique ID (e.g. '1', '2', 'setup')" }),
          content: Type.String({ description: "What needs to be done" }),
          status: StringEnum(["pending", "in_progress", "completed"] as const),
          priority: StringEnum(["high", "medium", "low"] as const),
        }),
        { description: "The FULL todo list for this task — every item, not just changes" }
      ),
    }),

    execute: async (_, params: any) => {
      AgentInterrupt.check(agentId);

      const taskId: string = params.task_id;
      const todos: TodoItem[] = params.todos;

      // Replace snapshot — new task_id wipes the old list automatically
      const snap: TodoSnapshot = { taskId, todos };
      _agentTodos.set(agentId, snap);

      // Broadcast to dashboard via SSE
      publishTodoUpdate(agentId, taskId, todos);

      // Build human-readable summary
      const completed = todos.filter((t: TodoItem) => t.status === "completed").length;
      const inProgress = todos.filter((t: TodoItem) => t.status === "in_progress").length;
      const pending = todos.filter((t: TodoItem) => t.status === "pending").length;
      const total = todos.length;

      const lines: string[] = [
        `[${taskId}] Todo: ${completed}/${total} completed, ${inProgress} in progress, ${pending} pending`,
      ];
      for (const t of todos) {
        const icon =
          t.status === "completed" ? "✓" :
          t.status === "in_progress" ? "►" : "○";
        lines.push(`  ${icon} [${t.id}] ${t.content}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: { taskId, todos } as TodoDetails,
      };
    },
  };
}
