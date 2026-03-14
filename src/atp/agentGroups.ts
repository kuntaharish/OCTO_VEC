/**
 * Agent Groups — Teams-style group chat support.
 *
 * Groups are named collections of agents. When the user sends a message
 * to a group, all members receive it. When any member replies, the reply
 * is forwarded to all other members automatically.
 *
 * Storage: data/agent-groups.json
 */

import fs from "fs";
import path from "path";
import { config } from "../config.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentGroup {
  id: string;
  name: string;
  members: string[];
  color: string;
}

// ── Persistence ──────────────────────────────────────────────────────────────

const GROUPS_PATH = path.join(config.dataDir, "agent-groups.json");

function readGroups(): AgentGroup[] {
  try {
    const raw = fs.readFileSync(GROUPS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGroups(groups: AgentGroup[]): void {
  try {
    fs.mkdirSync(path.dirname(GROUPS_PATH), { recursive: true });
    fs.writeFileSync(GROUPS_PATH, JSON.stringify(groups, null, 2), "utf-8");
  } catch {
    // Non-fatal
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function getAllGroups(): AgentGroup[] {
  return readGroups();
}

export function getGroup(id: string): AgentGroup | undefined {
  return readGroups().find((g) => g.id === id);
}

export function addGroup(name: string, members: string[], color: string): AgentGroup {
  const groups = readGroups();
  const group: AgentGroup = {
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    members: members.map((m) => m.trim().toLowerCase()),
    color,
  };
  groups.push(group);
  writeGroups(groups);
  return group;
}

export function deleteGroup(id: string): boolean {
  const groups = readGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return false;
  groups.splice(idx, 1);
  writeGroups(groups);
  // Clear any active conversations for this group
  for (const [agentId, entry] of activeConversations) {
    if (entry.groupId === id) activeConversations.delete(agentId);
  }
  return true;
}

// ── Active Group Conversation Tracking ───────────────────────────────────────
//
// Tracks which agents are currently "in" a group conversation.
// When the user sends to a group, all members are marked active.
// When an agent replies to "user", we check this map to determine
// if the reply should be forwarded to other group members.
//
// Expires after 10 minutes of no group activity.

interface ActiveEntry {
  groupId: string;
  timestamp: number;
}

const activeConversations = new Map<string, ActiveEntry>();
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Mark all members as participating in an active group conversation.
 * Call this when a group message is sent and when a group reply is forwarded.
 */
export function markActiveGroupConversation(groupId: string, members: string[]): void {
  const now = Date.now();
  for (const m of members) {
    activeConversations.set(m.trim().toLowerCase(), { groupId, timestamp: now });
  }
}

/**
 * Get the active group for an agent, if any.
 * Returns null if the agent isn't in a group conversation or if it's expired.
 */
export function getActiveGroupForAgent(agentId: string): AgentGroup | null {
  const key = agentId.trim().toLowerCase();
  const entry = activeConversations.get(key);
  if (!entry) return null;

  // Check expiry
  if (Date.now() - entry.timestamp > EXPIRY_MS) {
    activeConversations.delete(key);
    return null;
  }

  return getGroup(entry.groupId) ?? null;
}

/**
 * Clear an agent's active group conversation.
 * Call this when the user sends an individual DM to that agent.
 */
export function clearActiveGroup(agentId: string): void {
  activeConversations.delete(agentId.trim().toLowerCase());
}

/**
 * Find all groups an agent belongs to.
 */
export function getGroupsForAgent(agentId: string): AgentGroup[] {
  const key = agentId.trim().toLowerCase();
  return readGroups().filter((g) => g.members.includes(key));
}
