import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "@/lib/theme";

type Shortcut = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  tint: "accent" | "blue" | "warn" | "good" | "agentOrganizer";
};

// The places people otherwise only find in Profile's settings list. Five fit a phone's width
// without scrolling. Shopping has its own crew tip and getting-started step; Badges stays in Profile.
export const SHORTCUTS: Shortcut[] = [
  { label: "Explore", icon: "compass-outline", href: "/explore", tint: "accent" },
  { label: "Calendar", icon: "calendar-outline", href: "/calendar", tint: "blue" },
  { label: "Meal plan", icon: "restaurant-outline", href: "/meal-plan", tint: "warn" },
  { label: "Insights", icon: "stats-chart-outline", href: "/insights", tint: "good" },
  { label: "Kitchen Lab", icon: "flask-outline", href: "/kitchen-lab", tint: "agentOrganizer" },
];

/** One row of labelled shortcut icons under the fridge banner. */
export function Shortcuts() {
  const router = useRouter();
  const colors = useTheme().colors;

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      {SHORTCUTS.map((s) => (
        <Pressable
          key={s.label}
          onPress={() => router.push(s.href)}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <View
            style={{
              height: 48,
              width: 48,
              borderRadius: 16,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${colors[s.tint]}1f`,
            }}
          >
            <Ionicons name={s.icon} size={22} color={colors[s.tint]} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: colors.ink }}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
