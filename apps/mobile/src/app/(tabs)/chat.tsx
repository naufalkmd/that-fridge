import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  daysLabel,
  describeError,
  routeChatAgent,
  type RecipeSuggestionBlock,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { usePro } from "@/lib/pro";
import {
  FREE_CHATS_PER_WEEK,
  bumpChatUsed,
  getChatUsed,
} from "@/lib/chatQuota";
import { useRecipes } from "@/lib/recipes";
import { useVoiceDictation } from "@/lib/voice";
import { MarkdownText } from "@/components/markdown-text";
import { RecipeSuggestionCard } from "@/components/recipe-suggestion-card";

const WALLPAPER = require("../../../assets/images/thatfridge/chat-wallpaper.png");

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const GREETING: Msg = {
  role: "agent",
  text: "Hi! Ask me anything about what's in your fridge.",
};

type Msg = {
  role: "user" | "agent";
  text: string;
  recipe?: RecipeSuggestionBlock | null;
  mocked?: boolean;
  attachmentUri?: string;
};

export default function Chat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useLocalSearchParams<{ session?: string }>();
  const { items } = useInventory();
  const { isPro, presentPaywallIfNeeded } = usePro();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [used, setUsed] = useState(0);
  const [attachment, setAttachment] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Voice dictation → fills the composer; the user still reviews and hits send.
  const dictationBase = useRef("");
  const voice = useVoiceDictation((transcript) => {
    const base = dictationBase.current;
    setText(base ? `${base} ${transcript}` : transcript);
  });
  function toggleDictation() {
    if (voice.listening) {
      voice.stop();
    } else {
      dictationBase.current = text.trim();
      voice.start();
    }
  }

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
      setLoading(true);
      try {
        const h = session
          ? await api.getChatSessionMessages(session)
          : await api.getChatHistory();
        setSessionId(h.session_id);
        const restored = h.messages.flatMap((row) => {
          const out: Msg[] = [
            { role: "user" as const, text: row.user_message },
          ];
          if (row.agent_response)
            out.push({
              role: "agent",
              text: row.agent_response,
              recipe: row.recipe_suggestion,
            });
          return out;
        });
        setMessages(restored.length ? restored : [GREETING]);
      } catch {
        setMessages([GREETING]);
      } finally {
        setLoading(false);
      }
    })();
    getChatUsed().then(setUsed);
  }, [session]);

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setAttachment(res.assets[0].uri);
  }

  async function send(preset?: string) {
    if (voice.listening) voice.stop();
    const msg = (preset ?? text).trim();
    if ((!msg && !attachment) || sending) return;
    if (!isPro && remaining <= 0) {
      const nowPro = await presentPaywallIfNeeded();
      if (!nowPro) {
        router.push("/paywall");
        return;
      }
    }
    const img = attachment;
    if (!preset) setText("");
    setAttachment(null);
    setMessages((m) => [
      ...m,
      { role: "user", text: msg, attachmentUri: img ?? undefined },
    ]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    const messageForApi = msg || "What do you see in this photo?";
    try {
      const res = await api.sendChat(
        messageForApi,
        routeChatAgent(messageForApi),
        {
          inventory: inventorySummary,
          sessionId,
          image: img
            ? { uri: img, name: "photo.jpg", type: "image/jpeg" }
            : undefined,
        },
      );
      if (res.session_id) setSessionId(res.session_id);
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: res.agent_response,
          recipe: res.recipe_suggestion,
          mocked: res.mocked,
        },
      ]);
      // Fire-and-forget: let the crew update what it remembers from this exchange.
      api.extractMemory(messageForApi, res.agent_response).catch(() => {});
      if (!isPro) {
        await bumpChatUsed();
        setUsed((u) => u + 1);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: describeError(e, "Something went wrong. Try again."),
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <ImageBackground
      source={WALLPAPER}
      resizeMode="repeat"
      style={{ flex: 1, backgroundColor: "#0a0a0c" }}
    >
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
              <Text style={{ fontSize: 15.5, fontWeight: "800", color: INK }}>
                Quick Chat
              </Text>
              <Text style={{ fontSize: 11.5, color: FAINT }}>
                Quick answers about your fridge
              </Text>
            </View>
            <HeaderBtn
              icon="time-outline"
              onPress={() => router.push("/chat-history")}
            />
            <HeaderBtn
              icon="create-outline"
              onPress={() => {
                setMessages([GREETING]);
                setSessionId(null);
              }}
            />
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
              <Text style={{ fontSize: 12, fontWeight: "700", color: AMBER }}>
                Go Pro
              </Text>
            </Pressable>
          )}

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            }
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator color={AMBER} style={{ marginTop: 32 }} />
            ) : (
              messages.map((m, i) => <Bubble key={i} msg={m} />)
            )}
            {sending && <TypingDots />}
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 14,
              paddingTop: 8,
              // clear the floating tab bar (≈58 tall, sits ~insets.bottom+6 from the edge)
              paddingBottom: insets.bottom + 74,
              borderTopWidth: 1,
              borderTopColor: HAIRLINE,
              backgroundColor: "rgba(19,19,22,0.9)",
            }}
          >
            {attachment && (
              <View style={{ marginBottom: 8, width: 56, height: 56 }}>
                <Image
                  source={{ uri: attachment }}
                  style={{ flex: 1, borderRadius: 6 }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => setAttachment(null)}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "#0a0a0c",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.18)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="close" size={11} color={INK} />
                </Pressable>
              </View>
            )}
            {(voice.listening || voice.error) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                {voice.listening && (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: "#ff5f56",
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 11.5,
                    color: voice.error ? "#ff5f56" : MUTED,
                  }}
                >
                  {voice.error ?? "Listening… tap the mic to stop"}
                </Text>
              </View>
            )}
            <View
              style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
            >
              <Pressable
                onPress={pickImage}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="image-outline" size={17} color={INK} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Ask about your fridge…"
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
              {text.trim() || attachment || !voice.available ? (
                <Pressable
                  onPress={() => send()}
                  disabled={sending || (!text.trim() && !attachment)}
                  style={{
                    width: 38,
                    height: 38,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 19,
                    backgroundColor: AMBER,
                    opacity: sending || (!text.trim() && !attachment) ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="arrow-up" size={18} color="#0a0a0c" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={toggleDictation}
                  style={{
                    width: 38,
                    height: 38,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 19,
                    backgroundColor: voice.listening ? "#ff5f56" : SURFACE2,
                  }}
                >
                  <Ionicons
                    name={voice.listening ? "stop" : "mic"}
                    size={17}
                    color={voice.listening ? "#0a0a0c" : INK}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function HeaderBtn({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
      <Ionicons name={icon} size={15} color={INK} />
    </Pressable>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.delay(700 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: FAINT,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -3],
            }),
          },
        ],
      }}
    />
  );
}

