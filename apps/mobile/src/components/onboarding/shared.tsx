import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, { FadeIn } from "react-native-reanimated";

import { PixelText } from "@/components/brand";

// Shared onboarding UI — used by both `/welcome` (pre-sign-in) and `/onboarding` (the
// post-sign-in fallback for reinstalls / "Replay intro"). Purely presentational; each
// screen wires the callbacks to its own flow.

export const CANVAS = "#0a0a0c";
export const SURFACE = "#131316";
export const SURFACE2 = "#1a1a1f";
export const HAIRLINE = "rgba(255,255,255,0.09)";
export const ACCENT = "#26c6da";
export const INK = "#eaeaec";
export const MUTED = "rgba(234,234,236,0.58)";
export const FAINT = "rgba(234,234,236,0.34)";
export const GOOD = "#39e07f";
export const WARN = "#f5a623";
export const BAD = "#ff5567";

export const CREW = [
  { name: "Chef", gif: require("../../../assets/images/thatfridge/chef.gif") },
  { name: "Guardian", gif: require("../../../assets/images/thatfridge/guardian.gif") },
  { name: "Organizer", gif: require("../../../assets/images/thatfridge/organizer.gif") },
  { name: "Shopkeeper", gif: require("../../../assets/images/thatfridge/shopkeeper.gif") },
];

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  art: () => React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "MEET THE CREW",
    title: "Your kitchen has\na crew now",
    body: "Chef, Guardian, Organizer and Shopkeeper keep an eye on what's in your fridge so you don't have to.",
    art: () => <CrewArt />,
  },
  {
    eyebrow: "STAY AHEAD OF EXPIRY",
    title: "Know before\nit goes bad",
    body: "Track what you have and get a gentle nudge a few days out — not a bad smell a week later.",
    art: () => <FreshnessArt />,
  },
  {
    eyebrow: "ASK THE CREW",
    title: "Cook what\nyou already have",
    body: "Ask anything about your fridge in plain words. Less guessing, less waste, more dinners sorted.",
    art: () => <ChatArt />,
  },
];

// ---- the 3-slide value carousel ----------------------------------------------

export function IntroCarousel({
  onFinish,
  onSkip,
  onSlideView,
  finishLabel = "Get started",
  footerExtra,
}: {
  /** Last slide's primary button. */
  onFinish: () => void;
  /** Header "Skip". */
  onSkip: () => void;
  onSlideView?: (index: number) => void;
  finishLabel?: string;
  /** Rendered under the primary button on the last slide (e.g. "I already have an account"). */
  footerExtra?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    onSlideView?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = () => {
    if (last) {
      onFinish();
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (i !== index) setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                height: 7,
                width: i === index ? 22 : 7,
                borderRadius: 4,
                backgroundColor: i === index ? ACCENT : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </View>
        <Pressable onPress={onSkip} hitSlop={12}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: MUTED }}>Skip</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: "center" }}
        >
          {SLIDES.map((s, i) => (
            <View
              key={i}
              style={{
                width,
                height: "100%",
                paddingHorizontal: 28,
                justifyContent: "center",
                gap: 24,
              }}
            >
              <View style={{ alignItems: "center", height: 200, justifyContent: "center" }}>
                <Glow />
                {i === index ? s.art() : null}
              </View>
              <View style={{ gap: 10 }}>
                <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>
                  {s.eyebrow}
                </PixelText>
                <Text
                  style={{
                    fontSize: 30,
                    lineHeight: 36,
                    fontWeight: "800",
                    color: INK,
                    letterSpacing: -0.3,
                  }}
                >
                  {s.title}
                </Text>
                <Text style={{ fontSize: 14.5, lineHeight: 21, color: MUTED }}>
                  {s.body}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View
        style={{
          paddingHorizontal: 28,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12) + 10,
          gap: 12,
          backgroundColor: CANVAS,
        }}
      >
        <PrimaryButton label={last ? finishLabel : "Next"} onPress={next} />
        {last && footerExtra ? footerExtra : <View style={{ height: 22 }} />}
      </View>
    </View>
  );
}

// ---- name-your-fridge step --------------------------------------------------

