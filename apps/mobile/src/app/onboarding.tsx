import { useCallback, useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useOnboarding } from "@/lib/onboarding";
import { PixelText } from "@/components/brand";

const CANVAS = "#0a0a0c";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const ACCENT = "#26c6da";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";
const WARN = "#f5a623";
const BAD = "#ff5567";

const CREW = [
  { name: "Chef", gif: require("../../assets/images/thatfridge/chef.gif") },
  { name: "Guardian", gif: require("../../assets/images/thatfridge/guardian.gif") },
  { name: "Organizer", gif: require("../../assets/images/thatfridge/organizer.gif") },
  { name: "Shopkeeper", gif: require("../../assets/images/thatfridge/shopkeeper.gif") },
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

export default function Onboarding() {
  const router = useRouter();
  const { markSeen } = useOnboarding();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const last = index === SLIDES.length - 1;

  const finish = useCallback(
    async (opts?: { thenAdd?: boolean }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await markSeen();
      router.replace("/home");
      if (opts?.thenAdd) setTimeout(() => router.push("/add"), 250);
    },
    [markSeen, router],
  );

  const next = useCallback(() => {
    if (last) {
      void finish({ thenAdd: true });
      return;
    }
    void Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }, [last, finish, index, width]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* header: dots + skip */}
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
            <Dot key={i} active={i === index} />
          ))}
        </View>
        <Pressable onPress={() => finish()} hitSlop={12}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: MUTED }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width, flex: 1, paddingHorizontal: 28 }}>
            {/* art */}
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 220,
              }}
            >
              <Glow />
              {i === index && s.art()}
            </View>

            {/* copy */}
            <View style={{ paddingBottom: 8, gap: 10 }}>
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

      {/* footer button */}
      <View style={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 8, gap: 12 }}>
        <Pressable
          onPress={next}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: ACCENT,
            borderRadius: 12,
            paddingVertical: 16,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: CANVAS,
            }}
          >
            {last ? "Add my first item" : "Next"}
          </Text>
          <Ionicons
            name={last ? "add" : "arrow-forward"}
            size={17}
            color={CANVAS}
          />
        </Pressable>

        <Pressable
          onPress={() => finish()}
          hitSlop={8}
          style={{ alignItems: "center", paddingVertical: 4, opacity: last ? 1 : 0 }}
          disabled={!last}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: FAINT }}>
            I&apos;ll explore on my own
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 22 : 7, { duration: 220 }),
    backgroundColor: withTiming(active ? ACCENT : "rgba(255,255,255,0.18)", {
      duration: 220,
    }),
  }));
  return <Animated.View style={[{ height: 7, borderRadius: 4 }, style]} />;
}

/** Soft turquoise radial glow behind the art. */
function Glow() {
  return (
    <View style={{ position: "absolute", width: 320, height: 320 }} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="g" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
            <Stop offset="55%" stopColor={ACCENT} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
      </Svg>
    </View>
  );
}

// ---- slide 1: the crew ---------------------------------------------------

function CrewArt() {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        width: 232,
        justifyContent: "center",
        gap: 14,
      }}
    >
      {CREW.map((c, i) => (
        <Animated.View
          key={c.name}
          entering={FadeInDown.delay(120 + i * 90).springify().damping(14)}
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
        </Animated.View>
      ))}
    </View>
  );
}

// ---- slide 2: freshness pill cycling through states ---------------------

const FRESH_STATES = [
  { label: "Fresh", detail: "6 days left", color: GOOD, icon: "leaf" },
  { label: "Use soon", detail: "2 days left", color: WARN, icon: "clock-alert-outline" },
  { label: "Overdue", detail: "expired today", color: BAD, icon: "alert-circle-outline" },
] as const;

function FreshnessArt() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % FRESH_STATES.length), 1900);
    return () => clearInterval(id);
  }, []);

  const state = FRESH_STATES[step];
  const barStyle = useAnimatedStyle(() => ({
    width: withTiming(`${100 - step * 42}%`, {
      duration: 550,
      easing: Easing.out(Easing.quad),
    }),
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
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
        <Animated.View
          style={[{ height: 6, borderRadius: 3, backgroundColor: state.color }, barStyle]}
        />
      </View>
      <Text style={{ fontSize: 11.5, color: FAINT }}>{state.detail}</Text>
    </Animated.View>
  );
}

// ---- slide 3: mock chat -----------------------------------------------

function ChatArt() {
  return (
    <View style={{ width: 264, gap: 12 }}>
      <Animated.View
        entering={FadeInDown.delay(120).springify().damping(15)}
        style={{ alignSelf: "flex-end", maxWidth: "88%" }}
      >
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
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(360).springify().damping(15)}
        style={{ alignSelf: "flex-start", maxWidth: "92%" }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Image
            source={CREW[0].gif}
            style={{ width: 28, height: 28 }}
            contentFit="contain"
          />
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
      </Animated.View>
    </View>
  );
}
