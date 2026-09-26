import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { ApiError, describeError, type CalendarEntry, type Recipe } from "@thatfridge/core";
import { api } from "@/lib/api";
import { addDays, groupByDate, shortDayLabel, toISO, weekDays, weekRangeLabel } from "@/lib/calendar";
import { compareMeals, draftFromEntry, kcalLabel, MEAL_AUTOFILL_COST, mealsTotal, newDraft, type MealDraft } from "@/lib/mealPlan";
import { useCredits } from "@/lib/credits";
import { useToast } from "@/lib/toast";
import { useScope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useMealActions } from "@/lib/useMealActions";
import { SheetHeader } from "@/components/sheet";
import { MealRow } from "@/components/calendar/rows";
import { AskChef } from "@/components/ask-chef";
import { BottomSheet } from "@/components/bottom-sheet";
import { MealSheet } from "@/components/meal-plan/meal-sheet";

/**
 * The meal plan: this week, day by day. Tap "+" on a day to plan a meal, tap a meal to edit it, tick
 * it when cooked. The month view lives in the Calendar.
 */
export default function MealPlanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope } = useScope();
  const toast = useToast();
  const { balance: credits, setBalance: setCredits } = useCredits();
  // "Add to plan" from a recipe lands here with the recipe: the meal form opens ready to save.
  const params = useLocalSearchParams<{ recipeId?: string; recipeName?: string }>();

  const today = toISO(new Date());
  const [anchor, setAnchor] = useState(today);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [sheet, setSheet] = useState<MealDraft | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

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

  // Ask Chef covers the rest of the visible week: today onward, never days that have passed.
  const fillFrom = days.find((d) => d >= today) ?? null;

  function openAskChef() {
    if (!fillFrom || autofilling) return;
    if (credits !== null && credits < MEAL_AUTOFILL_COST) {
      Alert.alert("Not enough credits", `Asking Chef to plan costs ${MEAL_AUTOFILL_COST} credits and you have ${credits}.`, [
        { text: "Not now", style: "cancel" },
        { text: "Get credits", onPress: () => router.push("/credits") },
      ]);
      return;
    }
    setAskOpen(true);
  }

  /** Chef plans the empty slots from `fillFrom` to the end of the week, following what was typed (if anything). */
  async function askChef(prompt: string) {
    if (!fillFrom) return;
    setAutofilling(true);
    try {
      const res = await api.autofillMealPlan({ from: fillFrom, to: days[6], fridge_id: meals.fridgeId, prompt: prompt || undefined });
      setCredits(res.balance);
      setReload((n) => n + 1);
      if (res.created.length === 0) {
        toast.show(res.message ?? "Nothing to plan.");
        return;
      }
      setAskOpen(false);
      const n = res.created.length;
      toast.show(`Chef planned ${n} meal${n === 1 ? "" : "s"} · used ${res.creditsUsed} credits · ${res.balance} left`, {
        actionLabel: "Undo",
        onAction: () => {
          // Removes the meals it added; the credits are not refunded.
          void Promise.allSettled(res.created.map((m) => api.deleteMealEntry(m.id))).then(() => setReload((x) => x + 1));
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setAskOpen(false);
        router.push("/credits");
      } else {
        Alert.alert("Chef couldn't plan that", describeError(e, "Please try again."));
      }
    } finally {
      setAutofilling(false);
    }
  }

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

        {fillFrom && (
          <Pressable
            onPress={openAskChef}
            accessibilityRole="button"
            accessibilityLabel="Ask Chef to plan"
            style={{
              flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, marginBottom: 14,
              borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
            }}
          >
            <MaterialCommunityIcons name="chef-hat" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.ink }}>Ask Chef</Text>
              <Text style={{ fontSize: 12, color: colors.faint, marginTop: 1 }}>
                Say what you want this week, or let Chef fill the empty slots
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>
        )}

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

      <BottomSheet visible={askOpen} onClose={() => (autofilling ? undefined : setAskOpen(false))}>
        <View style={{ padding: 16, gap: 10 }}>
          <AskChef
            placeholder="e.g. vegetarian dinners, high protein, use up my spinach"
            examples={["Light dinners under 500 kcal", "Use up what's expiring", "Kid-friendly, nothing spicy"]}
            cost={MEAL_AUTOFILL_COST}
            busy={autofilling}
            allowEmpty
            onSubmit={askChef}
          />
          <Text style={{ fontSize: 11.5, color: colors.faint, textAlign: "center", lineHeight: 16 }}>
            Fills the empty slots from {fillFrom ? `${shortDayLabel(fillFrom).weekday} ${shortDayLabel(fillFrom).day}` : "today"} to{" "}
            {shortDayLabel(days[6]).weekday} {shortDayLabel(days[6]).day}. Meals you already planned stay. Nothing is charged if Chef can&apos;t plan anything.
          </Text>
        </View>
      </BottomSheet>

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
