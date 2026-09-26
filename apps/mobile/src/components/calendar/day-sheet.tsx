import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CalendarEntry, MealStatus } from "@thatfridge/core";

import { BottomSheet } from "@/components/bottom-sheet";
import { Eyebrow } from "@/components/ui";
import { dayTitle, GROUP_LABEL, sectionsForDay } from "@/lib/calendar";
import { compareMeals, draftFromEntry, newDraft, type MealDraft } from "@/lib/mealPlan";
import { useTheme } from "@/lib/theme";
import { AddMenu, type AddAction } from "./add-menu";
import { MealForm } from "./meal-form";
import { QuickAdd } from "./quick-add";
import { EntryRow, MealRow, MealsTotal } from "./rows";

export { isOpenable } from "./rows";

type View_ = { type: "list" } | { type: "menu" } | { type: "meal"; draft: MealDraft } | { type: "shopping" } | { type: "note" };

/**
 * One day's entries, grouped by kind, plus everything you can add: the "+ Add" button opens a menu
 * (plan a meal, shopping list, note, item, automation) right in this sheet - a second modal over a
 * modal is unreliable on iOS. Keyboard handling lives in BottomSheet, which sits on top of the keyboard.
 */
export function DaySheet({
  date,
  entries,
  slots,
  fridgeId,
  startAtMenu,
  onClose,
  onOpenEntry,
  onAddItem,
  onNewAutomation,
  onAskChat,
  onDeleteEntry,
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
  /** Opened from the floating "+": start on the add menu instead of the day's list. */
  startAtMenu?: boolean;
  onClose: () => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onAddItem: () => void;
  onNewAutomation: () => void;
  /** Hand the day over to Quick Chat to add something by describing it. */
  onAskChat: (date: string) => void;
  /** Delete an expiring item, an automation's log entry, or a day's history from the calendar. */
  onDeleteEntry: (entry: CalendarEntry) => void;
  /** Resolves to an error message, or null on success. */
  onSaveMeal: (draft: MealDraft) => Promise<string | null>;
  onDeleteMeal: (entry: { id: string; title: string }) => Promise<void>;
  onQuickStatus: (entry: CalendarEntry, status: MealStatus) => Promise<void>;
  onSaveSlots: (slots: string[]) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [view, setView] = useState<View_>({ type: "list" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different day (or closing) resets the sheet; the floating "+" opens straight onto the add menu.
  useEffect(() => {
    setError(null);
    setSaving(false);
    setView(date !== null && startAtMenu ? { type: "menu" } : { type: "list" });
  }, [date, startAtMenu]);

  const sections = useMemo(() => {
    const order = compareMeals(slots);
    return sectionsForDay(entries).map((s) => (s.group === "meals" ? { ...s, entries: [...s.entries].sort(order) } : s));
  }, [entries, slots]);

  const backToList = () => setView({ type: "list" });

  function pick(action: AddAction) {
    if (date === null) return;
    if (action === "meal") setView({ type: "meal", draft: newDraft(date, slots, fridgeId) });
    else if (action === "shopping" || action === "note") setView({ type: action });
    else if (action === "item") onAddItem();
    else if (action === "chat") onAskChat(date);
    else onNewAutomation();
  }

  async function saveMeal() {
    if (view.type !== "meal") return;
    setSaving(true);
    setError(null);
    const problem = await onSaveMeal(view.draft);
    setSaving(false);
    if (problem) setError(problem);
    else backToList();
  }

  async function removeMeal() {
    if (view.type !== "meal" || !view.draft.id) return;
    setSaving(true);
    await onDeleteMeal({ id: view.draft.id, title: view.draft.title });
    setSaving(false);
    backToList();
  }

  return (
    <BottomSheet visible={date !== null} onClose={onClose} maxHeight={620}>
      {date !== null && (
        <View>
          {view.type === "meal" ? (
            <MealForm
              draft={view.draft}
              slots={slots}
              saving={saving}
              error={error}
              onChange={(patch) => setView((v) => (v.type === "meal" ? { type: "meal", draft: { ...v.draft, ...patch } } : v))}
              onSave={saveMeal}
              onCancel={backToList}
              onDelete={view.draft.id ? removeMeal : undefined}
              onSaveSlots={onSaveSlots}
            />
          ) : view.type === "menu" ? (
            <AddMenu onPick={pick} onBack={backToList} />
          ) : view.type === "shopping" || view.type === "note" ? (
            <QuickAdd kind={view.type} onDone={backToList} onBack={() => setView({ type: "menu" })} />
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
                              onEdit={() => setView({ type: "meal", draft: draftFromEntry(entry) })}
                              onQuickStatus={onQuickStatus}
                            />
                          ) : (
                            <EntryRow key={entry.id} entry={entry} onOpen={onOpenEntry} onDelete={onDeleteEntry} />
                          ),
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              <Pressable
                onPress={() => setView({ type: "menu" })}
                accessibilityRole="button"
                accessibilityLabel="Add"
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6,
                  paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.accent, backgroundColor: `${colors.accent}14`,
                }}
              >
                <Ionicons name="add" size={18} color={colors.accent} />
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.accent }}>Add</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}
