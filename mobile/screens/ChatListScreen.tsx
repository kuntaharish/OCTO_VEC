import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { colors } from "../lib/theme";
import { getApi, logout, createSSEStream } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

interface Employee {
  name: string; role: string; agent_key: string;
  status: string; color?: string; initials?: string;
}
interface ChatEntry {
  timestamp: string; from: string; to: string; message: string;
}

type Props = { navigation: NativeStackNavigationProp<RootStackParams, "ChatList"> };

function getInitials(name: string) { return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2); }

function formatTime(ts: string): string {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatListScreen({ navigation }: Props) {
  const [agents, setAgents] = useState<Employee[]>([]);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeAgents, setActiveAgents] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [emps, msgs] = await Promise.all([
        getApi<Employee[]>("/api/employees"),
        getApi<ChatEntry[]>("/api/chat-log"),
      ]);
      setAgents(emps.filter(e => e.agent_key && e.agent_key !== "user"));
      setMessages(msgs);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 4000);
    const stopSSE = createSSEStream((ev) => {
      if (ev.type === "agent_start") setActiveAgents(p => ({ ...p, [ev.agentId]: true }));
      else if (ev.type === "agent_end") setActiveAgents(p => ({ ...p, [ev.agentId]: false }));
    });
    return () => { clearInterval(poll); stopSSE(); };
  }, [load]);

  const lastMsg: Record<string, ChatEntry> = {};
  for (const m of messages) {
    const k = m.from === "user" ? m.to : m.from;
    if (!lastMsg[k] || m.timestamp > lastMsg[k].timestamp) lastMsg[k] = m;
  }

  const sorted = [...agents].sort((a, b) =>
    (lastMsg[b.agent_key]?.timestamp ?? "").localeCompare(lastMsg[a.agent_key]?.timestamp ?? "")
  );
  const filtered = sorted.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleLogout = () => {
    Alert.alert("Logout", "Disconnect from OCTO VEC?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => {
        await logout();
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={handleLogout} style={s.headerBtn}>
          <Icon name="log-out-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <Icon name="search" size={16} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch}
          placeholder="Search agents..." placeholderTextColor={colors.textMuted} style={s.searchInput} />
        {!!search && <TouchableOpacity onPress={() => setSearch("")}><Icon name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.agent_key}
          renderItem={({ item }) => {
            const last = lastMsg[item.agent_key];
            const active = activeAgents[item.agent_key];
            let preview = "";
            if (last) {
              if (last.from === "user") preview = "You: ";
              preview += last.message.replace(/\n/g, " ").slice(0, 50);
            }
            return (
              <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={() =>
                navigation.navigate("Chat", {
                  agentKey: item.agent_key,
                  agentName: item.name,
                  agentColor: item.color,
                  agentInitials: item.initials || getInitials(item.name),
                  agentRole: item.role,
                })
              }>
                <View style={[s.avatar, { backgroundColor: item.color || colors.bgTertiary }]}>
                  <Text style={s.avatarText}>{item.initials || getInitials(item.name)}</Text>
                  {active && <View style={s.dot} />}
                </View>
                <View style={s.info}>
                  <View style={s.nameRow}>
                    <Text style={s.name} numberOfLines={1}>{item.name.split(" ")[0]}</Text>
                    {last && <Text style={s.time}>{formatTime(last.timestamp)}</Text>}
                  </View>
                  {active ? <Text style={s.typing}>typing...</Text>
                    : last ? <Text style={s.preview} numberOfLines={1}>{preview}</Text>
                    : <Text style={s.role}>{item.role}</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<View style={s.center}><Text style={{ color: colors.textMuted }}>No agents found</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: colors.textPrimary },
  headerBtn: { padding: 8, borderRadius: 10, backgroundColor: colors.bgCard },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: colors.bgCard, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  dot: {
    position: "absolute", bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bgPrimary,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  time: { fontSize: 11, color: colors.textMuted },
  preview: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  typing: { fontSize: 13, color: colors.green, fontWeight: "500", marginTop: 2 },
});
