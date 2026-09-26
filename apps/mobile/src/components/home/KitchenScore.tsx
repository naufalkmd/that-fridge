import { useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  getFoodGroupCoverage,
  getOverallScore,
  getOverdueItemStats,
  getScoreTrend,
  kitchenScoreResults,
  type KitchenScoreInput,
  type KitchenScoreResult,
  type ScoreSnapshot,
} from "@thatfridge/core";

import { PixelText } from "@/components/brand";
import { useTheme, type ThemeColors } from "@/lib/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Order matches the arc segments below and CrewScene's zone order.
const AGENT_META: Record<
  KitchenScoreResult["key"],
  { name: string; colorKey: keyof ThemeColors }
> = {
  waste: { name: "Guardian", colorKey: "agentGuardian" },
  balance: { name: "Chef", colorKey: "agentChef" },
  organizer: { name: "Organizer", colorKey: "agentOrganizer" },
  shopkeeper: { name: "Shopkeeper", colorKey: "agentShopkeeper" },
};
const AGENT_ORDER: KitchenScoreResult["key"][] = [
  "waste",
  "balance",
  "organizer",
  "shopkeeper",
];

// Compact score dial — a full ring split into 4 equal agent-colour arcs (identity, not data;
// the number in the middle is the readout). r=30 in a 78×78 box.
const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R; // ~188.5
const RING_SEG = RING_C / 4 - 5; // a quarter, less a small gap between segments

function bandColor(score: number | null, colors: ThemeColors): string {
  if (score === null) return colors.faint;
  if (score >= 80) return colors.good;
  if (score >= 55) return colors.warn;
  return colors.bad;
}

/** Guardian's own tell — its score is fundamentally an overdue-items check. */
function GuardianPill({ overdue }: { overdue: number }) {
  const { colors } = useTheme();
  const clear = overdue === 0;
  const color = clear ? colors.good : colors.bad;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 8,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 20,
        backgroundColor: `${color}1a`,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <MaterialCommunityIcons
        name={clear ? "check" : "alert-outline"}
        size={10}
        color={color}
      />
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: 0.3,
          textTransform: "uppercase",
          color,
        }}
      >
        {clear ? "nothing overdue" : `${overdue} overdue`}
      </Text>
    </View>
  );
}

const FOOD_GROUP_ICON: Record<string, string> = {
  protein: "food-drumstick",
  vegetables: "carrot",
  fruit: "food-apple",
  grains: "barley",
  dairy: "cheese",
};

/** Chef's tell — the 5 food-group icons, lit when that group's been used lately. */
function ChefExtra({ input }: { input: KitchenScoreInput }) {
  const { colors } = useTheme();
  const coverage = getFoodGroupCoverage(input.usageHistory ?? []);
  if (!coverage) return null;
  return (
    <View style={{ flexDirection: "row", gap: 4, marginTop: 8 }}>
      {coverage.map((c) => (
        <View
          key={c.key}
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.used ? `${colors.good}22` : "transparent",
            borderWidth: 1,
            borderColor: c.used ? colors.good : colors.hairlineStrong,
          }}
        >
          <MaterialCommunityIcons
            name={FOOD_GROUP_ICON[c.key] as never}
            size={10}
            color={c.used ? colors.good : colors.faint}
          />
        </View>
      ))}
    </View>
  );
}

