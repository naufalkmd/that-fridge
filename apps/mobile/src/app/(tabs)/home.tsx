import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { daysLabel, freshColor } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useNotifications } from "@/lib/notifications";
import { PixelText } from "@/components/brand";
import { AgentBadge, Card, Eyebrow, SectionHeader } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, loading, refresh } = useInventory();
  const { events } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const soon = useMemo(
    () =>
      [...items]
        .filter((i) => i.days >= 0 && i.days <= 3 && i.location !== "freezer")
        .sort((a, b) => a.days - b.days),
    [items],
  );

  const lowStock = useMemo(
    () => events.filter((e) => !e.done && e.kind === "lowStock"),
    [events],
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-6 pt-4 pb-16 gap-7"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {/* header */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <PixelText style={{ fontSize: 18, color: "#eaeaec" }}>ThatFridge</PixelText>
          </View>
          <Pressable onPress={() => router.push("/profile")} hitSlop={8}>
            <View className="h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface">
              <Text className="text-[13px] font-bold text-ink">
                {user?.name?.slice(0, 1).toUpperCase() ?? "?"}
              </Text>
            </View>
          </Pressable>
        </View>

        <View>
          <Text className="text-[13px] text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text className="mt-0.5 text-2xl font-extrabold text-ink">
            Hi {user?.name?.split(" ")[0] ?? "there"}
          </Text>
        </View>

        {/* overview */}
        <View>
          <SectionHeader>Overview</SectionHeader>
          <View className="flex-row gap-3">
            <Stat
              label="In your fridge"
              value={loading ? "…" : String(items.length)}
              onPress={() => router.navigate("/inventory")}
            />
            <Stat
              label="Expiring soon"
              value={loading ? "…" : String(soon.length)}
              tone={soon.length > 0 ? "#f5a623" : undefined}
              onPress={() => router.navigate("/inventory")}
            />
          </View>
        </View>

        {/* your crew */}
        <View>
          <SectionHeader>Your crew</SectionHeader>
          <View className="gap-3">
            <CrewCard
              eyebrow="Expiring soon"
              agent="Guardian"
              onPress={() => router.navigate("/inventory")}
            >
              {soon.length === 0 ? (
                <Text className="text-[13px] text-muted">Nothing about to turn. Nice.</Text>
              ) : (
                <Text className="text-[13.5px] text-ink">
                  <Text className="font-semibold">{soon[0].name}</Text>
                  <Text className="text-muted">
                    {" "}
                    {daysLabel(soon[0].days).toLowerCase()}
                    {soon.length > 1 ? ` · +${soon.length - 1} more` : ""}
                  </Text>
                </Text>
              )}
            </CrewCard>

            <CrewCard
              eyebrow="Low stock"
              agent="Shopkeeper"
              onPress={() => router.push("/shopping")}
            >
              {lowStock.length === 0 ? (
                <Text className="text-[13px] text-muted">Well stocked.</Text>
              ) : (
                <Text className="text-[13.5px] text-ink">
                  <Text className="font-semibold">{lowStock.length}</Text>
                  <Text className="text-muted"> essential{lowStock.length === 1 ? "" : "s"} running low</Text>
                </Text>
              )}
            </CrewCard>

            <CrewCard eyebrow="Chef's pick" agent="Chef" onPress={() => router.navigate("/eat")}>
              <Text className="text-[13px] text-muted">
                See what you can cook with what&apos;s fresh right now.
              </Text>
            </CrewCard>
          </View>
        </View>

        {/* use it up */}
        {soon.length > 0 && (
          <View>
            <SectionHeader>Use it up</SectionHeader>
            <Card className="overflow-hidden">
              {soon.slice(0, 5).map((item, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  className={`flex-row items-center justify-between px-4 py-3 active:bg-canvas ${
                    i < Math.min(soon.length, 5) - 1 ? "border-b border-hairline" : ""
                  }`}
                >
                  <Text className="text-[14px] font-semibold text-ink">{item.name}</Text>
                  <Text className="text-[12px] font-bold" style={{ color: freshColor(item.freshness) }}>
                    {daysLabel(item.days)}
                  </Text>
                </Pressable>
              ))}
            </Card>
          </View>
        )}

        {/* quick actions */}
        <View>
          <SectionHeader>Quick actions</SectionHeader>
          <View className="flex-row flex-wrap gap-3">
            <Action label="Add item" onPress={() => router.push("/add")} />
            <Action label="Scan" onPress={() => router.push("/scan")} />
            <Action label="Ask the crew" onPress={() => router.push("/chat")} />
            <Action label="Shopping list" onPress={() => router.push("/shopping")} />
          </View>
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
      className="flex-1 rounded-xl border border-hairline bg-surface p-4 active:opacity-80"
    >
      <Eyebrow color="rgba(234,234,236,0.34)">{label}</Eyebrow>
      <Text className="mt-1.5 text-2xl font-extrabold" style={{ color: tone ?? "#eaeaec" }}>
        {value}
      </Text>
    </Pressable>
  );
}

function CrewCard({
  eyebrow,
  agent,
  onPress,
  children,
}: {
  eyebrow: string;
  agent: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-[10px] border border-hairline bg-surface p-4 active:opacity-80"
    >
      <View className="mb-2 flex-row items-center justify-between">
        <Eyebrow>{eyebrow}</Eyebrow>
        <AgentBadge name={agent} />
      </View>
      {children}
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
