import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { timeAgo, type NotificationEvent, type NotificationKind } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";
import { SectionHeader } from "@/components/ui";

const KIND: Record<
  NotificationKind,
  { agent: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  expiring: { agent: "Guardian", color: "#ff5f56", icon: "hourglass" },
  lowStock: { agent: "Shopkeeper", color: "#39e07f", icon: "cart" },
  recipe: { agent: "Chef", color: "#f5a623", icon: "restaurant" },
};

export default function Notifications() {
  const router = useRouter();
  const { events, loading, error, refresh, markDone } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const active = events.filter((e) => !e.done);
  const done = events.filter((e) => e.done);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-5 pb-24 pt-3"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
      }
    >
      <Pressable
        onPress={() => router.push("/notification-settings")}
        className="mb-5 flex-row items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 active:opacity-80"
      >
        <Text className="text-[13px] font-semibold text-ink">Notification settings</Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(234,234,236,0.34)" />
      </Pressable>

      {error && (
        <Pressable onPress={refresh} className="mb-4 rounded-xl border border-bad bg-surface p-3">
          <Text className="font-semibold text-bad">{error}</Text>
        </Pressable>
      )}

      {active.length === 0 && done.length === 0 && (
        <Text className="mt-10 text-center text-[13px] text-faint">
          Nothing needs your attention. Nice.
        </Text>
      )}

      {active.length > 0 && (
        <View className="mb-6">
          <SectionHeader>Needs attention</SectionHeader>
          {active.map((e) => (
            <EventCard key={e.id} event={e} onDone={() => markDone(e.id, true)} />
          ))}
        </View>
      )}

      {done.length > 0 && (
        <View>
          <SectionHeader>Cleared</SectionHeader>
          {done.map((e) => (
            <EventCard key={e.id} event={e} onUndo={() => markDone(e.id, false)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EventCard({
  event,
  onDone,
  onUndo,
}: {
  event: NotificationEvent;
  onDone?: () => void;
  onUndo?: () => void;
}) {
  const meta = KIND[event.kind];
  return (
    <View
      className={`mb-2.5 flex-row items-center gap-3 rounded-[10px] border border-hairline p-3.5 ${
        event.done ? "bg-canvas" : "bg-surface"
      }`}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: event.done ? "rgba(255,255,255,0.05)" : `${meta.color}1a` }}
      >
        <Ionicons
          name={meta.icon}
          size={16}
          color={event.done ? "rgba(234,234,236,0.34)" : meta.color}
        />
      </View>

      <View className="flex-1">
        <View className="mb-0.5 flex-row items-center gap-1.5">
          <Text
            style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, color: meta.color }}
            className="uppercase"
          >
            {meta.agent}
          </Text>
        </View>
        <Text className={`text-[13.5px] ${event.done ? "text-muted" : "font-semibold text-ink"}`}>
          {event.message}
        </Text>
        <Text className="mt-0.5 text-[11px] text-faint">
          {event.fridgeName} · {timeAgo(event.createdAt)}
        </Text>
      </View>

      {onDone && (
        <Pressable onPress={onDone} hitSlop={8} className="px-2 py-1">
          <Text className="text-[12px] font-bold text-accent">Done</Text>
        </Pressable>
      )}
      {onUndo && (
        <Pressable onPress={onUndo} hitSlop={8} className="px-2 py-1">
          <Text className="text-[12px] font-semibold text-muted">Undo</Text>
        </Pressable>
      )}
    </View>
  );
}
