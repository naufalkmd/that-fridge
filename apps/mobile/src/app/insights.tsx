import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

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
import { FoodIcon } from "@/components/food-icon";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { ColumnChart, Legend, MeterRow, ScoreRing } from "@/components/insights/charts";
import { PageHeader, Skeleton } from "@/components/ui";

const WEEKS = 4;

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
      <PageHeader title="Insights" subtitle="How your kitchen is doing" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 14 }}>
        <FridgeScopePicker />

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {/* Score: one number, then one bar per crew member. Tap a bar for the why. */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            <ScoreRing score={overall} color={bandColor} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: overall === null ? colors.muted : bandColor }}>{band.label}</Text>
              <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted }}>
                {overall === null
                  ? "Keep using ThatFridge and your score appears here."
                  : wasteTrend && wasteTrend.delta !== 0
                    ? `Waste Saver is ${wasteTrend.delta > 0 ? "up" : "down"} ${Math.abs(wasteTrend.delta)} on last week.`
                    : `Your kitchen score, from ${scored === 4 ? "the whole crew" : `${scored} of 4 crew members`}.`}
              </Text>
              {(user?.streak ?? 0) > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="fire" size={14} color={colors.accent} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent }}>{user!.streak}-day streak</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ gap: 4, marginTop: 16 }}>
            {results.map((r) => {
              const agent = AGENTS[r.key];
              const open = openAgent === r.key;
              return (
                <View key={r.key}>
                  <Pressable
                    onPress={() => setOpenAgent(open ? null : r.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${agent.name}, ${r.score ?? "no score yet"}`}
                    accessibilityState={{ expanded: open }}
                    style={{ paddingVertical: 8 }}
                  >
                    <MeterRow label={agent.name} value={r.score ?? 0} color={colors[agent.color]} right={r.score === null ? "–" : String(r.score)} muted={r.score === null} />
                  </Pressable>
                  {open && (
                    <View style={{ marginLeft: 96, marginBottom: 6, gap: 2 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.ink }}>{r.headline}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: colors.muted }}>{r.detail}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </Card>

        <Card title="Right now">
          {scoped.length === 0 ? (
            <Empty>Nothing in the fridge yet.</Empty>
          ) : soon + overdue === 0 ? (
            <Row icon="check-circle-outline" color={colors.good}>Nothing is close to its date. Nice.</Row>
          ) : (
            <View style={{ gap: 8 }}>
              {overdue > 0 && (
                <Row icon="alert-circle-outline" color={colors.bad}>
                  {overdue} item{overdue === 1 ? " is" : "s are"} past {overdue === 1 ? "its" : "their"} date
                </Row>
              )}
              {soon > 0 && (
                <Row icon="clock-alert-outline" color={colors.warn}>
                  {soon} item{soon === 1 ? "" : "s"} to use in the next 3 days
                </Row>
              )}
            </View>
          )}
        </Card>

        <Card title="Waste">
          {loading ? (
            <ChartSkeleton />
          ) : wasteHeadline(waste) === null ? (
            <Empty>Nothing used up or thrown out yet. Remove items as you finish them and this fills in.</Empty>
          ) : (
            <>
              <Text style={{ fontSize: 14.5, lineHeight: 21, color: colors.ink, marginBottom: 14 }}>{wasteHeadline(waste)}</Text>
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

        <Card title="Calories this week">
          {loading ? (
            <ChartSkeleton />
          ) : kcal === null ? (
            <Empty>No meals with calories on this week&apos;s plan yet.</Empty>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
                <Text style={{ fontSize: 28, fontWeight: "800", color: colors.ink }}>≈ {kcal.value.toLocaleString()}</Text>
                <Text style={{ flex: 1, fontSize: 12.5, color: colors.muted }}>{kcal.caption}</Text>
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
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>Open the meal plan ›</Text>
          </Pressable>
        </Card>

        <Card title="Food groups">
          {coreGroups.length === 0 ? (
            <Empty>Use up a few items and we&apos;ll show which food groups you eat from.</Empty>
          ) : (
            <>
              <View style={{ gap: 12 }}>
                {coreGroups.map((g) => (
                  <MeterRow key={g.key} label={g.label} value={(g.percent / groupMax) * 100} color={colors.accent} muted={g.count === 0} />
                ))}
              </View>
              {balanceHint(groups) && <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted, marginTop: 14 }}>{balanceHint(groups)}</Text>}
            </>
          )}
        </Card>

        {(favourites.length > 0 || freshness !== null) && (
          <Card title="Habits">
            {freshness !== null && (
              <View style={{ marginBottom: favourites.length > 0 ? 16 : 0 }}>
                <MeterRow label="Freshness" value={freshness} color={colors.good} right={`${freshness}%`} />
                <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 6 }}>How fresh things are when you use them.</Text>
              </View>
            )}
            {favourites.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.faint }}>You use these most</Text>
                {favourites.map((u) => (
                  <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <FoodIcon icon={u.icon} name={u.name} size={26} />
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>{u.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
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

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}>
      {title && <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>{title}</Text>}
      {children}
    </View>
  );
}

function Row({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <MaterialCommunityIcons name={icon as never} size={18} color={color} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.ink }}>{children}</Text>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted }}>{children}</Text>;
}

/** Placeholder columns while a chart's numbers load. */
function ChartSkeleton() {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", height: 110 }}>
      {[60, 90, 45, 75].map((h, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Skeleton width="62%" height={h} radius={6} />
        </View>
      ))}
    </View>
  );
}
