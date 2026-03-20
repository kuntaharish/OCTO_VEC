import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { colors, spacing } from "../lib/theme";
import { getApi } from "../lib/api";
import { startBackgroundSync, stopBackgroundSync, isBackgroundRunning } from "../lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";

interface Task {
  id: string; title: string; status: string; assigned_to?: string;
  priority?: string; created_at?: string;
}
interface Employee {
  name: string; role: string; agent_key: string;
  status: string; color?: string; initials?: string;
}
interface Event {
  timestamp: string; type: string; agent_id?: string;
  agent_name?: string; message?: string;
}

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Employee[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bgSync, setBgSync] = useState(isBackgroundRunning());

  const load = useCallback(async () => {
    try {
      const [t, a, e] = await Promise.all([
        getApi<Task[]>("/api/tasks").catch(() => []),
        getApi<Employee[]>("/api/employees").catch(() => []),
        getApi<Event[]>("/api/events").catch(() => []),
      ]);
      setTasks(t);
      setAgents(a.filter(x => x.agent_key && x.agent_key !== "user"));
      setEvents(e.slice(0, 8));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const activeAgents = agents.filter(a => a.status === "available" || a.status === "busy").length;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <View>
          <Text style={s.logo}>OCTO VEC</Text>
          <Text style={s.subtitle}>Workspace Overview</Text>
        </View>
        <TouchableOpacity
          style={[s.syncBtn, bgSync && s.syncBtnActive]}
          onPress={async () => {
            if (bgSync) {
              await stopBackgroundSync();
              setBgSync(false);
            } else {
              await startBackgroundSync();
              setBgSync(true);
            }
          }}
        >
          <Icon name={bgSync ? "notifications" : "notifications-outline"} size={18} color={bgSync ? colors.bgPrimary : colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        {/* Stats Grid */}
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{tasks.length}</Text>
            <Text style={s.statLabel}>Total Tasks</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.yellow }]}>{inProgress}</Text>
            <Text style={s.statLabel}>In Progress</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.green }]}>{completed}</Text>
            <Text style={s.statLabel}>Completed</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.red }]}>{failed}</Text>
            <Text style={s.statLabel}>Failed</Text>
          </View>
        </View>

        {/* Active Agents */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Team</Text>
            <Text style={s.sectionBadge}>{activeAgents} active</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}>
            {agents.slice(0, 8).map(a => (
              <TouchableOpacity key={a.agent_key} style={s.agentChip} onPress={() =>
                nav.navigate("Chat", {
                  agentKey: a.agent_key, agentName: a.name,
                  agentColor: a.color, agentInitials: a.initials,
                  agentRole: a.role,
                })
              }>
                <View style={[s.agentDot, { backgroundColor: a.status === "available" || a.status === "busy" ? colors.green : colors.textDim }]} />
                <Text style={s.agentChipName}>{(a.name || "Agent").split(" ")[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Recent Activity */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Activity</Text>
          {events.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyText}>No recent events</Text>
            </View>
          ) : (
            events.map((ev, i) => (
              <View key={i} style={s.eventRow}>
                <View style={[s.eventDot, { backgroundColor: ev.type?.includes("completed") ? colors.green : ev.type?.includes("failed") ? colors.red : colors.textDim }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.eventText} numberOfLines={1}>
                    {ev.agent_name || ev.agent_id || "System"}{" "}
                    <Text style={s.eventType}>{(ev.type || "").replace(/_/g, " ")}</Text>
                  </Text>
                  {ev.message && <Text style={s.eventMsg} numberOfLines={1}>{ev.message}</Text>}
                </View>
                <Text style={s.eventTime}>{formatTimeAgo(ev.timestamp)}</Text>
              </View>
            ))
          )}
        </View>

        {/* In Progress Tasks */}
        {inProgress > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>In Progress</Text>
            {tasks.filter(t => t.status === "in_progress").slice(0, 5).map(t => (
              <View key={t.id} style={s.taskRow}>
                <View style={s.taskDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle} numberOfLines={1}>{t.title}</Text>
                  {t.assigned_to && <Text style={s.taskAssignee}>{t.assigned_to}</Text>}
                </View>
                {t.priority && <Text style={[s.taskPriority, t.priority === "high" && { color: colors.red }]}>{t.priority}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTimeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  syncBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },
  syncBtnActive: {
    backgroundColor: colors.textPrimary, borderColor: colors.textPrimary,
  },
  logo: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, letterSpacing: 1.5 },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: spacing.xl },
  statCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, alignItems: "center",
  },
  statValue: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: "600", letterSpacing: 0.3 },

  section: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.md },
  sectionBadge: { fontSize: 11, color: colors.green, fontWeight: "600", backgroundColor: "rgba(61,214,140,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  agentChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.bgCard, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  agentDot: { width: 6, height: 6, borderRadius: 3 },
  agentChipName: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },

  emptyCard: {
    backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, alignItems: "center",
  },
  emptyText: { color: colors.textMuted, fontSize: 13 },

  eventRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  eventDot: { width: 6, height: 6, borderRadius: 3 },
  eventText: { fontSize: 13, color: colors.textPrimary },
  eventType: { color: colors.textMuted },
  eventMsg: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  eventTime: { fontSize: 10, color: colors.textDim },

  taskRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  taskDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  taskTitle: { fontSize: 13, fontWeight: "500", color: colors.textPrimary },
  taskAssignee: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  taskPriority: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
});
