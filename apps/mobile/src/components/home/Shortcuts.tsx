import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "@/lib/theme";

type Shortcut = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

// The places people otherwise only find in Profile's settings list. Five fit a phone's width
// without scrolling. Shopping has its own crew tip and getting-started step; Badges stays in Profile.
export const SHORTCUTS: Shortcut[] = [
  { label: "Explore", icon: "compass-outline", href: "/explore" },
  { label: "Calendar", icon: "calendar-outline", href: "/calendar" },
  { label: "Meal plan", icon: "restaurant-outline", href: "/meal-plan" },
  { label: "Insights", icon: "stats-chart-outline", href: "/insights" },
  { label: "Kitchen Lab", icon: "flask-outline", href: "/kitchen-lab" },
];

/** One quiet card of shortcut icons under the fridge banner: plain icons, no colour, so it doesn't compete with the data. */
export function Shortcuts() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        paddingTop: 14,
        paddingBottom: 12,
        paddingHorizontal: 4,
        borderRadius: 16,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      {SHORTCUTS.map((s) => (
        <Pressable
          key={s.label}
          onPress={() => router.push(s.href)}
          accessibilityRole="button"
          accessibilityLabel={s.label}
          style={({ pressed }) => ({ flex: 1, minHeight: 48, alignItems: "center", gap: 7, opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name={s.icon} size={22} color={colors.ink} />
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
