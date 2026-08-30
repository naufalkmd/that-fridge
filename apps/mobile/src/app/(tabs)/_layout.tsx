import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { FloatingTabBar } from "@/components/tab-bar";

export default function TabsLayout() {
  const { status } = useAuth();

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
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#0a0a0c" },
        // Keep tab switches responsive: don't re-render backgrounded tabs, and use a
        // light native shift transition instead of a hard cut.
        freezeOnBlur: true,
        animation: "shift",
      }}
    >
      {/* Order here drives FloatingTabBar: home · inventory · [＋] · chat · eat */}
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventory" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="eat" options={{ title: "Crew" }} />
    </Tabs>
  );
}
