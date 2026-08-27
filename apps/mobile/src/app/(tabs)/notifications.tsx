import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { timeAgo, type NotificationEvent, type NotificationKind } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";

const KIND: Record<NotificationKind, { label: string; color: string }> = {
  expiring: { label: "Expiring", color: "#c1452e" },
  lowStock: { label: "Low stock", color: "#d99a2b" },
  recipe: { label: "Recipe", color: "#26c6da" },
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
        className="mb-4 flex-row items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3 active:opacity-80"
      >
        <Text className="text-[13px] font-semibold text-ink">Notification settings</Text>
        <Text className="text-muted">›</Text>
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

      {active.map((e) => (
        <Card key={e.id} event={e} onDone={() => markDone(e.id, true)} />
      ))}

      {done.length > 0 && (
        <>
          <Text className="mb-2 mt-6 text-[12px] font-bold tracking-wide text-faint">
            CLEARED
          </Text>
          {done.map((e) => (
            <Card key={e.id} event={e} onUndo={() => markDone(e.id, false)} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Card({
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
      className={`mb-2.5 flex-row items-center gap-3 rounded-xl border border-hairline p-3.5 ${
        event.done ? "bg-canvas" : "bg-surface"
      }`}
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: event.done ? "rgba(234,234,236,0.34)" : meta.color }}
      />
      <View className="flex-1">
        <Text
          className={`text-[13.5px] ${event.done ? "text-muted" : "font-semibold text-ink"}`}
        >
          {event.message}
        </Text>
        <Text className="mt-0.5 text-[11px] text-faint">
          {meta.label} · {event.fridgeName} · {timeAgo(event.createdAt)}
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
