import React, { useEffect, useState } from "react";
import { StatusBar, View, ActivityIndicator } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./lib/theme";
import { isLoggedIn, hydrateAuth } from "./lib/api";
import { setupNotifications, startBackgroundSync } from "./lib/notifications";
import Icon from "react-native-vector-icons/Ionicons";

import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import ChatListScreen from "./screens/ChatListScreen";
import ChatScreen from "./screens/ChatScreen";
import TasksScreen from "./screens/TasksScreen";
import AgentsScreen from "./screens/AgentsScreen";
import LiveScreen from "./screens/LiveScreen";
import ScanScreen from "./screens/ScanScreen";

// ── Types ───────────────────────────────────────────────────────────────────
export type RootStackParams = {
  Login: undefined;
  Scan: undefined;
  Main: undefined;
  Chat: { agentKey: string; agentName: string; agentColor?: string; agentInitials?: string; agentRole?: string };
};

export type TabParams = {
  Home: undefined;
  Chats: undefined;
  Tasks: undefined;
  Agents: undefined;
  Live: undefined;
};

// ── Tab Navigator ───────────────────────────────────────────────────────────
const Tab = createBottomTabNavigator<TabParams>();

function MainTabs() {
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
            Agents: focused ? "people" : "people-outline",
            Live: focused ? "pulse" : "pulse-outline",
          };
          return <Icon name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Chats" component={ChatListScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Agents" component={AgentsScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
    </Tab.Navigator>
  );
}

// ── Stack Navigator ─────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator<RootStackParams>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgPrimary,
    card: colors.bgSecondary,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.accent,
  },
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setupNotifications();
    hydrateAuth().then(() =>
      isLoggedIn().then(v => {
        setAuthed(v);
        setReady(true);
        if (v) startBackgroundSync();
      })
    );
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.textPrimary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName={authed ? "Main" : "Login"}
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
