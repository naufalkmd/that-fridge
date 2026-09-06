import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { OnboardingGoal } from "@thatfridge/core";

import { track } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { patchOnboardingDraft } from "@/lib/onboardingDraft";
import { PixelText } from "@/components/brand";
import {
  ACCENT,
  BAD,
  CANVAS,
  CREW,
  FAINT,
  FridgeStep,
  GOOD,
  Glow,
  HAIRLINE,
  INK,
  IntroCarousel,
  MUTED,
  PrimaryButton,
  SURFACE,
  SURFACE2,
  WARN,
  topBar,
} from "@/components/onboarding/shared";

// Pre-sign-in onboarding (PRE_SIGNUP_ONBOARDING.md Phase 3). Deliver the "aha" and collect
// a couple of choices while anonymous; the soft wall hands off to /sign-in, and
// hydrateFromOnboarding() (fired from lib/auth after the first auth) replays the draft.

type Step = "carousel" | "goal" | "demo" | "fridge" | "wall";

export default function Welcome() {
  const router = useRouter();
  const { markSeen } = useOnboarding();
  const [step, setStep] = useState<Step>("carousel");
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [fridgeName, setFridgeName] = useState<string | null>(null);

  useEffect(() => {
    track("welcome_started");
  }, []);
  useEffect(() => {
    track("welcome_step_viewed", { step });
  }, [step]);

  // Persist the anonymous choices + mark the intro seen so the post-sign-in /onboarding
  // route doesn't replay the carousel. Then hand off to the auth screen.
  const toSignIn = useCallback(
    async (mode: "login" | "signup") => {
      track("welcome_to_signin", { mode, has_goal: !!goal, has_fridge: !!fridgeName });
      try {
        await patchOnboardingDraft({
          ...(goal ? { goal } : {}),
          ...(fridgeName ? { fridgeName } : {}),
          completedAt: new Date().toISOString(),
        });
        await markSeen();
      } catch {
        /* best effort — a lost draft just means a plainer first session */
      }
      router.replace(`/sign-in?mode=${mode}`);
    },
    [goal, fridgeName, markSeen, router],
  );

  const haveAccount = () => toSignIn("login");

  if (step === "carousel") {
    return (
      <IntroCarousel
        finishLabel="Continue"
        onFinish={() => setStep("goal")}
        onSkip={() => toSignIn("signup")}
        onSlideView={(index) => track("welcome_slide_viewed", { index })}
        footerExtra={<HaveAccountLink onPress={haveAccount} />}
      />
    );
  }

  if (step === "goal") {
    return (
      <GoalStep
        value={goal}
        onChange={(g) => {
          setGoal(g);
          track("welcome_goal_picked", { goal: g });
        }}
        onBack={() => setStep("carousel")}
        onContinue={() => setStep("demo")}
        onHaveAccount={haveAccount}
      />
    );
  }

  if (step === "demo") {
    return (
      <DemoStep
        onBack={() => setStep("goal")}
        onContinue={() => {
          track("welcome_demo_win_tapped");
          setStep("fridge");
        }}
        onHaveAccount={haveAccount}
      />
    );
  }

  if (step === "fridge") {
    return (
      <FridgeStep
        ctaLabel="Continue"
        onBack={() => setStep("demo")}
        onSubmit={(name) => {
          setFridgeName(name);
          track("welcome_fridge_named");
          setStep("wall");
        }}
        onSkip={() => setStep("wall")}
      />
    );
  }

  return (
    <WallStep
      goal={goal}
      fridgeName={fridgeName}
      onCreate={() => toSignIn("signup")}
      onHaveAccount={haveAccount}
    />
  );
}

// ---- "I already have an account" -----------------------------------------

function HaveAccountLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: FAINT }}>
        I already have an account
      </Text>
    </Pressable>
  );
}

function BackBar({ onBack, onHaveAccount }: { onBack: () => void; onHaveAccount: () => void }) {
  return (
    <View style={topBar}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Ionicons name="arrow-back" size={20} color={MUTED} />
      </Pressable>
      <Pressable onPress={onHaveAccount} hitSlop={12}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: MUTED }}>Log in</Text>
      </Pressable>
    </View>
  );
}

// ---- step: "what brings you here?" ---------------------------------------

const GOALS: {
  key: OnboardingGoal;
  label: string;
  sub: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { key: "waste_less", label: "Stop wasting food", sub: "Fewer things forgotten at the back", icon: "leaf" },
  { key: "cook_smarter", label: "Cook what I already have", sub: "Ideas from your actual fridge", icon: "silverware-fork-knife" },
  { key: "organize", label: "Keep the kitchen organized", sub: "Know what's where, and what's low", icon: "sync" },
  { key: "save_money", label: "Save money on groceries", sub: "Buy less, throw out less", icon: "cash" },
];

