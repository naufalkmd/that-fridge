import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as AppleAuthentication from "expo-apple-authentication";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { OnboardingDraft } from "@/lib/onboardingDraft";

import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { googleAuthAvailable } from "@/lib/google-auth";
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

// Pre-sign-in onboarding (PRE_SIGNUP_ONBOARDING.md Phase 3 + 4). Deliver the "aha" and
// collect a few choices while anonymous; the soft wall does the auth, and
// hydrateFromOnboarding() (fired from lib/auth after the first auth) replays the draft.

type Step =
  | "carousel"
  | "questions"
  | "crew"
  | "demo"
  | "fridge"
  | "reminder"
  | "wall";

type Goal = NonNullable<OnboardingDraft["goal"]>;
type Waste = NonNullable<OnboardingDraft["wasteFrequency"]>;
type Household = NonNullable<OnboardingDraft["household"]>;
type Cadence = "evening" | "twice_weekly";

export default function Welcome() {
  const router = useRouter();
  const { preview: previewParam } = useLocalSearchParams<{ preview?: string }>();
  // Preview mode (Profile → "Preview welcome flow"): walk the screens without writing the
  // draft, marking the intro seen, or touching auth. Every hand-off just closes the flow.
  const preview = previewParam === "1";
  const { markSeen } = useOnboarding();
  const { signInWithApple, signInWithGoogle } = useAuth();

  const [step, setStep] = useState<Step>("carousel");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [waste, setWaste] = useState<Waste | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [fridgeName, setFridgeName] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Cadence | null>(null);

  useEffect(() => {
    track("welcome_started");
  }, []);
  useEffect(() => {
    track("welcome_step_viewed", { step });
  }, [step]);

  // Persist the anonymous choices + mark the intro seen (so the post-sign-in /onboarding
  // route doesn't replay the carousel). Called before every hand-off to auth.
  const commitDraft = useCallback(async () => {
    if (preview) return;
    try {
      await patchOnboardingDraft({
        ...(goal ? { goal } : {}),
        ...(waste ? { wasteFrequency: waste } : {}),
        ...(household ? { household } : {}),
        ...(fridgeName ? { fridgeName } : {}),
        reminder: reminder ? { cadence: reminder } : null,
        completedAt: new Date().toISOString(),
      });
      await markSeen();
    } catch {
      /* best effort — a lost draft just means a plainer first session */
    }
  }, [preview, goal, waste, household, fridgeName, reminder, markSeen]);

  // In preview, all exits just close back to Profile.
  const closePreview = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }, [router]);

  const toSignIn = useCallback(
    async (mode: "login" | "signup") => {
      if (preview) return closePreview();
      track("welcome_to_signin", { mode, has_goal: !!goal, has_fridge: !!fridgeName });
      await commitDraft();
      router.replace(`/sign-in?mode=${mode}`);
    },
    [preview, closePreview, commitDraft, goal, fridgeName, router],
  );

  const social = useCallback(
    async (provider: "apple" | "google") => {
      if (preview) return closePreview();
      track("welcome_social_auth", { provider });
      await commitDraft();
      try {
        await (provider === "apple" ? signInWithApple() : signInWithGoogle());
        router.replace("/home");
      } catch (err) {
        const e = err as { code?: string };
        if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "SIGN_IN_CANCELLED") return;
        // fall back to the full sign-in screen on a real failure
        router.replace("/sign-in?mode=signup");
      }
    },
    [preview, closePreview, commitDraft, signInWithApple, signInWithGoogle, router],
  );

  const haveAccount = () => toSignIn("login");

  const stepView = renderStep();
  return (
    <View style={{ flex: 1 }}>
      {stepView}
      {preview && (
        <Pressable
          onPress={closePreview}
          style={{
            position: "absolute",
            top: 6,
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "rgba(38,198,218,0.16)",
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="eye-outline" size={12} color={ACCENT} />
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: ACCENT }}>
            PREVIEW — tap to exit
          </Text>
        </Pressable>
      )}
    </View>
  );

  function renderStep() {
    if (step === "carousel") {
      return (
        <IntroCarousel
        finishLabel="Continue"
        onFinish={() => setStep("questions")}
        onSkip={() => toSignIn("signup")}
        onSlideView={(index) => track("welcome_slide_viewed", { index })}
        footerExtra={<HaveAccountLink onPress={haveAccount} />}
      />
    );
  }

  if (step === "questions") {
    return (
      <QuestionsStep
        goal={goal}
        waste={waste}
        household={household}
        onGoal={setGoal}
        onWaste={setWaste}
        onHousehold={setHousehold}
        onBack={() => setStep("carousel")}
        onContinue={() => {
          track("welcome_questions_answered", {
            goal,
            waste,
            household,
            answered: [goal, waste, household].filter(Boolean).length,
          });
          setStep("crew");
        }}
        onHaveAccount={haveAccount}
      />
    );
  }

  if (step === "crew") {
    return (
      <CrewStep
        onBack={() => setStep("questions")}
        onContinue={() => setStep("demo")}
        onHaveAccount={haveAccount}
      />
    );
  }

  if (step === "demo") {
    return (
      <DemoStep
        onBack={() => setStep("crew")}
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
        onHaveAccount={haveAccount}
        onSubmit={(name) => {
          setFridgeName(name);
          track("welcome_fridge_named");
          setStep("reminder");
        }}
        onSkip={() => setStep("reminder")}
      />
    );
  }

  if (step === "reminder") {
    return (
      <ReminderStep
        value={reminder}
        onChange={setReminder}
        onBack={() => setStep("fridge")}
        onContinue={() => {
          track("welcome_reminder_set", { cadence: reminder });
          setStep("wall");
        }}
        onHaveAccount={haveAccount}
      />
    );
  }

    return (
      <WallStep
        goal={goal}
        fridgeName={fridgeName}
        reminder={reminder}
        onEmail={() => toSignIn("signup")}
        onHaveAccount={haveAccount}
        onApple={() => social("apple")}
        onGoogle={() => social("google")}
      />
    );
  }
}

