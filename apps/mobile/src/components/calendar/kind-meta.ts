import type MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CalendarEntryKind } from "@thatfridge/core";

import type { ThemeColors } from "@/lib/theme";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function kindColor(kind: CalendarEntryKind, colors: ThemeColors): string {
  switch (kind) {
    case "expiry":
      return colors.warn;
    case "machine_scheduled":
    case "machine_run":
      return colors.accent;
    case "used":
      return colors.good;
    case "wasted":
      return colors.bad;
    case "added":
      return colors.blue;
  }
}

export const KIND_ICON: Record<CalendarEntryKind, IconName> = {
  expiry: "timer-sand",
  machine_scheduled: "clock-outline",
  machine_run: "cog-outline",
  used: "check-circle-outline",
  wasted: "delete-outline",
  added: "plus-circle-outline",
};
