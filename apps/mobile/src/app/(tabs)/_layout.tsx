import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";

export default function TabsLayout() {
  const { status } = useAuth();
  const { unread } = useNotifications();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }
  if (status === "signedOut") return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a0c" },
        headerTintColor: "#eaeaec",
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: "#0a0a0c" },
        tabBarStyle: {
          backgroundColor: "#0a0a0c",
          borderTopColor: "rgba(255,255,255,0.09)",
        },
        tabBarActiveTintColor: "#26c6da",
        tabBarInactiveTintColor: "rgba(234,234,236,0.34)",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="file-tray-stacked" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="eat"
        options={{
          title: "Eat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: "#c1452e", color: "#fff", fontSize: 10 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
