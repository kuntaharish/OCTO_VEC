import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { colors, spacing } from "../lib/theme";
import { getApi, postApi } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

interface Employee {
  employee_id?: string; name: string; role: string; agent_key: string;
  status: string; color?: string; initials?: string; department?: string;
}

interface RuntimeAgent {
  agentId: string; running: boolean; paused: boolean;
}

function getInitials(name: string) {
  return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function AgentsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [agents, setAgents] = useState<Employee[]>([]);
  const [runtime, setRuntime] = useState<Record<string, RuntimeAgent>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getApi<{ key: string; name: string; role: string; status: string; color: string; initials: string; running: boolean; paused: boolean }[]>("/api/m/agents");
      setAgents(list.map(a => ({ employee_id: a.key, name: a.name, role: a.role, agent_key: a.key, status: a.status, color: a.color, initials: a.initials })));
      const map: Record<string, RuntimeAgent> = {};
      for (const a of list) map[a.key] = { agentId: a.key, running: a.running, paused: a.paused };
      setRuntime(map);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAction = async (agent: Employee, action: string) => {
    try {
      if (action === "message") {
        nav.navigate("Chat", {
          agentKey: agent.agent_key, agentName: agent.name,
          agentColor: agent.color, agentInitials: agent.initials || getInitials(agent.name),
          agentRole: agent.role,
        });
        return;
      }
      if (action === "pause") {
        await postApi(`/api/agents/${agent.agent_key}/pause`, {});
        Alert.alert("Paused", `${(agent.name || "Agent").split(" ")[0]} is paused`);
      }
      if (action === "resume") {
        await postApi(`/api/agents/${agent.agent_key}/resume`, {});
        Alert.alert("Resumed", `${(agent.name || "Agent").split(" ")[0]} is running`);
      }
      load();
    } catch {
      Alert.alert("Error", "Action failed");
    }
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.title}>Agents</Text>
        <Text style={s.count}>{agents.length}</Text>
      </View>

      <FlatList
        data={agents}
        keyExtractor={a => a.agent_key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderItem={({ item }) => {
          const rt = runtime[item.agent_key];
          const isRunning = rt?.running && !rt?.paused;
          const isPaused = rt?.paused;

          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{item.initials || getInitials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.role}>{item.role}</Text>
                </View>
                <View style={[s.statusBadge, isRunning ? s.statusRunning : isPaused ? s.statusPaused : s.statusOff]}>
                  <View style={[s.statusDot, { backgroundColor: isRunning ? colors.green : isPaused ? colors.yellow : colors.textDim }]} />
                  <Text style={[s.statusText, { color: isRunning ? colors.green : isPaused ? colors.yellow : colors.textMuted }]}>
                    {isRunning ? "Running" : isPaused ? "Paused" : "Idle"}
                  </Text>
                </View>
              </View>

              {item.department && (
                <Text style={s.department}>{item.department}</Text>
              )}

              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => handleAction(item, "message")}>
                  <Icon name="chatbubble-outline" size={14} color={colors.textPrimary} />
                  <Text style={s.actionText}>Message</Text>
                </TouchableOpacity>
                {isRunning ? (
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleAction(item, "pause")}>
                    <Icon name="pause-outline" size={14} color={colors.yellow} />
                    <Text style={[s.actionText, { color: colors.yellow }]}>Pause</Text>
                  </TouchableOpacity>
                ) : isPaused ? (
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleAction(item, "resume")}>
                    <Icon name="play-outline" size={14} color={colors.green} />
                    <Text style={[s.actionText, { color: colors.green }]}>Resume</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="people-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyText}>No agents found</Text>
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

  card: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  role: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  department: { fontSize: 11, color: colors.textDim, marginTop: 8 },

  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusRunning: { backgroundColor: "rgba(61,214,140,0.08)" },
  statusPaused: { backgroundColor: "rgba(234,179,8,0.08)" },
  statusOff: { backgroundColor: colors.bgTertiary },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },

  actions: {
    flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.bgTertiary,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },

  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
});
