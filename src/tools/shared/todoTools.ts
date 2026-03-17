/**
 * Agent Todo Tool — lightweight per-agent task checklist.
 *
 * Inspired by Claude Code's TodoWrite: the agent breaks work into steps,
 * tracks progress, and updates in real time. State lives in the chat
 * history (tool result details) so it survives context compaction and
 * branching. A snapshot is also broadcast via SSE for the dashboard.
 *
 * Usage:
 *   import { getTodoTool } from "./todoTools.js";
 *   tools: [getTodoTool(agentId), ...]
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

export interface TodoDetails {
  todos: TodoItem[];
}

// ── In-memory snapshot per agent (for API/SSE) ────────────────────────────────

const _agentTodos: Map<string, TodoItem[]> = new Map();

/** Get the latest todo snapshot for an agent (used by dashboard API). */
export function getAgentTodos(agentId: string): TodoItem[] {
  return _agentTodos.get(agentId) ?? [];
}

/** Get all agents' todos (used by dashboard API). */
export function getAllAgentTodos(): Record<string, TodoItem[]> {
  const out: Record<string, TodoItem[]> = {};
  for (const [id, todos] of _agentTodos) {
    if (todos.length > 0) out[id] = todos;
  }
  return out;
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function getTodoTool(agentId: string): AgentTool {
  return {
    name: "todo",
    label: "Todo",
    description:
      "Manage your personal todo list to track progress on the current task. " +
      "Pass the FULL todo list each time (not a diff). " +
      "Use for multi-step work: create todos when you start, mark in_progress as you work, " +
      "and completed when done. Only one item should be in_progress at a time. " +
      "Mark tasks complete IMMEDIATELY after finishing — don't batch completions.",
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          id: Type.String({ description: "Short unique ID (e.g. '1', '2', 'setup')" }),
          content: Type.String({ description: "What needs to be done" }),
          status: StringEnum(["pending", "in_progress", "completed"] as const),
          priority: StringEnum(["high", "medium", "low"] as const),
        }),
        { description: "The FULL todo list — every item, not just changes" }
      ),
    }),

    execute: async (_, params: any) => {
      AgentInterrupt.check(agentId);

      const todos: TodoItem[] = params.todos;

      // Update in-memory snapshot
      _agentTodos.set(agentId, todos);

      // Broadcast to dashboard via SSE
      publishTodoUpdate(agentId, todos);

      // Build human-readable summary
      const completed = todos.filter((t: TodoItem) => t.status === "completed").length;
      const inProgress = todos.filter((t: TodoItem) => t.status === "in_progress").length;
      const pending = todos.filter((t: TodoItem) => t.status === "pending").length;
      const total = todos.length;

      const lines: string[] = [
        `Todo list updated: ${completed}/${total} completed, ${inProgress} in progress, ${pending} pending`,
      ];
      for (const t of todos) {
        const icon =
          t.status === "completed" ? "✓" :
          t.status === "in_progress" ? "►" : "○";
        lines.push(`  ${icon} [${t.id}] ${t.content}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: { todos } as TodoDetails,
      };
    },
  };
}
