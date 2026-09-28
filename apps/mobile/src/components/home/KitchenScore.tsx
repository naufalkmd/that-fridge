import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, G } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { getOverallScore, kitchenScoreResults, type KitchenScoreInput, type KitchenScoreResult } from "@thatfridge/core";

import { PixelText } from "@/components/brand";
import { scoreBand } from "@/lib/insights";
import { useTheme, type ThemeColors } from "@/lib/theme";

// Ring order and colours match CrewScene and Insights: one arc per crew member (identity, not data).
const AGENT_COLOR: Record<KitchenScoreResult["key"], keyof ThemeColors> = {
  waste: "agentGuardian",
  balance: "agentChef",
  organizer: "agentOrganizer",
  shopkeeper: "agentShopkeeper",
};
const AGENT_ORDER: KitchenScoreResult["key"][] = ["waste", "balance", "organizer", "shopkeeper"];

const SIZE = 44;
const R = 18;
const C = 2 * Math.PI * R;
const SEG = C / 4 - 3; // a quarter, less a small gap

/**
 * Home's kitchen score: one slim row - the score, a word for it and the streak - that opens
 * Insights, where the per-crew breakdown lives.
 */
export function KitchenScore({
  input,
  streak = 0,
}: {
  input: KitchenScoreInput;
  /** Daily "opened the app" streak from CurrentUser.streak. */
  streak?: number;
}) {
  const router = useRouter();
  const { colors } = useTheme();

  const overall = useMemo(() => getOverallScore(kitchenScoreResults(input)), [input]);
  const band = scoreBand(overall);
  const bandColor = band.tone === "none" ? colors.muted : colors[band.tone];

  return (
    <Pressable
      onPress={() => router.push("/insights")}
      accessibilityRole="button"
      accessibilityLabel={`Kitchen score ${overall ?? "not ready yet"}, open Insights`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: "absolute" }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors.hairlineStrong} strokeWidth={3.5} opacity={0.4} />
          {overall !== null &&
            AGENT_ORDER.map((key, i) => (
              <G key={key} rotation={-90 + i * 90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={colors[AGENT_COLOR[key]]}
                  strokeWidth={3.5}
                  strokeDasharray={`${SEG}, ${C - SEG}`}
                />
              </G>
            ))}
        </Svg>
        <PixelText style={{ fontSize: 15, color: colors.ink }}>{overall ?? "–"}</PixelText>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }}>Kitchen score</Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: "600", color: bandColor, marginTop: 1 }}>
          {overall === null ? "Appears after a few days of use" : band.label}
        </Text>
      </View>

      {streak > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 12,
            backgroundColor: `${colors.accent}1a`,
          }}
        >
          <MaterialCommunityIcons name="fire" size={12} color={colors.accent} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.accent }}>
            {streak} day{streak === 1 ? "" : "s"}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}
