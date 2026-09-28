import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

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
  CrewArt,
  FAINT,
  GOOD,
  Glow,
  HAIRLINE,
  INK,
  MUTED,
  PrimaryButton,
  SURFACE,
} from "@/components/onboarding/shared";

// Pre-sign-in onboarding (see apps/mobile/ONBOARDING.md): one welcome screen, then the soft wall
// does the auth. The real first win comes straight after sign-in - FirstScanGate opens
// "Let's fill your fridge" (/first-scan) for an empty fridge. The old questions, crew select,
// mock demo, fridge naming and reminder steps are gone: they delayed the first real item
// (the fridge is named "My Fridge", the reminder is offered after the first scan).

type Step = "hello" | "wall";

export default function Welcome() {
  const router = useRouter();
  const { preview: previewParam } = useLocalSearchParams<{ preview?: string }>();
  // Preview mode (Profile → "Preview welcome flow"): walk the screens without writing the
  // draft, marking the intro seen, or touching auth. Every hand-off just closes the flow.
  const preview = previewParam === "1";
  const { markSeen } = useOnboarding();
  const { signInWithApple, signInWithGoogle } = useAuth();

  const [step, setStep] = useState<Step>("hello");

  useEffect(() => {
    track("welcome_started");
  }, []);
  useEffect(() => {
    track("welcome_step_viewed", { step });
  }, [step]);

  // Mark the intro seen (so the post-sign-in /onboarding route doesn't replay it). Called before
  // every hand-off to auth.
  const commitDraft = useCallback(async () => {
    if (preview) return;
    try {
      await patchOnboardingDraft({ reminder: null, completedAt: new Date().toISOString() });
      await markSeen();
    } catch {
      /* best effort */
    }
  }, [preview, markSeen]);

  // In preview, all exits just close back to Profile.
  const closePreview = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }, [router]);

  const toSignIn = useCallback(
    async (mode: "login" | "signup") => {
      if (preview) return closePreview();
      track("welcome_to_signin", { mode });
      await commitDraft();
      router.replace(`/sign-in?mode=${mode}`);
    },
    [preview, closePreview, commitDraft, router],
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

  return (
    <View style={{ flex: 1 }}>
      {step === "hello" ? (
        <HelloStep onContinue={() => setStep("wall")} onHaveAccount={haveAccount} />
      ) : (
        <WallStep
          onBack={() => setStep("hello")}
          onEmail={() => toSignIn("signup")}
          onHaveAccount={haveAccount}
          onApple={() => social("apple")}
          onGoogle={() => social("google")}
        />
      )}
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
            borderCurve: "continuous", borderRadius: 8,
            paddingVertical: 4,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="eye-outline" size={12} color={ACCENT} />
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: ACCENT }}>
            PREVIEW — tap to exit
          </Text>
        </Pressable>
      )}
    </View>
  );
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

// ---- step: welcome (the crew + what the app does) ------------------------

const VALUE: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }[] = [
  { icon: "camera-outline", text: "Snap your fridge, a receipt or a barcode, and it fills itself in" },
  { icon: "bell-ring-outline", text: "A nudge a few days before food goes bad" },
  { icon: "chef-hat", text: "Your crew plans what to cook and what to buy" },
];

function HelloStep({ onContinue, onHaveAccount }: { onContinue: () => void; onHaveAccount: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 12, paddingBottom: 20, gap: 18 }}>
        <View style={{ height: 248, justifyContent: "center" }}>
          <CrewArt />
        </View>
        <Animated.View entering={FadeInDown.delay(150).duration(450)} style={{ gap: 8 }}>
          <PixelText style={{ fontSize: 11, color: ACCENT }}>THATFRIDGE</PixelText>
          <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: "700", color: INK, letterSpacing: -0.3 }}>
            Use what you have{"\n"}before it goes bad
          </Text>
        </Animated.View>
        <View style={{ gap: 12 }}>
          {VALUE.map((v, i) => (
            <Animated.View
              key={v.text}
              entering={FadeInUp.delay(350 + i * 120).duration(400)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIRLINE }}>
                <MaterialCommunityIcons name={v.icon} size={18} color={ACCENT} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: MUTED }}>{v.text}</Text>
            </Animated.View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Animated.View entering={FadeInUp.delay(700).duration(400)} style={{ gap: 12 }}>
          <PrimaryButton label="Get started" onPress={onContinue} />
          <HaveAccountLink onPress={onHaveAccount} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- step: the soft wall (with inline auth) -----------------------

function WallStep({
  onBack,
  onEmail,
  onHaveAccount,
  onApple,
  onGoogle,
}: {
  onBack: () => void;
  onEmail: () => void;
  onHaveAccount: () => void;
  onApple: () => void;
  onGoogle: () => void;
}) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = (fn: () => void | Promise<void>) => {
    if (busy) return;
    if (!consent) {
      setHint("Please tick the box above to continue.");
      return;
    }
    setBusy(true);
    // Reset if the provider sheet is cancelled; on success the screen has already navigated away.
    Promise.resolve(fn()).finally(() => setBusy(false));
  };

  const done = ["Your crew is ready", "Next: scan what's in your fridge", "Reminders before food goes bad"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CANVAS }}>
      <Pressable onPress={onBack} hitSlop={12} style={{ position: "absolute", top: 52, left: 20, zIndex: 2 }} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={20} color={MUTED} />
      </Pressable>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 20, gap: 16 }}>
        <View style={{ alignItems: "center" }}>
          <Glow />
          <View
            style={{
              width: 68,
              height: 68,
              borderCurve: "continuous", borderRadius: 16,
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
            fontWeight: "700",
            color: INK,
            textAlign: "center",
            letterSpacing: -0.3,
          }}
        >
          Save your kitchen
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED, textAlign: "center" }}>
          Create an account, then scan what you have. It takes about a minute.
        </Text>

        <View
          style={{
            borderCurve: "continuous", borderRadius: 16,
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

        <Pressable
          onPress={() => {
            setConsent((v) => !v);
            setHint(null);
          }}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, paddingHorizontal: 2 }}
        >
          <Ionicons
            name={consent ? "checkbox" : "square-outline"}
            size={18}
            color={consent ? ACCENT : MUTED}
            style={{ marginTop: 1 }}
          />
          <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, color: FAINT }}>
            I agree to the{" "}
            <Text
              style={{ fontWeight: "700", color: MUTED }}
              onPress={() => Linking.openURL("https://thatfridge.com/terms")}
            >
              Terms
            </Text>{" "}
            &amp;{" "}
            <Text
              style={{ fontWeight: "700", color: MUTED }}
              onPress={() => Linking.openURL("https://thatfridge.com/privacy")}
            >
              Privacy Policy
            </Text>
            , and consent to my data (including chat and photos) being processed outside my
            country — on servers in Singapore and the United States — for AI features.
          </Text>
        </Pressable>
        {hint && (
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: BAD, paddingHorizontal: 2 }}>
            {hint}
          </Text>
        )}

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
                borderCurve: "continuous", borderRadius: 12,
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
            onPress={() => {
              // The email sign-up screen has its own consent checkbox — don't make them tick twice.
              if (busy) return;
              setBusy(true);
              onEmail();
            }}
            disabled={busy}
            style={{
              alignItems: "center",
              justifyContent: "center",
              borderCurve: "continuous", borderRadius: 12,
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
