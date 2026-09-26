import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  ApiError,
  daysLabel,
  describeError,
  guessFoodIcon,
  routeChatAgent,
  type RecipeSuggestionBlock,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useNotes } from "@/lib/notes";
import { useShopping } from "@/lib/shopping";
import { useScope } from "@/lib/scope";
import { useOnboarding } from "@/lib/onboarding";
import { useCredits } from "@/lib/credits";
import { stashRecipeSuggestion, useRecipes } from "@/lib/recipes";
import { useVoiceDictation } from "@/lib/voice";
import { MarkdownText } from "@/components/markdown-text";
import { RecipeSuggestionCard } from "@/components/recipe-suggestion-card";
import { BottomSheet } from "@/components/bottom-sheet";
import { ContextSheet } from "@/components/chat/context-sheet";
import { addContext, contextIcon, dayLabel, MAX_CONTEXTS, toRefs, type ChatContext } from "@/lib/chatContext";
import { toISO } from "@/lib/calendar";
import { getDeviceTimezone } from "@/lib/timezone";
import { useTheme } from "@/lib/theme";

// Older builds on this OTA channel may not contain ExpoDocumentPicker. Its entry point
// loads the native module at import time, so a static import crashes the entire chat tab.
let documentPicker: typeof import("expo-document-picker") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  documentPicker = require("expo-document-picker");
} catch {
  documentPicker = null;
}

const WALLPAPER = require("../../../assets/images/thatfridge/chat-wallpaper.png");

const GREETING: Msg = {
  role: "agent",
  text: "Hi! Ask me anything about what's in your fridge — or paste a recipe link and I'll turn it into a card.",
};

// Shown only on a fresh/empty chat (before the first real message) - the same activation
// prompts Home's "Activate {agent}" tip cards use (see home.tsx's AGENT_ACTIVATE_PROMPT),
// so a suggestion here and the equivalent Home shortcut land the same reply.
const SUGGESTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; prompt: string }[] = [
  {
    icon: "restaurant-outline",
    label: "Generate a recipe card",
    prompt: "What can I cook tonight with what I have?",
  },
  {
    icon: "warning-outline",
    label: "What's expiring soon?",
    prompt: "What's at risk of going bad soon?",
  },
  {
    icon: "cart-outline",
    label: "What should I restock?",
    prompt: "What should I restock?",
  },
  {
    icon: "sync-outline",
    label: "Organize my fridge",
    prompt: "How should I organize my fridge right now?",
  },
];

type Msg = {
  role: "user" | "agent";
  text: string;
  feedbackId?: number;
  feedbackRating?: "up" | "down" | null;
  recipe?: RecipeSuggestionBlock | null;
  mocked?: boolean;
  attachmentUris?: string[];
  attachmentPdfName?: string;
  /** Labels of the kitchen context pinned to this message (shown as chips under it). */
  contextLabels?: { type: ChatContext["type"]; label: string }[];
};

type Attachment =
  | { kind: "image"; uri: string }
  | { kind: "pdf"; uri: string; name: string };

// Matches AgentController::send's MAX_CHAT_IMAGES - keeps vision cost/latency per message
// bounded rather than open-ended. Only one PDF per message (a document already carries
// several pages' worth of content on its own).
const MAX_IMAGES = 4;

