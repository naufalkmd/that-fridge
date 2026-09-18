import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { Image } from "expo-image";

import type { NotificationPrefs } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";
import {
  getFridgeReminder,
  type ReminderCadence,
  setFridgeReminder,
} from "@/lib/fridgeReminder";
import { useTheme, type ThemeColors } from "@/lib/theme";

const GIF = {
  guardian: require("../../assets/images/thatfridge/guardian.gif"),
  chef: require("../../assets/images/thatfridge/chef.gif"),
  organizer: require("../../assets/images/thatfridge/organizer.gif"),
  shopkeeper: require("../../assets/images/thatfridge/shopkeeper.gif"),
};

type Row = {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
  gif: keyof typeof GIF;
  accent: string;
};

// Grouped + agent-badged, mirroring apps/web's NotificationsScreen. The SHARED FRIDGES
// group covers activity/invite notifications (see Notifier on the backend).
function buildGroups(colors: ThemeColors): { title: string; rows: Row[] }[] {
  return [
    {
      title: "FRESHNESS & STOCK",
      rows: [
        {
          key: "expiryAlerts",
          label: "Expiry alerts",
          desc: "Guardian pings you before items go bad. Also drives the on-device reminders.",
          gif: "guardian",
          accent: colors.agentGuardian,
        },
        {
          key: "lowStock",
          label: "Low stock reminders",
          desc: "Shopkeeper flags essentials you're running low on.",
          gif: "shopkeeper",
          accent: colors.agentShopkeeper,
        },
      ],
    },
    {
      title: "MEALS & SUMMARIES",
      rows: [
        {
          key: "recipeTips",
          label: "Recipe suggestions",
          desc: "Chef's picks based on what's fresh right now.",
          gif: "chef",
          accent: colors.agentChef,
        },
        {
          key: "weeklyDigest",
          label: "Weekly digest",
          desc: "A Sunday summary of your fridge health.",
          gif: "organizer",
          accent: colors.agentOrganizer,
        },
      ],
    },
    {
      title: "SHARED FRIDGES",
      rows: [
        {
          key: "social",
          label: "Invites & members",
          desc: "Invitations, join requests, approvals, and people joining or leaving.",
          gif: "organizer",
          accent: colors.agentOrganizer,
        },
        {
          key: "crewActionsEnabled",
          label: "Crew activity",
          desc: "When someone in a shared fridge adds or uses an item, or leaves a note.",
          gif: "organizer",
          accent: colors.agentOrganizer,
        },
      ],
    },
  ];
}

const CADENCES: { key: ReminderCadence; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "twice_weekly", label: "2×/week" },
  { key: "evening", label: "Evenings" },
];

function CheckInReminderRow() {
  const { colors } = useTheme();
  const [cadence, setCadence] = useState<ReminderCadence | null>(null);

  useEffect(() => {
    getFridgeReminder().then(setCadence);
  }, []);

  const pick = (next: ReminderCadence) => {
    setCadence(next);
    void setFridgeReminder(next);
  };

  return (
    <View className="mb-5">
      <Text className="mb-2 text-[12px] font-extrabold tracking-wide text-faint">
        FRIDGE CHECK-IN
      </Text>
      <View className="gap-2 rounded-2xl border border-hairline bg-surface p-4">
        <Text className="text-[14px] font-semibold text-ink">Check-in reminder</Text>
        <Text className="mb-1 text-[11.5px] leading-4 text-faint">
          A recurring nudge to glance at your fridge before things go bad. On-device only.
        </Text>
        <View className="flex-row gap-2">
          {CADENCES.map((c) => {
            const active = cadence === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => pick(c.key)}
                className="flex-1 items-center rounded-lg py-2.5"
                style={{
                  backgroundColor: active ? colors.accent : colors.surface2,
                }}
              >
                <Text
                  className="text-[12.5px] font-bold"
                  style={{ color: active ? colors.canvas : colors.ink }}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function NotificationSettings() {
  const { prefs, togglePref } = useNotifications();
  const { colors } = useTheme();

  if (!prefs) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas px-5 pt-4">
      <CheckInReminderRow />
      {buildGroups(colors).map((group) => (
        <View key={group.title} className="mb-5">
          <Text className="mb-2 text-[12px] font-extrabold tracking-wide text-faint">
            {group.title}
          </Text>
          <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            {group.rows.map((row, i) => (
              <View
                key={row.key}
                className={`flex-row items-center gap-3 p-4 ${
                  i < group.rows.length - 1 ? "border-b border-hairline" : ""
                }`}
              >
                <View
                  className="h-9 w-9 items-center justify-center overflow-hidden rounded-lg"
                  style={{ backgroundColor: `${row.accent}1a` }}
                >
                  <Image source={GIF[row.gif]} style={{ width: 34, height: 34 }} contentFit="contain" />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-ink">{row.label}</Text>
                  <Text className="mt-0.5 text-[11.5px] leading-4 text-faint">{row.desc}</Text>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={() => togglePref(row.key)}
                  trackColor={{ true: colors.accent, false: colors.hairline }}
                  thumbColor={colors.ink}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text className="text-center text-[11px] text-faint">
        You can change these anytime — they only affect alerts inside ThatFridge and the
        on-device expiry reminders.
      </Text>
    </View>
  );
}
