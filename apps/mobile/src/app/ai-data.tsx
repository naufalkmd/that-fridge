import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useKitchenScore } from "@/lib/kitchenScore";
import { PageHeader } from "@/components/ui";
import { FoodIcon } from "@/components/food-icon";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const BAD = "#ff5567";

export default function AIData() {
  const router = useRouter();
  const { usageHistory, refresh } = useKitchenScore();
  const [facts, setFacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getMemoryFacts()
      .then(setFacts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const usage = useMemo(
    () => [...usageHistory].sort((a, b) => b.lastAt - a.lastAt),
    [usageHistory],
  );

  async function deleteFact(i: number) {
    setFacts(await api.deleteMemoryFact(i).catch(() => facts));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  function clearFacts() {
    Alert.alert("Clear memory", "Forget everything the crew remembers about you?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await api.clearMemoryFacts().catch(() => {});
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          setFacts([]);
        },
      },
    ]);
  }
  async function deleteUsage(id: string) {
    await api.deleteUsageHistoryEntry(id).catch(() => {});
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="AI Data & Memory" subtitle="See and manage what your crew remembers" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
        <Section label="CHAT HISTORY" />
        <Pressable
          onPress={() => router.push("/chat-history")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 8,
            padding: 13,
            marginBottom: 22,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${BLUE}1a` }}>
            <MaterialCommunityIcons name="message-outline" size={16} color={BLUE} />
          </View>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: INK }}>Past conversations</Text>
          <Ionicons name="chevron-forward" size={16} color={FAINT} />
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Section label={`MEMORY${facts.length ? ` (${facts.length})` : ""}`} inline />
          {facts.length > 0 && (
            <Pressable onPress={clearFacts} hitSlop={8}>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: BAD }}>Clear all</Text>
            </Pressable>
          )}
        </View>
        {loading ? (
          <ActivityIndicator color="#26c6da" style={{ marginVertical: 20 }} />
        ) : facts.length === 0 ? (
          <Text style={{ fontSize: 12, color: FAINT, marginBottom: 22 }}>
            Nothing remembered yet — the crew picks up preferences and habits from your chats.
          </Text>
        ) : (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 22 }}>
            {facts.map((f, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 13,
                  borderBottomWidth: i === facts.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 17, color: INK }}>{f}</Text>
                <Pressable onPress={() => deleteFact(i)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={15} color={FAINT} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Section label={`USAGE HISTORY${usage.length ? ` (${usage.length})` : ""}`} />
        {usage.length === 0 ? (
          <Text style={{ fontSize: 12, color: FAINT }}>
            Nothing yet — items you mark &ldquo;used it up&rdquo; show here and feed the Shopkeeper.
          </Text>
        ) : (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
            {usage.map((u, i) => (
              <View
                key={u.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderBottomWidth: i === usage.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center" }}>
                  <FoodIcon icon={u.icon} name={u.name} size={26} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>{u.name}</Text>
                  <Text style={{ fontSize: 10.5, color: FAINT }}>
                    used {u.count}× · {timeAgo(u.lastAt)}
                  </Text>
                </View>
                <Pressable onPress={() => deleteUsage(u.id)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={15} color={FAINT} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0.3,
        color: FAINT,
        marginBottom: inline ? 0 : 8,
      }}
    >
      {label}
    </Text>
  );
}
