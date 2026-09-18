import { type ComponentProps, memo, useCallback, useRef } from "react";
import { Pressable, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useOnboarding } from "@/lib/onboarding";
import { useTheme } from "@/lib/theme";
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Generous touch area so a near-miss on the icon still registers — the pill itself is small,
// and the gaps between pills otherwise belong to nothing.
const TAB_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;

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
  const { setCoachRect } = useOnboarding();
  const { colors } = useTheme();
  const ref = useRef<View>(null);

  // Publish this pill's screen rect so the onboarding spotlight can point at it.
  const reportRect = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width && height) setCoachRect(name, { x, y, width, height });
      });
    });
  }, [name, setCoachRect]);

  const progress = useDerivedValue(
    () => withTiming(active ? 1 : 0, { duration: 200 }),
    [active],
  );

  const surface2 = colors.surface2;
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(26,26,31,0)", surface2],
    ),
  }));

  return (
    <AnimatedPressable
      ref={ref}
      layout={PILL}
      onPress={onPress}
      onLayout={reportRect}
      hitSlop={TAB_HIT_SLOP}
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 20, paddingVertical: 11 },
        { paddingHorizontal: active ? 14 : 12 },
        pillStyle,
      ]}
    >
      <Ionicons
        name={active ? meta.activeIcon : meta.icon}
        size={16}
        color={active ? colors.accent : colors.faint}
      />
      {active && (
        <Animated.Text
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(110)}
          numberOfLines={1}
          style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: colors.ink }}
        >
          {meta.label}
        </Animated.Text>
      )}
    </AnimatedPressable>
  );
});

function AddFab() {
  const router = useRouter();
  const { setCoachRect } = useOnboarding();
  const { colors } = useTheme();
  const slotRef = useRef<View>(null);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const reportRect = useCallback(() => {
    // Deferred a frame so the floating bar has settled into place before we measure.
    requestAnimationFrame(() => {
      slotRef.current?.measureInWindow((x, y, width, height) => {
        if (width && height) setCoachRect("add", { x, y, width, height });
      });
    });
  }, [setCoachRect]);

  return (
    <View ref={slotRef} style={{ width: 58, alignItems: "center" }} onLayout={reportRect}>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: -22,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colors.accent,
            borderWidth: 4,
            borderColor: colors.surface,
          },
          style,
        ]}
      >
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
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          hitSlop={{ top: 10, bottom: 18, left: 14, right: 14 }}
        >
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function FloatingTabBarBase({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

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
    <View
      style={[
        {
          position: "absolute",
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 6,
          backgroundColor: colors.surface,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: colors.hairline,
        },
        { bottom: (insets.bottom || 10) + 6 },
      ]}
    >
      {renderTab("home")}
      {renderTab("inventory")}
      <AddFab />
      {renderTab("chat")}
      {renderTab("eat")}
    </View>
  );
}

export const FloatingTabBar = memo(FloatingTabBarBase);
