import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";

import { ApiError, describeError, type CalendarEntry, type Recipe } from "@thatfridge/core";
import { api } from "@/lib/api";
import { addDays, groupByDate, shortDayLabel, toISO, weekDays, weekRangeLabel } from "@/lib/calendar";
import { compareMeals, draftFromEntry, kcalLabel, MEAL_AUTOFILL_COST, mealsTotal, newDraft, type MealDraft } from "@/lib/mealPlan";
import { useCredits } from "@/lib/credits";
import { useToast } from "@/lib/toast";
import { useScope } from "@/lib/scope";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useMealActions } from "@/lib/useMealActions";
import { PixelText } from "@/components/brand";
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

  // The day strip scrolls to a day's card: remember where each card sits inside the scroll content.
  const scrollRef = useRef<ScrollView>(null);
  const listY = useRef(0);
  const dayY = useRef<Record<string, number>>({});
  const jumpTo = (day: string) => {
    const y = dayY.current[day];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + y - 12), animated: true });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <RoundButton icon="chevron-back" label="Back" onPress={() => router.back()} />
          <RoundButton icon="calendar-outline" label="Open the calendar" onPress={() => router.push("/calendar")} />
        </View>

        {/* Title, then the week switcher: arrows either side of which week this is. */}
        <View style={{ gap: 10 }}>
          <PixelText style={{ fontSize: 16, color: colors.ink }}>Meal plan</PixelText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable accessibilityLabel="Previous week" hitSlop={10} onPress={() => setAnchor(addDays(days[0], -7))} style={weekArrow(colors)}>
              <Ionicons name="chevron-back" size={15} color={colors.ink} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }}>{isThisWeek ? "This week" : weekRangeLabel(days)}</Text>
              <Text style={{ fontSize: 11.5, color: colors.muted, marginTop: 2 }}>
                {isThisWeek ? weekRangeLabel(days) : ""}
                {weekTotal.counted > 0 ? `${isThisWeek ? " · " : ""}${kcalLabel(weekTotal.kcal)} planned` : ""}
              </Text>
            </View>
            <Pressable accessibilityLabel="Next week" hitSlop={10} onPress={() => setAnchor(addDays(days[0], 7))} style={weekArrow(colors)}>
              <Ionicons name="chevron-forward" size={15} color={colors.ink} />
            </Pressable>
          </View>
          {!isThisWeek && (
            <Pressable hitSlop={8} onPress={() => setAnchor(today)} style={{ alignSelf: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>Back to this week</Text>
            </Pressable>
          )}
        </View>

        {/* The week at a glance: one dot per meal (planned, cooked, skipped). Tap a day to jump to it. */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {days.map((day) => {
            const dayMeals = byDate[day] ?? [];
            const { weekday, day: n } = shortDayLabel(day);
            const isToday = day === today;
            return (
              <Pressable
                key={day}
                onPress={() => jumpTo(day)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${weekday} ${n}, ${dayMeals.length} meal${dayMeals.length === 1 ? "" : "s"}`}
                style={{
                  flex: 1, height: 56, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3,
                  backgroundColor: isToday ? `${colors.accent}24` : "transparent", borderWidth: 1, borderColor: isToday ? `${colors.accent}66` : "transparent",
                }}
              >
                <Text style={{ fontSize: 10, color: isToday ? colors.accent : colors.faint }}>{weekday.slice(0, 1)}</Text>
                <Text style={{ fontSize: 13, fontWeight: isToday ? "700" : "600", color: isToday ? colors.accent : colors.ink }}>{n}</Text>
                <View style={{ flexDirection: "row", gap: 2, height: 4 }}>
                  {dayMeals.slice(0, 4).map((m) => (
                    <View key={m.id} style={{ width: 4, height: 4, borderRadius: 1, backgroundColor: dotColor(m, colors) }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {fillFrom && (
          <Pressable
            onPress={openAskChef}
            accessibilityRole="button"
            accessibilityLabel="Ask Chef to plan"
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
          >
            <View style={{ width: 40, height: 40, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.agentChef}1f`, overflow: "hidden" }}>
              <Image source={CHEF} style={{ width: 32, height: 32, marginTop: 4 }} contentFit="contain" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Ask Chef</Text>
              <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={2}>
                Say what you want this week, or let Chef fill the empty slots · {MEAL_AUTOFILL_COST} credits
              </Text>
            </View>
            <View style={{ height: 30, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center", backgroundColor: `${colors.agentChef}29` }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.agentChef }}>Plan</Text>
            </View>
          </Pressable>
        )}

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}
        {meals.error && <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{meals.error}</Text>}

        <View style={{ gap: 16 }} onLayout={(e) => (listY.current = e.nativeEvent.layout.y)}>
          {days.map((day) => {
            const dayMeals = [...(byDate[day] ?? [])].sort(order);
            const total = mealsTotal(dayMeals);
            const { weekday, day: n } = shortDayLabel(day);
            const isToday = day === today;
            return (
              <View key={day} testID={`plan-day-${day}`} style={{ gap: 8 }} onLayout={(e) => (dayY.current[day] = e.nativeEvent.layout.y)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, color: isToday ? colors.accent : colors.muted }}>
                    {isToday ? "Today" : weekday} · {n}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {total.counted > 0 && <Text style={{ fontSize: 11.5, color: colors.muted }}>{kcalLabel(total.kcal)}</Text>}
                  <Pressable
                    onPress={() => planFor(day)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a meal on ${weekday} ${n}`}
                    style={{ width: 28, height: 28, borderCurve: "continuous", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}24` }}
                  >
                    <Ionicons name="add" size={16} color={colors.accent} />
                  </Pressable>
                </View>
                {dayMeals.length === 0 ? (
                  <Pressable
                    onPress={() => planFor(day)}
                    accessibilityRole="button"
                    accessibilityLabel={`Nothing planned on ${weekday} ${n}. Plan a meal`}
                    style={{ height: 44, borderCurve: "continuous", borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: isToday ? `${colors.accent}66` : colors.hairline, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 12, color: colors.faint }}>Nothing planned</Text>
                  </Pressable>
                ) : (
                  <View style={{ borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: isToday ? `${colors.accent}66` : colors.hairline, backgroundColor: colors.surface, overflow: "hidden" }}>
                    {dayMeals.map((entry, i) => (
                      <MealRow
                        key={entry.id}
                        entry={entry}
                        flat
                        last={i === dayMeals.length - 1}
                        onEdit={() => setSheet(draftFromEntry(entry))}
                        onQuickStatus={meals.quickStatus}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {loading && <ActivityIndicator color={colors.accent} />}
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

const CHEF = require("../../assets/images/thatfridge/chef.gif");

/** A meal's dot in the day strip: cooked green, skipped faint, otherwise (planned) the accent. */
function dotColor(entry: CalendarEntry, colors: ThemeColors): string {
  if (entry.status === "cooked") return colors.good;
  if (entry.status === "skipped") return colors.faint;
  return colors.accent;
}

function weekArrow(colors: ThemeColors) {
  return { width: 32, height: 32, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 } as const;
}

function RoundButton({ icon, label, onPress }: { icon: "chevron-back" | "calendar-outline"; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}
    >
      <Ionicons name={icon} size={icon === "chevron-back" ? 18 : 16} color={colors.ink} />
    </Pressable>
  );
}
