import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo, type ChatSessionSummary } from "@thatfridge/core";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

function title(msg: string) {
  const t = msg.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 48)}…` : t || "Conversation";
}

export default function ChatHistory() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .listChatSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  function del(id: string) {
    Alert.alert("Delete conversation", "This removes the whole thread.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSessions((s) => s.filter((x) => x.session_id !== id));
          try {
            await api.deleteChatSession(id);
          } catch {
            load();
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Chat History" subtitle="Tap a conversation to pick it back up" />
      {loading ? (
        <ActivityIndicator color="#26c6da" style={{ marginTop: 40 }} />
      ) : sessions.length === 0 ? (
        <Text style={{ textAlign: "center", paddingVertical: 60, color: FAINT, fontSize: 13 }}>
          No past conversations yet.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
            {sessions.map((s, i) => (
              <Pressable
                key={s.session_id}
                onPress={() => router.push(`/chat?session=${s.session_id}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  borderBottomWidth: i === sessions.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${BLUE}1a` }}>
                  <MaterialCommunityIcons name="message-outline" size={16} color={BLUE} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }} numberOfLines={1}>
                    {title(s.first_message)}
                  </Text>
                  <Text style={{ fontSize: 11, color: FAINT }}>
                    {s.message_count} message{s.message_count === 1 ? "" : "s"} · {timeAgo(new Date(s.updated_at).getTime())}
                  </Text>
                </View>
                <Pressable onPress={() => del(s.session_id)} hitSlop={10} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={FAINT} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
