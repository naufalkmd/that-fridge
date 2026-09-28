import { useEffect, useRef, useState } from "react";
import { Animated as RNAnimated, Easing, LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { KitchenScorePill } from "@/components/home/KitchenScore";
import { useTheme, type ThemeColors } from "@/lib/theme";

const STRIP = require("../../../assets/images/thatfridge/crew-strip.webp");
const GIFS = {
  chef: require("../../../assets/images/thatfridge/chef.gif"),
  guardian: require("../../../assets/images/thatfridge/guardian.gif"),
  organizer: require("../../../assets/images/thatfridge/organizer.gif"),
  shopkeeper: require("../../../assets/images/thatfridge/shopkeeper.gif"),
} as const;

/** crew-strip.webp is 1527×330. */
const STRIP_RATIO = 1527 / 330;
/** Collapsed, only the bottom of the rooms shows: the floor with the crew standing on it. */
const COLLAPSED_FRACTION = 0.74;
/** Where the floor is, as a fraction of the strip's height from the top. */
const FLOOR = 0.87;
const SPRITE = 0.56; // sprite size, fraction of the strip's height

type CrewId = keyof typeof GIFS;
type Pending = Record<"expiring" | "lowStock" | "recipe", number>;

type Room = {
  id: CrewId;
  name: string;
  /** The whole room on the strip (what a tap on it covers), fractions of its width. */
  room: [number, number];
  /** The part of it the crew member walks, fractions of the strip's width. */
  from: number;
  to: number;
  color: keyof ThemeColors;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: Href;
  label: (pending: Pending) => string | null;
};

const count = (n: number, text: string) => (n > 0 ? `${n} ${text}` : null);

// Left to right as drawn: kitchen, clinic, stock room, shop.
export const ROOMS: Room[] = [
  { id: "chef", name: "Chef", room: [0, 0.28], from: 0.06, to: 0.22, color: "agentChef", icon: "chef-hat", route: "/eat?tab=recipes", label: (p) => count(p.recipe, "meals") },
  { id: "guardian", name: "Guardian", room: [0.28, 0.5], from: 0.31, to: 0.46, color: "agentGuardian", icon: "alert-outline", route: "/eat?tab=guardian", label: (p) => count(p.expiring, "expiring") },
  // The Organizer has no count of its own yet: it stands in its room without a pill.
  { id: "organizer", name: "Organizer", room: [0.5, 0.73], from: 0.53, to: 0.69, color: "agentOrganizer", icon: "package-variant", route: "/eat?tab=organizer", label: () => null },
  { id: "shopkeeper", name: "Shopkeeper", room: [0.73, 1], from: 0.76, to: 0.93, color: "agentShopkeeper", icon: "cart-outline", route: "/eat?tab=shopping", label: (p) => count(p.lowStock, "low") },
];

/** One crew member pacing back and forth inside their own room. */
function Walker({ room, width, height }: { room: Room; width: number; height: number }) {
  const size = height * SPRITE;
  const min = room.from * width;
  const max = room.to * width - size;
  const x = useRef(new RNAnimated.Value(min + Math.random() * Math.max(0, max - min))).current;
  const [facing, setFacing] = useState<1 | -1>(1);

  useEffect(() => {
    if (max <= min) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let at = min;
    const step = () => {
      if (cancelled) return;
      const to = min + Math.random() * (max - min);
      setFacing(to < at ? -1 : 1);
      const duration = Math.max(900, (Math.abs(to - at) / width) * 14000);
      at = to;
      RNAnimated.timing(x, { toValue: to, duration, easing: Easing.linear, useNativeDriver: true }).start(() => {
        if (!cancelled) timer = setTimeout(step, 800 + Math.random() * 2400);
      });
    };
    timer = setTimeout(step, Math.random() * 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      x.stopAnimation();
    };
  }, [min, max, width, x]);

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, top: height * FLOOR - size, width: size, height: size, transform: [{ translateX: x }, { scaleX: facing }] }}
    >
      <Image source={GIFS[room.id]} style={{ flex: 1 }} contentFit="contain" />
    </RNAnimated.View>
  );
}

/**
 * Home's crew: the four rooms floating above the tab bar with each crew member in theirs and a
 * pill for whatever they're flagging. Open at the top of Home; scrolled down it collapses to the
 * floor of the rooms with a count badge per busy room. Every room opens its crew member's page.
 */
