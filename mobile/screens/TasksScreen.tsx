import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing } from "../lib/theme";
import { getApi } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

interface Task {
  id: string; title: string; status: string; agent?: string;
  agentName?: string; agentInitials?: string; agentColor?: string;
  priority?: string; result?: string; created?: string; updated?: string;
}

const COLUMNS = [
  { key: "todo", label: "To Do", color: colors.textMuted, icon: "radio-button-off" },
  { key: "in_progress", label: "In Progress", color: colors.blue, icon: "time-outline" },
  { key: "completed", label: "Done", color: colors.green, icon: "checkmark-circle" },
  { key: "failed", label: "Failed", color: colors.red, icon: "close-circle" },
  { key: "cancelled", label: "Cancelled", color: colors.textDim, icon: "ban-outline" },
] as const;

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filter, setFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await getApi<Task[]>("/api/m/tasks");
      setTasks(t);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;

  // Kanban view
  if (view === "kanban") {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.header}>
          <Text style={s.title}>Tasks</Text>
          <View style={s.headerRight}>
            <Text style={s.count}>{tasks.length}</Text>
            <TouchableOpacity style={s.viewToggle} onPress={() => setView("list")}>
              <Icon name="list-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal pagingEnabled={false} showsHorizontalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
          contentContainerStyle={s.kanbanScroll}
        >
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            if (colTasks.length === 0 && col.key === "cancelled") return null; // hide empty cancelled
            return (
              <View key={col.key} style={s.column}>
                <View style={s.colHeader}>
                  <View style={[s.colDot, { backgroundColor: col.color }]} />
                  <Text style={s.colTitle}>{col.label}</Text>
                  <Text style={s.colCount}>{colTasks.length}</Text>
                </View>
                <ScrollView style={s.colScroll} showsVerticalScrollIndicator={false}>
                  {colTasks.map(task => (
                    <TouchableOpacity
                      key={task.id}
                      style={s.kCard}
                      activeOpacity={0.7}
                      onPress={() => setExpanded(expanded === task.id ? null : task.id)}
                    >
                      <View style={s.kCardTop}>
                        <Text style={s.kTaskId}>{task.id}</Text>
                        <Text style={s.kTime}>{timeAgo(task.updated || task.created)}</Text>
                      </View>
                      <Text style={s.kTitle} numberOfLines={expanded === task.id ? 10 : 2}>{task.title}</Text>
                      {expanded === task.id && task.result ? (
                        <View style={s.kResult}>
                          <Text style={s.kResultText}>{task.result}</Text>
                        </View>
                      ) : null}
                      <View style={s.kCardBottom}>
                        <View style={s.kAgent}>
                          <View style={s.kAvatar}>
                            <Text style={s.kAvatarText}>{task.agentInitials || (task.agent || "?").slice(0, 2).toUpperCase()}</Text>
                          </View>
                          <Text style={s.kAgentName}>{task.agentName || task.agent}</Text>
                        </View>
                        {task.priority && task.priority !== "medium" && task.priority !== "normal" && (
                          <Text style={[
                            s.kPriority,
                            task.priority === "high" || task.priority === "critical" ? s.kPriorityHigh : s.kPriorityLow,
                          ]}>
                            {task.priority}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                  {colTasks.length === 0 && (
                    <Text style={s.colEmpty}>No tasks</Text>
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // List view
  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Tasks</Text>
        <View style={s.headerRight}>
          <Text style={s.count}>{tasks.length}</Text>
          <TouchableOpacity style={s.viewToggle} onPress={() => setView("kanban")}>
            <Icon name="grid-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[{ key: "all", label: "All" }, ...COLUMNS].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterBtn, filter === f.key && s.filterActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>
                {f.label}
              </Text>
              {f.key !== "all" && counts[f.key] ? (
                <Text style={[s.filterCount, filter === f.key && s.filterCountActive]}>{counts[f.key]}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderItem={({ item }) => {
          const col = COLUMNS.find(c => c.key === item.status) || COLUMNS[0];
          const isExpanded = expanded === item.id;
          return (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.7}
              onPress={() => setExpanded(isExpanded ? null : item.id)}
            >
              <View style={s.cardHeader}>
                <Icon name={col.icon} size={18} color={col.color} />
                <Text style={s.cardTitle} numberOfLines={isExpanded ? 10 : 2}>{item.title}</Text>
              </View>
              {isExpanded && item.result ? (
                <View style={s.cardResult}>
                  <Text style={s.cardResultLabel}>Result</Text>
                  <Text style={s.cardResultText}>{item.result}</Text>
                </View>
              ) : null}
              <View style={s.cardFooter}>
                <View style={s.kAgent}>
                  <View style={s.kAvatar}>
                    <Text style={s.kAvatarText}>{item.agentInitials || (item.agent || "?").slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Text style={s.kAgentName}>{item.agentName || item.agent}</Text>
                </View>
                {item.priority && item.priority !== "medium" && item.priority !== "normal" && (
                  <Text style={[
                    s.kPriority,
                    item.priority === "high" || item.priority === "critical" ? s.kPriorityHigh : s.kPriorityLow,
                  ]}>
                    {item.priority}
                  </Text>
                )}
                <Text style={s.taskId}>{item.id}</Text>
                <Text style={s.date}>{timeAgo(item.updated || item.created)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="checkbox-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyText}>No tasks</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  count: { fontSize: 14, fontWeight: "700", color: colors.textMuted, backgroundColor: colors.bgCard, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  viewToggle: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: "center", alignItems: "center",
  },

  // Kanban
  kanbanScroll: { paddingHorizontal: spacing.sm, paddingTop: spacing.md, paddingBottom: 40 },
  column: { width: 260, marginHorizontal: 4 },
  colHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, flex: 1 },
  colCount: {
    fontSize: 10, fontWeight: "700", color: colors.textMuted,
    backgroundColor: colors.bgTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  colScroll: { flex: 1 },
  colEmpty: { fontSize: 11, color: colors.textDim, textAlign: "center", paddingVertical: 20 },

  // Kanban card
  kCard: {
    backgroundColor: colors.bgCard, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    padding: 10, marginBottom: 6, marginHorizontal: 2,
  },
  kCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  kTaskId: { fontSize: 10, fontWeight: "600", color: colors.textDim, fontFamily: "monospace" },
  kTime: { fontSize: 9, color: colors.textDim },
  kTitle: { fontSize: 12, fontWeight: "600", color: colors.textPrimary, lineHeight: 17 },
  kResult: {
    marginTop: 6, padding: 6, backgroundColor: colors.bgPrimary,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  kResultText: { fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  kCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  kAgent: { flexDirection: "row", alignItems: "center", gap: 5 },
  kAvatar: {
    width: 18, height: 18, borderRadius: 5,
    backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
  },
  kAvatarText: { fontSize: 8, fontWeight: "700", color: colors.textSecondary },
  kAgentName: { fontSize: 10, color: colors.textMuted },
  kPriority: {
    fontSize: 9, fontWeight: "700", textTransform: "uppercase",
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
    overflow: "hidden",
  },
  kPriorityHigh: { backgroundColor: "rgba(240,68,68,0.1)", color: colors.red },
  kPriorityLow: { backgroundColor: "rgba(102,102,102,0.1)", color: colors.textMuted },

  // List filters
  filterRow: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  filterActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  filterText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  filterTextActive: { color: colors.bgPrimary },
  filterCount: { fontSize: 10, fontWeight: "700", color: colors.textDim },
  filterCountActive: { color: colors.bgPrimary },

  // List card
  card: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, lineHeight: 20 },
  cardResult: {
    marginTop: 8, padding: 8, backgroundColor: colors.bgPrimary,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  cardResultLabel: { fontSize: 9, fontWeight: "700", color: colors.textDim, textTransform: "uppercase", marginBottom: 4 },
  cardResultText: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  taskId: { fontSize: 9, color: colors.textDim, fontFamily: "monospace", marginLeft: "auto" },
  date: { fontSize: 10, color: colors.textDim },

  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
});
