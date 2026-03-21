import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { StatusBar, View, ActivityIndicator } from "react-native";
import { NavigationContainer, DarkTheme, DefaultTheme, useNavigation, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import notifee, { EventType } from "@notifee/react-native";
import { ThemeProvider, useTheme, spacing } from "./lib/theme";
import { isLoggedIn, hydrateAuth, getApi, onDeviceUnlinked } from "./lib/api";
import { setupNotifications, startBackgroundSync } from "./lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";

import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ChatListScreen from "./screens/ChatListScreen";
import ChatScreen from "./screens/ChatScreen";
import TasksScreen from "./screens/TasksScreen";
import FinanceScreen from "./screens/FinanceScreen";
import LiveScreen from "./screens/LiveScreen";
import ScanScreen from "./screens/ScanScreen";
import SettingsScreen from "./screens/SettingsScreen";

// ── Types ───────────────────────────────────────────────────────────────────
export type RootStackParams = {
  Login: undefined;
  Scan: undefined;
  Main: undefined;
  Settings: undefined;
  Chat: { agentKey: string; agentName: string; agentColor?: string; agentInitials?: string; agentRole?: string };
};

export type TabParams = {
  Home: undefined;
  Chats: undefined;
  Tasks: undefined;
  Finance: undefined;
  Live: undefined;
};

// ── Tab Navigator ───────────────────────────────────────────────────────────
const Tab = createBottomTabNavigator<TabParams>();

function MainTabs() {
  const { colors } = useTheme();
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadApprovals() {
      try {
        const data = await getApi<any[]>("/api/m/approvals");
        if (active) setApprovalCount(data.length);
      } catch {}
    }
    loadApprovals();
    const poll = setInterval(loadApprovals, 3000);
    return () => { active = false; clearInterval(poll); };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            Home: focused ? "grid" : "grid-outline",
            Chats: focused ? "chatbubbles" : "chatbubbles-outline",
            Tasks: focused ? "checkbox" : "checkbox-outline",
            Finance: focused ? "wallet" : "wallet-outline",
            Live: focused ? "pulse" : "pulse-outline",
          };
          return <Icon name={icons[route.name]} size={22} color={color} />;
        },
        tabBarBadge: route.name === "Live" && approvalCount > 0 ? approvalCount : undefined,
        tabBarBadgeStyle: route.name === "Live" ? {
          backgroundColor: colors.orange,
          color: "#fff",
          fontSize: 10,
          fontWeight: "700",
          minWidth: 18,
          height: 18,
          lineHeight: 18,
          borderRadius: 9,
        } : undefined,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Chats" component={ChatListScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
    </Tab.Navigator>
  );
}

// ── Stack Navigator ─────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator<RootStackParams>();

// Global nav ref so notification handler can navigate
const navigationRef = React.createRef<NavigationContainerRef<RootStackParams>>();
let _pendingNavAction: Record<string, any> | null = null;

function doNavigate(data: Record<string, any>) {
  const nav = navigationRef.current;
  if (!nav) return;

  switch (data.action) {
    case "chat":
      if (data.agentKey) {
        nav.navigate("Chat" as any, {
          agentKey: data.agentKey,
          agentName: data.agentName || data.agentKey,
          agentInitials: data.agentInitials || "",
          agentRole: data.agentRole || "",
        });
      } else {
        nav.navigate("Main" as any, { screen: "Chats" } as any);
      }
      break;
    case "live":
      nav.navigate("Main" as any, { screen: "Live" } as any);
      break;
    case "tasks":
      nav.navigate("Main" as any, { screen: "Tasks" } as any);
      break;
  }
}

function handleNotificationPress(data: Record<string, any> | undefined) {
  if (!data?.action) return;

  if (navigationRef.current?.isReady()) {
    doNavigate(data);
  } else {
    // Nav not ready yet (app resuming) — queue it
    _pendingNavAction = data;
  }
}

function AppInner() {
  const { colors, mode } = useTheme();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const isDark = mode === "dark" || mode === "midnight";
  const navTheme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.bgPrimary,
      card: colors.bgSecondary,
      border: colors.border,
      text: colors.textPrimary,
      primary: colors.accent,
    },
  }), [colors, isDark]);

  useEffect(() => {
    setupNotifications();

    // Auto-logout when device is unlinked from dashboard
    onDeviceUnlinked(() => {
      setAuthed(false);
      if (navigationRef.current?.isReady()) {
        navigationRef.current.resetRoot({ index: 0, routes: [{ name: "Login" }] });
      }
    });

    hydrateAuth().then(() =>
      isLoggedIn().then(v => {
        setAuthed(v);
        setReady(true);
        if (v) startBackgroundSync();
      })
    );

    // Handle notification taps (foreground + resuming from background)
    const unsubForeground = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification?.data) {
        handleNotificationPress(detail.notification.data);
      }
    });

    // Check if app was opened from a notification (cold start)
    notifee.getInitialNotification().then(initial => {
      if (initial?.notification?.data) {
        handleNotificationPress(initial.notification.data);
      }
    });

    // Check for pending nav from background event handler
    const bgCheck = setInterval(() => {
      const pending = (global as any).__pendingNotifNav;
      if (pending && navigationRef.current?.isReady()) {
        (global as any).__pendingNotifNav = null;
        doNavigate(pending);
      }
    }, 500);
    // Stop checking after 5s — if it hasn't fired by then, discard
    setTimeout(() => clearInterval(bgCheck), 5000);

    return () => { unsubForeground(); clearInterval(bgCheck); };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.textPrimary} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.bgPrimary}
      />
      <NavigationContainer ref={navigationRef} theme={navTheme} onReady={() => {
        // Check queued actions from foreground handler
        const pending = _pendingNavAction || (global as any).__pendingNotifNav;
        _pendingNavAction = null;
        (global as any).__pendingNotifNav = null;
        if (pending) {
          setTimeout(() => doNavigate(pending), 300);
        }
      }}>
        <Stack.Navigator
          initialRouteName={authed ? "Main" : "Login"}
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
