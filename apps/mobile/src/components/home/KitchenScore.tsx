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
  computeStreak,
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

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ACCENT = "#26c6da";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const STRONG = "rgba(255,255,255,0.18)";
const FAINT = "rgba(234,234,236,0.34)";
const MUTED = "rgba(234,234,236,0.58)";

// Order matches the arc segments below and CrewScene's zone order.
const AGENT_META: Record<
  KitchenScoreResult["key"],
  { name: string; segment: string }
> = {
  waste: { name: "Guardian", segment: "#ff5f56" },
  balance: { name: "Chef", segment: "#f5a623" },
  organizer: { name: "Organizer", segment: "#3d6fe0" },
  shopkeeper: { name: "Shopkeeper", segment: "#39e07f" },
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

function bandColor(score: number | null): string {
  if (score === null) return FAINT;
  if (score >= 80) return "#39e07f";
  if (score >= 55) return "#f5a623";
  return "#ff5567";
}

/** Guardian's own tell — its score is fundamentally an overdue-items check. */
function GuardianPill({ overdue }: { overdue: number }) {
  const clear = overdue === 0;
  const color = clear ? "#39e07f" : "#ff5567";
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
            backgroundColor: c.used ? "rgba(57,224,127,0.13)" : "transparent",
            borderWidth: 1,
            borderColor: c.used ? "#39e07f" : STRONG,
          }}
        >
          <MaterialCommunityIcons
            name={FOOD_GROUP_ICON[c.key] as never}
            size={10}
            color={c.used ? "#39e07f" : FAINT}
          />
        </View>
      ))}
    </View>
  );
}

/** Organizer's tell — its score IS a ratio, so a completion ring. */
function OrganizerExtra({ input }: { input: KitchenScoreInput }) {
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
          stroke={STRONG}
          strokeWidth={3}
        />
        <G rotation={-90} origin="13, 13">
          <Circle
            cx={13}
            cy={13}
            r={r}
            fill="none"
            stroke="#3d6fe0"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${(c * ratio).toFixed(1)}, ${c.toFixed(1)}`}
          />
        </G>
      </Svg>
      <Text style={{ fontSize: 10, fontWeight: "700", color: FAINT }}>
        {tally.itemsCorrectTotal}/{tally.itemsCheckedTotal} in the right spot
      </Text>
    </View>
  );
}

/** Shopkeeper's tell — its score IS the checked/total split, so a receipt-style bar. */
function ShopkeeperExtra({ input }: { input: KitchenScoreInput }) {
  const list = input.shoppingList ?? [];
  if (list.length === 0) return null;
  const checked = list.filter((i) => i.checked).length;
  return (
    <View style={{ marginTop: 8 }}>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: STRONG,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 2,
            width: `${(checked / list.length) * 100}%`,
            backgroundColor: "#39e07f",
          }}
        />
      </View>
      <Text
        style={{ marginTop: 4, fontSize: 10, fontWeight: "700", color: FAINT }}
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
        borderColor: ACCENT,
      }}
    />
  );
}

export function KitchenScore({
  input,
  snapshots = [],
}: {
  input: KitchenScoreInput;
  snapshots?: ScoreSnapshot[];
}) {
  const [expanded, setExpanded] = useState(false);

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
  const streak = snapshots.length > 0 ? computeStreak(snapshots) : null;
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
          color: MUTED,
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
          backgroundColor: "#131316",
          borderWidth: 1,
          borderColor: HAIRLINE,
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
            color: FAINT,
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
                stroke={STRONG}
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
                      stroke={AGENT_META[key].segment}
                      strokeWidth={5}
                      strokeDasharray={`${RING_SEG}, ${RING_C - RING_SEG}`}
                    />
                  </G>
                ))}
            </Svg>
            <View style={{ alignItems: "center" }}>
              <PixelText
                style={{ fontSize: 22, color: "#eaeaec", lineHeight: 22 }}
              >
                {overall !== null ? overall : "–"}
              </PixelText>
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                  color: FAINT,
                  marginTop: 1,
                }}
              >
                / 100
              </Text>
            </View>
          </Pressable>

          {/* right — streak + summary */}
          <View style={{ flex: 1, gap: 7 }}>
            {streak !== null && (
              <View
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 20,
                  backgroundColor:
                    streak > 0 ? "rgba(38,198,218,0.1)" : SURFACE2,
                  borderWidth: 1,
                  borderColor: streak > 0 ? ACCENT : STRONG,
                }}
              >
                <MaterialCommunityIcons
                  name="fire"
                  size={12}
                  color={streak > 0 ? ACCENT : FAINT}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: streak > 0 ? ACCENT : FAINT,
                  }}
                >
                  {streak > 0
                    ? `${streak} week${streak === 1 ? "" : "s"} streak`
                    : "No streak yet"}
                </Text>
              </View>
            )}

            {overall !== null ? (
              <>
                {wasteTrend && wasteTrend.delta !== 0 && (
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: "700",
                      color: wasteTrend.delta > 0 ? "#39e07f" : "#ff5567",
                    }}
                  >
                    {wasteTrend.delta > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(wasteTrend.delta)} Waste Saver vs last week
                  </Text>
                )}
                <Text style={{ fontSize: 10, lineHeight: 14, color: FAINT }}>
                  {scoredCount === 4
                    ? "Guardian, Chef, Organizer & Shopkeeper, averaged"
                    : `Averaged across ${scoredCount} of 4 agents`}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 10.5, lineHeight: 15, color: MUTED }}>
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
                  backgroundColor: SURFACE2,
                  borderLeftWidth: 3,
                  borderLeftColor: AGENT_META[r.key].segment,
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
                      color: "#eaeaec",
                    }}
                  >
                    {AGENT_META[r.key].name}
                    <Text style={{ color: MUTED, fontWeight: "600" }}>
                      {" "}
                      · {r.label}
                    </Text>
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: bandColor(r.score),
                    }}
                  >
                    {r.score !== null ? r.score : "—"}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: "600",
                    color: "#eaeaec",
                    marginBottom: 2,
                  }}
                >
                  {r.headline}
                </Text>
                <Text style={{ fontSize: 10.5, lineHeight: 15, color: MUTED }}>
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
