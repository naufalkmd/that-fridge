import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError, getOverallScore, getScoreTrend, kitchenScoreResults, type CalendarEntry, type KitchenScoreResult } from "@thatfridge/core";
import { api } from "@/lib/api";
import { addDays, toISO, weekDays } from "@/lib/calendar";
import {
  balanceHint, calorieHeadline, calorieSummary, CORE_GROUPS, dayInitial, foodGroupShares, freshnessAtUse, scoreBand, topUsed,
  wasteHeadline, wasteSummary, weekColumnLabel,
} from "@/lib/insights";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { scopeItems, useScope } from "@/lib/scope";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useKitchenScoreInput } from "@/lib/useKitchenScoreInput";
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { ColumnChart, Legend, MeterRow, ScoreRing } from "@/components/insights/charts";
import { Skeleton } from "@/components/ui";

const WEEKS = 4;
// Usage history is per person and all-time (GET /usage-history), not per fridge, so the fridge picker doesn't narrow it.
const USAGE_NOTE = "From everything you've used, in all your fridges";

const AGENTS: Record<KitchenScoreResult["key"], { name: string; color: keyof ThemeColors }> = {
  waste: { name: "Guardian", color: "agentGuardian" },
  balance: { name: "Chef", color: "agentChef" },
  organizer: { name: "Organizer", color: "agentOrganizer" },
  shopkeeper: { name: "Shopkeeper", color: "agentShopkeeper" },
};
const AGENT_ORDER: KitchenScoreResult["key"][] = ["waste", "balance", "organizer", "shopkeeper"];

/**
 * Insights: how the household's kitchen is doing, in one place. A single score with a bar per crew member, then what's about to
 * go off, what gets used vs thrown out, calories, the food-group mix and habits. Each section is a sentence and a simple shape
 * rather than a table of numbers. Computed on the device from data the app already loads (see lib/insights.ts).
 */
