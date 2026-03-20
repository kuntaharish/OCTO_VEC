import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { colors, spacing } from "../lib/theme";
import { getApi } from "../lib/api";
import { startBackgroundSync, stopBackgroundSync, isBackgroundRunning } from "../lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";

interface SummaryData {
  agents: { key: string; name: string; role: string; status: string; color: string; initials: string; running: boolean; paused: boolean }[];
  tasks: { total: number; in_progress: number; completed: number; failed: number; todo: number };
  recentTasks: { id: string; title: string; status: string; agent: string; priority: string }[];
  events: { timestamp: string; type: string; agent: string; message: string }[];
  pendingApprovals: number;
  unreadChats: number;
}

export default function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [data, setData] = useState<SummaryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bgSync, setBgSync] = useState(isBackgroundRunning());
  const [connError, setConnError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await getApi<SummaryData>("/api/m/summary");
      setData(d);
      setConnError("");
    } catch (err: any) {
      setConnError(err.message || "Cannot reach server");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const agents = data?.agents ?? [];
  const tasks = data?.tasks ?? { total: 0, in_progress: 0, completed: 0, failed: 0, todo: 0 };
  const events = data?.events ?? [];
  const recentTasks = data?.recentTasks ?? [];
  const activeAgents = agents.filter(a => a.running).length;

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

      {connError ? (
        <TouchableOpacity style={s.errorBanner} onPress={load} activeOpacity={0.7}>
          <Icon name="cloud-offline-outline" size={14} color={colors.red} />
          <Text style={s.errorText}>{connError}</Text>
          <Text style={s.errorRetry}>Tap to retry</Text>
        </TouchableOpacity>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        {/* Stats Grid */}
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{tasks.total}</Text>
            <Text style={s.statLabel}>Total Tasks</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.yellow }]}>{tasks.in_progress}</Text>
            <Text style={s.statLabel}>In Progress</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.green }]}>{tasks.completed}</Text>
            <Text style={s.statLabel}>Completed</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.red }]}>{tasks.failed}</Text>
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
              <TouchableOpacity key={a.key} style={s.agentChip} onPress={() =>
                nav.navigate("Chat", {
                  agentKey: a.key, agentName: a.name,
                  agentColor: a.color, agentInitials: a.initials,
                  agentRole: a.role,
                })
              }>
                <View style={[s.agentDot, { backgroundColor: a.running ? colors.green : colors.textDim }]} />
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
                    {ev.agent || "System"}{" "}
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
        {recentTasks.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Active Tasks</Text>
            {recentTasks.map(t => (
              <View key={t.id} style={s.taskRow}>
                <View style={s.taskDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.taskTitle} numberOfLines={1}>{t.title}</Text>
                  {t.agent && <Text style={s.taskAssignee}>{t.agent}</Text>}
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
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: "rgba(240,68,68,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(240,68,68,0.15)",
  },
  errorText: { fontSize: 12, color: colors.red, flex: 1 },
  errorRetry: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
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
