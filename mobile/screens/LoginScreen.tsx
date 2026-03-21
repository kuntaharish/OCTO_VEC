import React, { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator, StyleSheet, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParams } from "../App";
import { useTheme } from "../lib/theme";
import { login, loginRelay } from "../lib/api";
import { startBackgroundSync } from "../lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";

type Props = { navigation: NativeStackNavigationProp<RootStackParams, "Login"> };

export default function LoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<"choose" | "local" | "relay">("choose");

  // Local mode
  const [serverUrl, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [step, setStep] = useState<"server" | "key">("server");

  // Relay mode
  const [relayUrl, setRelayUrl] = useState("");
  const [relaySecret, setRelaySecret] = useState("");
  const [relaySession, setRelaySession] = useState("default");
  const [showSecret, setShowSecret] = useState(false);

  const [loading, setLoading] = useState(false);

  const s = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
    logoWrap: { alignItems: "center", marginBottom: 40 },
    logoCircle: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
      justifyContent: "center", alignItems: "center", marginBottom: 16,
    },
    title: { fontSize: 28, fontWeight: "800", color: colors.textPrimary, letterSpacing: 1 },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    formWrap: { gap: 12 },
    label: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
    inputRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.bgCard, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    },
    input: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 14 },
    hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, paddingHorizontal: 2 },
    btn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      backgroundColor: colors.textPrimary, borderRadius: 12, paddingVertical: 14, marginTop: 8,
    },
    btnText: { fontSize: 16, fontWeight: "700", color: colors.bgPrimary },
    serverBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.bgCard, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start", marginBottom: 4,
    },
    serverBadgeText: { fontSize: 11, color: colors.textSecondary },
    scanBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      backgroundColor: colors.textPrimary, borderRadius: 14,
      paddingVertical: 16,
    },
    scanBtnText: { fontSize: 17, fontWeight: "700", color: colors.bgPrimary },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 11, color: colors.textDim, fontWeight: "500" },
    modeBtn: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: colors.bgCard, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    modeBtnIcon: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: colors.bgTertiary, justifyContent: "center", alignItems: "center",
    },
    modeBtnTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    modeBtnDesc: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    backBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
      paddingVertical: 12, marginTop: 4,
    },
    backBtnText: { fontSize: 14, color: colors.textMuted },
  }), [colors]);

  // ── Local connect ─────────────────────────────────────────────────────
  async function handleConnect() {
    const url = serverUrl.trim();
    if (!url) { Alert.alert("Error", "Enter your server URL"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/settings`).catch(() => null);
      if (!res) {
        Alert.alert("Connection Failed", "Cannot reach the server. Check the URL and make sure OCTO VEC is running.");
        setLoading(false);
        return;
      }
      setStep("key");
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Connection failed");
    }
    setLoading(false);
  }

  async function handleLogin() {
    const key = apiKey.trim();
    if (!key) { Alert.alert("Error", "Enter your dashboard key"); return; }
    setLoading(true);
    const result = await login(serverUrl.trim(), key);
    setLoading(false);
    if (result.ok) {
      startBackgroundSync();
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert("Login Failed", result.error ?? "Invalid key");
    }
  }

  // ── Relay connect ─────────────────────────────────────────────────────
  async function handleRelayLogin() {
    const url = relayUrl.trim();
    const secret = relaySecret.trim();
    if (!url) { Alert.alert("Error", "Enter the relay server URL"); return; }
    if (!secret) { Alert.alert("Error", "Enter the relay secret"); return; }
    setLoading(true);
    const result = await loginRelay(url, secret, relaySession.trim());
    setLoading(false);
    if (result.ok) {
      startBackgroundSync();
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert("Connection Failed", result.error ?? "Could not connect");
    }
  }

  // ── Choose mode ───────────────────────────────────────────────────────
  if (mode === "choose") {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.inner}>
          <View style={s.logoWrap}>
            <View style={s.logoCircle}>
              <Icon name="cube-outline" size={36} color={colors.accent} />
            </View>
            <Text style={s.title}>OCTO VEC</Text>
            <Text style={s.subtitle}>Connect to your workspace</Text>
          </View>

          <View style={s.formWrap}>
            {/* QR Scan — primary action */}
            <TouchableOpacity style={s.scanBtn} onPress={() => navigation.navigate("Scan")}>
              <Icon name="qr-code-outline" size={22} color={colors.bgPrimary} />
              <Text style={s.scanBtnText}>Scan QR Code</Text>
            </TouchableOpacity>

            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or connect manually</Text>
              <View style={s.dividerLine} />
            </View>

            <TouchableOpacity style={s.modeBtn} onPress={() => setMode("local")}>
              <View style={s.modeBtnIcon}>
                <Icon name="wifi-outline" size={22} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modeBtnTitle}>Same Network</Text>
                <Text style={s.modeBtnDesc}>Connect via local WiFi</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textDim} />
            </TouchableOpacity>

            <TouchableOpacity style={s.modeBtn} onPress={() => setMode("relay")}>
              <View style={s.modeBtnIcon}>
                <Icon name="globe-outline" size={22} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modeBtnTitle}>Remote Access</Text>
                <Text style={s.modeBtnDesc}>Connect via secure relay</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textDim} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Local mode ────────────────────────────────────────────────────────
  if (mode === "local") {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={s.inner} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={s.logoWrap}>
            <View style={s.logoCircle}>
              <Icon name="wifi-outline" size={36} color={colors.accent} />
            </View>
            <Text style={s.title}>Same Network</Text>
            <Text style={s.subtitle}>Connect directly to your PC</Text>
          </View>

          {step === "server" ? (
            <View style={s.formWrap}>
              <Text style={s.label}>Server URL</Text>
              <View style={s.inputRow}>
                <Icon name="globe-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  value={serverUrl} onChangeText={setUrl}
                  placeholder="http://192.168.1.100:3000"
                  placeholderTextColor={colors.textMuted} style={s.input}
                  autoCapitalize="none" autoCorrect={false} keyboardType="url"
                  returnKeyType="go" onSubmitEditing={handleConnect}
                />
              </View>
              <Text style={s.hint}>
                Your OCTO VEC dashboard URL. Use your PC's local IP if on the same WiFi.
              </Text>
              <TouchableOpacity style={s.btn} onPress={handleConnect} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.bgPrimary} size="small" /> : (
                  <><Text style={s.btnText}>Connect</Text><Icon name="arrow-forward" size={18} color="#fff" /></>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.backBtn} onPress={() => { setMode("choose"); setStep("server"); }}>
                <Icon name="arrow-back" size={16} color={colors.textMuted} />
                <Text style={s.backBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.formWrap}>
              <View style={s.serverBadge}>
                <Icon name="checkmark-circle" size={14} color={colors.green} />
                <Text style={s.serverBadgeText}>{serverUrl}</Text>
                <TouchableOpacity onPress={() => setStep("server")}>
                  <Icon name="pencil" size={12} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={s.label}>Dashboard Key</Text>
              <View style={s.inputRow}>
                <Icon name="key-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  value={apiKey} onChangeText={setApiKey}
                  placeholder="Enter your dashboard key"
                  placeholderTextColor={colors.textMuted} style={s.input}
                  autoCapitalize="none" autoCorrect={false}
                  secureTextEntry={!showKey} returnKeyType="go" onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowKey(!showKey)} style={{ padding: 6 }}>
                  <Icon name={showKey ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>The same key you use to log into the dashboard.</Text>
              <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.bgPrimary} size="small" /> : (
                  <><Text style={s.btnText}>Sign In</Text><Icon name="log-in-outline" size={18} color="#fff" /></>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.backBtn} onPress={() => { setMode("choose"); setStep("server"); }}>
                <Icon name="arrow-back" size={16} color={colors.textMuted} />
                <Text style={s.backBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Relay mode ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={s.inner} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <View style={[s.logoCircle, { borderColor: colors.green }]}>
              <Icon name="globe-outline" size={36} color={colors.green} />
            </View>
            <Text style={s.title}>Remote Access</Text>
            <Text style={s.subtitle}>Connect via your secure relay server</Text>
          </View>

          <View style={s.formWrap}>
            <Text style={s.label}>Relay Server URL</Text>
            <View style={s.inputRow}>
              <Icon name="server-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                value={relayUrl} onChangeText={setRelayUrl}
                placeholder="http://your-vps-ip:8080"
                placeholderTextColor={colors.textMuted} style={s.input}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
              />
            </View>

            <Text style={s.label}>Relay Secret</Text>
            <View style={s.inputRow}>
              <Icon name="lock-closed-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                value={relaySecret} onChangeText={setRelaySecret}
                placeholder="Your relay secret"
                placeholderTextColor={colors.textMuted} style={s.input}
                autoCapitalize="none" autoCorrect={false}
                secureTextEntry={!showSecret}
              />
              <TouchableOpacity onPress={() => setShowSecret(!showSecret)} style={{ padding: 6 }}>
                <Icon name={showSecret ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Session ID</Text>
            <View style={s.inputRow}>
              <Icon name="finger-print-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                value={relaySession} onChangeText={setRelaySession}
                placeholder="default"
                placeholderTextColor={colors.textMuted} style={s.input}
                autoCapitalize="none" autoCorrect={false}
              />
            </View>

            <Text style={s.hint}>
              Set VEC_RELAY_URL and VEC_RELAY_SECRET in your .env file on your PC, then restart OCTO VEC.
            </Text>

            <TouchableOpacity style={[s.btn, { backgroundColor: colors.green }]} onPress={handleRelayLogin} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.bgPrimary} size="small" /> : (
                <><Text style={s.btnText}>Connect</Text><Icon name="link-outline" size={18} color={colors.bgPrimary} /></>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.backBtn} onPress={() => setMode("choose")}>
              <Icon name="arrow-back" size={16} color={colors.textMuted} />
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
