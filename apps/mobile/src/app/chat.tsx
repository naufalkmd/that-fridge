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

import {
  daysLabel,
  describeError,
  type ChatAgentName,
  type RecipeSuggestionBlock,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";

const AGENTS: { key: ChatAgentName; blurb: string }[] = [
  { key: "Chef", blurb: "what to cook" },
  { key: "Guardian", blurb: "freshness" },
  { key: "Shopkeeper", blurb: "restocking" },
  { key: "Organizer", blurb: "planning" },
];

type Msg = {
  role: "user" | "agent";
  text: string;
  recipe?: RecipeSuggestionBlock | null;
};

export default function Chat() {
  const { items } = useInventory();
  const [agent, setAgent] = useState<ChatAgentName>("Chef");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
  }, []);

  async function send() {
    const msg = text.trim();
    if (!msg || sending) return;
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
          return (
            <Pressable
              key={a.key}
              onPress={() => setAgent(a.key)}
              className={`flex-1 items-center rounded-lg border py-2 ${
                active ? "border-accent bg-surface" : "border-hairline"
              }`}
            >
              <Text
                className={`text-[12px] font-bold ${active ? "text-accent" : "text-muted"}`}
              >
                {a.key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-4 pb-4 gap-3"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <ActivityIndicator color="#4de1c1" className="mt-8" />
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
          placeholderTextColor="#5f7285"
          multiline
          className="max-h-24 flex-1 rounded-2xl border border-hairline bg-surface px-4 py-2.5 text-[14px] text-ink"
        />
        <Pressable
          onPress={send}
          disabled={sending || !text.trim()}
          className="h-10 w-10 items-center justify-center rounded-full bg-warn active:opacity-80"
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
          isUser ? "bg-warn" : "border border-hairline bg-surface"
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