function TypingDots() {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
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
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const { recipes, create } = useRecipes();
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const alreadyInBook =
    !!msg.recipe &&
    recipes.some(
      (r) =>
        r.name.trim().toLowerCase() === msg.recipe!.name.trim().toLowerCase(),
    );

  async function addToBook() {
    if (!msg.recipe || adding) return;
    setAdding(true);
    try {
      await create({
        name: msg.recipe.name,
        minutes: msg.recipe.minutes || 20,
        category: msg.recipe.category ?? null,
        ingredients: msg.recipe.ingredients.map((i) => ({
          name: i.name,
          icon: "leftovers",
        })),
        steps: msg.recipe.steps,
      });
      setAdded(true);
    } catch {
      /* leave the button actionable */
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "85%",
          padding: msg.attachmentUri ? 6 : undefined,
          paddingHorizontal: msg.attachmentUri ? 6 : 14,
          paddingVertical: msg.attachmentUri ? 6 : 11,
          backgroundColor: isUser ? AMBER : SURFACE,
          borderWidth: isUser ? 0 : 1,
          borderColor: HAIRLINE,
          borderTopLeftRadius: isUser ? 16 : 4,
          borderTopRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        }}
      >
        {msg.attachmentUri && (
          <Image
            source={{ uri: msg.attachmentUri }}
            style={{
              width: 180,
              height: 180,
              borderRadius: 10,
              marginBottom: msg.text ? 6 : 0,
            }}
            contentFit="cover"
          />
        )}
        {isUser ? (
          !!msg.text && (
            <Text
              style={{
                fontSize: 13.5,
                lineHeight: 20,
                color: "#0a0a0c",
                paddingHorizontal: msg.attachmentUri ? 8 : 0,
                paddingBottom: msg.attachmentUri ? 4 : 0,
              }}
            >
              {msg.text}
            </Text>
          )
        ) : (
          <>
            {msg.mocked && (
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: FAINT,
                  marginBottom: 4,
                }}
              >
                Demo reply — no AI key configured
              </Text>
            )}
            <MarkdownText text={msg.text} />
          </>
        )}
      </View>
      {msg.recipe && !dismissed && (
        <RecipeSuggestionCard
          suggestion={msg.recipe}
          added={added || alreadyInBook}
          adding={adding}
          onAdd={addToBook}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </View>
  );
}
