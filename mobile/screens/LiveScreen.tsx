import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";
import { getApi, createSSEStream } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";

interface Event {
  timestamp: string; type: string; agent_id?: string;
  agent_name?: string; message?: string; content?: string;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string }> = {
  task_created: { icon: "add-circle-outline", color: colors.blue },
  task_in_progress: { icon: "time-outline", color: colors.yellow },
  task_completed: { icon: "checkmark-circle-outline", color: colors.green },
  task_failed: { icon: "close-circle-outline", color: colors.red },
  agent_thinking: { icon: "bulb-outline", color: colors.cyan },
  agent_tool_call: { icon: "construct-outline", color: colors.orange },
  message_sent: { icon: "chatbubble-outline", color: colors.textSecondary },
  agent_start: { icon: "play-outline", color: colors.green },
  agent_end: { icon: "stop-outline", color: colors.textMuted },
};

function PulseDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[s.liveDot, { opacity }]} />;
}

export default function LiveScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [liveEvents, setLiveEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const e = await getApi<Event[]>("/api/events");
      setEvents(e.slice(0, 30));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // SSE for live updates
  useEffect(() => {
    const stop = createSSEStream((ev) => {
      const liveEv: Event = {
        timestamp: new Date().toISOString(),
        type: ev.type,
        agent_id: ev.agentId,
        message: ev.content,
      };
      setLiveEvents(prev => [liveEv, ...prev].slice(0, 20));
    });
    return () => stop();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const allEvents = [...liveEvents, ...events];
  // Dedupe by timestamp + type
  const seen = new Set<string>();
  const unique = allEvents.filter(e => {
    const key = `${e.timestamp}-${e.type}-${e.agent_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.title}>Live</Text>
          <PulseDot />
        </View>
        <Text style={s.eventCount}>{unique.length} events</Text>
      </View>

      <FlatList
        data={unique}
        keyExtractor={(e, i) => `${e.timestamp}-${i}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderItem={({ item, index }) => {
          const cfg = EVENT_CONFIG[item.type] || { icon: "radio-button-off", color: colors.textDim };
          const isLive = index < liveEvents.length;

          return (
            <View style={s.row}>
              <View style={s.timeline}>
                <View style={[s.timelineDot, { borderColor: cfg.color }]}>
                  <Icon name={cfg.icon} size={12} color={cfg.color} />
                </View>
                {index < unique.length - 1 && <View style={s.timelineLine} />}
              </View>
              <View style={s.content}>
                <View style={s.rowHeader}>
                  <Text style={s.eventType}>{(item.type || "").replace(/_/g, " ")}</Text>
                  {isLive && <View style={s.liveTag}><Text style={s.liveTagText}>LIVE</Text></View>}
                  <Text style={s.time}>{formatTime(item.timestamp)}</Text>
                </View>
                {(item.agent_name || item.agent_id) && (
                  <Text style={s.agent}>{item.agent_name || item.agent_id}</Text>
                )}
                {item.message && (
                  <Text style={s.message} numberOfLines={2}>{item.message}</Text>
                )}
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Icon name="pulse-outline" size={40} color={colors.textDim} />
            <Text style={s.emptyText}>Waiting for activity...</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  eventCount: { fontSize: 12, color: colors.textMuted },

  row: { flexDirection: "row", minHeight: 60 },
  timeline: { width: 32, alignItems: "center" },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, justifyContent: "center", alignItems: "center",
    backgroundColor: colors.bgPrimary,
  },
  timelineLine: { width: 1, flex: 1, backgroundColor: colors.border, marginVertical: 2 },

  content: { flex: 1, paddingLeft: 10, paddingBottom: 16 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventType: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, textTransform: "capitalize" },
  liveTag: { backgroundColor: "rgba(61,214,140,0.12)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  liveTagText: { fontSize: 8, fontWeight: "800", color: colors.green, letterSpacing: 0.5 },
  time: { fontSize: 10, color: colors.textDim, marginLeft: "auto" },
  agent: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  message: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 17 },

  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
});
