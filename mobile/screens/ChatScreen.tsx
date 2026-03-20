import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Keyboard, Alert, ActivityIndicator, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParams } from "../App";
import { colors } from "../lib/theme";
import { getApi, postApi, createSSEStream } from "../lib/api";
import Icon from "react-native-vector-icons/Ionicons";
// Using plain Text instead of Markdown to avoid crash on some RN versions
// import Markdown from "react-native-markdown-display";

interface ChatEntry { id?: string; timestamp: string; from: string; to: string; message: string; }

type Props = {
  navigation: NativeStackNavigationProp<RootStackParams, "Chat">;
  route: RouteProp<RootStackParams, "Chat">;
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function formatDate(ts: string) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Typing dots ─────────────────────────────────────────────────────────────
function TypingDots({ color }: { color?: string }) {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const mk = (d: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
    ]));
    const a = [mk(d1, 0), mk(d2, 150), mk(d3, 300)];
    a.forEach(x => x.start());
    return () => a.forEach(x => x.stop());
  }, [d1, d2, d3]);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginVertical: 4, paddingRight: 50 }}>
      <View style={[s.miniAvatar, { backgroundColor: color || colors.bgTertiary }]} />
      <View style={s.typingBubble}>
        <Animated.View style={[s.typingDot, { opacity: d1 }]} />
        <Animated.View style={[s.typingDot, { opacity: d2 }]} />
        <Animated.View style={[s.typingDot, { opacity: d3 }]} />
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function ChatScreen({ navigation, route }: Props) {
  const { agentKey, agentName, agentColor, agentInitials, agentRole } = route.params;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadMsgs = useCallback(async () => {
    try {
      const all = await getApi<ChatEntry[]>("/api/chat-log");
      setMessages(all.filter(m =>
        (m.from === agentKey && m.to === "user") || (m.from === "user" && m.to === agentKey)
      ));
    } catch {}
  }, [agentKey]);

  useEffect(() => {
    loadMsgs();
    const poll = setInterval(loadMsgs, 3000);
    const stopSSE = createSSEStream((ev) => {
      if (ev.agentId === agentKey) {
        if (ev.type === "agent_start") setIsTyping(true);
        else if (ev.type === "agent_end") { setIsTyping(false); loadMsgs(); }
      }
    });
    return () => { clearInterval(poll); stopSSE(); };
  }, [agentKey, loadMsgs]);

  const send = useCallback(async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    Keyboard.dismiss();
    try {
      await postApi("/api/send-message", { to: agentKey, message: msg });
      setMessages(prev => [...prev, { timestamp: new Date().toISOString(), from: "user", to: agentKey, message: msg }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert("Error", "Failed to send");
      setInput(msg);
    }
    setSending(false);
  }, [input, sending, agentKey]);

  const firstName = agentName?.split(" ")[0] ?? agentKey;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Icon name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={[s.headerAvatar, { backgroundColor: agentColor || colors.bgTertiary }]}>
          <Text style={s.headerAvatarText}>{agentInitials || firstName[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName}>{firstName}</Text>
          {isTyping ? <Text style={s.headerTyping}>typing...</Text>
            : <Text style={s.headerRole}>{agentRole ?? ""}</Text>}
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m, i) => m.id ?? `${m.timestamp}-${i}`}
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const showDate = !prev || new Date(item.timestamp).toDateString() !== new Date(prev.timestamp).toDateString();
            const isUser = item.from === "user";
            return (
              <>
                {showDate && (
                  <View style={s.dateSep}>
                    <View style={s.dateLine} /><Text style={s.dateText}>{formatDate(item.timestamp)}</Text><View style={s.dateLine} />
                  </View>
                )}
                <View style={[s.bubbleRow, isUser ? s.bubbleRowUser : s.bubbleRowAgent]}>
                  {!isUser && (
                    <View style={[s.miniAvatar, { backgroundColor: agentColor || colors.bgTertiary }]}>
                      <Text style={s.miniAvatarText}>{agentInitials || firstName[0]}</Text>
                    </View>
                  )}
                  <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAgent]}>
                    <Text style={isUser ? { color: "#fff", fontSize: 15, lineHeight: 21 } : { color: colors.textPrimary, fontSize: 15, lineHeight: 21 }}>{item.message}</Text>
                    <Text style={[s.ts, isUser ? s.tsUser : s.tsAgent]}>{formatTime(item.timestamp)}</Text>
                  </View>
                </View>
              </>
            );
          }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="chatbubbles-outline" size={48} color={colors.bgTertiary} />
              <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: "600", marginTop: 12 }}>No messages yet</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Send a message to {firstName}</Text>
            </View>
          }
          ListFooterComponent={isTyping ? <TypingDots color={agentColor} /> : null}
        />

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput value={input} onChangeText={setInput}
            placeholder={`Message ${firstName}...`} placeholderTextColor={colors.textMuted}
            style={s.textInput} multiline maxLength={4000} />
          <TouchableOpacity onPress={send} disabled={!input.trim() || sending}
            style={[s.sendBtn, input.trim() && !sending ? s.sendActive : null]}>
            {sending ? <ActivityIndicator color="#fff" size="small" />
              : <Icon name="arrow-up" size={20} color={input.trim() ? "#fff" : colors.textMuted} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const mdBase = { paragraph: { marginTop: 0, marginBottom: 0 }, bullet_list: { marginVertical: 4 }, ordered_list: { marginVertical: 4 }, list_item: { marginVertical: 1 } };
const mdUser: any = { ...mdBase, body: { color: "#fff", fontSize: 15, lineHeight: 21 }, strong: { fontWeight: "700", color: "#fff" }, link: { color: "#c4b5fd" }, code_inline: { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff", paddingHorizontal: 4, borderRadius: 4, fontSize: 13 }, fence: { backgroundColor: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8, marginVertical: 4, fontSize: 12, color: "#fff" } };
const mdAgent: any = { ...mdBase, body: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 }, strong: { fontWeight: "700", color: colors.textPrimary }, link: { color: colors.accent }, code_inline: { backgroundColor: colors.bgTertiary, color: colors.textPrimary, paddingHorizontal: 4, borderRadius: 4, fontSize: 13 }, fence: { backgroundColor: colors.bgPrimary, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginVertical: 4, fontSize: 12, color: colors.textPrimary } };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  headerAvatarText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  headerName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  headerRole: { fontSize: 12, color: colors.textMuted },
  headerTyping: { fontSize: 12, color: colors.green, fontWeight: "500" },

  dateSep: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 8 },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },

  bubbleRow: { flexDirection: "row", marginVertical: 2, alignItems: "flex-end" },
  bubbleRowUser: { justifyContent: "flex-end", paddingLeft: 50 },
  bubbleRowAgent: { justifyContent: "flex-start", paddingRight: 50 },
  miniAvatar: { width: 26, height: 26, borderRadius: 9, justifyContent: "center", alignItems: "center", marginRight: 6, marginBottom: 2 },
  miniAvatarText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, borderRadius: 18 },
  bubbleUser: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleAgent: { backgroundColor: colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  ts: { fontSize: 10, marginTop: 2, alignSelf: "flex-end" },
  tsUser: { color: "rgba(255,255,255,0.5)" },
  tsAgent: { color: colors.textMuted },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },

  typingBubble: {
    flexDirection: "row", gap: 4, backgroundColor: colors.bgCard, borderRadius: 18,
    borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textMuted },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  textInput: {
    flex: 1, minHeight: 40, maxHeight: 120,
    backgroundColor: colors.bgCard, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
  },
  sendActive: { backgroundColor: colors.accent },
});
