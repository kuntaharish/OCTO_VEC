import { useState, useEffect, useRef, useCallback } from "react";
import { usePolling } from "./useApi";
import type { ChatEntry } from "../types";

const SYSTEM_PREFIXES = ["SUNSET_COMPLETE", "SUNRISE_", "NO_ACTION_REQUIRED", "MEMORY_UPDATED", "JOURNAL_"];

function isSystemMsg(msg: string): boolean {
  return SYSTEM_PREFIXES.some((p) => (msg ?? "").trim().startsWith(p));
}

/** Generates a short notification beep using Web Audio API. */
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);

    // Second tone for a pleasant two-tone chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.value = 1320;
    gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.4);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available — ignore silently
  }
}

// ── Toast data ────────────────────────────────────────────────────────────

export interface ChatToast {
  id: number;
  agentId: string;
  message: string;
  timestamp: number;
}

// ── Per-agent unread tracking ─────────────────────────────────────────────

function loadPerAgentSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem("chat-per-agent-seen");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePerAgentSeen(data: Record<string, number>) {
  localStorage.setItem("chat-per-agent-seen", JSON.stringify(data));
}

function countPerAgent(entries: ChatEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (e.from !== "user" && e.to === "user" && !isSystemMsg(e.message)) {
      counts[e.from] = (counts[e.from] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Tracks unread chat messages, per-agent unread counts, plays notification sound,
 * and emits toast data for new messages.
 */
export function useChatNotifications(activeView: string) {
  const { data: entries } = usePolling<ChatEntry[]>("/api/chat-log", 3000);

  // Total incoming count
  const incomingCount = (entries ?? []).filter(
    (e) => e.from !== "user" && e.to === "user" && !isSystemMsg(e.message)
  ).length;

  // Global last-seen
  const [lastSeenCount, setLastSeenCount] = useState<number>(() => {
    const saved = localStorage.getItem("chat-last-seen-count");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Per-agent last-seen counts
  const [perAgentSeen, setPerAgentSeen] = useState<Record<string, number>>(loadPerAgentSeen);

  // Toast queue
  const [toasts, setToasts] = useState<ChatToast[]>([]);
  const toastIdRef = useRef(0);

  const prevCountRef = useRef(incomingCount);
  const prevPerAgentRef = useRef<Record<string, number>>({});
  const initializedRef = useRef(false);

  // Per-agent current counts
  const perAgentCounts = entries ? countPerAgent(entries) : {};

  // On first data load, sync
  useEffect(() => {
    if (entries && !initializedRef.current) {
      initializedRef.current = true;
      prevCountRef.current = incomingCount;
      prevPerAgentRef.current = { ...perAgentCounts };
      if (lastSeenCount > incomingCount) {
        setLastSeenCount(incomingCount);
        localStorage.setItem("chat-last-seen-count", String(incomingCount));
      }
      // Sync per-agent seen — clamp to actual counts
      const synced = { ...perAgentSeen };
      let changed = false;
      for (const [k, v] of Object.entries(synced)) {
        if (v > (perAgentCounts[k] ?? 0)) {
          synced[k] = perAgentCounts[k] ?? 0;
          changed = true;
        }
      }
      if (changed) {
        setPerAgentSeen(synced);
        savePerAgentSeen(synced);
      }
    }
  }, [entries, incomingCount, lastSeenCount, perAgentSeen, perAgentCounts]);

  // Detect new messages — play sound + create toasts
  useEffect(() => {
    if (!initializedRef.current) return;
    if (incomingCount <= prevCountRef.current) {
      prevCountRef.current = incomingCount;
      prevPerAgentRef.current = { ...perAgentCounts };
      return;
    }

    // Find which agents have new messages
    const newToasts: ChatToast[] = [];
    for (const [agentId, count] of Object.entries(perAgentCounts)) {
      const prev = prevPerAgentRef.current[agentId] ?? 0;
      if (count > prev) {
        // Find the latest message from this agent
        const agentMsgs = (entries ?? []).filter(
          (e) => e.from === agentId && e.to === "user" && !isSystemMsg(e.message)
        );
        const latest = agentMsgs[agentMsgs.length - 1];
        if (latest) {
          newToasts.push({
            id: toastIdRef.current++,
            agentId,
            message: latest.message,
            timestamp: Date.now(),
          });
        }
      }
    }

    if (newToasts.length > 0 && activeView !== "chat") {
      playNotificationSound();
      setToasts((prev) => [...prev, ...newToasts].slice(-5)); // keep last 5
    }

    prevCountRef.current = incomingCount;
    prevPerAgentRef.current = { ...perAgentCounts };
  }, [incomingCount, activeView, entries, perAgentCounts]);

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 5000));
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // Auto-clear global when on chat view
  useEffect(() => {
    if (activeView === "chat" && incomingCount > 0) {
      setLastSeenCount(incomingCount);
      localStorage.setItem("chat-last-seen-count", String(incomingCount));
    }
  }, [activeView, incomingCount]);

  const unreadCount = Math.max(0, incomingCount - lastSeenCount);

  // Per-agent unread: current count minus last-seen for that agent
  const perAgentUnread: Record<string, number> = {};
  for (const [agentId, count] of Object.entries(perAgentCounts)) {
    const seen = perAgentSeen[agentId] ?? 0;
    const diff = count - seen;
    if (diff > 0) perAgentUnread[agentId] = diff;
  }

  // Mark a specific agent's messages as read
  const markAgentRead = useCallback((agentId: string) => {
    const count = perAgentCounts[agentId] ?? 0;
    setPerAgentSeen((prev) => {
      const next = { ...prev, [agentId]: count };
      savePerAgentSeen(next);
      return next;
    });
  }, [perAgentCounts]);

  const clearUnread = useCallback(() => {
    setLastSeenCount(incomingCount);
    localStorage.setItem("chat-last-seen-count", String(incomingCount));
  }, [incomingCount]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { unreadCount, perAgentUnread, toasts, clearUnread, markAgentRead, dismissToast };
}
