import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "@/lib/theme";

type Shortcut = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

// The places people otherwise only find in Profile's settings list. Shopping has its own crew tip
// and getting-started step; Badges stays in Profile.
export const SHORTCUTS: Shortcut[] = [
  { label: "Explore", icon: "compass-outline", href: "/explore" },
  { label: "Calendar", icon: "calendar-outline", href: "/calendar" },
  { label: "Meal plan", icon: "restaurant-outline", href: "/meal-plan" },
  { label: "Insights", icon: "stats-chart-outline", href: "/insights" },
  { label: "Kitchen Lab", icon: "flask-outline", href: "/kitchen-lab" },
];

// The same size as the notification rows' icons (notification-row.tsx): 36pt with a 17pt icon.
const SIZE = 36;

/** A row of round icon buttons under the fridge banner, sized like the notification icons, each labelled underneath. */
export function Shortcuts() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      {SHORTCUTS.map((s) => (
        <Pressable
          key={s.label}
          onPress={() => router.push(s.href)}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          // Fixed-width columns so the labels never run into each other.
          // A plain style object: NativeWind drops Pressable's style-function form.
          style={{ width: 64, minHeight: 48, alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.hairline,
            }}
          >
            <Ionicons name={s.icon} size={17} color={colors.ink} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