export function FridgeStep({
  onBack,
  onSubmit,
  onSkip,
  onHaveAccount,
  ctaLabel = "Create fridge",
  busy = false,
}: {
  onBack: () => void;
  onSubmit: (name: string) => void;
  onSkip: () => void;
  /** Pre-sign-in only: shows a "Log in" link in the header. */
  onHaveAccount?: () => void;
  ctaLabel?: string;
  /** Show a spinner on the CTA (post-sign-in flow makes a network call). */
  busy?: boolean;
}) {
  const [name, setName] = useState("My Fridge");

  const submit = () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSubmit(name.trim() || "My Fridge");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={topBar}>
        <Pressable onPress={onBack} hitSlop={12} disabled={busy}>
          <Ionicons name="arrow-back" size={20} color={MUTED} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {onHaveAccount && (
            <Pressable onPress={onHaveAccount} hitSlop={12} disabled={busy}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: MUTED }}>Log in</Text>
            </Pressable>
          )}
          <Pressable onPress={onSkip} hitSlop={12} disabled={busy}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: MUTED }}>Skip</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 14 }}>
        <View style={{ alignItems: "center", marginBottom: 6 }}>
          <Glow />
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <MaterialCommunityIcons name="fridge-outline" size={34} color={ACCENT} />
          </View>
        </View>

        <PixelText
          style={{ fontSize: 11, letterSpacing: 1, color: ACCENT, textAlign: "center" }}
        >
          YOUR FIRST FRIDGE
        </PixelText>
        <Text
          style={{
            fontSize: 27,
            lineHeight: 33,
            fontWeight: "800",
            color: INK,
            textAlign: "center",
            letterSpacing: -0.3,
          }}
        >
          Name your fridge
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED, textAlign: "center" }}>
          It&apos;s where everything you track lives. Add more later — one for home, one
          shared with housemates.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="My Fridge"
          placeholderTextColor={FAINT}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submit}
          editable={!busy}
          style={{
            marginTop: 6,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 16,
            fontSize: 15,
            fontWeight: "600",
            color: INK,
            textAlign: "center",
          }}
        />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 20 }}>
        <PrimaryButton label={ctaLabel} onPress={submit} busy={busy} />
      </View>
    </SafeAreaView>
  );
}

// ---- little shared primitives ---------------------------------------------

export const topBar = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: 24,
  paddingTop: 8,
  paddingBottom: 4,
};

export function PrimaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: ACCENT,
        borderRadius: 12,
        minHeight: 54,
        paddingHorizontal: 20,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={CANVAS} />
      ) : (
        <>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: CANVAS,
            }}
          >
            {label}
          </Text>
          <Ionicons name="arrow-forward" size={17} color={CANVAS} />
        </>
      )}
    </Pressable>
  );
}

/** Soft turquoise radial glow behind the art. */
export function Glow() {
  return (
    <View style={{ position: "absolute", width: 300, height: 300 }} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="obGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
            <Stop offset="55%" stopColor={ACCENT} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#obGlow)" />
      </Svg>
    </View>
  );
}

function CrewArt() {
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        width: 232,
        justifyContent: "center",
        gap: 14,
      }}
    >
      {CREW.map((c) => (
        <View
          key={c.name}
          style={{
            width: 100,
            alignItems: "center",
            gap: 6,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 14,
            paddingVertical: 12,
          }}
        >
          <Image source={c.gif} style={{ width: 52, height: 52 }} contentFit="contain" />
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: INK }}>{c.name}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const FRESH_STATES = [
  { label: "Fresh", detail: "6 days left", color: GOOD, icon: "leaf", fill: 1 },
  {
    label: "Use soon",
    detail: "2 days left",
    color: WARN,
    icon: "clock-alert-outline",
    fill: 0.55,
  },
  {
    label: "Overdue",
    detail: "expired today",
    color: BAD,
    icon: "alert-circle-outline",
    fill: 0.16,
  },
] as const;

function FreshnessArt() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % FRESH_STATES.length), 1900);
    return () => clearInterval(id);
  }, []);

  const state = FRESH_STATES[step];

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      style={{
        width: 260,
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 16,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${state.color}22`,
          }}
        >
          <MaterialCommunityIcons name={state.icon} size={19} color={state.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: INK }}>Greek yogurt</Text>
          <Text style={{ fontSize: 11.5, color: MUTED }}>Top shelf</Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: `${state.color}1f`,
          }}
        >
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: state.color }}>
            {state.label}
          </Text>
        </View>
      </View>

      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: SURFACE2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: state.color,
            width: `${Math.round(state.fill * 100)}%`,
          }}
        />
      </View>
      <Text style={{ fontSize: 11.5, color: FAINT }}>{state.detail}</Text>
    </Animated.View>
  );
}

function ChatArt() {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ width: 264, gap: 12 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: "88%" }}>
        <View
          style={{
            backgroundColor: ACCENT,
            borderRadius: 16,
            borderBottomRightRadius: 4,
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: CANVAS }}>
            What can I cook tonight?
          </Text>
        </View>
      </View>

      <View style={{ alignSelf: "flex-start", maxWidth: "92%" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Image source={CREW[0].gif} style={{ width: 28, height: 28 }} contentFit="contain" />
          <View
            style={{
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderRadius: 16,
              borderBottomLeftRadius: 4,
              paddingVertical: 10,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontSize: 13, lineHeight: 18, color: INK }}>
              You&apos;ve got eggs, spinach and cheese — a 15-minute frittata uses all
              three before they turn.
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
