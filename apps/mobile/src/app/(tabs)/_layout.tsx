import { useCallback, useMemo } from "react";
import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth";
import { useOnboarding } from "@/lib/onboarding";
import { FloatingTabBar } from "@/components/tab-bar";
import { CoachSpotlight } from "@/components/home/CoachSpotlight";

// Same order the FloatingTabBar renders in (the [＋] FAB sits between inventory and chat but
// isn't a swipe target). A left→right swipe goes to the previous tab, right→left to the next.
const SWIPE_ROUTES = ["/home", "/inventory", "/chat", "/eat"] as const;
type SwipeRoute = (typeof SWIPE_ROUTES)[number];

export default function TabsLayout() {
  const { status } = useAuth();
  const onboarding = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();

  const go = useCallback(
    (route: SwipeRoute) => {
      void Haptics.selectionAsync();
      router.navigate(route);
    },
    [router],
  );

  const swipe = useMemo(() => {
    const current = "/" + (pathname.split("/").pop() || "home").toLowerCase();
    const index = SWIPE_ROUTES.indexOf(current as SwipeRoute);

    return Gesture.Pan()
      // Only take over on a clearly horizontal drag; vertical scrolling always wins, and the
      // threshold is high enough that a flick on an inner horizontal chip row still scrolls it.
      .activeOffsetX([-30, 30])
      .failOffsetY([-16, 16])
      .onEnd((e) => {
        "worklet";
        if (index < 0) return;
        const far = Math.abs(e.translationX) >= 80;
        const fast = Math.abs(e.velocityX) >= 300;
        if (!far || !fast) return;
        const dir = e.translationX < 0 ? 1 : -1;
        const target = SWIPE_ROUTES[index + dir];
        if (target) runOnJS(go)(target);
      });
  }, [pathname, go]);

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
      <GestureDetector gesture={swipe}>
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
        </View>
      </GestureDetector>

      {/* first-run spotlight — remounts on "Replay intro" so the nav tour re-arms */}
      <CoachSpotlight key={onboarding.coachReplayNonce} />
    </View>
  );
}
