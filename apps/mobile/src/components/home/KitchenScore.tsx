import { useMemo, useState } from "react";
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from "react-native";
import Svg, { Circle, G, Polyline, Rect } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  computeStreak,
  getFoodGroupCoverage,
  getOverallScore,
  getOverdueItemStats,
  getScoreSeries,
  getScoreTrend,
  kitchenScoreResults,
  type KitchenScoreInput,
  type KitchenScoreResult,
  type ScoreSnapshot,
} from "@thatfridge/core";

import { PixelText } from "@/components/brand";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
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
const AGENT_ORDER: KitchenScoreResult["key"][] = ["waste", "balance", "organizer", "shopkeeper"];

// Half-circle "sunrise arc" gauge — r=70, centre (88,88), swept 180°→360°. 4 fixed equal
// segments; only the puck position is data-driven. Mirrors the web KitchenScoreSection.
const ARC_R = 70;
const ARC_C = 88;
const CIRCUMFERENCE = 2 * Math.PI * ARC_R; // 439.82
const ARC_DASH = [51.31, CIRCUMFERENCE - 51.31];
const ARC_ROTATIONS = [180, 226, 272, 318];

function puckPosition(overall: number) {
  const angle = ((180 + Math.max(0, Math.min(100, overall)) * 1.8) * Math.PI) / 180;
  return { x: ARC_C + ARC_R * Math.cos(angle), y: ARC_C + ARC_R * Math.sin(angle) };
}

function bandColor(score: number | null): string {
  if (score === null) return FAINT;
  if (score >= 80) return "#39e07f";
  if (score >= 55) return "#f5a623";
  return "#ff5567";
}

