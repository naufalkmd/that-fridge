import type { OnboardingPrefs } from "@thatfridge/core";

import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { clearOnboardingDraft, getOnboardingDraft } from "@/lib/onboardingDraft";

// Replays the pre-sign-in onboarding draft to the server, exactly once, right after the
// first successful auth. Every step is independent and best-effort — a failure logs a
// beacon and moves on; the Home "Getting started" checklist is the backstop for anything
// that didn't land. Safe to call on every sign-in: a no-op when there's no draft.
//
// Wired into the auth flow but currently inert — no screen writes a draft until the
// pre-sign-in flow ships (PRE_SIGNUP_ONBOARDING.md Phase 3).

export async function hydrateOnboarding(): Promise<void> {
  const draft = await getOnboardingDraft();
  if (!draft) return;

  const failures: string[] = [];

  // 1. Fridge — only if the account has none (a returning user keeps theirs).
  if (draft.fridgeName) {
    try {
      const fridges = await api.listFridges();
      if (fridges.length === 0) {
        await api.createFridge(draft.fridgeName.trim() || "My Fridge");
      }
    } catch {
      failures.push("fridge");
    }
  }

  // 2. Preference tags (kept as tags — no concrete UserGoal is seeded, see decision §10.4).
  const prefs: OnboardingPrefs = {};
  if (draft.goal) prefs.goal = draft.goal;
  if (draft.wasteFrequency) prefs.waste_frequency = draft.wasteFrequency;
  if (draft.household) prefs.household = draft.household;
  if (Object.keys(prefs).length > 0) {
    try {
      await api.saveOnboardingProfile(prefs);
    } catch {
      failures.push("preferences");
    }
  }

  // 3. Reminder — the draft records the intent; scheduling + the permission prompt are
  //    wired in Phase 4 (they need the notification-scheduling helper and careful timing).

  await clearOnboardingDraft();
  track("onboarding_hydrated", {
    named_fridge: !!draft.fridgeName,
    goal: draft.goal ?? null,
    failures: failures.length ? failures : null,
  });
}
