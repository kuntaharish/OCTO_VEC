import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { useTheme, spacing } from "../lib/theme";
import { getApi, postApi } from "../lib/api";
import EncryptedStorage from "react-native-encrypted-storage";
import Icon from "react-native-vector-icons/Ionicons";

interface ChatItem {
  key: string; name: string; role: string; initials: string; color: string;
  active: boolean; unread: number;
  lastMessage: { from: string; text: string; time: string } | null;
}

interface PendingApproval { id: string; agentId: string; }

function getInitials(name: string) { return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2); }

function formatTime(ts: string): string {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatListScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [approvalAgents, setApprovalAgents] = useState<Set<string>>(new Set());

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
    header: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
    searchWrap: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
      height: 34, backgroundColor: colors.bgCard, borderRadius: 17,
      paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 13, paddingVertical: 0 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 14,
      paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 14,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    avatarText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    dot: {
      position: "absolute", bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6,
      backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bgPrimary,
    },
    info: { flex: 1 },
    nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    nameRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, flex: 1 },
    time: { fontSize: 11, color: colors.textDim },
    previewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
    preview: { fontSize: 13, color: colors.textMuted },
    role: { fontSize: 13, color: colors.textDim },
    typing: { fontSize: 13, color: colors.green, fontWeight: "500" },
    badge: {
      minWidth: 20, height: 20, borderRadius: 10,
      backgroundColor: colors.textPrimary, justifyContent: "center", alignItems: "center",
      paddingHorizontal: 5,
    },
    badgeText: { fontSize: 11, fontWeight: "800", color: colors.bgPrimary },
    approvalDot: {
      position: "absolute", top: -1, right: -1, width: 12, height: 12, borderRadius: 6,
      backgroundColor: colors.orange, borderWidth: 2, borderColor: colors.bgPrimary,
    },
  }), [colors]);

  const load = useCallback(async () => {
    try {
      // Send lastRead timestamps to server so it can compute unread counts
      let lastReadParam = "";
      try {
        const raw = await EncryptedStorage.getItem("chat_last_read");
        if (raw) lastReadParam = `?lastRead=${encodeURIComponent(raw)}`;
      } catch {}
      const data = await getApi<ChatItem[]>(`/api/m/chats${lastReadParam}`);
      setChats(data);
    } catch {}
    setLoading(false);
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const data = await getApi<PendingApproval[]>("/api/m/approvals");
      setApprovalAgents(new Set(data.map(a => a.agentId)));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    load(); loadApprovals();
    const poll = setInterval(load, 4000);
    const pollApproval = setInterval(loadApprovals, 2000);
    return () => { clearInterval(poll); clearInterval(pollApproval); };
  }, [load, loadApprovals]));

  const filtered = chats.filter(a =>
    !search || (a.name || "").toLowerCase().includes(search.toLowerCase()) || (a.role || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Chats</Text>
        <View style={s.searchWrap}>
          <Icon name="search" size={14} color={colors.textDim} />
          <TextInput value={search} onChangeText={setSearch}
            placeholder="Search..." placeholderTextColor={colors.textDim} style={s.searchInput} />
          {!!search && <TouchableOpacity onPress={() => setSearch("")}><Icon name="close-circle" size={14} color={colors.textDim} /></TouchableOpacity>}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.textMuted} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.key}
          renderItem={({ item }) => {
            const last = item.lastMessage;
            let preview = "";
            if (last) {
              if (last.from === "user") preview = "You: ";
              preview += last.text;
            }

            return (
              <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={async () => {
                // Mark as read locally
                try {
                  const raw = await EncryptedStorage.getItem("chat_last_read");
                  const lr = raw ? JSON.parse(raw) : {};
                  lr[item.key] = new Date().toISOString();
                  await EncryptedStorage.setItem("chat_last_read", JSON.stringify(lr));
                } catch {}
                nav.navigate("Chat", {
                  agentKey: item.key,
                  agentName: item.name,
                  agentColor: item.color,
                  agentInitials: item.initials || getInitials(item.name),
                  agentRole: item.role,
                });
              }}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{item.initials || getInitials(item.name)}</Text>
                  {approvalAgents.has(item.key) ? <View style={s.approvalDot} /> : item.active ? <View style={s.dot} /> : null}
                </View>
                <View style={s.info}>
                  <View style={s.nameRow}>
                    <Text style={[s.name, item.unread > 0 && { fontWeight: "800" }]} numberOfLines={1}>{(item.name || "Agent").split(" ")[0]}</Text>
                    <View style={s.nameRight}>
                      {last && <Text style={[s.time, item.unread > 0 && { color: colors.textPrimary }]}>{formatTime(last.time)}</Text>}
                    </View>
                  </View>
                  <View style={s.previewRow}>
                    <View style={{ flex: 1 }}>
                      {last ? <Text style={[s.preview, item.unread > 0 && { color: colors.textSecondary }]} numberOfLines={1}>{preview}</Text>
                        : <Text style={s.role}>{item.role}</Text>}
                    </View>
                    {item.unread > 0 && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>{item.unread > 9 ? "9+" : item.unread}</Text>
                      </View>
                    )}
                  </View>
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
