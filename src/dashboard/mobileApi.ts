/**
 * Mobile-optimized API endpoints — /api/m/*
 *
 * Lightweight, fast, single-call endpoints designed for the OCTO VEC mobile app.
 * Each endpoint returns only the data the mobile app needs — no bloat.
 *
 * Core goals:
 *   1. Initiate & monitor tasks
 *   2. Approve agent permission requests
 *   3. See live agent status
 *   4. Chat with agents
 *   5. Interrupt / steer running agents
 */

import { Router } from "express";
import { ATPDatabase } from "../atp/database.js";
import { EventLog } from "../atp/eventLog.js";
import { UserChatLog } from "../atp/chatLog.js";
import { AgentMessageQueue, AGENT_DISPLAY_NAMES } from "../atp/agentMessageQueue.js";
import { AgentInterrupt } from "../atp/agentInterrupt.js";
import { getReplayBuffer } from "../atp/agentStreamBus.js";
import type { StreamToken } from "../atp/agentStreamBus.js";
import { getAllAgentTodos } from "../tools/shared/todoTools.js";
import { getRosterEntry } from "../ar/roster.js";
import { ActiveChannelState, EditorChannelState } from "../channels/activeChannel.js";
import { clearActiveGroup } from "../atp/agentGroups.js";
import type { AgentRuntime } from "../atp/agentRuntime.js";
import type { VECAgent } from "../atp/inboxLoop.js";
import { getAllUsage as getFinanceAllUsage, getTotals as getFinanceTotals, getBudgetStatus } from "../atp/tokenTracker.js";

// ── Approval system (in-memory for now, persisted on restart via events) ─────

interface PendingApproval {
  id: string;
  agentId: string;
  agentName: string;
  type: "dangerous_action" | "deploy" | "delete" | "external_api" | "cost_limit" | "general";
  title: string;
  description: string;
  context?: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "approved" | "denied";
  resolvedAt?: string;
}

const _pendingApprovals: PendingApproval[] = [];
let _approvalCounter = 0;