// ---- shared bits --------------------------------------------------------

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

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? ACCENT : HAIRLINE,
        backgroundColor: active ? "rgba(38,198,218,0.12)" : SURFACE,
        paddingVertical: 9,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: active ? ACCENT : INK }}>
        {label}
      </Text>
    </Pressable>
  );
}

function QuestionBlock({
  crew,
  question,
  children,
}: {
  crew: string;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Text style={{ fontSize: 10.5, fontWeight: "800", letterSpacing: 0.4, color: ACCENT }}>
        {crew.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 15.5, fontWeight: "700", color: INK }}>{question}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

// ---- step: the 3 questions ---------------------------------------------

const GOALS: { key: Goal; label: string }[] = [
  { key: "waste_less", label: "Stop wasting food" },
  { key: "cook_smarter", label: "Cook what I have" },
  { key: "organize", label: "Stay organized" },
  { key: "save_money", label: "Save money" },
];
const WASTE: { key: Waste; label: string }[] = [
  { key: "weekly", label: "Every week" },
  { key: "monthly", label: "A few times a month" },
  { key: "rarely", label: "Rarely" },
];
const HOUSEHOLD: { key: Household; label: string }[] = [
  { key: "solo", label: "Just me" },
  { key: "partner", label: "Me + partner" },
  { key: "household", label: "Whole household" },
  { key: "roommates", label: "Roommates" },
];

function QuestionsStep({
  goal,
  waste,
  household,
  onGoal,
  onWaste,
  onHousehold,
  onBack,
  onContinue,
  onHaveAccount,
}: {
  goal: Goal | null;
  waste: Waste | null;
  household: Household | null;
  onGoal: (g: Goal) => void;
  onWaste: (w: Waste) => void;
  onHousehold: (h: Household) => void;
  onBack: () => void;
  onContinue: () => void;
  onHaveAccount: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <BackBar onBack={onBack} onHaveAccount={onHaveAccount} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 10, paddingBottom: 20, gap: 20 }}
      >
        <View style={{ gap: 6 }}>
          <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>
            A FEW QUICK THINGS
          </PixelText>
          <Text
            style={{ fontSize: 25, lineHeight: 31, fontWeight: "800", color: INK, letterSpacing: -0.3 }}
          >
            Help the crew help you
          </Text>
          <Text style={{ fontSize: 13, color: FAINT }}>Tap what fits. Nothing&apos;s required.</Text>
        </View>

        <QuestionBlock crew="Shopkeeper" question="What brings you here?">
          {GOALS.map((g) => (
            <Chip key={g.key} label={g.label} active={goal === g.key} onPress={() => onGoal(g.key)} />
          ))}
        </QuestionBlock>

        <QuestionBlock crew="Guardian" question="How often does food get thrown out?">
          {WASTE.map((w) => (
            <Chip key={w.key} label={w.label} active={waste === w.key} onPress={() => onWaste(w.key)} />
          ))}
        </QuestionBlock>

        <QuestionBlock crew="Organizer" question="Who's this fridge for?">
          {HOUSEHOLD.map((h) => (
            <Chip
              key={h.key}
              label={h.label}
              active={household === h.key}
              onPress={() => onHousehold(h.key)}
            />
          ))}
        </QuestionBlock>
      </ScrollView>

      <View style={{ paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 }}>
        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

// ---- step: meet the crew ---------------------------------------------

const CREW_LINES = [
  "I turn what's about to go off into tonight's dinner.",
  "I flag food before it spoils — and what's risky to keep.",
  "I say what belongs in the fridge, freezer or pantry.",
  "I keep a running list of what you're running low on.",
];

function CrewStep({
  onBack,
  onContinue,
  onHaveAccount,
}: {
  onBack: () => void;
  onContinue: () => void;
  onHaveAccount: () => void;
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <BackBar onBack={onBack} onHaveAccount={onHaveAccount} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 10, paddingBottom: 20, gap: 12 }}
      >
        <View style={{ gap: 6 }}>
          <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>MEET THE CREW</PixelText>
          <Text
            style={{ fontSize: 25, lineHeight: 31, fontWeight: "800", color: INK, letterSpacing: -0.3 }}
          >
            Four of them, one job each
          </Text>
          <Text style={{ fontSize: 13, color: FAINT }}>Tap a card to hear what they do.</Text>
        </View>

        {CREW.map((c, i) => {
          const isOpen = open === i;
          return (
            <Pressable
              key={c.name}
              onPress={() => setOpen(isOpen ? null : i)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 13,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isOpen ? ACCENT : HAIRLINE,
                backgroundColor: isOpen ? "rgba(38,198,218,0.08)" : SURFACE,
                padding: 13,
              }}
            >
              <Image source={c.gif} style={{ width: 42, height: 42 }} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "800", color: INK }}>{c.name}</Text>
                <Text
                  style={{ fontSize: 12.5, lineHeight: 17, color: isOpen ? MUTED : FAINT, marginTop: 2 }}
                  numberOfLines={isOpen ? undefined : 1}
                >
                  {CREW_LINES[i]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 }}>
        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

// ---- step: the first-win demo --------------------------------------

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
        <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>HERE&apos;S THE IDEA</PixelText>
        <Text
          style={{ fontSize: 25, lineHeight: 31, fontWeight: "800", color: INK, letterSpacing: -0.3 }}
        >
          Say this is your fridge
        </Text>

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

        <DemoBubble
          gif={CREW[0].gif}
          name="Chef"
          text="A 15-minute frittata clears the eggs and spinach, and the Greek yogurt makes a quick herb sauce on the side."
        />
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

// ---- step: set your intention (reminder) ---------------------------

const CADENCES: { key: Cadence | "off"; label: string; sub: string }[] = [
  { key: "evening", label: "Every evening", sub: "A quick glance before dinner" },
  { key: "twice_weekly", label: "A couple of times a week", sub: "Wednesday and Sunday" },
  { key: "off", label: "No reminders", sub: "I'll check on my own" },
];

function ReminderStep({
  value,
  onChange,
  onBack,
  onContinue,
  onHaveAccount,
}: {
  value: Cadence | null;
  onChange: (c: Cadence | null) => void;
  onBack: () => void;
  onContinue: () => void;
  onHaveAccount: () => void;
}) {
  const current = value ?? "off";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <BackBar onBack={onBack} onHaveAccount={onHaveAccount} />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 26, gap: 12 }}>
        <PixelText style={{ fontSize: 11, letterSpacing: 1, color: ACCENT }}>ONE LAST THING</PixelText>
        <Text
          style={{ fontSize: 25, lineHeight: 31, fontWeight: "800", color: INK, letterSpacing: -0.3 }}
        >
          Want a nudge to check in?
        </Text>
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: MUTED, marginBottom: 6 }}>
          A gentle reminder to look before things go bad. Change it any time in settings.
        </Text>

        {CADENCES.map((c) => {
          const active = current === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => onChange(c.key === "off" ? null : c.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: active ? ACCENT : HAIRLINE,
                backgroundColor: active ? "rgba(38,198,218,0.10)" : SURFACE,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "700", color: INK }}>{c.label}</Text>
                <Text style={{ fontSize: 12, color: FAINT, marginTop: 1 }}>{c.sub}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={18} color={ACCENT} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 }}>
        <PrimaryButton label="Continue" onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