function AgentBar({ result }: { result: KitchenScoreResult }) {
  const meta = AGENT_META[result.key];
  const height = result.score !== null ? Math.max(6, (result.score / 100) * 32) : 6;
  const color = result.score !== null ? meta.segment : STRONG;
  return (
    <View style={{ width: 7, height: 32, justifyContent: "flex-end" }}>
      <View style={{ width: "100%", height, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
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
      <MaterialCommunityIcons name={clear ? "check" : "alert-outline"} size={10} color={color} />
      <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase", color }}>
        {clear ? "nothing overdue" : `${overdue} overdue`}
      </Text>
    </View>
  );
}

/**
 * Waste Saver's weekly trend as a tiny polyline — real snapshots + the live score as the last
 * point (see core's getScoreSeries). Mirrors the web card's sparkline. Hidden until there are
 * at least two points to draw a line between.
 */
function Sparkline({ points }: { points: { score: number }[] }) {
  if (points.length < 2) return null;
  const W = 96;
  const H = 22;
  const PAD = 2;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const step = (W - PAD * 2) / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = PAD + i * step;
      const y = PAD + (H - PAD * 2) * (1 - (p.score - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = coords.split(" ").at(-1)!.split(",").map(Number);
  const rising = scores.at(-1)! >= scores[0];
  const color = rising ? "#39e07f" : "#ff5567";
  return (
    <Svg width={W} height={H} style={{ marginTop: 6 }}>
      <Polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </Svg>
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Circle cx={13} cy={13} r={r} fill="none" stroke={STRONG} strokeWidth={3} />
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
      <View style={{ height: 4, borderRadius: 2, backgroundColor: STRONG, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: 2, width: `${(checked / list.length) * 100}%`, backgroundColor: "#39e07f" }} />
      </View>
      <Text style={{ marginTop: 4, fontSize: 10, fontWeight: "700", color: FAINT }}>
        {checked}/{list.length} picked up
      </Text>
    </View>
  );
}

function AgentExtra({ agentKey, input }: { agentKey: KitchenScoreResult["key"]; input: KitchenScoreInput }) {
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
  const wasteSeries = getScoreSeries(snapshots, "waste", wasteScore);
  const overdue = getOverdueItemStats(input.items).overdueCount;
  const puck = overall !== null ? puckPosition(overall) : null;

  return (
    <View>
      <PixelText style={{ fontSize: 14, letterSpacing: 0.5, color: MUTED, marginBottom: 9 }}>
        Your Kitchen This Week
      </PixelText>

      <View
        style={{
          position: "relative",
          borderRadius: 10,
          paddingHorizontal: 18,
          paddingTop: 22,
          paddingBottom: 16,
          alignItems: "center",
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
            fontSize: 10,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: FAINT,
            marginBottom: 12,
            fontVariant: ["tabular-nums"],
          }}
        >
          {"// kitchen score"}
        </Text>

        {overall !== null && puck ? (
          <>
            <Svg width={176} height={100} viewBox="0 0 176 100">
              {AGENT_ORDER.map((key, i) => (
                <G key={key} rotation={ARC_ROTATIONS[i]} origin={`${ARC_C}, ${ARC_C}`}>
                  <Circle
                    cx={ARC_C}
                    cy={ARC_C}
                    r={ARC_R}
                    fill="none"
                    stroke={AGENT_META[key].segment}
                    strokeWidth={10}
                    strokeDasharray={ARC_DASH}
                  />
                </G>
              ))}
              <Circle cx={puck.x} cy={puck.y} r={11} fill={ACCENT} opacity={0.22} />
              <G rotation={45} origin={`${puck.x}, ${puck.y}`}>
                <Rect
                  x={puck.x - 5}
                  y={puck.y - 5}
                  width={10}
                  height={10}
                  fill="#131316"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                />
              </G>
            </Svg>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
                <PixelText style={{ fontSize: 34, color: "#eaeaec", lineHeight: 36 }}>
                  {overall}
                </PixelText>
                <Text style={{ fontSize: 11, fontWeight: "700", color: FAINT }}>/ 100</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5 }}>
                {ordered.map((r) => (
                  <AgentBar key={r.key} result={r} />
                ))}
              </View>
            </View>

            <Text style={{ marginTop: 6, fontSize: 11, color: FAINT }}>
              {scoredCount === 4
                ? "Guardian, Chef, Organizer & Shopkeeper, averaged"
                : `Averaged across ${scoredCount} of 4 agents so far`}
            </Text>

            {wasteTrend && wasteTrend.delta !== 0 && (
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 10.5,
                  fontWeight: "700",
                  color: wasteTrend.delta > 0 ? "#39e07f" : "#ff5567",
                }}
              >
                {wasteTrend.delta > 0 ? "▲" : "▼"} {Math.abs(wasteTrend.delta)} Waste Saver vs last week
              </Text>
            )}

            <Sparkline points={wasteSeries} />
          </>
        ) : (
          <Text
            style={{
              paddingVertical: 18,
              paddingHorizontal: 8,
              fontSize: 11.5,
              lineHeight: 17,
              color: MUTED,
              textAlign: "center",
            }}
          >
            Building your kitchen score — add a few items and start using ThatFridge to get going.
          </Text>
        )}

        {streak !== null && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 16,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 20,
              backgroundColor: streak > 0 ? "rgba(38,198,218,0.1)" : SURFACE2,
              borderWidth: 1,
              borderColor: streak > 0 ? ACCENT : STRONG,
            }}
          >
            <MaterialCommunityIcons
              name="fire"
              size={13}
              color={streak > 0 ? ACCENT : FAINT}
            />
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: "700",
                color: streak > 0 ? ACCENT : FAINT,
              }}
            >
              {streak > 0 ? `${streak} week${streak === 1 ? "" : "s"} streak` : "No streak yet"}
            </Text>
          </View>
        )}

        <View style={{ height: 1, backgroundColor: HAIRLINE, alignSelf: "stretch", marginTop: 16, marginBottom: 12 }} />

        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setExpanded((e) => !e);
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            alignSelf: "stretch",
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 6,
            backgroundColor: SURFACE2,
          }}
        >
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Agent scores
          </Text>
          <MaterialCommunityIcons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={15}
            color={MUTED}
          />
        </Pressable>

        {expanded && (
          <View style={{ alignSelf: "stretch", marginTop: 8, gap: 6 }}>
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
                  <Text style={{ fontSize: 12.5, fontWeight: "800", color: "#eaeaec" }}>
                    {AGENT_META[r.key].name}
                    <Text style={{ color: MUTED, fontWeight: "600" }}> · {r.label}</Text>
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: bandColor(r.score) }}>
                    {r.score !== null ? r.score : "—"}
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: "600", color: "#eaeaec", marginBottom: 2 }}>
                  {r.headline}
                </Text>
                <Text style={{ fontSize: 10.5, lineHeight: 15, color: MUTED }}>{r.detail}</Text>
                {r.key === "waste" ? <GuardianPill overdue={overdue} /> : <AgentExtra agentKey={r.key} input={input} />}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
