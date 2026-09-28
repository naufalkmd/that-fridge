import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, G } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { PixelText } from "@/components/brand";
import { scoreBand } from "@/lib/insights";
import { useTheme, type ThemeColors } from "@/lib/theme";

// One arc per crew member, in CrewDock's room order (identity, not data).
const ARC_COLORS: (keyof ThemeColors)[] = ["agentGuardian", "agentChef", "agentOrganizer", "agentShopkeeper"];

const SIZE = 26;
const R = 10.5;
const C = 2 * Math.PI * R;
const SEG = C / 4 - 2.5;

/**
 * The kitchen score beside "Your Crew": a small crew-coloured ring with the number, a word for it
 * and the streak. Opens Insights, where the per-crew breakdown lives.
 */
export function KitchenScorePill({ score, streak = 0 }: { score: number | null; streak?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const band = scoreBand(score);
  const bandColor = band.tone === "none" ? colors.muted : colors[band.tone];

  return (
    <Pressable
      onPress={() => router.push("/insights")}
      accessibilityRole="button"
      accessibilityLabel={`Kitchen score ${score ?? "not ready yet"}, open Insights`}
      hitSlop={6}
      // A plain style object: NativeWind drops Pressable's style-function form.
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 32,
        paddingLeft: 3,
        paddingRight: 10,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: "absolute" }}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors.hairlineStrong} strokeWidth={2.5} opacity={0.4} />
          {score !== null &&
            ARC_COLORS.map((c, i) => (
              <G key={c} rotation={-90 + i * 90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors[c]} strokeWidth={2.5} strokeDasharray={`${SEG}, ${C - SEG}`} />
              </G>
            ))}
        </Svg>
        <PixelText style={{ fontSize: 9, color: colors.ink }}>{score ?? "–"}</PixelText>
      </View>
      <Text style={{ fontSize: 12, fontWeight: "700", color: bandColor }}>{score === null ? "Building" : band.label}</Text>
      {streak > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <MaterialCommunityIcons name="fire" size={12} color={colors.accent} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent }}>{streak}</Text>
        </View>
      )}
    </Pressable>
  );
}
