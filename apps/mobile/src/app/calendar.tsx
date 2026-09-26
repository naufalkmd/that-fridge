import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError, type CalendarEntry } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useMealActions } from "@/lib/useMealActions";
import { useScope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import {
  addMonths,
  filterEntries,
  GROUPS,
  GROUP_LABEL,
  groupByDate,
  monthGrid,
  monthTitle,
  toISO,
  weekdayLabels,
  type CalendarGroup,
} from "@/lib/calendar";
import { SheetHeader } from "@/components/sheet";
import { MonthGrid } from "@/components/calendar/month-grid";
import { DaySheet } from "@/components/calendar/day-sheet";

/**
 * The in-app calendar: everything ThatFridge knows about time in one month grid. Every day is
 * tappable and opens that day's detail. Read-only for now (expiry, automations, activity).
 */
export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { scope } = useScope();
  const [startAtMenu, setStartAtMenu] = useState(false);
  const meals = useMealActions(useCallback(() => setReload((n) => n + 1), []));

  const today = toISO(new Date());
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<CalendarGroup>>(new Set());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getCalendar({
        from: grid.from,
        to: grid.to,
        fridgeId: scope === "all" ? undefined : scope,
        tz: getDeviceTimezone(),
      })
      .then((res) => {
        if (!alive) return;
        setEntries(res.entries);
        setTruncated(res.truncated);
      })
      .catch((e) => alive && setError(describeError(e, "Couldn't load the calendar.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [grid, scope, reload]);

  const visible = useMemo(() => filterEntries(entries, hidden), [entries, hidden]);
  const byDate = useMemo(() => groupByDate(visible), [visible]);

  const toggleGroup = useCallback((group: CalendarGroup) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  function openEntry(entry: CalendarEntry) {
    setSelected(null);
    if (entry.refs.itemId) router.push(`/item/${entry.refs.itemId}`);
    else if (entry.refs.machineId) router.push("/kitchen-lab");
  }

  function closeSheet() {
    setSelected(null);
    setStartAtMenu(false);
  }

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <SheetHeader title="Calendar" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={{ alignItems: "flex-end", marginTop: 2 }}>
          <Pressable hitSlop={8} accessibilityLabel="Open the meal plan" onPress={() => router.push("/meal-plan")}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>Meal plan ›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 }}>
          <Pressable
            accessibilityLabel="Previous month"
            hitSlop={10}
            onPress={() => setCursor((c) => addMonths(c.year, c.month, -1))}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>{monthTitle(cursor.year, cursor.month)}</Text>
            {!isCurrentMonth && (
              <Pressable hitSlop={8} onPress={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.accent, marginTop: 2 }}>Today</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityLabel="Next month"
            hitSlop={10}
            onPress={() => setCursor((c) => addMonths(c.year, c.month, 1))}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {GROUPS.map((group) => {
            const on = !hidden.has(group);
            return (
              <Pressable
                key={group}
                onPress={() => toggleGroup(group)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: on ? `${colors.accent}26` : colors.surface2,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.hairline,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: on ? colors.accent : colors.faint }}>
                  {GROUP_LABEL[group]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {weekdayLabels().map((label, i) => (
            <Text key={i} style={{ width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "700", color: colors.faint }}>
              {label}
            </Text>
          ))}
        </View>

        <MonthGrid cells={grid.cells} entriesByDate={byDate} today={today} selected={selected} onSelect={(d) => {
            setStartAtMenu(false);
            setSelected(d);
          }}
        />

        <View style={{ marginTop: 14, minHeight: 24, alignItems: "center", justifyContent: "center" }}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : error ? (
            <Pressable onPress={() => setReload((n) => n + 1)}>
              <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
            </Pressable>
          ) : meals.error ? (
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{meals.error}</Text>
          ) : truncated ? (
            <Text style={{ fontSize: 11.5, color: colors.faint }}>Showing the first entries — narrow to one fridge to see the rest.</Text>
          ) : null}
        </View>
      </ScrollView>

      <DaySheet
        date={selected}
        entries={selected ? (byDate[selected] ?? []) : []}
        slots={meals.slots}
        fridgeId={meals.fridgeId}
        startAtMenu={startAtMenu}
        onClose={closeSheet}
        onOpenEntry={openEntry}
        onAddItem={() => {
          closeSheet();
          router.push("/add");
        }}
        onNewAutomation={() => {
          closeSheet();
          router.push({ pathname: "/kitchen-lab", params: { new: "1" } });
        }}
        onSaveMeal={meals.saveMeal}
        onDeleteMeal={meals.deleteMeal}
        onQuickStatus={meals.quickStatus}
        onSaveSlots={meals.saveSlots}
      />

      {/* The general "+": add anything to the selected day (or today) without picking a day first. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to the calendar"
        onPress={() => {
          setStartAtMenu(true);
          setSelected(selected ?? today);
        }}
        style={{
          position: "absolute", right: 20, bottom: 28, width: 54, height: 54, borderRadius: 27,
          backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
          shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color={colors.onAccent} />
      </Pressable>
    </SafeAreaView>
  );
}
