import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing } from "../lib/theme";
import { getApi, postApi, subscribeStream } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  agentId: string; type: string; content: string;
  toolName?: string; toolArgs?: any; toolResult?: string;
  isError?: boolean; timestamp: number;
}
interface TodoItem { id: string; content: string; status: string; priority?: string; }
interface AgentInfo { agent_key: string; name: string; role: string; color?: string; initials?: string; }
interface AgentState { active: boolean; tokens: string; activity: ActivityEntry[]; todos: TodoItem[]; thinking: boolean; }

// ── Pulse Dot ────────────────────────────────────────────────────────────────

function PulseDot({ color = colors.green, size = 8 }: { color?: string; size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }} />;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function LiveScreen() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [filter, setFilter] = useState<string>("all");
  const [steerAgent, setSteerAgent] = useState<string | null>(null);
  const [steerMsg, setSteerMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);

  const loadLive = useCallback(async () => {
    try {
      const data: any[] = await getApi("/api/m/live");
      setConnected(true);
      const agentList: AgentInfo[] = [];
      for (const a of data) {
        agentList.push({ agent_key: a.key, name: a.name, role: a.role, color: a.color, initials: a.initials });
      }
      setAgents(agentList);
      // Only seed states on first load (don't overwrite WebSocket data)
      setAgentStates(prev => {
        if (Object.keys(prev).length > 0) return prev; // already have WS data
        const states: Record<string, AgentState> = {};
        for (const a of data) {
          states[a.key] = {
            active: a.active ?? false, thinking: a.thinking ?? false, tokens: a.lastText ?? "",
            activity: (a.activity ?? []).map((act: any) => ({
              agentId: a.key, type: act.type, content: act.content,
              toolName: act.toolName, isError: act.isError, timestamp: act.ts || Date.now(),
            })),
            todos: (a.todos ?? []).map((t: any) => ({ id: t.id, content: t.content, status: t.status, priority: "" })),
          };
        }
        return states;
      });
    } catch { setConnected(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    // Load agent list once on focus, then rely on WebSocket for updates
    loadLive();

    // Real-time stream via WebSocket (works through relay too)
    // System content to hide from timeline
    const NOISE = ["NO_ACTION_REQUIRED", "SUNSET_COMPLETE", "SUNRISE_", "MEMORY_UPDATED", "JOURNAL_"];
    const isNoise = (s: string) => NOISE.some(p => (s || "").trim().startsWith(p));

    const unsub = subscribeStream((ev) => {
      setConnected(true);
      const { agentId, type, content } = ev;
      const now = Date.now();
      setAgentStates(prev => {
        const state = prev[agentId] || { active: false, tokens: "", activity: [], todos: [], thinking: false };
        const updated = { ...state };
        switch (type) {
          case "agent_start":
            updated.active = true; updated.tokens = ""; updated.thinking = false;
            // Don't add "Started" to timeline — wait for real activity
            break;
          case "agent_end": {
            updated.active = false; updated.thinking = false;
            // Skip idle cycles (no real work done between start/end)
            const hasRealActivity = state.activity.some(a =>
              a.agentId === agentId && (a.type === "tool_start" || a.type === "tool_end" || a.type === "text")
            );
            if (hasRealActivity && !isNoise(content)) {
              updated.activity = [...state.activity, { agentId, type, content: content || "Finished", timestamp: now }].slice(-50);
            }
            updated.tokens = "";
            break;
          }
          case "text":
            if (!isNoise(content)) updated.tokens = state.tokens + content;
            break;
          case "thinking_start": case "thinking": updated.thinking = true; break;
          case "thinking_end": updated.thinking = false; break;
          case "tool_start":
            updated.activity = [...state.activity, { agentId, type, content: (ev as any).toolName || content, toolName: (ev as any).toolName, timestamp: now }].slice(-50);
            break;
          case "tool_end":
            updated.activity = [...state.activity, { agentId, type, content: (ev as any).toolResult || content, isError: (ev as any).isError, timestamp: now }].slice(-50);
            break;
          case "todo_update":
            if ((ev as any).todos) updated.todos = (ev as any).todos;
            break;
        }
        return { ...prev, [agentId]: updated };
      });
    });

    return () => { unsub(); };
  }, [loadLive]));

  async function handleSteer() {
    if (!steerAgent || !steerMsg.trim()) return;
    try {
      await postApi("/api/m/steer", { agent_id: steerAgent, message: steerMsg.trim() });
      setSteerMsg(""); setSteerAgent(null);
    } catch {}
  }
  async function handleInterrupt(agentId: string) {
    try { await postApi("/api/m/interrupt", { agent_id: agentId, reason: "Stopped from mobile" }); } catch {}
  }

  const onRefresh = async () => { setRefreshing(true); await loadLive(); setRefreshing(false); };

  const activeCount = Object.values(agentStates).filter(s => s.active).length;

  const agentsWithState = agents.map(a => ({
    ...a,
    state: agentStates[a.agent_key] || { active: false, tokens: "", activity: [], todos: [], thinking: false },
  }));

  // No reordering — keep agents in stable positions
  const filtered = filter === "all" ? agentsWithState
    : filter === "active" ? agentsWithState.filter(a => a.state.active)
    : agentsWithState.filter(a => a.agent_key === filter);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.title}>Live Activity</Text>
        <View style={s.headerRight}>
          <View style={[s.connPill, connected ? s.connOn : s.connOff]}>
            {connected ? <PulseDot size={5} color="#fff" /> : null}
            <Text style={s.connText}>{connected ? "Connected" : "Offline"}</Text>
          </View>
        </View>
      </View>
      {/* ── Status bar ─────────────────────────────────────── */}
      <View style={s.statusBar}>
        <View style={s.statusItem}>
          <Text style={s.statusNum}>{agents.length}</Text>
          <Text style={s.statusLabel}>Agents</Text>
        </View>
        <View style={s.statusDivider} />
        <View style={s.statusItem}>
          <Text style={[s.statusNum, { color: colors.green }]}>{activeCount}</Text>
          <Text style={s.statusLabel}>Running</Text>
        </View>
        <View style={s.statusDivider} />
        <View style={s.statusItem}>
          <Text style={s.statusNum}>{agents.length - activeCount}</Text>
          <Text style={s.statusLabel}>Idle</Text>
        </View>
      </View>

      {/* ── Filter tabs ────────────────────────────────────── */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabContent}>
          {[
            { key: "all", label: "All" },
            { key: "active", label: `Active (${activeCount})` },
            ...agents.map(a => ({
              key: a.agent_key,
              label: (a.name || "Agent").split(" ")[0],
              active: agentStates[a.agent_key]?.active,
            })),
          ].map(tab => {
            const selected = filter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setFilter(selected && tab.key !== "all" ? "all" : tab.key)}
                style={[s.tab, selected && s.tabSelected]}
                activeOpacity={0.7}
              >
                {(tab as any).active && <View style={s.tabActiveDot} />}
                <Text style={[s.tabText, selected && s.tabTextSelected]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Agent cards ────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={a => a.agent_key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderItem={({ item }) => (
          <AgentCard
            agent={item} state={item.state}
            onSteer={() => setSteerAgent(steerAgent === item.agent_key ? null : item.agent_key)}
            onInterrupt={() => handleInterrupt(item.agent_key)}
            showSteer={steerAgent === item.agent_key}
            steerMsg={steerMsg} setSteerMsg={setSteerMsg} handleSteer={handleSteer}
          />
        )}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon name="radio-outline" size={28} color={colors.textDim} />
            </View>
            <Text style={s.emptyTitle}>No activity yet</Text>
            <Text style={s.emptySub}>Agents will appear here when running</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, state, onSteer, onInterrupt, showSteer, steerMsg, setSteerMsg, handleSteer }: {
  agent: AgentInfo; state: AgentState;
  onSteer: () => void; onInterrupt: () => void;
  showSteer: boolean; steerMsg: string; setSteerMsg: (v: string) => void; handleSteer: () => void;
}) {
  const initials = agent.initials || (agent.name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const statusColor = state.active ? colors.green : state.thinking ? colors.cyan : colors.textDim;
  const hasActivity = state.activity.length > 0;

  return (
    <View style={s.card}>
      {/* Header row */}
      <View style={s.cardHead}>
        <View style={s.cardLeft}>
          <View style={[s.avatar, state.active && { borderColor: colors.green }]}>
            <Text style={s.avatarText}>{initials}</Text>
            <View style={[s.avatarDot, { backgroundColor: statusColor }]} />
          </View>
          <View>
            <Text style={s.cardName}>{(agent.name || "Agent").split(" ")[0]}</Text>
            <Text style={s.cardRole}>{agent.role || "Agent"}</Text>
          </View>
        </View>
        <View style={s.cardRight}>
          {state.thinking && (
            <View style={s.thinkBadge}>
              <Icon name="bulb-outline" size={10} color={colors.cyan} />
              <Text style={s.thinkText}>thinking</Text>
            </View>
          )}
          {state.active && (
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionBtn} onPress={onSteer} activeOpacity={0.6}>
                <Icon name="navigate-outline" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, s.stopAction]} onPress={onInterrupt} activeOpacity={0.6}>
                <Icon name="stop-circle-outline" size={15} color={colors.red} />
              </TouchableOpacity>
            </View>
          )}
          {!state.active && hasActivity && (
            <View style={s.doneBadge}>
              <Icon name="checkmark-circle" size={12} color={colors.textDim} />
              <Text style={s.doneText}>done</Text>
            </View>
          )}
        </View>
      </View>

      {/* Steer input */}
      {showSteer && (
        <View style={s.steerRow}>
          <TextInput
            value={steerMsg} onChangeText={setSteerMsg}
            placeholder="Guide this agent..." placeholderTextColor={colors.textDim}
            style={s.steerInput} onSubmitEditing={handleSteer} returnKeyType="send"
          />
          <TouchableOpacity style={s.steerSend} onPress={handleSteer}>
            <Icon name="arrow-up" size={16} color={colors.bgPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Live output */}
      {state.active && state.tokens.length > 0 && (
        <View style={s.liveOutput}>
          <View style={s.liveLabel}>
            <PulseDot size={4} />
            <Text style={s.liveLabelText}>Streaming</Text>
          </View>
          <Text style={s.liveText} numberOfLines={3}>{state.tokens.slice(-200)}</Text>
        </View>
      )}

      {/* Todo progress */}
      {state.todos.length > 0 && (
        <View style={s.todoSection}>
          <View style={s.todoHead}>
            <Icon name="list-outline" size={12} color={colors.textMuted} />
            <Text style={s.todoTitle}>Checklist</Text>
            <Text style={s.todoProgress}>
              {state.todos.filter(t => t.status === "completed").length}/{state.todos.length}
            </Text>
          </View>
          {/* Progress bar */}
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${(state.todos.filter(t => t.status === "completed").length / state.todos.length) * 100}%` }]} />
          </View>
          {state.todos.slice(0, 4).map((todo, i) => (
            <View key={todo.id || i} style={s.todoRow}>
              <Icon
                name={todo.status === "completed" ? "checkmark-circle" : todo.status === "in_progress" ? "ellipse" : "ellipse-outline"}
                size={13}
                color={todo.status === "completed" ? colors.green : todo.status === "in_progress" ? colors.yellow : colors.textDim}
              />
              <Text style={[s.todoText, todo.status === "completed" && s.todoDone]} numberOfLines={1}>{todo.content}</Text>
            </View>
          ))}
          {state.todos.length > 4 && <Text style={s.todoMore}>+{state.todos.length - 4} more</Text>}
        </View>
      )}

      {/* Activity timeline — fixed max height with scroll */}
      {hasActivity && (
        <ScrollView style={s.timelineScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={s.timeline}>
            {state.activity.slice(-10).map((entry, i, arr) => {
              const cfg = getEntryConfig(entry);
              const isLast = i === arr.length - 1;
              return (
                <View key={`${entry.timestamp}-${i}`} style={s.tlRow}>
                  <View style={s.tlRail}>
                    <View style={[s.tlDot, { backgroundColor: cfg.color }]} />
                    {!isLast && <View style={s.tlLine} />}
                  </View>
                  <View style={s.tlBody}>
                    <View style={s.tlTopRow}>
                      <Text style={[s.tlLabel, { color: cfg.color }]}>{cfg.label}</Text>
                      <Text style={s.tlTime}>{fmtTime(entry.timestamp)}</Text>
                    </View>
                    {entry.content && entry.type !== "agent_start" && entry.type !== "agent_end" && (
                      <Text style={[s.tlDetail, entry.isError && { color: colors.red }]} numberOfLines={2}>
                        {trunc(entry.toolName ? `${entry.toolName}: ${entry.content}` : entry.content, 100)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Idle state */}
      {!hasActivity && !state.active && (
        <View style={s.idleRow}>
          <Icon name="moon-outline" size={12} color={colors.textDim} />
          <Text style={s.idleText}>Standing by</Text>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEntryConfig(e: ActivityEntry): { label: string; color: string } {
  switch (e.type) {
    case "agent_start": return { label: "Started", color: colors.green };
    case "agent_end": return { label: "Finished", color: colors.textMuted };
    case "text": return { label: "Output", color: colors.textSecondary };
    case "thinking": return { label: "Thinking", color: colors.cyan };
    case "tool_start": return { label: e.toolName || "Tool", color: colors.orange };
    case "tool_end": return { label: e.isError ? "Error" : "Result", color: e.isError ? colors.red : colors.green };
    default: return { label: (e.type || "").replace(/_/g, " "), color: colors.textDim };
  }
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + "..." : s; }

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  connPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  connOn: { backgroundColor: "rgba(61,214,140,0.15)" },
  connOff: { backgroundColor: "rgba(240,68,68,0.15)" },
  connText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.3 },

  // Status bar
  statusBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: 12,
    paddingVertical: 10, borderWidth: 1, borderColor: colors.border,
  },
  statusItem: { flex: 1, alignItems: "center" },
  statusNum: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  statusLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "500", marginTop: 1 },
  statusDivider: { width: 1, height: 24, backgroundColor: colors.border },

  // Tab filters
  tabBar: { marginBottom: 4 },
  tabContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  tabSelected: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  tabActiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  tabText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  tabTextSelected: { color: colors.bgPrimary },

  // List
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: 10 },

  // Card
  card: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  cardGlow: { borderColor: "rgba(61,214,140,0.25)", backgroundColor: "#0d1a12" },
  cardHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: colors.border,
  },
  avatarText: { fontSize: 12, fontWeight: "800", color: colors.textPrimary },
  avatarDot: {
    position: "absolute", bottom: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: colors.bgCard,
  },
  cardName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  cardRole: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  // Badges
  thinkBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: "rgba(34,211,238,0.08)",
  },
  thinkText: { fontSize: 9, fontWeight: "700", color: colors.cyan, letterSpacing: 0.3 },
  doneBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  doneText: { fontSize: 9, fontWeight: "600", color: colors.textDim },

  // Actions
  actionRow: { flexDirection: "row", gap: 4 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
  },
  stopAction: { backgroundColor: "rgba(240,68,68,0.08)" },

  // Steer
  steerRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingBottom: 12,
  },
  steerInput: {
    flex: 1, backgroundColor: colors.bgPrimary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, color: colors.textPrimary, fontSize: 13,
    borderWidth: 1, borderColor: colors.border,
  },
  steerSend: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: colors.textPrimary, justifyContent: "center", alignItems: "center",
  },

  // Live output
  liveOutput: {
    marginHorizontal: 14, marginBottom: 10, padding: 10,
    backgroundColor: colors.bgPrimary, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(61,214,140,0.1)",
  },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  liveLabelText: { fontSize: 9, fontWeight: "700", color: colors.green, letterSpacing: 0.5, textTransform: "uppercase" },
  liveText: { fontSize: 11, color: colors.textSecondary, fontFamily: "monospace", lineHeight: 16 },

  // Todos
  todoSection: {
    marginHorizontal: 14, marginBottom: 10, padding: 10,
    backgroundColor: colors.bgPrimary, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  todoHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  todoTitle: { fontSize: 11, fontWeight: "700", color: colors.textPrimary, flex: 1 },
  todoProgress: { fontSize: 10, color: colors.green, fontWeight: "700" },
  progressBar: { height: 3, backgroundColor: colors.bgTertiary, borderRadius: 2, marginBottom: 8, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: colors.green, borderRadius: 2 },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  todoText: { fontSize: 11, color: colors.textSecondary, flex: 1 },
  todoDone: { textDecorationLine: "line-through", opacity: 0.4 },
  todoMore: { fontSize: 10, color: colors.textDim, marginTop: 4, textAlign: "center" },

  // Timeline
  timelineScroll: { maxHeight: 180, marginHorizontal: 14, marginBottom: 12 },
  timeline: { },
  tlRow: { flexDirection: "row", minHeight: 26 },
  tlRail: { width: 18, alignItems: "center" },
  tlDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  tlLine: { width: 1, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  tlBody: { flex: 1, paddingLeft: 8, paddingBottom: 6 },
  tlTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tlLabel: { fontSize: 10, fontWeight: "700" },
  tlTime: { fontSize: 8, color: colors.textDim, fontFamily: "monospace" },
  tlDetail: { fontSize: 10, color: colors.textMuted, marginTop: 1, fontFamily: "monospace", lineHeight: 14 },

  // Idle
  idleRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingBottom: 14 },
  idleText: { fontSize: 11, color: colors.textDim },

  // Empty
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.bgCard, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: colors.border, marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  emptySub: { fontSize: 12, color: colors.textDim },
});
