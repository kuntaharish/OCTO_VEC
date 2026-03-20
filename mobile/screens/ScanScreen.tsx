import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, PermissionsAndroid, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParams } from "../App";
import { colors } from "../lib/theme";
import { login, loginRelay } from "../lib/api";
import { startBackgroundSync } from "../lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";
// Import Android camera directly, bypassing React.lazy wrapper
import Camera from "react-native-camera-kit/src/Camera.android";

type Props = {
  navigation: NativeStackNavigationProp<RootStackParams, "Scan">;
  route: RouteProp<RootStackParams, "Scan">;
};

export default function ScanScreen({ navigation }: Props) {
  const [processing, setProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "OCTO VEC needs camera access to scan QR codes",
            buttonPositive: "OK",
          },
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasPermission(true);
      }
    })();
  }, []);

  async function handleScan(event: any) {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);
    let step = "init";

    try {
      step = "read event";
      const codeValue = event?.nativeEvent?.codeStringValue ?? event?.nativeEvent?.codeValue ?? "";
      let raw = String(codeValue).trim().replace(/^\uFEFF/, "");
      raw = raw.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

      if (!raw) {
        Alert.alert("Empty Scan", `Event keys: ${JSON.stringify(Object.keys(event?.nativeEvent || {}))}`);
        setScanned(false);
        setProcessing(false);
        return;
      }

      step = "parse JSON";
      const data = JSON.parse(raw);

      step = "check fields";
      const url = data.url || "";
      const key = data.key || "";
      const mode = data.mode || "";

      if (mode === "relay" && data.relay && data.secret) {
        step = "relay login";
        const result = await loginRelay(data.relay, data.secret, data.session || "default");
        if (result.ok) {
          startBackgroundSync();
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert("Connection Failed", result.error ?? "Could not connect to relay");
          setScanned(false);
        }
      } else if (url && key) {
        step = "direct login";
        const result = await login(url, key);
        step = "login done";
        if (result.ok) {
          startBackgroundSync();
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert("Login Failed", result.error ?? "Invalid credentials");
          setScanned(false);
        }
      } else if (url && !key) {
        Alert.alert("Missing Key", "QR has no key. Regenerate from Settings → Mobile.");
        setScanned(false);
      } else {
        Alert.alert("Invalid QR", `Missing url/key.\n\nParsed: ${JSON.stringify(data).substring(0, 150)}`);
        setScanned(false);
      }
    } catch (e: any) {
      Alert.alert("Error at: " + step, `${e.message}\n\nStack: ${(e.stack || "").substring(0, 200)}`);
      setScanned(false);
    }
    setProcessing(false);
  }

  return (
    <View style={s.container}>
      {hasPermission ? (
        <Camera
          scanBarcode={true}
          onReadCode={handleScan}
          showFrame={true}
          laserColor="rgba(255,255,255,0.4)"
          frameColor="rgba(255,255,255,0.6)"
          scanThrottleDelay={500}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#fff", marginTop: 12, fontSize: 14 }}>Requesting camera access...</Text>
        </View>
      )}

      {/* Overlay */}
      <SafeAreaView style={s.overlay} edges={["top"]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Scan QR Code</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {/* Bottom hint */}
      <View style={s.bottom}>
        <View style={s.hintCard}>
          {processing ? (
            <View style={s.hintRow}>
              <ActivityIndicator color={colors.textPrimary} size="small" />
              <Text style={s.hintText}>Connecting...</Text>
            </View>
          ) : (
            <>
              <Icon name="qr-code-outline" size={20} color={colors.textMuted} />
              <Text style={s.hintText}>
                Open OCTO VEC dashboard → Settings → Mobile Connect
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#fff" },
  bottom: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 40,
  },
  hintCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hintText: { fontSize: 13, color: "rgba(255,255,255,0.7)", flex: 1, lineHeight: 18 },
});
