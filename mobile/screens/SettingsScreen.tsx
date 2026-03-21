import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { useTheme, spacing, type ThemeMode } from "../lib/theme";
import { logout, getServerUrl, getRelayMode } from "../lib/api";
import { stopBackgroundSync } from "../lib/notifications";
import EncryptedStorage from "react-native-encrypted-storage";
import Icon from "react-native-vector-icons/Ionicons";

// ── Chat Theme Presets ──────────────────────────────────────────────────────
interface ChatColors {
  userBubble: string; userText: string;
  agentBubble: string; agentText: string;
  tsUser: string; tsAgent: string;
}

const CHAT_PRESETS: { label: string; icon: string; colors: ChatColors }[] = [
  { label: "Default", icon: "ellipse-outline", colors: { userBubble: "", userText: "", agentBubble: "", agentText: "", tsUser: "", tsAgent: "" } },
  { label: "Ocean", icon: "water-outline", colors: { userBubble: "#0077b6", userText: "#ffffff", agentBubble: "#1b2838", agentText: "#cad2de", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
  { label: "Forest", icon: "leaf-outline", colors: { userBubble: "#2d6a4f", userText: "#ffffff", agentBubble: "#1b2e1b", agentText: "#c5dfc5", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
  { label: "Sunset", icon: "sunny-outline", colors: { userBubble: "#e85d04", userText: "#ffffff", agentBubble: "#2a1a0e", agentText: "#f0d5be", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
  { label: "Lavender", icon: "flower-outline", colors: { userBubble: "#7b2cbf", userText: "#ffffff", agentBubble: "#1e1230", agentText: "#d4bfec", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
  { label: "Rose", icon: "rose-outline", colors: { userBubble: "#e63971", userText: "#ffffff", agentBubble: "#2a1018", agentText: "#f0c0d0", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
  { label: "Slate", icon: "moon-outline", colors: { userBubble: "#475569", userText: "#f8fafc", agentBubble: "#1e293b", agentText: "#cbd5e1", tsUser: "rgba(255,255,255,0.5)", tsAgent: "rgba(255,255,255,0.3)" } },
];

const CHAT_THEME_KEY = "chat_theme";

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [serverUrl, setServerUrl] = React.useState("");
  const [isRelay, setIsRelay] = React.useState(false);
  const [chatTheme, setChatTheme] = useState("Default");

  React.useEffect(() => {
    getServerUrl().then(u => setServerUrl(u));
    getRelayMode().then(r => setIsRelay(r));
    EncryptedStorage.getItem(CHAT_THEME_KEY).then(v => { if (v) setChatTheme(v); }).catch(() => {});
  }, []);

  function applyChatTheme(label: string) {
    setChatTheme(label);
    const preset = CHAT_PRESETS.find(p => p.label === label);
    if (!preset) return;
    EncryptedStorage.setItem(CHAT_THEME_KEY, label).catch(() => {});
    EncryptedStorage.setItem("chat_colors", JSON.stringify(preset.colors)).catch(() => {});
  }

  const handleLogout = () => {
    Alert.alert("Logout", "Disconnect from the server?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout", style: "destructive",
        onPress: async () => {
          await stopBackgroundSync();
          await logout();
          nav.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
      justifyContent: "center", alignItems: "center",
    },
    title: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },

    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: spacing.md },

    card: {
      backgroundColor: colors.bgCard, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    },
    row: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: spacing.lg, paddingVertical: 14,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
    rowIcon: {
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    rowLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    rowValue: { fontSize: 13, color: colors.textMuted },

    themeRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 14 },
    themeBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
      backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
    },
    themeBtnActive: {
      backgroundColor: colors.accent, borderColor: colors.accent,
    },
    themeBtnText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
    themeBtnTextActive: { color: colors.bgPrimary },

    presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 14 },
    presetChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
      backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
    },
    presetChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
    presetDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
    presetLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
    presetLabelActive: { color: colors.accent },
    previewBox: {
      marginHorizontal: spacing.lg, marginBottom: 14, padding: 12,
      backgroundColor: colors.bgPrimary, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, gap: 8,
    },
    previewBubble: { maxWidth: "75%", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },

    logoutBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      marginHorizontal: spacing.xl, marginTop: spacing.xxl,
      paddingVertical: 14, borderRadius: 14,
      backgroundColor: "rgba(240,68,68,0.08)", borderWidth: 1, borderColor: "rgba(240,68,68,0.15)",
    },
    logoutText: { fontSize: 15, fontWeight: "700", color: colors.red },

    footer: { alignItems: "center", paddingVertical: spacing.xxl },
    footerText: { fontSize: 11, color: colors.textDim },
  }), [colors]);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => nav.goBack()}>
          <Icon name="arrow-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Appearance ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Appearance</Text>
          <View style={s.card}>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.rowIcon}>
                  <Icon name="color-palette-outline" size={18} color={colors.textPrimary} />
                </View>
                <View>
                  <Text style={s.rowLabel}>App Theme</Text>
                  <Text style={s.rowSub}>Choose your preferred look</Text>
                </View>
              </View>
            </View>
            <View style={s.themeRow}>
              {([
                { key: "light" as ThemeMode, label: "Light", icon: "sunny" },
                { key: "dark" as ThemeMode, label: "Dark", icon: "moon" },
                { key: "midnight" as ThemeMode, label: "Midnight", icon: "planet" },
              ]).map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[s.themeBtn, mode === t.key && s.themeBtnActive]}
                  onPress={() => setMode(t.key)}
                >
                  <Icon
                    name={t.icon}
                    size={16}
                    color={mode === t.key ? colors.bgPrimary : colors.textMuted}
                  />
                  <Text style={[s.themeBtnText, mode === t.key && s.themeBtnTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Chat Theme ────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Chat Theme</Text>
          <View style={s.card}>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.rowIcon}>
                  <Icon name="chatbubbles-outline" size={18} color={colors.textPrimary} />
                </View>
                <View>
                  <Text style={s.rowLabel}>Bubble Style</Text>
                  <Text style={s.rowSub}>Customize chat bubble colors</Text>
                </View>
              </View>
            </View>
            <View style={s.presetGrid}>
              {CHAT_PRESETS.map(p => {
                const active = chatTheme === p.label;
                const dotColor = p.colors.userBubble || colors.textPrimary;
                return (
                  <TouchableOpacity
                    key={p.label}
                    style={[s.presetChip, active && s.presetChipActive]}
                    onPress={() => applyChatTheme(p.label)}
                  >
                    <View style={[s.presetDot, { backgroundColor: dotColor, borderColor: dotColor }]} />
                    <Text style={[s.presetLabel, active && s.presetLabelActive]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Preview */}
            {(() => {
              const preset = CHAT_PRESETS.find(p => p.label === chatTheme) ?? CHAT_PRESETS[0];
              const c = preset.colors;
              const userBg = c.userBubble || colors.textPrimary;
              const userTxt = c.userText || colors.bgPrimary;
              const agentBg = c.agentBubble || colors.bgCard;
              const agentTxt = c.agentText || colors.textPrimary;
              return (
                <View style={s.previewBox}>
                  <View style={{ alignItems: "flex-end" }}>
                    <View style={[s.previewBubble, { backgroundColor: userBg, borderBottomRightRadius: 4 }]}>
                      <Text style={{ color: userTxt, fontSize: 13 }}>Hey, how's the task going?</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-start" }}>
                    <View style={[s.previewBubble, { backgroundColor: agentBg, borderBottomLeftRadius: 4, borderWidth: c.agentBubble ? 0 : 1, borderColor: colors.border }]}>
                      <Text style={{ color: agentTxt, fontSize: 13 }}>Almost done! Finishing up now.</Text>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        </View>

        {/* ── Connection ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Connection</Text>
          <View style={s.card}>
            <View style={[s.row, s.rowBorder]}>
              <View style={s.rowLeft}>
                <View style={s.rowIcon}>
                  <Icon name="server-outline" size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Server</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{serverUrl || "Not connected"}</Text>
                </View>
              </View>
            </View>
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={s.rowIcon}>
                  <Icon name={isRelay ? "globe-outline" : "wifi-outline"} size={18} color={colors.textPrimary} />
                </View>
                <View>
                  <Text style={s.rowLabel}>Mode</Text>
                  <Text style={s.rowSub}>{isRelay ? "Relay (Remote)" : "Direct (Local)"}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── About ───────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <View style={s.card}>
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={s.rowIcon}>
                  <Icon name="information-circle-outline" size={18} color={colors.textPrimary} />
                </View>
                <Text style={s.rowLabel}>Version</Text>
              </View>
              <Text style={s.rowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* ── Logout ──────────────────────────────────── */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Icon name="log-out-outline" size={18} color={colors.red} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.footerText}>OCTO VEC Mobile</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
