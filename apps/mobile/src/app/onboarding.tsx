import { useCallback, useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";
import { FAINT, FridgeStep, IntroCarousel } from "@/components/onboarding/shared";

// Post-sign-in fallback for the intro: a reinstall, or "Replay intro & tips". New users
// meet the same carousel + fridge-naming step *before* sign-in in `/welcome`; this route
// only fires when a signed-in user still has `onboarding.seen === false`.

export default function Onboarding() {
  const router = useRouter();
  const { markSeen } = useOnboarding();
  const { fridges, refresh } = useInventory();
  const [phase, setPhase] = useState<"slides" | "fridge">("slides");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    track("onboarding_started");
  }, []);

  const finish = useCallback(
    async (reason: "skip" | "complete", thenAdd = false) => {
      track(reason === "skip" ? "onboarding_skipped" : "onboarding_finished", { phase });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await markSeen();
      router.replace("/home");
      if (thenAdd) setTimeout(() => router.push("/add"), 250);
    },
    [markSeen, router, phase],
  );

  const onCarouselDone = () => {
    // A returning user who already has a fridge skips the naming step.
    if (fridges.length > 0) {
      void finish("complete", true);
    } else {
      track("onboarding_fridge_step_viewed");
      setPhase("fridge");
    }
  };

  if (phase === "fridge") {
    return (
      <FridgeStep
        busy={busy}
        onBack={() => setPhase("slides")}
        onSubmit={async (name) => {
          setBusy(true);
          try {
            await api.createFridge(name);
            await refresh();
            track("onboarding_fridge_created");
          } catch {
            /* the add-item flow will create "My Fridge" if this didn't land */
          }
          void finish("complete", true);
        }}
        onSkip={() => {
          track("onboarding_fridge_skipped");
          void finish("complete", true);
        }}
      />
    );
  }

  return (
    <IntroCarousel
      onFinish={onCarouselDone}
      onSkip={() => finish("skip")}
      onSlideView={(index) => track("onboarding_slide_viewed", { index })}
      footerExtra={
        <Pressable
          onPress={() => finish("skip")}
          hitSlop={8}
          style={{ alignItems: "center", paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: FAINT }}>
            I&apos;ll explore on my own
          </Text>
        </Pressable>
      }
    />
  );
}
