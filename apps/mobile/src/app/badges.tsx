import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { BADGE_CATALOG, type BadgeKey, type BadgeProgress } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { PageHeader, SkeletonList } from "@/components/ui";

export default function Badges() {
  const {
    accent: ACCENT,
    surface: SURFACE,
    hairline: HAIRLINE,
    hairlineStrong: STRONG,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    blue: BLUE,
    good: GOOD,
    warn: WARN,
  } = useTheme().colors;
  const STYLE: Record<BadgeKey, { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }> = {
    rescued_10: { icon: "lifebuoy", color: BLUE },
    first_link_recipe: { icon: "link-variant", color: "#7a5cb0" },
    full_week_variety: { icon: "food-apple-outline", color: GOOD },
    zero_waste_week: { icon: "star-outline", color: WARN },
  };
  const [badges, setBadges] = useState<BadgeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getBadges()
      .then(setBadges)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Badges" subtitle="One-time unlocks for real anti-waste habits" />
      {loading ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
          <SkeletonList rows={5} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60, gap: 10 }}>
          {BADGE_CATALOG.map((badge) => {
            const p = badges.find((b) => b.badgeKey === badge.key);
            const earned = !!p?.earnedAt;
            const progress = Math.min(p?.progress ?? 0, badge.target);
            const s = STYLE[badge.key];
            return (
              <View
                key={badge.key}
                style={{
                  flexDirection: "row",
                  gap: 14,
                  padding: 14,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: earned ? s.color : HAIRLINE,
                  backgroundColor: SURFACE,
                  opacity: earned ? 1 : 0.75,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: earned ? `${s.color}1a` : "rgba(255,255,255,0.05)",
                  }}
                >
                  <MaterialCommunityIcons name={s.icon} size={20} color={earned ? s.color : FAINT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: earned ? INK : MUTED, marginBottom: 2 }}>
                    {badge.label}
                  </Text>
                  <Text style={{ fontSize: 11.5, lineHeight: 16, color: FAINT }}>{badge.description}</Text>
                  {badge.target > 1 && !earned && (
                    <View style={{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: STRONG, overflow: "hidden" }}>
                      <View style={{ height: "100%", borderRadius: 2, width: `${(progress / badge.target) * 100}%`, backgroundColor: s.color }} />
                    </View>
                  )}
                  {earned && (
                    <Text style={{ marginTop: 6, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: s.color }}>
                      UNLOCKED
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
