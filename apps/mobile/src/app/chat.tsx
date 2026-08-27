import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useRouter } from "expo-router";

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

type Msg = {
  role: "user" | "agent";
  text: string;
  recipe?: RecipeSuggestionBlock | null;
};

export default function Chat() {
  const router = useRouter();
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
    () =>
      items
        .slice(0, 40)
        .map((i) => `${i.name} (${daysLabel(i.days)})`)
        .join(", "),
    [items],
  );

  useEffect(() => {
    (async () => {
      try {
        const h = await api.getChatHistory();
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
        // fresh thread
      } finally {
        setLoading(false);
      }
    })();
    getChatUsed().then(setUsed);
  }, []);

  async function send() {
    const msg = text.trim();
    if (!msg || sending) return;
    if (!isPro && remaining <= 0) {
      // Try the native paywall; if it can't show (Expo Go / no dashboard paywall) or the
      // user doesn't buy, send them to the full paywall screen.
      const nowPro = await presentPaywallIfNeeded();
      if (!nowPro) {
        router.push("/paywall");
        return;
      }
    }
    setText("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api.sendChat(msg, agent, { inventory: inventorySummary, sessionId });
      if (res.session_id) setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        { role: "agent", text: res.agent_response, recipe: res.recipe_suggestion },
      ]);
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View className="flex-row gap-2 px-4 py-3">
        {AGENTS.map((a) => {
          const active = agent === a.key;
          const color = AGENT_COLOR[a.key];
          return (
            <Pressable
              key={a.key}
              onPress={() => setAgent(a.key)}
              className="flex-1 items-center rounded-lg border py-2"
              style={{
                borderColor: active ? color : "rgba(255,255,255,0.09)",
                backgroundColor: active ? `${color}1a` : "transparent",
              }}
            >
              <Text
                className="text-[12px] font-bold"
                style={{ color: active ? color : "rgba(234,234,236,0.58)" }}
              >
                {a.key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!isPro && (
        <Pressable
          onPress={() => router.push("/paywall")}
          className="mx-4 mb-1 flex-row items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2"
        >
          <Text className="text-[12px] text-muted">
            {remaining > 0
              ? `${remaining} free message${remaining === 1 ? "" : "s"} left this week`
              : "Weekly free messages used up"}
          </Text>
          <Text className="text-[12px] font-bold text-accent">Go Pro</Text>
        </Pressable>
      )}

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-4 pb-4 gap-3"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <ActivityIndicator color="#26c6da" className="mt-8" />
        ) : messages.length === 0 ? (
          <Text className="mt-8 text-center text-[13px] text-faint">
            Ask {agent} about {AGENTS.find((a) => a.key === agent)?.blurb}.
          </Text>
        ) : (
          messages.map((m, i) => <Bubble key={i} msg={m} />)
        )}
        {sending && <Text className="text-[12px] text-faint">{agent} is thinking…</Text>}
      </ScrollView>

      <View className="flex-row items-end gap-2 border-t border-hairline px-4 py-3">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Message ${agent}…`}
          placeholderTextColor="rgba(234,234,236,0.34)"
          multiline
          className="max-h-24 flex-1 rounded-2xl border border-hairline bg-surface px-4 py-2.5 text-[14px] text-ink"
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          className="h-10 w-10 items-center justify-center rounded-full bg-accent active:opacity-80"
          style={sending || !text.trim() ? { opacity: 0.5 } : undefined}
        >
          <Text className="text-[16px] font-bold text-[#0a0a0c]">↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
          isUser ? "bg-accent" : "border border-hairline bg-surface"
        }`}
      >
        <Text className={`text-[14px] leading-5 ${isUser ? "text-[#0a0a0c]" : "text-ink"}`}>
          {msg.text}
        </Text>
      </View>
      {msg.recipe && (
        <View className="mt-2 max-w-[85%] rounded-2xl border border-accent bg-surface p-3">
          <Text className="text-[14px] font-bold text-ink">{msg.recipe.name}</Text>
          <Text className="mb-1 text-[11px] text-faint">{msg.recipe.minutes} min</Text>
          <Text className="text-[12.5px] leading-5 text-muted">{msg.recipe.description}</Text>
          {msg.recipe.steps.map((s, i) => (
            <Text key={i} className="mt-1 text-[12.5px] leading-5 text-ink">
              {i + 1}. {s}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
