/**
 * Agent Reminder Tools — set, list, and cancel time-based reminders.
 *
 * Agents call set_reminder() to schedule a future notification.
 * The tower.ts scheduler loop checks every 30s for due reminders
 * and delivers them as follow-up messages to the agent.
 */

import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { AgentInterrupt } from "../../atp/agentInterrupt.js";
import { ATPDatabase } from "../../atp/database.js";

// ── Tool factory ────────────────────────────────────────────────────────────

export function getReminderTools(agentId: string): AgentTool[] {
  const setReminder: AgentTool = {
    name: "set_reminder",
    label: "Set Reminder",
    description:
      "Set a reminder for yourself at a specific date and time. " +
      "When the time arrives, you will receive a follow-up message with the reminder text. " +
      "Use ISO 8601 format for the datetime (e.g. '2026-03-18T14:30:00'). " +
      "You can also use relative descriptions in the message to help yourself remember context.",
    parameters: Type.Object({
      message: Type.String({ description: "What to remind yourself about" }),
      datetime: Type.String({
        description:
          "When to trigger the reminder in ISO 8601 format (e.g. '2026-03-18T14:30:00'). " +
          "Must be in the future.",
      }),
    }),

    execute: async (_, params: any) => {
      AgentInterrupt.check(agentId);

      const message: string = params.message;
      const datetime: string = params.datetime;

      // Validate datetime
      const scheduledDate = new Date(datetime);
      if (isNaN(scheduledDate.getTime())) {
        return {
          content: [{ type: "text" as const, text: `Invalid datetime format: "${datetime}". Use ISO 8601 (e.g. '2026-03-18T14:30:00').` }],
          details: {},
          isError: true,
        };
      }

      if (scheduledDate.getTime() <= Date.now()) {
        return {
          content: [{ type: "text" as const, text: `Datetime "${datetime}" is in the past. Reminders must be scheduled for the future.` }],
          details: {},
          isError: true,
        };
      }

      const scheduled_for = scheduledDate.toISOString();
      const reminder = ATPDatabase.createReminder(agentId, message, scheduled_for);

      const friendlyTime = scheduledDate.toLocaleString();
      return {
        content: [{
          type: "text" as const,
          text: `Reminder ${reminder.reminder_id} set for ${friendlyTime}:\n"${message}"`,
        }],
        details: {},
      };
    },
  };

  const listReminders: AgentTool = {
    name: "list_reminders",
    label: "List Reminders",
    description: "List all your active (not yet triggered) reminders.",
    parameters: Type.Object({}),

    execute: async () => {
      AgentInterrupt.check(agentId);

      const reminders = ATPDatabase.getRemindersForAgent(agentId, false);
      if (reminders.length === 0) {
        return {
          content: [{ type: "text" as const, text: "You have no active reminders." }],
          details: {},
        };
      }

      const lines = reminders.map((r) => {
        const when = new Date(r.scheduled_for).toLocaleString();
        return `- [${r.reminder_id}] ${when}: ${r.message}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `Active reminders (${reminders.length}):\n${lines.join("\n")}`,
        }],
        details: {},
      };
    },
  };

  const cancelReminder: AgentTool = {
    name: "cancel_reminder",
    label: "Cancel Reminder",
    description: "Cancel an active reminder by its ID (e.g. 'REM-001').",
    parameters: Type.Object({
      reminder_id: Type.String({ description: "The reminder ID to cancel (e.g. 'REM-001')" }),
    }),

    execute: async (_, params: any) => {
      AgentInterrupt.check(agentId);

      const id: string = params.reminder_id;
      const existing = ATPDatabase.getReminder(id);
      if (!existing) {
        return {
          content: [{ type: "text" as const, text: `Reminder "${id}" not found.` }],
          details: {},
          isError: true,
        };
      }
      if (existing.agent_id !== agentId) {
        return {
          content: [{ type: "text" as const, text: `Reminder "${id}" belongs to another agent.` }],
          details: {},
          isError: true,
        };
      }

      ATPDatabase.deleteReminder(id);
      return {
        content: [{ type: "text" as const, text: `Reminder ${id} cancelled.` }],
        details: {},
      };
    },
  };

  return [setReminder, listReminders, cancelReminder];
}