function GoalStep({
  value,
  onChange,
  onBack,
  onContinue,
  onHaveAccount,
}: {
  value: OnboardingGoal | null;
  onChange: (g: OnboardingGoal) => void;
  onBack: () => void;
  onContinue: () => void;
  onHaveAccount: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <BackBar onBack={onBack} onHaveAccount={onHaveAccount} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 12, paddingBottom: 20, gap: 12 }}
      >
        <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>
          ONE QUICK THING
        </PixelText>
        <Text
          style={{
            fontSize: 27,
            lineHeight: 33,
            fontWeight: "800",
            color: INK,
            letterSpacing: -0.3,
          }}
        >
          What brings you here?
        </Text>
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: MUTED, marginBottom: 6 }}>
          The crew leans into this. Pick one — you can change it later.
        </Text>

        {GOALS.map((g) => {
          const active = value === g.key;
          return (
            <Pressable
              key={g.key}
              onPress={() => onChange(g.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 13,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: active ? ACCENT : HAIRLINE,
                backgroundColor: active ? "rgba(38,198,218,0.10)" : SURFACE,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <MaterialCommunityIcons
                name={g.icon}
                size={20}
                color={active ? ACCENT : MUTED}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "700", color: INK }}>{g.label}</Text>
                <Text style={{ fontSize: 12, color: FAINT, marginTop: 1 }}>{g.sub}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={18} color={ACCENT} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 28, paddingTop: 8, paddingBottom: 20, gap: 10 }}>
        <PrimaryButton label="Continue" onPress={onContinue} />
        <Pressable onPress={onContinue} hitSlop={8} style={{ alignItems: "center", paddingVertical: 2 }}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: FAINT }}>Skip</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ---- step: the first-win demo (mock fridge → Chef → Guardian) -----------

const DEMO_ITEMS = [
  { name: "Eggs", where: "Door shelf", color: GOOD, days: "5 days" },
  { name: "Spinach", where: "Crisper", color: WARN, days: "2 days" },
  { name: "Greek yogurt", where: "Top shelf", color: BAD, days: "gone tomorrow" },
];

function DemoStep({
  onBack,
  onContinue,
  onHaveAccount,
}: {
  onBack: () => void;
  onContinue: () => void;
  onHaveAccount: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <BackBar onBack={onBack} onHaveAccount={onHaveAccount} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 20, gap: 14 }}
      >
        <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>
          HERE&apos;S THE IDEA
        </PixelText>
        <Text
          style={{ fontSize: 25, lineHeight: 31, fontWeight: "800", color: INK, letterSpacing: -0.3 }}
        >
          Say this is your fridge
        </Text>

        {/* mock fridge */}
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE,
            overflow: "hidden",
          }}
        >
          {DEMO_ITEMS.map((it, i) => (
            <View
              key={it.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderBottomWidth: i === DEMO_ITEMS.length - 1 ? 0 : 1,
                borderBottomColor: HAIRLINE,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{it.name}</Text>
                <Text style={{ fontSize: 11, color: FAINT }}>{it.where}</Text>
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: it.color }}>{it.days}</Text>
            </View>
          ))}
        </View>

        {/* Chef */}
        <DemoBubble
          gif={CREW[0].gif}
          name="Chef"
          text="A 15-minute frittata clears the eggs and spinach, and the Greek yogurt makes a quick herb sauce on the side."
        />
        {/* Guardian */}
        <DemoBubble
          gif={CREW[1].gif}
          name="Guardian"
          text="Use the Greek yogurt today. The spinach has two days — the eggs are fine all week."
        />
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 }}>
        <PrimaryButton label="Nice — let's set up mine" onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

function DemoBubble({ gif, name, text }: { gif: number; name: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Image source={gif} style={{ width: 30, height: 30 }} contentFit="contain" />
      <View
        style={{
          flex: 1,
          backgroundColor: SURFACE2,
          borderWidth: 1,
          borderColor: HAIRLINE,
          borderRadius: 14,
          borderTopLeftRadius: 4,
          padding: 12,
          gap: 3,
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3, color: ACCENT }}>
          {name.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: INK }}>{text}</Text>
      </View>
    </View>
  );
}

// ---- step: the soft wall -------------------------------------------------

function WallStep({
  goal,
  fridgeName,
  onCreate,
  onHaveAccount,
}: {
  goal: OnboardingGoal | null;
  fridgeName: string | null;
  onCreate: () => void;
  onHaveAccount: () => void;
}) {
  const done = [
    { label: goal ? "Goal set" : "Crew ready", ok: true },
    { label: fridgeName ? `Fridge "${fridgeName}" ready` : "Fridge ready", ok: true },
    { label: "Your crew is on standby", ok: true },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 16 }}>
        <View style={{ alignItems: "center" }}>
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
            <MaterialCommunityIcons name="content-save-check-outline" size={32} color={ACCENT} />
          </View>
        </View>

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
          Save your setup
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED, textAlign: "center" }}>
          Create an account so your fridge, your crew and your progress are there next time.
        </Text>

        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE,
            padding: 14,
            gap: 10,
          }}
        >
          {done.map((d) => (
            <View key={d.label} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <Ionicons name="checkmark-circle" size={16} color={GOOD} />
              <Text style={{ fontSize: 13, color: INK }}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 22, gap: 12 }}>
        <PrimaryButton label="Create account" onPress={onCreate} />
        <Pressable onPress={onHaveAccount} hitSlop={8} style={{ alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: FAINT }}>
            I already have an account
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