/** Organizer's tell — its score IS a ratio, so a completion ring. */
function OrganizerExtra({ input }: { input: KitchenScoreInput }) {
  const { colors } = useTheme();
  const tally = input.organizerTally;
  if (!tally || tally.itemsCheckedTotal === 0) return null;
  const ratio = tally.itemsCorrectTotal / tally.itemsCheckedTotal;
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
      }}
    >
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Circle
          cx={13}
          cy={13}
          r={r}
          fill="none"
          stroke={colors.hairlineStrong}
          strokeWidth={3}
        />
        <G rotation={-90} origin="13, 13">
          <Circle
            cx={13}
            cy={13}
            r={r}
            fill="none"
            stroke={colors.agentOrganizer}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${(c * ratio).toFixed(1)}, ${c.toFixed(1)}`}
          />
        </G>
      </Svg>
      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.faint }}>
        {tally.itemsCorrectTotal}/{tally.itemsCheckedTotal} in the right spot
      </Text>
    </View>
  );
}

/** Shopkeeper's tell — its score IS the checked/total split, so a receipt-style bar. */
function ShopkeeperExtra({ input }: { input: KitchenScoreInput }) {
  const { colors } = useTheme();
  const list = input.shoppingList ?? [];
  if (list.length === 0) return null;
  const checked = list.filter((i) => i.checked).length;
  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.hairlineStrong,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 2,
            width: `${(checked / list.length) * 100}%`,
            backgroundColor: colors.good,
          }}
        />
      </View>
      <Text
        style={{ marginTop: 4, fontSize: 10, fontWeight: "700", color: colors.faint }}
      >
        {checked}/{list.length} picked up
      </Text>
    </View>
  );
}

function AgentExtra({
  agentKey,
  input,
}: {
  agentKey: KitchenScoreResult["key"];
  input: KitchenScoreInput;
}) {
  if (agentKey === "balance") return <ChefExtra input={input} />;
  if (agentKey === "organizer") return <OrganizerExtra input={input} />;
  if (agentKey === "shopkeeper") return <ShopkeeperExtra input={input} />;
  return null;
}

/** Small L-bracket in each corner — the web card's "corner brackets" brand moment. */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const { colors } = useTheme();
  const isTop = pos[0] === "t";
  const isLeft = pos[1] === "l";
  return (
    <View
      style={{
        position: "absolute",
        width: 10,
        height: 10,
        [isTop ? "top" : "bottom"]: -1,
        [isLeft ? "left" : "right"]: -1,
        [isTop ? "borderTopWidth" : "borderBottomWidth"]: 1.5,
        [isLeft ? "borderLeftWidth" : "borderRightWidth"]: 1.5,
        borderColor: colors.accent,
      }}
    />
  );
}

export function KitchenScore({
  input,
  snapshots = [],
  streak = 0,
  defaultExpanded = false,
}: {
  input: KitchenScoreInput;
  snapshots?: ScoreSnapshot[];
  /** Daily "opened the app" streak from CurrentUser.streak, not derived from snapshots. */
  streak?: number;
  /** Open with the four agent cards already showing (the Crew score screen). */
  defaultExpanded?: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const ordered = useMemo(() => {
    const r = kitchenScoreResults(input);
    const byKey = Object.fromEntries(r.map((x) => [x.key, x])) as Record<
      KitchenScoreResult["key"],
      KitchenScoreResult
    >;
    return AGENT_ORDER.map((k) => byKey[k]);
  }, [input]);

  const overall = getOverallScore(ordered);
  const scoredCount = ordered.filter((r) => r.score !== null).length;
  const wasteScore = ordered.find((r) => r.key === "waste")?.score ?? null;
  const wasteTrend = getScoreTrend(snapshots, "waste", wasteScore);
  const overdue = getOverdueItemStats(input.items).overdueCount;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View>
      <PixelText
        style={{
          fontSize: 14,
          letterSpacing: 0.5,
          color: colors.muted,
          marginBottom: 8,
        }}
      >
        Your Kitchen This Week
      </PixelText>

      <View
        style={{
          position: "relative",
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.hairline,
        }}
      >
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />

        <Text
          style={{
            fontSize: 9.5,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: colors.faint,
            marginBottom: 10,
            fontVariant: ["tabular-nums"],
          }}
        >
          {"// kitchen score"}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          {/* left — tappable score dial */}
          <Pressable
            onPress={toggle}
            style={{
              width: 78,
              height: 78,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Svg
              width={78}
              height={78}
              viewBox="0 0 78 78"
              style={{ position: "absolute" }}
            >
              <Circle
                cx={39}
                cy={39}
                r={RING_R}
                fill="none"
                stroke={colors.hairlineStrong}
                strokeWidth={5}
                opacity={0.4}
              />
              {overall !== null &&
                AGENT_ORDER.map((key, i) => (
                  <G key={key} rotation={-90 + i * 90} origin="39, 39">
                    <Circle
                      cx={39}
                      cy={39}
                      r={RING_R}
                      fill="none"
                      stroke={colors[AGENT_META[key].colorKey]}
                      strokeWidth={5}
                      strokeDasharray={`${RING_SEG}, ${RING_C - RING_SEG}`}
                    />
                  </G>
                ))}
            </Svg>
            <View style={{ alignItems: "center" }}>
              <PixelText
                style={{ fontSize: 22, color: colors.ink, lineHeight: 22 }}
              >
                {overall !== null ? overall : "–"}
              </PixelText>
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                  color: colors.faint,
                  marginTop: 1,
                }}
              >
                / 100
              </Text>
            </View>
          </Pressable>

          {/* right — streak + summary */}
          <View style={{ flex: 1, gap: 7 }}>
            <View
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 20,
                backgroundColor: streak > 0 ? `${colors.accent}1a` : colors.surface2,
                borderWidth: 1,
                borderColor: streak > 0 ? colors.accent : colors.hairlineStrong,
              }}
            >
              <MaterialCommunityIcons
                name="fire"
                size={12}
                color={streak > 0 ? colors.accent : colors.faint}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: streak > 0 ? colors.accent : colors.faint,
                }}
              >
                {streak > 0
                  ? `${streak} day${streak === 1 ? "" : "s"} streak`
                  : "No streak yet"}
              </Text>
            </View>

            {overall !== null ? (
              <>
                {wasteTrend && wasteTrend.delta !== 0 && (
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: "700",
                      color: wasteTrend.delta > 0 ? colors.good : colors.bad,
                    }}
                  >
                    {wasteTrend.delta > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(wasteTrend.delta)} Waste Saver vs last week
                  </Text>
                )}
                <Text style={{ fontSize: 10, lineHeight: 14, color: colors.faint }}>
                  {scoredCount === 4
                    ? "Guardian, Chef, Organizer & Shopkeeper, averaged"
                    : `Averaged across ${scoredCount} of 4 agents`}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 10.5, lineHeight: 15, color: colors.muted }}>
                Building your score — add items and keep using ThatFridge.
              </Text>
            )}
          </View>
        </View>

        {expanded && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {ordered.map((r) => (
              <View
                key={r.key}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: colors.surface2,
                  borderLeftWidth: 3,
                  borderLeftColor: colors[AGENT_META[r.key].colorKey],
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: "800",
                      color: colors.ink,
                    }}
                  >
                    {AGENT_META[r.key].name}
                    <Text style={{ color: colors.muted, fontWeight: "600" }}>
                      {" "}
                      · {r.label}
                    </Text>
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: bandColor(r.score, colors),
                    }}
                  >
                    {r.score !== null ? r.score : "—"}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: "600",
                    color: colors.ink,
                    marginBottom: 2,
                  }}
                >
                  {r.headline}
                </Text>
                <Text style={{ fontSize: 10.5, lineHeight: 15, color: colors.muted }}>
                  {r.detail}
                </Text>
                {r.key === "waste" ? (
                  <GuardianPill overdue={overdue} />
                ) : (
                  <AgentExtra agentKey={r.key} input={input} />
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
