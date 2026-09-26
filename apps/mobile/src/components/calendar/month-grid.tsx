import { Pressable, Text, View } from "react-native";
import type { CalendarEntry } from "@thatfridge/core";

import { dayDots, dayTitle, type GridCell } from "@/lib/calendar";
import { useTheme } from "@/lib/theme";
import { kindColor } from "./kind-meta";

/** A 6-week month grid. Every day - past, future, and the greyed days of the neighbouring
 *  months - is tappable; the dots under the number show which kinds of entries it has. */
export function MonthGrid({
  cells,
  entriesByDate,
  today,
  selected,
  onSelect,
}: {
  cells: GridCell[];
  entriesByDate: Record<string, CalendarEntry[]>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((cell) => {
        const entries = entriesByDate[cell.date];
        const isToday = cell.date === today;
        const isSelected = cell.date === selected;
        const count = entries?.length ?? 0;
        return (
          <Pressable
            key={cell.date}
            testID={`day-${cell.date}`}
            onPress={() => onSelect(cell.date)}
            accessibilityRole="button"
            accessibilityLabel={`${dayTitle(cell.date)}${count > 0 ? `, ${count} ${count === 1 ? "entry" : "entries"}` : ""}`}
            style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 5 }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isSelected ? colors.accent : "transparent",
                borderWidth: isToday && !isSelected ? 1.5 : 0,
                borderColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isToday || isSelected ? "800" : "500",
                  color: isSelected ? colors.onAccent : cell.inMonth ? colors.ink : colors.faint,
                  opacity: cell.inMonth || isSelected ? 1 : 0.55,
                }}
              >
                {cell.day}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 3, height: 6, marginTop: 3 }}>
              {dayDots(entries).map((kind) => (
                <View
                  key={kind}
                  style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: kindColor(kind, colors), opacity: cell.inMonth ? 1 : 0.5 }}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