// ---- step: the soft wall (with inline auth) -----------------------

function WallStep({
  goal,
  fridgeName,
  reminder,
  onEmail,
  onHaveAccount,
  onApple,
  onGoogle,
}: {
  goal: Goal | null;
  fridgeName: string | null;
  reminder: Cadence | null;
  onEmail: () => void;
  onHaveAccount: () => void;
  onApple: () => void;
  onGoogle: () => void;
}) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = (fn: () => void) => {
    if (busy) return;
    setBusy(true);
    fn();
  };

  const done = [
    goal ? "Goal set" : "Your crew is ready",
    fridgeName ? `Fridge "${fridgeName}" ready` : "Fridge ready",
    reminder ? "Check-in reminder on" : "Everything's set up",
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 20, gap: 16 }}>
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
          Save your fridge &amp; crew
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
            <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <Ionicons name="checkmark-circle" size={16} color={GOOD} />
              <Text style={{ fontSize: 13, color: INK }}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={{ height: 50, width: "100%" }}
              onPress={() => run(onApple)}
            />
          )}
          {!!googleAuthAvailable && (
            <Pressable
              onPress={() => run(onGoogle)}
              disabled={busy}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                borderRadius: 12,
                backgroundColor: "#fff",
                height: 50,
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Ionicons name="logo-google" size={18} color="#0a0a0c" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#0a0a0c" }}>
                Continue with Google
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => run(onEmail)}
            disabled={busy}
            style={{
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: HAIRLINE,
              height: 50,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>Sign up with email</Text>
          </Pressable>
        </View>

        <Pressable onPress={onHaveAccount} hitSlop={8} style={{ alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: FAINT }}>
            I already have an account
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
