import { Pressable, ScrollView, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CalendarEntry } from "@thatfridge/core";

import { BottomSheet } from "@/components/bottom-sheet";
import { Eyebrow } from "@/components/ui";
import { dayTitle, GROUP_LABEL, sectionsForDay } from "@/lib/calendar";
import { useTheme } from "@/lib/theme";
import { KIND_ICON, kindColor } from "./kind-meta";

export function isOpenable(entry: CalendarEntry): boolean {
  return !!(entry.refs.itemId || entry.refs.machineId);
}

/** One day's entries, grouped by kind. Opens over the grid when a day is tapped. */
export function DaySheet({
  date,
  entries,
  onClose,
  onOpenEntry,
}: {
  date: string | null;
  entries: CalendarEntry[];
  onClose: () => void;
  onOpenEntry: (entry: CalendarEntry) => void;
}) {
  const { colors } = useTheme();
  const sections = sectionsForDay(entries);
  return (
    <BottomSheet visible={date !== null} onClose={onClose} maxHeight={560}>
      {date !== null && (
        <View style={{ paddingBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>{dayTitle(date)}</Text>
          {sections.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.faint, paddingVertical: 20, textAlign: "center" }}>
              Nothing on this day.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {sections.map((section) => (
                <View key={section.group} style={{ marginBottom: 14 }}>
                  <Eyebrow color={colors.faint}>{GROUP_LABEL[section.group]}</Eyebrow>
                  <View style={{ marginTop: 8, gap: 8 }}>
                    {section.entries.map((entry) => {
                      const color = entry.tone === "overdue" ? colors.bad : kindColor(entry.kind, colors);
                      const openable = isOpenable(entry);
                      return (
                        <Pressable
                          key={entry.id}
                          disabled={!openable}
                          onPress={() => onOpenEntry(entry)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                            padding: 12,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.hairline,
                            backgroundColor: colors.surface,
                          }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 6,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: `${color}1a`,
                            }}
                          >
                            <MaterialCommunityIcons name={KIND_ICON[entry.kind]} size={17} color={color} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }}>{entry.title}</Text>
                            {(entry.time || entry.meta) && (
                              <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 2 }}>
                                {[entry.time, entry.meta].filter(Boolean).join(" · ")}
                              </Text>
                            )}
                          </View>
                          {openable && <Ionicons name="chevron-forward" size={16} color={colors.faint} />}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </BottomSheet>
  );
}