/** Called by agent tools to request human approval. Returns a promise that resolves when user decides. */
export function requestApproval(
  agentId: string,
  type: PendingApproval["type"],
  title: string,
  description: string,
  context?: Record<string, unknown>,
): Promise<{ approved: boolean; message?: string }> {
  const id = `apr-${++_approvalCounter}-${Date.now()}`;
  const agentName = AGENT_DISPLAY_NAMES[agentId] || agentId;

  return new Promise((resolve) => {
    const approval: PendingApproval = {
      id, agentId, agentName, type, title, description, context,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    // Attach resolver so /approve can trigger it
    (approval as any)._resolve = resolve;
    _pendingApprovals.push(approval);
  });
}

/** Resolve a pending approval. */
function resolveApproval(id: string, approved: boolean, message?: string): boolean {
  const idx = _pendingApprovals.findIndex(a => a.id === id && a.status === "pending");
  if (idx === -1) return false;
  const approval = _pendingApprovals[idx];
  approval.status = approved ? "approved" : "denied";
  approval.resolvedAt = new Date().toISOString();
  const resolver = (approval as any)._resolve;
  if (resolver) resolver({ approved, message });
  return true;
}

// ── Helper: compact agent info ───────────────────────────────────────────────

function getCompactAgents() {
  return ATPDatabase.listEmployees()
    .filter(e => e.agent_id && e.agent_id !== "user")
    .map(e => {
      const r = getRosterEntry(e.agent_id);
      return {
        key: e.agent_id,
        name: e.name,
        role: e.designation,
        status: e.status,
        color: r?.color ?? "",
        initials: r?.initials ?? "",
      };
    });
}

// ── Router factory ───────────────────────────────────────────────────────────

export function createMobileRouter(runtime: AgentRuntime): Router {
  const router = Router();
  const agents = runtime.allAgents;

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/summary — Everything the home screen needs in ONE call
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/summary", (_req, res) => {
    const allTasks = ATPDatabase.getAllTasks();
    const taskCounts = { total: allTasks.length, in_progress: 0, completed: 0, failed: 0, todo: 0 };
    for (const t of allTasks) {
      const s = t.status === "pending" ? "todo" : t.status;
      if (s in taskCounts) (taskCounts as any)[s]++;
    }

    const agentList = getCompactAgents();
    const runtimeStatus = runtime.getStatus();
    const runtimeMap: Record<string, { running: boolean; paused: boolean }> = {};
    for (const s of runtimeStatus) runtimeMap[s.agent_id] = { running: s.status === "running", paused: s.status === "paused" };

    // Merge runtime into agents
    const agentsWithRuntime = agentList.map(a => ({
      ...a,
      running: runtimeMap[a.key]?.running ?? false,
      paused: runtimeMap[a.key]?.paused ?? false,
    }));

    const events = EventLog.getEvents(10).map(e => ({
      timestamp: e.timestamp,
      type: e.event_type ?? "",
      agent: e.agent_id || "",
      message: e.message || "",
    }));

    const pendingApprovalCount = _pendingApprovals.filter(a => a.status === "pending").length;

    // Unread chat count (agent messages with no subsequent user reply)
    const chatLog = UserChatLog.getRecent(100);
    let totalUnread = 0;
    const agentKeys = new Set(agentList.map(a => a.key));
    for (const key of agentKeys) {
      const agentMsgs = chatLog.filter(m => m.from === key && m.to === "user");
      const lastUserMsg = chatLog.filter(m => m.from === "user" && m.to === key).pop();
      if (lastUserMsg) {
        totalUnread += agentMsgs.filter(m => m.timestamp > lastUserMsg.timestamp).length;
      } else if (agentMsgs.length > 0) {
        totalUnread += agentMsgs.length;
      }
    }

    res.json({
      agents: agentsWithRuntime,
      tasks: taskCounts,
      recentTasks: allTasks
        .filter(t => t.status === "in_progress" || t.status === "pending")
        .slice(0, 5)
        .map(t => ({ id: t.task_id, title: t.description, status: t.status === "pending" ? "todo" : t.status, agent: t.agent_id, priority: t.priority })),
      events,
      pendingApprovals: pendingApprovalCount,
      unreadChats: totalUnread,
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/live — Compact live agent states for the Live screen
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/live", (_req, res) => {
    const tokens = getReplayBuffer();
    const runtimeStatus = runtime.getStatus();
    const runtimeMap: Record<string, boolean> = {};
    for (const s of runtimeStatus) runtimeMap[s.agent_id] = s.status === "running";

    // Build per-agent state from replay buffer
    const agentStates: Record<string, {
      active: boolean;
      thinking: boolean;
      lastText: string;
      hadWork: boolean;
      activity: { type: string; content: string; toolName?: string; isError?: boolean; ts: number }[];
      todos: { id: string; content: string; status: string }[];
    }> = {};

    const NOISE = ["NO_ACTION_REQUIRED", "SUNSET_COMPLETE", "SUNRISE_", "MEMORY_UPDATED", "JOURNAL_"];
    const isNoise = (s: string) => NOISE.some(p => (s || "").trim().startsWith(p));

    for (const tok of tokens) {
      const { agentId, type, content } = tok;
      if (!agentId) continue;
      if (!agentStates[agentId]) agentStates[agentId] = { active: false, thinking: false, lastText: "", hadWork: false, activity: [], todos: [] };
      const s = agentStates[agentId];

      switch (type) {
        case "agent_start": s.active = true; s.lastText = ""; s.thinking = false; s.hadWork = false; break;
        case "agent_end":
          s.active = false; s.thinking = false;
          if (s.hadWork && !isNoise(content)) s.activity.push({ type, content: "Finished", ts: Date.now() });
          s.hadWork = false;
          break;
        case "text":
          if (!isNoise(content)) s.lastText += content;
          break;
        case "thinking_start": case "thinking": s.thinking = true; break;
        case "thinking_end": s.thinking = false; break;
        case "tool_start": s.hadWork = true; s.activity.push({ type, content: tok.toolName || content, toolName: tok.toolName, ts: Date.now() }); break;
        case "tool_end": s.hadWork = true; s.activity.push({ type, content: (tok.toolResult || "").slice(0, 100), isError: tok.isError, ts: Date.now() }); break;
        case "todo_update": if (tok.todos) s.todos = tok.todos.map(t => ({ id: t.id, content: t.content, status: t.status })); break;
      }
    }

    // Cap activity and lastText
    for (const id of Object.keys(agentStates)) {
      agentStates[id].activity = agentStates[id].activity.slice(-15);
      agentStates[id].lastText = agentStates[id].lastText.slice(-200);
    }

    // Include agents from roster even if no stream data
    // "active" = actively working (between agent_start/agent_end in replay buffer), NOT just process running
    const agentList = getCompactAgents();
    const result = agentList.map(a => ({
      ...a,
      ...(agentStates[a.key] || { active: false, thinking: false, lastText: "", activity: [], todos: [] }),
    }));

    res.json(result);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/chats — Chat list with server-computed unread counts
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/chats", (req, res) => {
    const since = (req.query.since as string) || ""; // ISO timestamp — msgs after this are "unread"
    const lastReadMap: Record<string, string> = {};
    if (req.query.lastRead) {
      try { Object.assign(lastReadMap, JSON.parse(req.query.lastRead as string)); } catch {}
    }

    const agentList = getCompactAgents();
    const chatLog = UserChatLog.getRecent(100);
    const runtimeStatus = runtime.getStatus();
    const runtimeMap: Record<string, boolean> = {};
    for (const s of runtimeStatus) runtimeMap[s.agent_id] = s.status === "running";

    const chats = agentList.map(agent => {
      const agentMsgs = chatLog.filter(m =>
        (m.from === agent.key && m.to === "user") || (m.from === "user" && m.to === agent.key)
      );
      const last = agentMsgs[agentMsgs.length - 1];

      // Unread: messages FROM agent AFTER the lastRead timestamp for this agent
      const readTs = lastReadMap[agent.key] || "";
      const fromAgent = chatLog.filter(m => m.from === agent.key && m.to === "user");
      const unread = readTs
        ? fromAgent.filter(m => m.timestamp > readTs).length
        : fromAgent.length;

      return {
        key: agent.key,
        name: agent.name,
        role: agent.role,
        initials: agent.initials,
        color: agent.color,
        active: runtimeMap[agent.key] ?? false,
        unread,
        lastMessage: last ? {
          from: last.from,
          text: (last.message || "").replace(/\n/g, " ").slice(0, 80),
          time: last.timestamp,
        } : null,
      };
    });

    // Sort by last message time (most recent first)
    chats.sort((a, b) => (b.lastMessage?.time ?? "").localeCompare(a.lastMessage?.time ?? ""));

    res.json(chats);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/chat/:agentId — Last 50 messages for one agent
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/chat/:agentId", (req, res) => {
    const agentId = req.params.agentId.trim().toLowerCase();
    const chatLog = UserChatLog.getRecent(100);
    const msgs = chatLog
      .filter(m => (m.from === agentId && m.to === "user") || (m.from === "user" && m.to === agentId))
      .slice(-50)
      .map(m => ({
        from: m.from,
        message: m.message,
        time: m.timestamp,
      }));
    res.json(msgs);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/m/send — Send message to agent
  // ────────────────────────────────────────────────────────────────────────────
  router.post("/send", (req, res) => {
    const { to, message } = req.body ?? {};
    if (!to || typeof to !== "string" || !message || typeof message !== "string") {
      res.status(400).json({ error: "to and message required" });
      return;
    }
    const agentKey = to.trim().toLowerCase();
    if (agentKey === "user") {
      res.status(400).json({ error: "Cannot message yourself" });
      return;
    }
    // Validate agent exists in employees database
    const emp = ATPDatabase.listEmployees().find(e => e.agent_id === agentKey);
    if (!emp) {
      res.status(400).json({ error: `Unknown agent: ${agentKey}` });
      return;
    }
    ActiveChannelState.set("dashboard");
    AgentMessageQueue.push("user", agentKey, "", message.trim(), "normal");
    UserChatLog.log({ from: "user", to: agentKey, message: message.trim(), channel: "dashboard" });
    clearActiveGroup(agentKey);
    res.json({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/tasks — Compact task list
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/tasks", (_req, res) => {
    const agentList = getCompactAgents();
    const nameMap: Record<string, { name: string; initials: string; color: string }> = {};
    for (const a of agentList) nameMap[a.key] = { name: a.name, initials: a.initials, color: a.color };

    const tasks = ATPDatabase.getAllTasks().map(t => ({
      id: t.task_id,
      title: t.description,
      status: t.status === "pending" ? "todo" : t.status,
      agent: t.agent_id,
      agentName: nameMap[t.agent_id]?.name ?? t.agent_id,
      agentInitials: nameMap[t.agent_id]?.initials ?? t.agent_id.slice(0, 2).toUpperCase(),
      agentColor: nameMap[t.agent_id]?.color ?? "",
      priority: t.priority,
      result: t.result || "",
      created: t.created_at,
      updated: t.updated_at,
    }));
    res.json(tasks);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/m/task — Create a new task from mobile
  // ────────────────────────────────────────────────────────────────────────────
  router.post("/task", (req, res) => {
    const { title, agent, priority } = req.body ?? {};
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title required" });
      return;
    }
    // Default: assign to PM if no agent specified, PM will delegate
    const agentId = (agent && typeof agent === "string") ? agent.trim().toLowerCase() : "pm";
    const prio = (priority && typeof priority === "string") ? priority : "medium";

    try {
      const task = ATPDatabase.createTask(title.trim(), agentId, prio);
      // Notify the agent via message queue
      AgentMessageQueue.push("user", agentId, "", `[New Task Assigned] ${title.trim()}`, "priority");
      res.json({ ok: true, task: { id: task.task_id, title: task.description, status: "todo", agent: agentId } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create task" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/m/interrupt — Stop an agent
  // ────────────────────────────────────────────────────────────────────────────
  router.post("/interrupt", (req, res) => {
    const { agent_id, reason } = req.body ?? {};
    if (!agent_id || typeof agent_id !== "string") {
      res.status(400).json({ error: "agent_id required" });
      return;
    }
    const id = agent_id.trim().toLowerCase();
    const r = (reason as string | undefined) ?? "Stopped from mobile";
    agents.get(id)?.abort();
    AgentInterrupt.request(id, r);
    res.json({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/m/steer — Send steering message to running agent
  // ────────────────────────────────────────────────────────────────────────────
  router.post("/steer", (req, res) => {
    const { agent_id, message } = req.body ?? {};
    if (!agent_id || typeof agent_id !== "string" || !message || typeof message !== "string") {
      res.status(400).json({ error: "agent_id and message required" });
      return;
    }
    const id = agent_id.trim().toLowerCase();
    const agent = agents.get(id);
    if (!agent) {
      res.status(404).json({ error: `Unknown agent: ${id}` });
      return;
    }
    if (agent.steer) {
      agent.steer(message.trim());
    } else {
      AgentMessageQueue.push("user", id, "", message.trim(), "priority");
    }
    res.json({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/approvals — Pending approval requests
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/approvals", (_req, res) => {
    const pending = _pendingApprovals
      .filter(a => a.status === "pending")
      .map(a => ({
        id: a.id,
        agentId: a.agentId,
        agentName: a.agentName,
        type: a.type,
        title: a.title,
        description: a.description,
        createdAt: a.createdAt,
      }));
    res.json(pending);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // POST /api/m/approve — Approve or deny a pending request
  // ────────────────────────────────────────────────────────────────────────────
  router.post("/approve", (req, res) => {
    const { id, approved, message } = req.body ?? {};
    if (!id || typeof id !== "string" || typeof approved !== "boolean") {
      res.status(400).json({ error: "id (string) and approved (boolean) required" });
      return;
    }
    const ok = resolveApproval(id, approved, message);
    if (!ok) {
      res.status(404).json({ error: "Approval not found or already resolved" });
      return;
    }
    res.json({ ok: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/agents — Compact agent list with runtime status
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/agents", (_req, res) => {
    const agentList = getCompactAgents();
    const runtimeStatus = runtime.getStatus();
    const runtimeMap: Record<string, { running: boolean; paused: boolean }> = {};
    for (const s of runtimeStatus) runtimeMap[s.agent_id] = { running: s.status === "running", paused: s.status === "paused" };

    res.json(agentList.map(a => ({
      ...a,
      running: runtimeMap[a.key]?.running ?? false,
      paused: runtimeMap[a.key]?.paused ?? false,
    })));
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/finance — Token usage, costs, and budget status
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/finance", (_req, res) => {
    const totals = getFinanceTotals();
    const agentUsage = getFinanceAllUsage();
    const budgetStatus = getBudgetStatus();
    const agentList = getCompactAgents();
    const nameMap: Record<string, { name: string; role: string; initials: string; color: string }> = {};
    for (const a of agentList) nameMap[a.key] = { name: a.name, role: a.role, initials: a.initials, color: a.color };

    res.json({
      totals: {
        totalCostUsd: totals.totalCostUsd,
        totalTokens: totals.totalTokens,
        totalInputTokens: totals.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens,
        totalTurns: totals.totalTurns,
        sessionStart: totals.sessionStart,
      },
      agents: agentUsage.map(a => ({
        id: a.agentId,
        name: nameMap[a.agentId]?.name ?? a.agentId,
        role: nameMap[a.agentId]?.role ?? "",
        initials: nameMap[a.agentId]?.initials ?? a.agentId.slice(0, 2).toUpperCase(),
        color: nameMap[a.agentId]?.color ?? "",
        turns: a.turns,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        totalTokens: a.totalTokens,
        costUsd: a.costUsd,
        model: a.model ?? "",
        lastActivity: a.lastActivity,
      })),
      budget: {
        org: budgetStatus.org,
        departments: budgetStatus.departments,
      },
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GET /api/m/ping — Health check (mobile uses this to verify connection)
  // ────────────────────────────────────────────────────────────────────────────
  router.get("/ping", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  return router;
}
