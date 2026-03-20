import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";
import { getApi } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

interface Task {
  id: string; title: string; status: string; assigned_to?: string;
  priority?: string; created_at?: string; description?: string;
}

const FILTERS = ["all", "in_progress", "completed", "failed", "todo"] as const;
type Filter = typeof FILTERS[number];

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  todo: { icon: "radio-button-off", color: colors.textMuted, label: "To Do" },
  in_progress: { icon: "time-outline", color: colors.yellow, label: "In Progress" },
  completed: { icon: "checkmark-circle", color: colors.green, label: "Done" },
  failed: { icon: "close-circle", color: colors.red, label: "Failed" },
  cancelled: { icon: "ban-outline", color: colors.textDim, label: "Cancelled" },
};

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await getApi<Task[]>("/api/tasks");
      setTasks(t);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Tasks</Text>
        <Text style={s.count}>{tasks.length}</Text>
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === "all" ? "All" : (STATUS_CONFIG[f]?.label || f)}
            </Text>
            {f !== "all" && counts[f] ? (
              <Text style={[s.filterCount, filter === f && s.filterCountActive]}>{counts[f]}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.todo;
          return (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Icon name={cfg.icon} size={18} color={cfg.color} />
                <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
              </View>
              {item.description && (
                <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
              )}
              <View style={s.cardFooter}>
                {item.assigned_to && (
                  <View style={s.assignee}>
                    <Icon name="person-outline" size={11} color={colors.textMuted} />
                    <Text style={s.assigneeText}>{item.assigned_to}</Text>
                  </View>
                )}
                {item.priority && (
                  <Text style={[s.priority, item.priority === "high" && { color: colors.red, borderColor: "rgba(240,68,68,0.2)" }]}>
                    {item.priority}
                  </Text>
                )}
                <Text style={s.date}>{item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</Text>
              </View>
            </View>
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
  title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  count: { fontSize: 14, fontWeight: "700", color: colors.textMuted, backgroundColor: colors.bgCard, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },

  filterRow: {
    flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
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

  card: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary, lineHeight: 20 },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  assignee: { flexDirection: "row", alignItems: "center", gap: 4 },
  assigneeText: { fontSize: 11, color: colors.textMuted },
  priority: {
    fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase",
    borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  date: { fontSize: 10, color: colors.textDim, marginLeft: "auto" },

  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
});