export default function Chat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, prefill, contextDay } = useLocalSearchParams<{ session?: string; prefill?: string; contextDay?: string }>();
  const { items, refresh: refreshInventory } = useInventory();
  const { refresh: refreshNotes } = useNotes();
  const { refresh: refreshShopping } = useShopping();
  const { scope } = useScope();
  const { markChecklistVisited } = useOnboarding();
  const { balance: credits, setBalance: setCredits, refresh: refreshCredits } = useCredits();
  const { colors } = useTheme();
  const {
    accent: AMBER,
    bad: BAD,
    canvas: CANVAS,
    onAccent: ONACCENT,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    hairlineStrong: STRONG,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
  } = colors;
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  // Handed over from elsewhere (e.g. the calendar's "Ask Quick Chat"): drop it in the composer once.
  useEffect(() => {
    if (prefill) setText(prefill);
  }, [prefill]);
  // ...and the day it was about, pinned as context so the crew can see that day's meals and expiries.
  useEffect(() => {
    if (contextDay) {
      const today = toISO(new Date());
      setContexts((prev) => addContext(prev, { type: "day", id: contextDay, label: dayLabel(contextDay, today) }));
    }
  }, [contextDay]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [contexts, setContexts] = useState<ChatContext[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const imageCount = attachments.filter((a) => a.kind === "image").length;
  const hasPdf = attachments.some((a) => a.kind === "pdf");
  // Context can always be added (up to its own cap), so the + is never dead.
  const canAttach = true;

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
              feedbackId: row.id,
              feedbackRating: row.feedback_rating,
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
    void refreshCredits();
  }, [session, refreshCredits]);

  async function pickImages() {
    const remaining = MAX_IMAGES - imageCount;
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (res.canceled) return;
    setAttachments((prev) => [
      ...prev,
      ...res.assets
        .slice(0, remaining)
        .map((a) => ({ kind: "image" as const, uri: a.uri })),
    ]);
  }

  async function takePhoto() {
    if (imageCount >= MAX_IMAGES) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow camera access to take a photo, or attach one from your library instead.",
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    setAttachments((prev) => [...prev, { kind: "image", uri: res.assets[0].uri }]);
  }

  async function pickPdf() {
    if (hasPdf || !documentPicker) return;
    try {
      const res = await documentPicker.getDocumentAsync({ type: "application/pdf" });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      setAttachments((prev) => [
        ...prev,
        { kind: "pdf", uri: asset.uri, name: asset.name || "document.pdf" },
      ]);
    } catch {
      Alert.alert("Couldn't open documents", "Please try again or use a photo instead.");
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  /** Close the sheet first: iOS can't present the camera/library/document picker over an open Modal. */
  function attachVia(pick: () => Promise<void>) {
    setAttachOpen(false);
    setTimeout(() => void pick(), 350);
  }

  async function send(preset?: string) {
    if (voice.listening) voice.stop();
    const msg = (preset ?? text).trim();
    if ((!msg && attachments.length === 0 && contexts.length === 0) || sending) return;
    if (credits !== null && credits < 1) {
      router.push("/credits");
      return;
    }
    const pending = attachments;
    const pendingContexts = contexts;
    const pendingImages = pending.filter((a) => a.kind === "image");
    const pendingPdf = pending.find((a) => a.kind === "pdf");
    if (!preset) setText("");
    setAttachments([]);
    setContexts([]);
    setMessages((m) => [
      ...m,
      {
        role: "user",
        text: msg,
        attachmentUris: pendingImages.length
          ? pendingImages.map((a) => a.uri)
          : undefined,
        attachmentPdfName: pendingPdf?.name,
        contextLabels: pendingContexts.length ? pendingContexts.map(({ type, label }) => ({ type, label })) : undefined,
      },
    ]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    const messageForApi =
      msg ||
      (pendingPdf
        ? "What's in this document?"
        : pending.length > 0
          ? "What do you see in this photo?"
          : "What should I know about this?");
    try {
      // Expo's fetch/FormData implementation needs a real Blob for a file part - it doesn't
      // support React Native's classic { uri, name, type } placeholder object, despite the
      // types still listing it as valid (see draft-item.tsx's expiry-scan photo for the same
      // fix). Without this, fetch() throws before the request is sent, which the shared http
      // client then misreports as "you're offline".
      const imageBlobs = await Promise.all(
        pendingImages.map(async (a) => (await fetch(a.uri)).blob()),
      );
      const pdfPayload = pendingPdf
        ? {
            blob: await (await fetch(pendingPdf.uri)).blob(),
            name: pendingPdf.name,
          }
        : undefined;
      const res = await api.sendChat(
        messageForApi,
        routeChatAgent(messageForApi),
        {
          inventory: inventorySummary,
          sessionId,
          fridgeId: scope === "all" ? undefined : scope,
          images: imageBlobs.length ? imageBlobs : undefined,
          pdf: pdfPayload,
          contexts: pendingContexts.length ? toRefs(pendingContexts) : undefined,
          tz: pendingContexts.length ? getDeviceTimezone() : undefined,
        },
      );
      if (res.session_id) setSessionId(res.session_id);
      // A tool call changed the user's data — the mutated flag doesn't say which of
      // inventory / notes / shopping, so refresh all three (cheap) so every tab matches.
      if (res.mutated) {
        void refreshInventory();
        void refreshNotes();
        void refreshShopping();
      }
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: res.agent_response,
          recipe: res.recipe_suggestion,
          mocked: res.mocked,
          feedbackId: res.id,
        },
      ]);
      if (typeof res.credits === "number") setCredits(res.credits);
      // Fire-and-forget: let the crew update what it remembers from this exchange.
      api.extractMemory(messageForApi, res.agent_response).catch(() => {});
      // Completes the "Ask the crew" step on the Home checklist — a sent message, not
      // just opening this screen.
      void markChecklistVisited("crew");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        void refreshCredits();
        router.push("/credits");
        return;
      }
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
      style={{ flex: 1, backgroundColor: CANVAS }}
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
              backgroundColor: `${SURFACE}cc`,
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

          {credits !== null && (
            <Pressable
              onPress={() => router.push("/credits")}
              style={{
                marginHorizontal: 16,
                marginBottom: 4,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: HAIRLINE,
                backgroundColor: `${SURFACE}d9`,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: credits < 3 ? BAD : MUTED }}>
                {credits} AI credit{credits === 1 ? "" : "s"}
                {credits < 3 ? " — running low" : ""}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: AMBER }}>
                Get more
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
              <>
                {messages.map((m, i) => <Bubble key={i} msg={m} />)}
                {messages.length === 1 && messages[0] === GREETING && (
                  <SuggestionChips onPick={(prompt) => send(prompt)} />
                )}
              </>
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
              backgroundColor: `${SURFACE}e6`,
            }}
          >
            {contexts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {contexts.map((c) => (
                    <View
                      key={`${c.type}:${c.id ?? ""}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 10, paddingRight: 6, height: 30, borderRadius: 15, backgroundColor: SURFACE2, borderWidth: 1, borderColor: STRONG }}
                    >
                      <Ionicons name={contextIcon(c.type) as never} size={13} color={MUTED} />
                      <Text numberOfLines={1} style={{ fontSize: 12, color: INK, maxWidth: 150 }}>{c.label}</Text>
                      <Pressable
                        onPress={() => setContexts((prev) => prev.filter((x) => x !== c))}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${c.label}`}
                      >
                        <Ionicons name="close-circle" size={16} color={FAINT} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
            {attachments.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 8 }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {attachments.map((a, i) => (
                    <View key={i} style={{ width: 56, height: 56 }}>
                      {a.kind === "image" ? (
                        <Image
                          source={{ uri: a.uri }}
                          style={{ flex: 1, borderRadius: 6 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={{
                            flex: 1,
                            borderRadius: 6,
                            backgroundColor: SURFACE2,
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 3,
                          }}
                        >
                          <Ionicons name="document-text-outline" size={18} color={INK} />
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 8, color: MUTED, marginTop: 2, maxWidth: 48 }}
                          >
                            {a.name}
                          </Text>
                        </View>
                      )}
                      <Pressable
                        onPress={() => removeAttachment(i)}
                        style={{
                          position: "absolute",
                          top: -6,
                          right: -6,
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: CANVAS,
                          borderWidth: 1,
                          borderColor: STRONG,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="close" size={11} color={INK} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
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
                      backgroundColor: BAD,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 11.5,
                    color: voice.error ? BAD : MUTED,
                  }}
                >
                  {voice.error ?? "Listening… tap the mic to stop"}
                </Text>
              </View>
            )}
            <View
              style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}
            >
              <Pressable
                onPress={() => setAttachOpen(true)}
                disabled={!canAttach}
                hitSlop={4}
                accessibilityLabel="Add attachment"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: canAttach ? 1 : 0.4,
                }}
              >
                <Ionicons name="add" size={22} color={INK} />
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
              {text.trim() || attachments.length > 0 || contexts.length > 0 || !voice.available ? (
                <Pressable
                  onPress={() => send()}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  disabled={sending || (!text.trim() && attachments.length === 0 && contexts.length === 0)}
                  style={{
                    width: 38,
                    height: 38,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 19,
                    backgroundColor: AMBER,
                    opacity:
                      sending || (!text.trim() && attachments.length === 0 && contexts.length === 0) ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="arrow-up" size={18} color={ONACCENT} />
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
                    backgroundColor: voice.listening ? BAD : SURFACE2,
                  }}
                >
                  <Ionicons
                    name={voice.listening ? "stop" : "mic"}
                    size={17}
                    color={voice.listening ? ONACCENT : INK}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BottomSheet visible={attachOpen} onClose={() => setAttachOpen(false)}>
        <View style={{ gap: 4, paddingBottom: 4 }}>
          {[
            {
              key: "camera",
              icon: "camera-outline" as const,
              label: "Take a photo",
              hint: imageCount >= MAX_IMAGES ? `Up to ${MAX_IMAGES} images` : undefined,
              disabled: imageCount >= MAX_IMAGES,
              onPress: () => attachVia(takePhoto),
            },
            {
              key: "library",
              icon: "image-outline" as const,
              label: "Choose from library",
              hint: imageCount >= MAX_IMAGES ? `Up to ${MAX_IMAGES} images` : undefined,
              disabled: imageCount >= MAX_IMAGES,
              onPress: () => attachVia(pickImages),
            },
            ...(documentPicker
              ? [
                  {
                    key: "file",
                    icon: "document-attach-outline" as const,
                    label: "Attach a PDF",
                    hint: hasPdf ? "One PDF per message" : undefined,
                    disabled: hasPdf,
                    onPress: () => attachVia(pickPdf),
                  },
                ]
              : []),
            {
              key: "context",
              icon: "link-outline" as const,
              label: "Add context",
              hint: contexts.length >= MAX_CONTEXTS ? `Up to ${MAX_CONTEXTS} per message` : "An item, fridge, recipe, day, meal plan…",
              disabled: contexts.length >= MAX_CONTEXTS,
              onPress: () => {
                setAttachOpen(false);
                setTimeout(() => setContextOpen(true), 350);
              },
            },
          ].map((o) => (
            <Pressable
              key={o.key}
              onPress={o.onPress}
              disabled={o.disabled}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 12,
                opacity: o.disabled ? 0.4 : 1,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={o.icon} size={19} color={INK} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: INK }}>{o.label}</Text>
                {o.hint && <Text style={{ fontSize: 12, color: FAINT }}>{o.hint}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <ContextSheet visible={contextOpen} onClose={() => setContextOpen(false)} onPick={(c) => setContexts((prev) => addContext(prev, c))} />
    </ImageBackground>
  );
}

function SuggestionChips({ onPick }: { onPick: (prompt: string) => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        alignSelf: "flex-start",
        marginTop: 2,
      }}
    >
      {SUGGESTIONS.map((s) => (
        <Pressable
          key={s.label}
          onPress={() => onPick(s.prompt)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: `${colors.surface}e6`,
            borderWidth: 1,
            borderColor: colors.hairline,
          }}
        >
          <Ionicons name={s.icon} size={13} color={colors.accent} />
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.ink }}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function HeaderBtn({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { colors } = useTheme();
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
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      <Ionicons name={icon} size={15} color={colors.ink} />
    </Pressable>
  );
}

function Dot({ delay }: { delay: number }) {
  const { colors } = useTheme();
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
        backgroundColor: colors.faint,
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
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
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
  const router = useRouter();
  const { colors } = useTheme();
  const isUser = msg.role === "user";
  const { recipes, create } = useRecipes();
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"up" | "down" | null>(msg.feedbackRating ?? null);
  const [choosingReason, setChoosingReason] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);

  async function rateReply(rating: "up" | "down", reason?: "wrong_info" | "ignored_fridge" | "too_slow" | "other") {
    if (!msg.feedbackId || ratingBusy) return;
    setRatingBusy(true);
    try {
      await api.rateChatReply(msg.feedbackId, rating, reason);
      setFeedbackRating(rating);
      setChoosingReason(false);
    } catch (e) {
      Alert.alert("Couldn't save rating", describeError(e, "Please try again."));
    } finally {
      setRatingBusy(false);
    }
  }
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
        // The model only sends ingredient names, so derive each icon the same way the
        // suggestion card does (guessFoodIcon of the name) — otherwise the saved recipe's
        // thumbnail, which keys off ingredients[0].icon, wouldn't match the card.
        ingredients: msg.recipe.ingredients.map((i) => ({
          name: i.name,
          icon: guessFoodIcon(i.name) ?? "leftovers",
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

  const hasAttachment = !!(msg.attachmentUris?.length || msg.attachmentPdfName);

  return (
    <View style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "85%",
          padding: hasAttachment ? 6 : undefined,
          paddingHorizontal: hasAttachment ? 6 : 14,
          paddingVertical: hasAttachment ? 6 : 11,
          backgroundColor: isUser ? colors.accent : colors.surface,
          borderWidth: isUser ? 0 : 1,
          borderColor: colors.hairline,
          borderTopLeftRadius: isUser ? 16 : 4,
          borderTopRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        }}
      >
        {!!msg.attachmentUris?.length && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: msg.text ? 6 : 0,
            }}
          >
            {msg.attachmentUris.map((uri, i) => {
              const size = msg.attachmentUris!.length > 1 ? 86 : 180;
              return (
                <Image
                  key={i}
                  source={{ uri }}
                  style={{ width: size, height: size, borderRadius: 10 }}
                  contentFit="cover"
                />
              );
            })}
          </View>
        )}
        {!!msg.attachmentPdfName && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: isUser ? "#ffffff26" : colors.surface2,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: msg.text ? 6 : 0,
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={15}
              color={isUser ? colors.onAccent : colors.ink}
            />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: isUser ? colors.onAccent : colors.ink,
                flexShrink: 1,
              }}
            >
              {msg.attachmentPdfName}
            </Text>
          </View>
        )}
        {!!msg.contextLabels?.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: msg.text ? 6 : 0, paddingHorizontal: hasAttachment ? 8 : 0 }}>
            {msg.contextLabels.map((c, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "#ffffff26" }}>
                <Ionicons name={contextIcon(c.type) as never} size={11} color={colors.onAccent} />
                <Text style={{ fontSize: 11, color: colors.onAccent }} numberOfLines={1}>{c.label}</Text>
              </View>
            ))}
          </View>
        )}
        {isUser ? (
          !!msg.text && (
            <Text
              selectable
              style={{
                fontSize: 13.5,
                lineHeight: 20,
                color: colors.onAccent,
                paddingHorizontal: hasAttachment ? 8 : 0,
                paddingBottom: hasAttachment ? 4 : 0,
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
                  color: colors.faint,
                  marginBottom: 4,
                }}
              >
                Demo reply — no AI key configured
              </Text>
            )}
            <MarkdownText text={msg.text} selectable />
          </>
        )}
      </View>
      {!isUser && msg.feedbackId && (
        <View style={{ alignItems: "flex-start", marginTop: 4, marginBottom: 5 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable accessibilityLabel="Helpful answer" disabled={ratingBusy} onPress={() => { void rateReply("up"); }}>
              <Ionicons name={feedbackRating === "up" ? "thumbs-up" : "thumbs-up-outline"} size={15} color={feedbackRating === "up" ? colors.accent : colors.muted} />
            </Pressable>
            <Pressable accessibilityLabel="Unhelpful answer" disabled={ratingBusy} onPress={() => setChoosingReason((v) => !v)}>
              <Ionicons name={feedbackRating === "down" ? "thumbs-down" : "thumbs-down-outline"} size={15} color={feedbackRating === "down" ? colors.bad : colors.muted} />
            </Pressable>
          </View>
          {choosingReason && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
              {([
                ["wrong_info", "Wrong info"], ["ignored_fridge", "Ignored my fridge"],
                ["too_slow", "Too slow"], ["other", "Other"],
              ] as const).map(([reason, label]) => (
                <Pressable key={reason} disabled={ratingBusy} onPress={() => { void rateReply("down", reason); }} style={{ padding: 6, borderRadius: 6, backgroundColor: colors.surface2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
                </Pressable>
              ))}
              <Pressable disabled={ratingBusy} onPress={() => { void rateReply("down"); }} style={{ padding: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>No reason</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      {msg.recipe && !dismissed && (
        <RecipeSuggestionCard
          suggestion={msg.recipe}
          added={added || alreadyInBook}
          adding={adding}
          onAdd={addToBook}
          onEdit={() => {
            stashRecipeSuggestion(msg.recipe!);
            router.push("/recipe-form?from=suggestion");
          }}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </View>
  );
}
