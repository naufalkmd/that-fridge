import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError, type CalendarEntry, type Recipe } from "@thatfridge/core";
import { api } from "@/lib/api";
import { addDays, groupByDate, shortDayLabel, toISO, weekDays, weekRangeLabel } from "@/lib/calendar";
import { compareMeals, draftFromEntry, kcalLabel, mealsTotal, newDraft, type MealDraft } from "@/lib/mealPlan";
import { useScope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useMealActions } from "@/lib/useMealActions";
import { SheetHeader } from "@/components/sheet";
import { MealRow } from "@/components/calendar/rows";
import { MealSheet } from "@/components/meal-plan/meal-sheet";

/**
 * The meal plan: this week, day by day. Tap "+" on a day to plan a meal, tap a meal to edit it, tick
 * it when cooked. The month view lives in the Calendar.
 */
export default function MealPlanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope } = useScope();
  // "Add to plan" from a recipe lands here with the recipe: the meal form opens ready to save.
  const params = useLocalSearchParams<{ recipeId?: string; recipeName?: string }>();

  const today = toISO(new Date());
  const [anchor, setAnchor] = useState(today);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [sheet, setSheet] = useState<MealDraft | null>(null);

  const meals = useMealActions(useCallback(() => setReload((n) => n + 1), []));
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const isThisWeek = days.includes(today);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getCalendar({ from: days[0], to: days[6], fridgeId: scope === "all" ? undefined : scope, tz: getDeviceTimezone() })
      .then((res) => alive && setEntries(res.entries.filter((e) => e.kind === "meal")))
      .catch((e) => alive && setError(describeError(e, "Couldn't load your meal plan.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, scope, reload]);

  // Opened from a recipe: start the meal form with it, on today.
  useEffect(() => {
    if (params.recipeId) setSheet(newDraft(today, meals.slots, meals.fridgeId, { id: params.recipeId, name: params.recipeName ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.recipeId]);

  const byDate = useMemo(() => groupByDate(entries), [entries]);
  const order = useMemo(() => compareMeals(meals.slots), [meals.slots]);
  const weekTotal = mealsTotal(entries);

  const planFor = (day: string, recipe?: Recipe) =>
    setSheet(newDraft(day, meals.slots, meals.fridgeId, recipe ? { id: recipe.id, name: recipe.name } : null));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <SheetHeader title="Meal plan" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 6 }}>
          <Pressable accessibilityLabel="Previous week" hitSlop={10} onPress={() => setAnchor(addDays(days[0], -7))}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{isThisWeek ? "This week" : weekRangeLabel(days)}</Text>
            <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 2 }}>
              {isThisWeek ? weekRangeLabel(days) : ""}
              {weekTotal.counted > 0 ? `${isThisWeek ? " · " : ""}${kcalLabel(weekTotal.kcal)} planned` : ""}
            </Text>
          </View>
          <Pressable accessibilityLabel="Next week" hitSlop={10} onPress={() => setAnchor(addDays(days[0], 7))}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          {!isThisWeek ? (
            <Pressable hitSlop={8} onPress={() => setAnchor(today)}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>Back to this week</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable hitSlop={8} accessibilityLabel="Open the calendar" onPress={() => router.push("/calendar")}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>Calendar ›</Text>
          </Pressable>
        </View>

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}
        {meals.error && <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center", marginBottom: 12 }}>{meals.error}</Text>}

        <View style={{ gap: 10 }}>
          {days.map((day) => {
            const dayMeals = [...(byDate[day] ?? [])].sort(order);
            const total = mealsTotal(dayMeals);
            const { weekday, day: n } = shortDayLabel(day);
            const isToday = day === today;
            return (
              <View
                key={day}
                testID={`plan-day-${day}`}
                style={{
                  borderRadius: 10, padding: 12, borderWidth: isToday ? 1.5 : 1,
                  borderColor: isToday ? colors.accent : colors.hairline, backgroundColor: colors.surface,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: dayMeals.length > 0 ? 10 : 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: isToday ? colors.accent : colors.ink }}>
                    {isToday ? "Today" : weekday} · {n}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {total.counted > 0 && <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{kcalLabel(total.kcal)}</Text>}
                  <Pressable
                    onPress={() => planFor(day)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a meal on ${weekday} ${n}`}
                    style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}26` }}
                  >
                    <Ionicons name="add" size={18} color={colors.accent} />
                  </Pressable>
                </View>
                {dayMeals.length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.faint, marginTop: 6 }}>Nothing planned</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {dayMeals.map((entry) => (
                      <MealRow key={entry.id} entry={entry} onEdit={() => setSheet(draftFromEntry(entry))} onQuickStatus={meals.quickStatus} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />}
      </ScrollView>

      <MealSheet
        initial={sheet}
        slots={meals.slots}
        dayOptions={days}
        onClose={() => setSheet(null)}
        onSave={meals.saveMeal}
        onDelete={meals.deleteMeal}
        onSaveSlots={meals.saveSlots}
      />
    </SafeAreaView>
  );
}