export default function Insights() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope } = useScope();
  const { user } = useAuth();
  const { items } = useInventory();
  const { usageHistory, scoreSnapshots } = useKitchenScore();
  const scoreInput = useKitchenScoreInput();

  const today = toISO(new Date());
  const thisWeek = weekDays(today)[0];
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [openAgent, setOpenAgent] = useState<KitchenScoreResult["key"] | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getCalendar({
        from: addDays(thisWeek, -7 * (WEEKS - 1)),
        to: addDays(thisWeek, 6),
        fridgeId: scope === "all" ? undefined : scope,
        tz: getDeviceTimezone(),
      })
      .then((res) => {
        if (!alive) return;
        setEntries(res.entries);
        setTruncated(res.truncated);
      })
      .catch((e) => alive && setError(describeError(e, "Couldn't load your insights.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope, thisWeek, reload]);

  const results = useMemo(() => {
    const byKey = Object.fromEntries(kitchenScoreResults(scoreInput).map((r) => [r.key, r])) as Record<KitchenScoreResult["key"], KitchenScoreResult>;
    return AGENT_ORDER.map((k) => byKey[k]);
  }, [scoreInput]);
  const overall = getOverallScore(results);
  const band = scoreBand(overall);
  const bandColor = band.tone === "good" ? colors.good : band.tone === "warn" ? colors.warn : band.tone === "bad" ? colors.bad : colors.faint;
  const wasteTrend = getScoreTrend(scoreSnapshots, "waste", results.find((r) => r.key === "waste")?.score ?? null);
  const scored = results.filter((r) => r.score !== null).length;

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const soon = scoped.filter((i) => i.days >= 0 && i.days <= 3).length;
  const overdue = scoped.filter((i) => i.days < 0).length;
  const waste = useMemo(() => wasteSummary(entries, today, WEEKS), [entries, today]);
  const calories = useMemo(() => calorieSummary(entries, today), [entries, today]);
  const kcal = calorieHeadline(calories);
  const groups = useMemo(() => foodGroupShares(usageHistory), [usageHistory]);
  const coreGroups = CORE_GROUPS.map((k) => groups.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => !!g);
  const groupMax = Math.max(1, ...coreGroups.map((g) => g.percent));
  const favourites = useMemo(() => topUsed(usageHistory, 3), [usageHistory]);
  const freshness = useMemo(() => freshnessAtUse(usageHistory), [usageHistory]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 22 }}>
        <View style={{ gap: 14 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <View style={{ gap: 4 }}>
            <PixelText style={{ fontSize: 16, color: colors.ink }}>Insights</PixelText>
            <Text style={{ fontSize: 12.5, color: colors.muted }}>How your kitchen is doing</Text>
          </View>
          <FridgeScopePicker />
        </View>

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {/* Score: one number and a word for it, with a faint accent wash like the Home score card. */}
        <Card tint>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <ScoreRing score={overall} color={bandColor} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: overall === null ? colors.muted : bandColor }}>{band.label}</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>
                {overall === null
                  ? "Keep using ThatFridge and your score appears here."
                  : wasteTrend && wasteTrend.delta !== 0
                    ? `Waste Saver is ${wasteTrend.delta > 0 ? "up" : "down"} ${Math.abs(wasteTrend.delta)} on last week.`
                    : `Your kitchen score, from ${scored === 4 ? "the whole crew" : `${scored} of 4 crew members`}.`}
              </Text>
              {(user?.streak ?? 0) > 0 && (
                <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.accent }}>{user!.streak}-day streak</Text>
              )}
            </View>
          </View>
        </Card>

        {/* One bar per crew member. Tap a bar for the why. */}
        <Section title="Your crew">
          <Card padded={false}>
            {results.map((r, i) => {
              const agent = AGENTS[r.key];
              const open = openAgent === r.key;
              return (
                <View key={r.key} style={{ borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: colors.hairline }}>
                  <Pressable
                    onPress={() => setOpenAgent(open ? null : r.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${agent.name}, ${r.score ?? "no score yet"}`}
                    accessibilityState={{ expanded: open }}
                    style={{ paddingVertical: 12, paddingHorizontal: 14 }}
                  >
                    <MeterRow label={agent.name} dot={colors[agent.color]} value={r.score ?? 0} color={colors[agent.color]} right={r.score === null ? "–" : String(r.score)} muted={r.score === null} />
                  </Pressable>
                  {open && (
                    <View style={{ marginLeft: 112, marginRight: 14, marginTop: -4, marginBottom: 12, gap: 2 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.ink }}>{r.headline}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>{r.detail}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </Section>

        <Section title="Right now">
          <Card>
            {scoped.length === 0 ? (
              <Empty>Nothing in the fridge yet.</Empty>
            ) : soon + overdue === 0 ? (
              <Row color={colors.good}>Nothing is close to its date. Nice.</Row>
            ) : (
              <View style={{ gap: 10 }}>
                {overdue > 0 && (
                  <Row color={colors.bad}>
                    {overdue} item{overdue === 1 ? " is" : "s are"} past {overdue === 1 ? "its" : "their"} date
                  </Row>
                )}
                {soon > 0 && (
                  <Row color={colors.warn}>
                    {soon} item{soon === 1 ? "" : "s"} to use in the next 3 days
                  </Row>
                )}
              </View>
            )}
          </Card>
        </Section>

        <Section title={`Waste · last ${WEEKS} weeks`}>
          <Card>
          {loading ? (
            <ChartSkeleton />
          ) : wasteHeadline(waste) === null ? (
            <Empty>Nothing used up or thrown out yet. Remove items as you finish them and this fills in.</Empty>
          ) : (
            <>
              <Text style={{ fontSize: 13, lineHeight: 19, color: colors.ink, marginBottom: 14 }}>{wasteHeadline(waste)}</Text>
              <ColumnChart
                columns={waste.weeks.map((w, i) => ({
                  key: w.start,
                  label: weekColumnLabel(i, WEEKS),
                  highlight: i === WEEKS - 1,
                  parts: [{ value: w.used, color: colors.good }, { value: w.wasted, color: colors.bad }],
                }))}
              />
              <Legend items={[{ label: "Used up", color: colors.good }, { label: "Thrown out", color: colors.bad }]} />
            </>
          )}
          </Card>
        </Section>

        <Section title="Calories this week">
          <Card>
          {loading ? (
            <ChartSkeleton />
          ) : kcal === null ? (
            <Empty>No meals with calories on this week&apos;s plan yet.</Empty>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
                <Text style={{ fontSize: 16, color: colors.ink }}>
                  ≈ <Text style={{ fontFamily: "PixelMix", fontSize: 18, letterSpacing: 0.5 }}>{kcal.value.toLocaleString()}</Text>
                </Text>
                <Text style={{ flex: 1, fontSize: 11.5, color: colors.muted }}>{kcal.caption}</Text>
              </View>
              <ColumnChart
                columns={calories.days.map((d) => ({
                  key: d.date,
                  label: dayInitial(d.date),
                  highlight: d.date === today,
                  parts: [{ value: d.cooked, color: colors.good }, { value: d.planned, color: colors.accent }],
                }))}
              />
              <Legend items={[{ label: "Cooked", color: colors.good }, { label: "Planned", color: colors.accent }]} />
              {calories.unknown > 0 && (
                <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 8 }}>
                  {calories.unknown} meal{calories.unknown === 1 ? "" : "s"} without an estimate {calories.unknown === 1 ? "isn't" : "aren't"} counted.
                </Text>
              )}
            </>
          )}
          <Pressable onPress={() => router.push("/meal-plan")} hitSlop={8} style={{ marginTop: 12, alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>Open the meal plan ›</Text>
          </Pressable>
          </Card>
        </Section>

        <Section title="Food groups" note={USAGE_NOTE}>
          <Card>
          {coreGroups.length === 0 ? (
            <Empty>Use up a few items and we&apos;ll show which food groups you eat from.</Empty>
          ) : (
            <>
              <View style={{ gap: 12 }}>
                {coreGroups.map((g) => (
                  <MeterRow key={g.key} label={g.label} value={(g.percent / groupMax) * 100} color={colors.accent} muted={g.count === 0} />
                ))}
              </View>
              {balanceHint(groups) && <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 14 }}>{balanceHint(groups)}</Text>}
            </>
          )}
          </Card>
        </Section>

        {(favourites.length > 0 || freshness !== null) && (
          <Section title="Habits" note={USAGE_NOTE}>
            <Card>
            {freshness !== null && (
              <View style={{ marginBottom: favourites.length > 0 ? 16 : 0 }}>
                <MeterRow label="Freshness" value={freshness} color={colors.good} right={`${freshness}%`} />
                <Text style={{ fontSize: 11, color: colors.faint, marginTop: 6 }}>How fresh things are when you use them.</Text>
              </View>
            )}
            {favourites.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.muted }}>You use these most</Text>
                {favourites.map((u) => (
                  <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 30, height: 30, borderCurve: "continuous", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}>
                      <FoodIcon icon={u.icon} name={u.name} size={24} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.ink }}>{u.name}</Text>
                  </View>
                ))}
              </View>
            )}
            </Card>
          </Section>
        )}

        {truncated && (
          <Text style={{ fontSize: 11.5, color: colors.faint, textAlign: "center" }}>
            Busy fridge: pick a single fridge for complete waste and calorie charts.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A small uppercase label over its card (the text keeps its case; the style upper-cases it). */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted }}>{title}</Text>
        {note && <Text style={{ fontSize: 11, color: colors.faint }}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

function Card({ children, tint, padded = true }: { children: React.ReactNode; tint?: boolean; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: padded ? 14 : 0, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" }}>
      {tint && <View style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "60%", backgroundColor: `${colors.accent}12` }} />}
      {children}
    </View>
  );
}

/** A sentence with a small coloured square for how urgent it is. */
function Row({ color, children }: { color: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: color }} />
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink }}>{children}</Text>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>{children}</Text>;
}

/** Placeholder columns while a chart's numbers load. */
function ChartSkeleton() {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end", height: 100 }}>
      {[60, 90, 45, 75].map((h, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Skeleton width={18} height={h} radius={2} />
        </View>
      ))}
    </View>
  );
}