export function CrewDock({
  pending,
  score,
  streak,
  collapsed,
  bottom,
}: {
  pending: Pending;
  score: number | null;
  streak: number;
  collapsed: boolean;
  /** Distance from the bottom of the screen to just above the tab bar. */
  bottom: number;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = width / STRIP_RATIO;
  const shut = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    shut.value = withTiming(collapsed ? 1 : 0, { duration: 220 });
  }, [collapsed, shut]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: 1 - shut.value,
    height: interpolate(shut.value, [0, 1], [34, 0]),
    marginBottom: interpolate(shut.value, [0, 1], [26, 6]),
  }));
  const stripStyle = useAnimatedStyle(() => ({
    height: interpolate(shut.value, [0, 1], [height, height * COLLAPSED_FRACTION]),
  }));
  // The rooms slide up inside the frame so the floor stays put when it shrinks.
  const roomsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(shut.value, [0, 1], [0, -height * (1 - COLLAPSED_FRACTION)]) }],
  }));
  const pillsStyle = useAnimatedStyle(() => ({ opacity: 1 - shut.value }));
  const badgesStyle = useAnimatedStyle(() => ({ opacity: shut.value }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: bottom,
        paddingHorizontal: 8,
        paddingTop: 6,
        backgroundColor: colors.canvas,
        shadowColor: colors.canvas,
        shadowOffset: { width: 0, height: -14 },
        shadowOpacity: 1,
        shadowRadius: 14,
      }}
    >
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, overflow: "hidden" }, titleStyle]}>
        <Pressable
          onPress={() => router.navigate("/eat")}
          accessibilityRole="button"
          accessibilityLabel="Your crew"
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Text style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>Your Crew</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.ink} />
        </Pressable>
        <KitchenScorePill score={score} streak={streak} />
      </Animated.View>

      <View testID="crew-strip" onLayout={onLayout}>
        {width > 0 && (
          <Animated.View style={[{ overflow: "hidden", borderRadius: 10 }, stripStyle]}>
            <Animated.View style={[{ width, height }, roomsStyle]}>
              <Image source={STRIP} style={{ width, height }} contentFit="fill" accessibilityIgnoresInvertColors />
              {ROOMS.map((room) => (
                <Walker key={room.id} room={room} width={width} height={height} />
              ))}
            </Animated.View>
            {/* Each room is a button to that crew member's page, open or collapsed. */}
            {ROOMS.map((room) => (
              <Pressable
                key={room.id}
                onPress={() => router.navigate(room.route)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${room.name}`}
                style={{ position: "absolute", top: 0, bottom: 0, left: room.room[0] * width, width: (room.room[1] - room.room[0]) * width }}
              />
            ))}
            <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 4, left: 0, right: 0 }, badgesStyle]}>
              {ROOMS.map((room) => {
                const n = room.id === "chef" ? pending.recipe : room.id === "guardian" ? pending.expiring : room.id === "shopkeeper" ? pending.lowStock : 0;
                if (n <= 0) return null;
                return (
                  <View
                    key={room.id}
                    style={{
                      position: "absolute",
                      left: room.to * width - 12,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 5,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors[room.color],
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: colors.canvas }}>{n}</Text>
                  </View>
                );
              })}
            </Animated.View>
          </Animated.View>
        )}

        {/* The pills sit half over the top edge of the rooms, one above each busy crew member. */}
        {width > 0 && (
          <Animated.View pointerEvents={collapsed ? "none" : "box-none"} style={[{ position: "absolute", top: -17, left: 0, right: 0, height: 32 }, pillsStyle]}>
            {ROOMS.map((room) => {
              const text = room.label(pending);
              if (!text) return null;
              const center = ((room.from + room.to) / 2) * width;
              return (
                <View key={room.id} style={{ position: "absolute", left: center - 60, width: 120, alignItems: "center" }}>
                  <Pressable
                    onPress={() => router.navigate(room.route)}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      height: 30,
                      paddingLeft: 8,
                      paddingRight: 10,
                      borderRadius: 15,
                      borderWidth: 1.5,
                      borderColor: colors[room.color],
                      backgroundColor: `${colors.canvas}eb`,
                    }}
                  >
                    <MaterialCommunityIcons name={room.icon} size={14} color={colors[room.color]} />
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", color: colors.ink }}>
                      {text}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </Animated.View>
        )}
      </View>
    </View>
  );
}
