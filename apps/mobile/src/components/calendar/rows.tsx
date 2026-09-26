import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CalendarEntry, MealStatus } from "@thatfridge/core";

import { kcalLabel, mealsTotal, STATUS_LABEL } from "@/lib/mealPlan";
import { useTheme } from "@/lib/theme";
import { KIND_ICON, kindColor } from "./kind-meta";

export function isOpenable(entry: CalendarEntry): boolean {
  return !!(entry.refs.itemId || entry.refs.machineId);
}

/** What can be removed straight from the calendar: your expiring items, an automation's log entry, and a
 *  day's used-up / thrown-out history. (Meals are edited and deleted in their own form; "items added" are
 *  your real items and stay read-only here.) */
export function isDeletable(entry: CalendarEntry): boolean {
  return (
    (entry.kind === "expiry" && !!entry.refs.itemId) ||
    (entry.kind === "machine_run" && !!entry.refs.machineId && !!entry.refs.runId) ||
    entry.kind === "used" ||
    entry.kind === "wasted"
  );
}

export function deleteLabel(entry: CalendarEntry): string {
  if (entry.kind === "expiry") return `Remove ${entry.title}`;
  if (entry.kind === "machine_run") return `Delete log entry ${entry.title}`;
  return `Clear ${entry.title}`;
}

export function EntryRow({
  entry,
  onOpen,
  onDelete,
}: {
  entry: CalendarEntry;
  onOpen: (e: CalendarEntry) => void;
  onDelete?: (e: CalendarEntry) => void;
}) {
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
      {onDelete && isDeletable(entry) && (
        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={deleteLabel(entry)} onPress={() => onDelete(entry)}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.faint} />
        </Pressable>
      )}
      {openable && <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
    </Pressable>
  );
}

export function MealRow({
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
export function MealsTotal({ entries }: { entries: CalendarEntry[] }) {
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
