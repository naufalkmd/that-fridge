import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { daysLabel, freshColor } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, loading, refresh } = useInventory();
  const [refreshing, setRefreshing] = useState(false);

  const soon = useMemo(
    () =>
      [...items]
        .filter((i) => i.days >= 0 && i.days <= 3 && i.location !== "freezer")
        .sort((a, b) => a.days - b.days),
    [items],
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        contentContainerClassName="p-6 gap-6 pb-16"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9fb0c0" />
        }
      >
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="text-[13px] text-muted">
              {new Date().toLocaleDateString(undefined, { weekday: "long" })}
            </Text>
            <Text className="text-2xl font-extrabold text-ink">
              Hi {user?.name?.split(" ")[0] ?? "there"}
            </Text>
          </View>
          <Pressable onPress={() => router.push("/profile")} hitSlop={8} className="p-1">
            <View className="h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface">
              <Text className="text-[13px] font-bold text-ink">
                {user?.name?.slice(0, 1).toUpperCase() ?? "?"}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* stat row */}
        <View className="flex-row gap-3">
          <Stat
            label="In your fridge"
            value={loading ? "…" : String(items.length)}
            onPress={() => router.navigate("/inventory")}
          />
          <Stat
            label="Expiring soon"
            value={loading ? "…" : String(soon.length)}
            tone={soon.length > 0 ? "#d99a2b" : undefined}
            onPress={() => router.navigate("/inventory")}
          />
        </View>

        {/* use it up */}
        {soon.length > 0 && (
          <View className="gap-2">
            <Text className="text-[12px] font-bold tracking-wide text-faint">USE IT UP</Text>
            <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
              {soon.slice(0, 5).map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  className={`flex-row items-center justify-between px-4 py-3 active:bg-canvas ${
                    i < Math.min(soon.length, 5) - 1 ? "border-b border-hairline" : ""
                  }`}
                >
                  <Text className="text-[14px] font-semibold text-ink">{item.name}</Text>
                  <Text
                    className="text-[12px] font-bold"
                    style={{ color: freshColor(item.freshness) }}
                  >
                    {daysLabel(item.days)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* quick actions */}
        <View className="flex-row flex-wrap gap-3">
          <Action label="Add item" onPress={() => router.push("/add")} />
          <Action label="Scan" onPress={() => router.push("/scan")} />
          <Action label="Ask the crew" onPress={() => router.push("/chat")} />
          <Action label="Shopping list" onPress={() => router.push("/shopping")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-2xl border border-hairline bg-surface p-4 active:opacity-80"
    >
      <Text className="text-[11px] font-bold uppercase tracking-widest text-faint">{label}</Text>
      <Text className="mt-1 text-2xl font-extrabold" style={{ color: tone ?? "#e8eef4" }}>
        {value}
      </Text>
    </Pressable>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="min-w-[47%] flex-1 items-center rounded-xl border border-hairline bg-surface py-3.5 active:opacity-80"
    >
      <Text className="text-[13px] font-bold text-ink">{label}</Text>
    </Pressable>
  );
}
