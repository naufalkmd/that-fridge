import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CalendarEntry, MealStatus } from "@thatfridge/core";

import { BottomSheet } from "@/components/bottom-sheet";
import { Eyebrow } from "@/components/ui";
import { dayTitle, GROUP_LABEL, sectionsForDay } from "@/lib/calendar";
import { compareMeals, draftFromEntry, kcalLabel, mealsTotal, newDraft, STATUS_LABEL, type MealDraft } from "@/lib/mealPlan";
import { useTheme } from "@/lib/theme";
import { KIND_ICON, kindColor } from "./kind-meta";
import { MealForm } from "./meal-form";

export function isOpenable(entry: CalendarEntry): boolean {
  return !!(entry.refs.itemId || entry.refs.machineId);
}

/**
 * One day's entries, grouped by kind, plus meal planning: "Plan a meal" and tapping a meal open the
 * form in this same sheet (a second modal over a modal is unreliable on iOS). Opens over the grid
 * when a day is tapped. Keyboard handling lives in BottomSheet, which sits on top of the keyboard.
 */
export function DaySheet({
  date,
  entries,
  slots,
  fridgeId,
  seedRecipe,
  onClose,
  onOpenEntry,
  onSaveMeal,
  onDeleteMeal,
  onQuickStatus,
  onSaveSlots,
}: {
  date: string | null;
  entries: CalendarEntry[];
  slots: string[];
  /** The fridge a new meal is planned on (null = personal). */
  fridgeId: string | null;
  /** "Add to plan" from a recipe: the day sheet opens straight into the form with it filled in. */
  seedRecipe?: { id: string; name: string } | null;
  onClose: () => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  /** Resolves to an error message, or null on success. */
  onSaveMeal: (draft: MealDraft) => Promise<string | null>;
  onDeleteMeal: (entry: { id: string; title: string }) => Promise<void>;
  onQuickStatus: (entry: CalendarEntry, status: MealStatus) => Promise<void>;
  onSaveSlots: (slots: string[]) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different day (or closing) always returns to the list; a recipe seed opens the form.
  useEffect(() => {
    setError(null);
    setSaving(false);
    setDraft(date !== null && seedRecipe ? newDraft(date, slots, fridgeId, seedRecipe) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, seedRecipe?.id]);

  const sections = useMemo(() => {
    const order = compareMeals(slots);
    return sectionsForDay(entries).map((s) => (s.group === "meals" ? { ...s, entries: [...s.entries].sort(order) } : s));
  }, [entries, slots]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const problem = await onSaveMeal(draft);
    setSaving(false);
    if (problem) setError(problem);
    else setDraft(null);
  }

  async function remove() {
    if (!draft?.id) return;
    setSaving(true);
    await onDeleteMeal({ id: draft.id, title: draft.title });
    setSaving(false);
    setDraft(null);
  }

  return (
    <BottomSheet visible={date !== null} onClose={onClose} maxHeight={620}>
      {date !== null && (
        <View>
          {draft ? (
            <MealForm
              draft={draft}
              slots={slots}
              saving={saving}
              error={error}
              onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              onSave={save}
              onCancel={() => setDraft(null)}
              onDelete={draft.id ? remove : undefined}
              onSaveSlots={onSaveSlots}
            />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>{dayTitle(date)}</Text>
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {sections.length === 0 ? (
                  <Text style={{ fontSize: 13, color: colors.faint, paddingVertical: 20, textAlign: "center" }}>
                    Nothing on this day.
                  </Text>
                ) : (
                  sections.map((section) => (
                    <View key={section.group} style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                        <Eyebrow color={colors.faint}>{GROUP_LABEL[section.group]}</Eyebrow>
                        {section.group === "meals" && <MealsTotal entries={section.entries} />}
                      </View>
                      <View style={{ marginTop: 8, gap: 8 }}>
                        {section.entries.map((entry) =>
                          entry.kind === "meal" ? (
                            <MealRow
                              key={entry.id}
                              entry={entry}
                              onEdit={() => setDraft(draftFromEntry(entry))}
                              onQuickStatus={onQuickStatus}
                            />
                          ) : (
                            <EntryRow key={entry.id} entry={entry} onOpen={onOpenEntry} />
                          ),
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              <Pressable
                onPress={() => setDraft(newDraft(date, slots, fridgeId))}
                accessibilityRole="button"
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6,
                  paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.accent, backgroundColor: `${colors.accent}14`,
                }}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.accent }}>Plan a meal</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

function EntryRow({ entry, onOpen }: { entry: CalendarEntry; onOpen: (e: CalendarEntry) => void }) {
  const { colors } = useTheme();
  const color = entry.tone === "overdue" ? colors.bad : kindColor(entry.kind, colors);
  const openable = isOpenable(entry);
  return (
    <Pressable
      disabled={!openable}
      onPress={() => onOpen(entry)}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 8,
        borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${color}1a` }}>
        <MaterialCommunityIcons name={KIND_ICON[entry.kind]} size={17} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }}>{entry.title}</Text>
        {(entry.time || entry.meta) && (
          <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 2 }}>{[entry.time, entry.meta].filter(Boolean).join(" · ")}</Text>
        )}
      </View>
      {openable && <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
    </Pressable>
  );
}

function MealRow({
  entry,
  onEdit,
  onQuickStatus,
}: {
  entry: CalendarEntry;
  onEdit: () => void;
  onQuickStatus: (entry: CalendarEntry, status: MealStatus) => Promise<void>;
}) {
  const { colors } = useTheme();
  const color = kindColor("meal", colors);
  const status = entry.status ?? "planned";
  const done = status === "cooked";
  const meta = [
    entry.slot,
    entry.time,
    typeof entry.calories === "number" ? kcalLabel(entry.calories) : null,
    entry.by ? `by @${entry.by}` : null,
    status !== "planned" ? STATUS_LABEL[status] : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${entry.title}`}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 8,
        borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, opacity: status === "skipped" ? 0.55 : 1,
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${color}1a` }}>
        <MaterialCommunityIcons name={KIND_ICON.meal} size={17} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink, textDecorationLine: status === "skipped" ? "line-through" : "none" }}>
          {entry.title}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 2 }}>{meta}</Text>
      </View>
      {status === "planned" ? (
        <Pressable hitSlop={8} accessibilityLabel={`Mark ${entry.title} cooked`} onPress={() => onQuickStatus(entry, "cooked")}>
          <MaterialCommunityIcons name="check-circle-outline" size={24} color={colors.faint} />
        </Pressable>
      ) : (
        done && <MaterialCommunityIcons name="check-circle" size={24} color={colors.good} />
      )}
    </Pressable>
  );
}

/** The day's meals added up ("≈ 1,240 kcal"), noting how many had an estimate when some did not. */
function MealsTotal({ entries }: { entries: CalendarEntry[] }) {
  const { colors } = useTheme();
  const { kcal, counted, total } = mealsTotal(entries);
  if (counted === 0) return null;
  return (
    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }} accessibilityLabel={`Meals total ${kcal} kilocalories`}>
      {kcalLabel(kcal)}
      {counted < total ? ` · ${counted} of ${total} counted` : ""}
    </Text>
  );
}
