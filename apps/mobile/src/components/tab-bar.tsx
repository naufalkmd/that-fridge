import { type ComponentProps, memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type TabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";

// All animations run on the UI thread via Reanimated, so tab switches stay smooth
// even while the destination screen is mounting.
const PILL = LinearTransition.duration(220);
const SPRING = { damping: 16, stiffness: 340, mass: 0.6 };

// Floating pill nav — mirrors apps/web TabBar: Home · Inventory · [＋] · Chat · Crew, with the
// active tab expanding to show its label and a raised amber add-FAB in the middle.
const META: Record<
  string,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }
> = {
  home: { label: "Home", icon: "home-outline", activeIcon: "home" },
  inventory: {
    label: "Inventory",
    icon: "file-tray-stacked-outline",
    activeIcon: "file-tray-stacked",
  },
  chat: { label: "Chat", icon: "chatbubble-outline", activeIcon: "chatbubble" },
  eat: { label: "Crew", icon: "people-outline", activeIcon: "people" },
};
const ORDER = ["home", "inventory", "chat", "eat"] as const;

type TabName = (typeof ORDER)[number];

const Tab = memo(function Tab({
  name,
  active,
  onPress,
}: {
  name: TabName;
  active: boolean;
  onPress: () => void;
}) {
  const meta = META[name];
  const progress = useDerivedValue(
    () => withTiming(active ? 1 : 0, { duration: 200 }),
    [active],
  );

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(26,26,31,0)", SURFACE2],
    ),
  }));

  return (
    <Animated.View
      layout={PILL}
      style={[styles.tab, { paddingHorizontal: active ? 14 : 9 }, pillStyle]}
    >
      <Pressable onPress={onPress} hitSlop={10} style={styles.tabPress}>
        <Ionicons
          name={active ? meta.activeIcon : meta.icon}
          size={16}
          color={active ? AMBER : FAINT}
        />
        {active && (
          <Animated.Text
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(110)}
            numberOfLines={1}
            style={styles.label}
          >
            {meta.label}
          </Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  );
});

function AddFab() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.fabSlot}>
      <Animated.View style={[styles.fab, style]}>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add");
          }}
          onPressIn={() => {
            scale.value = withSpring(0.9, SPRING);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, SPRING);
          }}
          style={styles.fabPress}
          hitSlop={8}
        >
          <Ionicons name="add" size={26} color="#0a0a0c" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function FloatingTabBarBase({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const routeByName = Object.fromEntries(state.routes.map((r) => [r.name, r]));
  const activeName = state.routes[state.index]?.name;

  const press = useCallback(
    (name: TabName) => {
      const route = routeByName[name];
      if (!route) return;
      const active = activeName === name;
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!active && !event.defaultPrevented) {
        void Haptics.selectionAsync();
        navigation.navigate(route.name);
      }
    },
    [routeByName, activeName, navigation],
  );

  const renderTab = (name: TabName) => {
    if (!routeByName[name]) return null;
    return (
      <Tab
        key={name}
        name={name}
        active={activeName === name}
        onPress={() => press(name)}
      />
    );
  };

  return (
    <View style={[styles.bar, { bottom: (insets.bottom || 10) + 6 }]}>
      {renderTab("home")}
      {renderTab("inventory")}
      <AddFab />
      {renderTab("chat")}
      {renderTab("eat")}
    </View>
  );
}

export const FloatingTabBar = memo(FloatingTabBarBase);

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 6,
    backgroundColor: SURFACE,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  tab: {
    borderRadius: 20,
    paddingVertical: 9,
  },
  tabPress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: INK,
  },
  fabSlot: {
    width: 58,
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    top: -22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: AMBER,
    borderWidth: 4,
    borderColor: SURFACE,
  },
  fabPress: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
