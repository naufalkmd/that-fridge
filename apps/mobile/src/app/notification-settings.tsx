import { ActivityIndicator, Switch, Text, View } from "react-native";

import type { NotificationPrefs } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";

const ROWS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  {
    key: "expiryAlerts",
    label: "Expiry alerts",
    desc: "Get pinged before items go bad. Also drives the on-device reminders.",
  },
  { key: "lowStock", label: "Low stock reminders", desc: "Flags essentials you're running low on." },
  { key: "recipeTips", label: "Recipe suggestions", desc: "Ideas based on what's fresh right now." },
  { key: "weeklyDigest", label: "Weekly digest", desc: "A Sunday summary of your fridge health." },
  {
    key: "crewActionsEnabled",
    label: "Crew activity",
    desc: "When someone in a shared fridge adds or uses an item.",
  },
];

export default function NotificationSettings() {
  const { prefs, togglePref } = useNotifications();

  if (!prefs) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas p-5">
      <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        {ROWS.map((row, i) => (
          <View
            key={row.key}
            className={`flex-row items-center gap-3 p-4 ${
              i < ROWS.length - 1 ? "border-b border-hairline" : ""
            }`}
          >
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-ink">{row.label}</Text>
              <Text className="mt-0.5 text-[11.5px] leading-4 text-faint">{row.desc}</Text>
            </View>
            <Switch
              value={prefs[row.key]}
              onValueChange={() => togglePref(row.key)}
              trackColor={{ true: "#26c6da", false: "rgba(255,255,255,0.09)" }}
              thumbColor="#eaeaec"
            />
          </View>
        ))}
      </View>
      <Text className="mt-4 text-center text-[11px] text-faint">
        These control alerts inside ThatFridge and the on-device expiry reminders.
      </Text>
    </View>
  );
}
