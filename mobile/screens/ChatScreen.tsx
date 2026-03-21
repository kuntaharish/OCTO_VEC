import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Keyboard, Alert, ActivityIndicator, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParams } from "../App";
import { useTheme, spacing } from "../lib/theme";
import { getApi, postApi } from "../lib/api";
import EncryptedStorage from "react-native-encrypted-storage";

interface ChatThemeColors {
  userBubble: string; userText: string;
  agentBubble: string; agentText: string;
  tsUser: string; tsAgent: string;
}
import Icon from "react-native-vector-icons/Ionicons";

interface ChatEntry { id?: string; timestamp: string; from: string; to: string; message: string; }
interface PendingApproval {
  id: string; agentId: string; agentName: string;
  type: string; title: string; description: string;
  context?: { toolName?: string; args?: any };
  createdAt: string;
}

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

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function ChatScreen({ navigation, route }: Props) {
  const { colors, mode } = useTheme();
  const { agentKey, agentName, agentInitials, agentRole } = route.params;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [actingApproval, setActingApproval] = useState<string | null>(null);
  const [chatTheme, setChatTheme] = useState<ChatThemeColors | null>(null);
  const listRef = useRef<FlatList>(null);

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 8, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerAvatarWrap: { position: "relative" },
    headerAvatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center" },
    headerOnline: {
      position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5,
      backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bgPrimary,
    },
    headerAvatarText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    headerName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    headerRole: { fontSize: 11, color: colors.textDim },
    headerTyping: { fontSize: 11, color: colors.green, fontWeight: "500" },

    dateSep: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 8 },
    dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dateText: { fontSize: 10, fontWeight: "600", color: colors.textDim, letterSpacing: 0.5 },

    bubbleRow: { flexDirection: "row", marginVertical: 2, alignItems: "flex-end" },
    bubbleRowUser: { justifyContent: "flex-end", paddingLeft: 50 },
    bubbleRowAgent: { justifyContent: "flex-start", paddingRight: 50 },
    bubble: { maxWidth: "85%", paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, borderRadius: 18 },
    bubbleUser: { backgroundColor: colors.textPrimary, borderBottomRightRadius: 4 },
    bubbleAgent: { backgroundColor: colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    msgUser: { color: colors.bgPrimary, fontSize: 15, lineHeight: 21 },
    msgAgent: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
    ts: { fontSize: 10, marginTop: 2, alignSelf: "flex-end" },
    tsUser: { color: mode === "light" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)" },
    tsAgent: { color: colors.textDim },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },

    typingBubble: {
      flexDirection: "row", gap: 4, backgroundColor: colors.bgCard, borderRadius: 18,
      borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.border,
    },
    typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },

    inputBar: {
      flexDirection: "row", alignItems: "flex-end", gap: 6,
      paddingHorizontal: 8, paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: colors.border,
      backgroundColor: colors.bgPrimary,
    },
    attachBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    inputWrap: {
      flex: 1, flexDirection: "row", alignItems: "flex-end",
      backgroundColor: colors.bgCard, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border,
      minHeight: 40,
      paddingLeft: 14, paddingRight: 4, paddingBottom: 4,
    },
    textInput: {
      flex: 1, maxHeight: 100,
      color: colors.textPrimary, fontSize: 15,
      paddingTop: 8, paddingBottom: 8,
      textAlignVertical: "center",
    },
    sendBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    sendActive: { backgroundColor: colors.textPrimary },

    approvalBar: {
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: "rgba(245,158,11,0.06)",
      borderBottomWidth: 1, borderBottomColor: colors.border,
      gap: 6,
    },
    approvalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    approvalTool: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.orange, fontFamily: "monospace" },
    approvalAllow: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: "rgba(61,214,140,0.12)", justifyContent: "center", alignItems: "center",
    },
    approvalDeny: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: "rgba(240,68,68,0.1)", justifyContent: "center", alignItems: "center",
    },
  }), [colors, mode]);

  // ── Load chat theme ────────────────────────────────────────────────────────
  useEffect(() => {
    EncryptedStorage.getItem("chat_colors").then(v => {
      if (v) setChatTheme(JSON.parse(v));
    }).catch(() => {});
  }, []);

  // ── Typing dots ─────────────────────────────────────────────────────────────
  function TypingDots() {
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
        <View style={s.typingBubble}>
          <Animated.View style={[s.typingDot, { opacity: d1 }]} />
          <Animated.View style={[s.typingDot, { opacity: d2 }]} />
          <Animated.View style={[s.typingDot, { opacity: d3 }]} />
        </View>
      </View>
    );
  }

  const loadMsgs = useCallback(async () => {
    try {
      const msgs = await getApi<{ from: string; message: string; time: string }[]>(`/api/m/chat/${agentKey}`);
      setMessages(msgs.map((m, i) => ({ from: m.from, to: m.from === "user" ? agentKey : "user", message: m.message, timestamp: m.time })));
    } catch {}
  }, [agentKey]);

  // Mark as read whenever this screen is open
  useEffect(() => {
    (async () => {
      try {
        const raw = await EncryptedStorage.getItem("chat_last_read");
        const lr = raw ? JSON.parse(raw) : {};
        lr[agentKey] = new Date().toISOString();
        await EncryptedStorage.setItem("chat_last_read", JSON.stringify(lr));
      } catch {}
    })();
  }, [agentKey, messages]);

  useEffect(() => {
    loadMsgs();
    const poll = setInterval(loadMsgs, 3000);
    const kbShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100),
    );
    return () => { clearInterval(poll); kbShow.remove(); };
  }, [agentKey, loadMsgs]);

  // Poll approvals for this agent
  const loadApprovals = useCallback(async () => {
    try {
      const all = await getApi<PendingApproval[]>("/api/m/approvals");
      setApprovals(all.filter(a => a.agentId === agentKey));
    } catch {}
  }, [agentKey]);

  useEffect(() => {
    loadApprovals();
    const poll = setInterval(loadApprovals, 2000);
    return () => clearInterval(poll);
  }, [loadApprovals]);

  async function respondApproval(id: string, approved: boolean) {
    setActingApproval(id);
    try { await postApi("/api/m/approve", { id, approved }); loadApprovals(); }
    catch {}
    finally { setActingApproval(null); }
  }

  const send = useCallback(async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    Keyboard.dismiss();
    try {
      await postApi("/api/m/send", { to: agentKey, message: msg });
      setMessages(prev => [...prev, { timestamp: new Date().toISOString(), from: "user", to: agentKey, message: msg }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert("Error", `Failed to send: ${err?.message || err}`);
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
          <Icon name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerAvatarWrap}>
          <View style={s.headerAvatar}>
            <Text style={s.headerAvatarText}>{agentInitials || firstName[0]}</Text>
          </View>
          {isTyping && <View style={s.headerOnline} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName}>{firstName}</Text>
          {isTyping ? <Text style={s.headerTyping}>typing...</Text>
            : <Text style={s.headerRole}>{agentRole ?? ""}</Text>}
        </View>
      </View>

      {/* Pending approvals */}
      {approvals.length > 0 && (
        <View style={s.approvalBar}>
          {approvals.map(a => (
            <View key={a.id} style={s.approvalRow}>
              <Icon name="shield-checkmark-outline" size={14} color={colors.orange} />
              <Text style={s.approvalTool} numberOfLines={1}>{a.context?.toolName || a.title}</Text>
              <TouchableOpacity style={s.approvalAllow} onPress={() => respondApproval(a.id, true)}
                disabled={actingApproval === a.id} activeOpacity={0.6}>
                <Icon name="checkmark" size={14} color={colors.green} />
              </TouchableOpacity>
              <TouchableOpacity style={s.approvalDeny} onPress={() => respondApproval(a.id, false)}
                disabled={actingApproval === a.id} activeOpacity={0.6}>
                <Icon name="close" size={14} color={colors.red} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
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
                  <View style={[
                    s.bubble,
                    isUser ? s.bubbleUser : s.bubbleAgent,
                    chatTheme && isUser && chatTheme.userBubble ? { backgroundColor: chatTheme.userBubble } : null,
                    chatTheme && !isUser && chatTheme.agentBubble ? { backgroundColor: chatTheme.agentBubble, borderWidth: 0 } : null,
                  ]}>
                    <Text style={[
                      isUser ? s.msgUser : s.msgAgent,
                      chatTheme && isUser && chatTheme.userText ? { color: chatTheme.userText } : null,
                      chatTheme && !isUser && chatTheme.agentText ? { color: chatTheme.agentText } : null,
                    ]}>{item.message}</Text>
                    <Text style={[
                      s.ts,
                      isUser ? s.tsUser : s.tsAgent,
                      chatTheme && isUser && chatTheme.tsUser ? { color: chatTheme.tsUser } : null,
                      chatTheme && !isUser && chatTheme.tsAgent ? { color: chatTheme.tsAgent } : null,
                    ]}>{formatTime(item.timestamp)}</Text>
                  </View>
                </View>
              </>
            );
          }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="chatbubbles-outline" size={40} color={colors.textDim} />
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600", marginTop: 12 }}>No messages yet</Text>
              <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}>Send a message to {firstName}</Text>
            </View>
          }
          ListFooterComponent={isTyping ? <TypingDots /> : null}
        />

        {/* Input */}
        <View style={s.inputBar}>
          <TouchableOpacity style={s.attachBtn} activeOpacity={0.6}>
            <Icon name="add" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={s.inputWrap}>
            <TextInput value={input} onChangeText={setInput}
              placeholder={`Message ${firstName}...`} placeholderTextColor={colors.textDim}
              style={s.textInput} multiline maxLength={4000}
              onSubmitEditing={send} blurOnSubmit={false} />
            <TouchableOpacity onPress={send} disabled={!input.trim() || sending}
              style={[s.sendBtn, input.trim() && !sending ? s.sendActive : null]}
              activeOpacity={0.7}>
              {sending ? <ActivityIndicator color={colors.bgPrimary} size="small" />
                : <Icon name="arrow-up" size={18} color={input.trim() ? colors.bgPrimary : colors.textDim} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
