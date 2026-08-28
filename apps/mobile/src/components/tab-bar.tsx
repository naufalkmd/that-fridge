import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";

// Floating pill nav — mirrors apps/web TabBar: Home · Inventory · [＋] · Chat · Eat, with the
// active tab expanding to show its label and a raised amber add-FAB in the middle.
const META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }
> = {
  home: { label: "Home", icon: "home-outline", activeIcon: "home" },
  inventory: { label: "Inventory", icon: "file-tray-stacked-outline", activeIcon: "file-tray-stacked" },
  chat: { label: "Chat", icon: "chatbubble-outline", activeIcon: "chatbubble" },
  eat: { label: "Crew", icon: "people-outline", activeIcon: "people" },
};
const ORDER = ["home", "inventory", "chat", "eat"] as const;

export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const routeByName = Object.fromEntries(state.routes.map((r) => [r.name, r]));
  const activeName = state.routes[state.index]?.name;

  const renderTab = (name: (typeof ORDER)[number]) => {
    const route = routeByName[name];
    if (!route) return null;
    const meta = META[name];
    const active = activeName === name;

    return (
      <Pressable
        key={name}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 9,
          paddingHorizontal: active ? 14 : 9,
          borderRadius: 20,
          backgroundColor: active ? SURFACE2 : "transparent",
        }}
      >
        <Ionicons name={active ? meta.activeIcon : meta.icon} size={16} color={active ? AMBER : FAINT} />
        {active && (
          <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: INK }} numberOfLines={1}>
            {meta.label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: (insets.bottom || 10) + 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 6,
        backgroundColor: SURFACE,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: HAIRLINE,
      }}
    >
      {renderTab("home")}
      {renderTab("inventory")}

      <View style={{ width: 58, alignItems: "center" }}>
        <Pressable
          onPress={() => router.push("/add")}
          style={{
            position: "absolute",
            top: -22,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: AMBER,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 4,
            borderColor: SURFACE,
          }}
        >
          <Ionicons name="add" size={26} color="#0a0a0c" />
        </Pressable>
      </View>

      {renderTab("chat")}
      {renderTab("eat")}
    </View>
  );
}
