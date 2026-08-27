import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  daysLabel,
  describeError,
  type ChatAgentName,
  type RecipeSuggestionBlock,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { usePro } from "@/lib/pro";
import { FREE_CHATS_PER_WEEK, bumpChatUsed, getChatUsed } from "@/lib/chatQuota";
import { MarkdownText } from "@/components/markdown-text";

const WALLPAPER = require("../../../assets/images/thatfridge/chat-wallpaper.png");

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const AGENTS: { key: ChatAgentName; blurb: string }[] = [
  { key: "Chef", blurb: "what to cook" },
  { key: "Guardian", blurb: "freshness" },
  { key: "Shopkeeper", blurb: "restocking" },
  { key: "Organizer", blurb: "planning" },
];
const AGENT_COLOR: Record<ChatAgentName, string> = {
  Chef: "#f5a623",
  Guardian: "#ff5f56",
  Shopkeeper: "#39e07f",
  Organizer: "#3d6fe0",
};
const QUICK_ASKS = [
  "What's expiring soon?",
  "What can I cook tonight?",
  "What do I need to buy?",
  "How's my fridge doing?",
];

type Msg = { role: "user" | "agent"; text: string; recipe?: RecipeSuggestionBlock | null };

export default function Chat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useLocalSearchParams<{ session?: string }>();
  const { items } = useInventory();
  const { isPro, presentPaywallIfNeeded } = usePro();
  const [agent, setAgent] = useState<ChatAgentName>("Chef");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [used, setUsed] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const remaining = Math.max(0, FREE_CHATS_PER_WEEK - used);

  const inventorySummary = useMemo(
    () => items.slice(0, 40).map((i) => `${i.name} (${daysLabel(i.days)})`).join(", "),
    [items],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const h = session
          ? await api.getChatSessionMessages(session)
          : await api.getChatHistory();
        setSessionId(h.session_id);
        setMessages(
          h.messages.flatMap((row) => {
            const out: Msg[] = [{ role: "user", text: row.user_message }];
            if (row.agent_response)
              out.push({ role: "agent", text: row.agent_response, recipe: row.recipe_suggestion });
            return out;
          }),
        );
      } catch {
        /* fresh thread */
      } finally {
        setLoading(false);
      }
    })();
    getChatUsed().then(setUsed);
  }, [session]);

  async function send(preset?: string) {
    const msg = (preset ?? text).trim();
    if (!msg || sending) return;
    if (!isPro && remaining <= 0) {
      const nowPro = await presentPaywallIfNeeded();
      if (!nowPro) {
        router.push("/paywall");
        return;
      }
    }
    if (!preset) setText("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api.sendChat(msg, agent, { inventory: inventorySummary, sessionId });
      if (res.session_id) setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "agent", text: res.agent_response, recipe: res.recipe_suggestion }]);
      if (!isPro) {
        await bumpChatUsed();
        setUsed((u) => u + 1);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "agent", text: describeError(e, "Something went wrong. Try again.") },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const showQuickAsks = !loading && messages.length <= 3;

  return (
    <ImageBackground source={WALLPAPER} resizeMode="repeat" style={{ flex: 1, backgroundColor: "#0a0a0c" }}>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          {/* header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingBottom: 12,
              backgroundColor: "rgba(19,19,22,0.8)",
              borderBottomWidth: 1,
              borderBottomColor: HAIRLINE,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: "800", color: INK }}>Quick Chat</Text>
              <Text style={{ fontSize: 11.5, color: FAINT }}>Quick answers about your fridge</Text>
            </View>
            <Pressable
              onPress={() => {
                setMessages([]);
                setSessionId(null);
              }}
              hitSlop={8}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE2,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="create-outline" size={15} color={INK} />
            </Pressable>
          </View>

          {/* agent picker */}
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {AGENTS.map((a) => {
              const active = agent === a.key;
              const color = AGENT_COLOR[a.key];
              return (
                <Pressable
                  key={a.key}
                  onPress={() => setAgent(a.key)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 7,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? color : HAIRLINE,
                    backgroundColor: active ? `${color}1a` : "rgba(19,19,22,0.6)",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? color : MUTED }}>
                    {a.key}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!isPro && (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={{
                marginHorizontal: 16,
                marginBottom: 4,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: HAIRLINE,
                backgroundColor: "rgba(19,19,22,0.85)",
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: MUTED }}>
                {remaining > 0
                  ? `${remaining} free message${remaining === 1 ? "" : "s"} left this week`
                  : "Weekly free messages used up"}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: AMBER }}>Go Pro</Text>
            </Pressable>
          )}

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator color={AMBER} style={{ marginTop: 32 }} />
            ) : messages.length === 0 ? (
              <Text style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: FAINT }}>
                Ask {agent} about {AGENTS.find((a) => a.key === agent)?.blurb}.
              </Text>
            ) : (
              messages.map((m, i) => <Bubble key={i} msg={m} />)
            )}
            {sending && <TypingDots />}
          </ScrollView>

          {showQuickAsks && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_ASKS.map((label) => (
                <Pressable
                  key={label}
                  onPress={() => send(label)}
                  style={{
                    backgroundColor: "rgba(19,19,22,0.9)",
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderRadius: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: INK }}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 8,
              paddingHorizontal: 14,
              paddingTop: 8,
              // clear the floating tab bar (≈58 tall, sits ~insets.bottom+6 from the edge)
              paddingBottom: insets.bottom + 74,
              borderTopWidth: 1,
              borderTopColor: HAIRLINE,
              backgroundColor: "rgba(19,19,22,0.9)",
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={`Ask ${agent} about your fridge…`}
              placeholderTextColor={FAINT}
              multiline
              style={{
                flex: 1,
                maxHeight: 96,
                backgroundColor: SURFACE2,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 11,
                fontSize: 13.5,
                color: INK,
              }}
            />
            <Pressable
              onPress={() => send()}
              disabled={sending || !text.trim()}
              style={{
                width: 38,
                height: 38,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 19,
                backgroundColor: AMBER,
                opacity: sending || !text.trim() ? 0.5 : 1,
              }}
            >
              <Ionicons name="arrow-up" size={18} color="#0a0a0c" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function TypingDots() {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        gap: 4,
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 13,
      }}
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: FAINT }} />
      ))}
    </View>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "85%",
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: isUser ? AMBER : SURFACE,
          borderWidth: isUser ? 0 : 1,
          borderColor: HAIRLINE,
          borderTopLeftRadius: isUser ? 16 : 4,
          borderTopRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        }}
      >
        {isUser ? (
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: "#0a0a0c" }}>{msg.text}</Text>
        ) : (
          <MarkdownText text={msg.text} />
        )}
      </View>
      {msg.recipe && (
        <View
          style={{
            marginTop: 8,
            maxWidth: "85%",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: AMBER,
            backgroundColor: SURFACE,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: INK }}>{msg.recipe.name}</Text>
          <Text style={{ fontSize: 11, color: FAINT, marginBottom: 4 }}>{msg.recipe.minutes} min</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: MUTED }}>{msg.recipe.description}</Text>
          {msg.recipe.steps.map((s, i) => (
            <Text key={i} style={{ marginTop: 4, fontSize: 12.5, lineHeight: 19, color: INK }}>
              {i + 1}. {s}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
