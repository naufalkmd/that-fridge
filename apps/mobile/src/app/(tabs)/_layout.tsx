import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { useOnboarding } from "@/lib/onboarding";
import { FloatingTabBar } from "@/components/tab-bar";
import { CoachSpotlight } from "@/components/home/CoachSpotlight";

export default function TabsLayout() {
  const { status } = useAuth();
  const onboarding = useOnboarding();

  if (status === "loading" || (status === "signedIn" && !onboarding.ready)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  if (!onboarding.seen) return <Redirect href="/onboarding" />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "#0a0a0c" },
          // Snappy tab switches: instant swap (no transition to jank while a heavy screen
          // mounts) + don't re-render backgrounded tabs.
          freezeOnBlur: true,
          animation: "none",
        }}
      >
        {/* Order here drives FloatingTabBar: home · inventory · [＋] · chat · eat */}
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="inventory" options={{ title: "Inventory" }} />
        <Tabs.Screen name="chat" options={{ title: "Chat" }} />
        <Tabs.Screen name="eat" options={{ title: "Crew" }} />
      </Tabs>

      {/* first-run spotlight on the + button, until the user adds an item */}
      <CoachSpotlight />
    </View>
  );
}
