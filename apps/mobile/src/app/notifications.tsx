import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo, type NotificationEvent, type NotificationKind } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";
import { PixelText } from "@/components/brand";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";

const KIND: Record<
  NotificationKind,
  { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  expiring: { color: "#ff5f56", icon: "timer-sand" },
  lowStock: { color: "#39e07f", icon: "cart-outline" },
  recipe: { color: "#f5a623", icon: "chef-hat" },
};

export default function Notifications() {
  const router = useRouter();
  const { events, loading, error, refresh, markDone } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ paddingTop: 1 }}>
            <Ionicons name="chevron-back" size={20} color={MUTED} />
          </Pressable>
          <View>
            <PixelText style={{ fontSize: 14, color: INK }}>Notifications</PixelText>
            <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              Tap Clear to mark as done
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.push("/notification-settings")} hitSlop={8}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <Ionicons name="settings-outline" size={15} color={MUTED} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {error && (
          <Pressable
            onPress={refresh}
            style={{ marginBottom: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ff5567", backgroundColor: SURFACE, padding: 12 }}
          >
            <Text style={{ fontWeight: "600", color: "#ff5567" }}>{error}</Text>
          </Pressable>
        )}

        {loading ? (
          <ActivityIndicator color="#26c6da" style={{ marginTop: 40 }} />
        ) : events.length === 0 ? (
          <Text style={{ textAlign: "center", paddingVertical: 60, color: FAINT, fontSize: 13 }}>
            You&apos;re all caught up — no notifications yet.
          </Text>
        ) : (
          events.map((e) => (
            <Row
              key={e.id}
              event={e}
              onClear={() => markDone(e.id, true)}
              onUndo={() => markDone(e.id, false)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  event,
  onClear,
  onUndo,
}: {
  event: NotificationEvent;
  onClear: () => void;
  onUndo: () => void;
}) {
  const meta = KIND[event.kind];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 13,
        marginBottom: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: HAIRLINE,
        backgroundColor: event.done ? SURFACE2 : SURFACE,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: event.done ? SURFACE2 : `${meta.color}1a`,
        }}
      >
        <MaterialCommunityIcons
          name={meta.icon}
          size={17}
          color={event.done ? FAINT : meta.color}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: event.done ? FAINT : INK,
            textDecorationLine: event.done ? "line-through" : "none",
            marginBottom: 2,
          }}
        >
          {event.message}
        </Text>
        <Text style={{ fontSize: 11, color: FAINT }}>
          {event.fridgeName} · {timeAgo(event.createdAt)}
        </Text>
      </View>

      {event.done ? (
        <Pressable onPress={onUndo} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons name="check" size={16} color={GOOD} />
          <Text style={{ fontSize: 11, color: FAINT }}>Undo</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onClear} hitSlop={8} style={{ paddingHorizontal: 4, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: BLUE }}>Clear</Text>
        </Pressable>
      )}
    </View>
  );
}
