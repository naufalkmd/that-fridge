import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { describeError, type CalendarEntry } from "@thatfridge/core";
import { api } from "@/lib/api";
import { addDays, shortDayLabel, toISO, weekDays } from "@/lib/calendar";
import { calorieSummary, foodGroupShares, freshnessAtUse, topUsed, wasteSummary } from "@/lib/insights";
import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { kcalLabel } from "@/lib/mealPlan";
import { scopeItems, useScope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useAuth } from "@/lib/auth";
import { FoodIcon } from "@/components/food-icon";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { Eyebrow, PageHeader } from "@/components/ui";

const WEEKS = 4;

/**
 * Insights: one place for the numbers behind the household's kitchen - what's about to go off, what
 * gets used vs thrown out, calories on the meal plan, the food-group mix and habits. Everything is
 * computed on the device from data the app already loads (see lib/insights.ts); nothing new is stored.
 */
export default function Insights() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope } = useScope();
  const { user } = useAuth();
  const { items } = useInventory();
  const { usageHistory } = useKitchenScore();

  const today = toISO(new Date());
  const thisWeek = weekDays(today)[0];
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const fridgeNow = useMemo(
    () => ({
      total: scoped.length,
      overdue: scoped.filter((i) => i.days < 0).length,
      soon: scoped.filter((i) => i.days >= 0 && i.days <= 3).length,
    }),
    [scoped],
  );
  const waste = useMemo(() => wasteSummary(entries, today, WEEKS), [entries, today]);
  const calories = useMemo(() => calorieSummary(entries, today), [entries, today]);
  const groups = useMemo(() => foodGroupShares(usageHistory), [usageHistory]);
  const favourites = useMemo(() => topUsed(usageHistory, 5), [usageHistory]);
  const freshness = useMemo(() => freshnessAtUse(usageHistory), [usageHistory]);

  const weekMax = Math.max(1, ...waste.weeks.map((w) => w.used + w.wasted));
  const dayMax = Math.max(1, ...calories.days.map((d) => d.planned + d.cooked));
  const groupMax = Math.max(1, ...groups.map((g) => g.percent));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Insights" subtitle="Waste, nutrition and habits, all in one place" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 14 }}>
        <FridgeScopePicker />

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        <Card title="Right now">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="In the fridge" value={fridgeNow.total} />
            <Stat label="Expiring in 3 days" value={fridgeNow.soon} tone={fridgeNow.soon > 0 ? colors.warn : undefined} />
            <Stat label="Past date" value={fridgeNow.overdue} tone={fridgeNow.overdue > 0 ? colors.bad : undefined} />
          </View>
        </Card>

        <Card title={`Waste · last ${WEEKS} weeks`}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : waste.used + waste.wasted === 0 ? (
            <Empty>Nothing used up or thrown out yet. Remove items as you finish them to see this.</Empty>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                <Stat label="Used up" value={waste.used} tone={colors.good} />
                <Stat label="Thrown out" value={waste.wasted} tone={waste.wasted > 0 ? colors.bad : undefined} />
                <Stat label="Waste rate" value={waste.wasteRate === null ? "—" : `${waste.wasteRate}%`} />
              </View>
              {waste.weeks.map((w, i) => (
                <BarRow
                  key={w.start}
                  label={i === WEEKS - 1 ? "This week" : `${shortDayLabel(w.start).day}/${w.start.slice(5, 7)}`}
                  parts={[
                    { value: w.used, color: colors.good },
                    { value: w.wasted, color: colors.bad },
                  ]}
                  max={weekMax}
                  caption={`${w.used} used · ${w.wasted} out`}
                />
              ))}
            </>
          )}
        </Card>

        <Card title="Calories · this week">
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : calories.plannedTotal + calories.cookedTotal === 0 ? (
            <Empty>No meals with calories on this week's plan yet.</Empty>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                <Stat label="Cooked" value={kcalLabel(calories.cookedTotal)} small />
                <Stat label="Still planned" value={kcalLabel(calories.plannedTotal)} small />
                <Stat label="Daily average" value={calories.dailyAverage === null ? "—" : kcalLabel(calories.dailyAverage)} small />
              </View>
              {calories.days.map((d) => {
                const { weekday, day } = shortDayLabel(d.date);
                return (
                  <BarRow
                    key={d.date}
                    label={d.date === today ? "Today" : `${weekday} ${day}`}
                    parts={[
                      { value: d.cooked, color: colors.good },
                      { value: d.planned, color: colors.accent },
                    ]}
                    max={dayMax}
                    caption={d.cooked + d.planned > 0 ? `${d.cooked + d.planned}` : "–"}
                  />
                );
              })}
              <Legend items={[{ label: "Cooked", color: colors.good }, { label: "Planned", color: colors.accent }]} />
              {calories.unknown > 0 && (
                <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 6 }}>
                  {calories.unknown} meal{calories.unknown === 1 ? "" : "s"} without a calorie estimate {calories.unknown === 1 ? "isn't" : "aren't"} counted.
                </Text>
              )}
            </>
          )}
          <Pressable onPress={() => router.push("/meal-plan")} hitSlop={8} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>Open the meal plan ›</Text>
          </Pressable>
        </Card>

        <Card title="Nutrition balance">
          {groups.length === 0 ? (
            <Empty>Use up a few items and we&apos;ll show the food groups you eat from.</Empty>
          ) : (
            groups.map((g) => (
              <BarRow
                key={g.key}
                label={g.label}
                parts={[{ value: g.percent, color: g.count > 0 ? colors.accent : colors.hairline }]}
                max={groupMax}
                caption={`${g.percent}%`}
              />
            ))
          )}
        </Card>

        <Card title="Habits">
          <View style={{ flexDirection: "row", gap: 10, marginBottom: favourites.length > 0 ? 12 : 0 }}>
            <Stat label="Day streak" value={user?.streak ?? 0} />
            <Stat label="Freshness when used" value={freshness === null ? "—" : `${freshness}%`} />
          </View>
          {favourites.length > 0 && (
            <>
              <Eyebrow color={colors.faint}>Most used</Eyebrow>
              <View style={{ gap: 8, marginTop: 8 }}>
                {favourites.map((u) => (
                  <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <FoodIcon icon={u.icon} name={u.name} size={26} />
                    <Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>{u.name}</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.muted }}>{u.count}×</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>

        {truncated && (
          <Text style={{ fontSize: 11.5, color: colors.faint, textAlign: "center" }}>
            Busy fridge: pick a single fridge for complete waste and calorie numbers.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}>
      <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: number | string; tone?: string; small?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: small ? 13 : 20, fontWeight: "800", color: tone ?? colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: colors.faint, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted }}>{children}</Text>;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i.color }} />
          <Text style={{ fontSize: 11, color: colors.faint }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A horizontal stacked bar: `parts` share one track scaled against `max`. */
function BarRow({ label, parts, max, caption }: { label: string; parts: { value: number; color: string }[]; max: number; caption: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <Text style={{ width: 64, fontSize: 11.5, color: colors.muted }}>{label}</Text>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, flexDirection: "row", overflow: "hidden" }}>
        {parts.map((p, i) => (
          <View key={i} style={{ width: `${(p.value / max) * 100}%`, backgroundColor: p.color }} />
        ))}
      </View>
      <Text style={{ width: 70, fontSize: 11.5, color: colors.faint, textAlign: "right" }}>{caption}</Text>
    </View>
  );
}
