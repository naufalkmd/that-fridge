import type { Fridge, OnboardingPrefs } from "@thatfridge/core";

import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { clearOnboardingDraft, getOnboardingDraft } from "@/lib/onboardingDraft";

// Replays the pre-sign-in onboarding draft to the server after the first successful auth.
// See PRE_SIGNUP_ONBOARDING.md. Best-effort throughout — a failure logs a beacon and moves
// on; the Home "Getting started" checklist is the backstop.

/**
 * Create the user's first fridge with the name they chose in onboarding — or return an
 * existing one. Always checks the server first, so the two callers (hydrateOnboarding
 * right after auth, and inventory's ensureFridgeId on first-item-add) can never both
 * create one. Clears the draft once a fridge is confirmed.
 */
export async function ensureOnboardingFridge(): Promise<Fridge | null> {
  try {
    const existing = await api.listFridges();
    if (existing.length > 0) {
      await clearOnboardingDraft();
      return existing[0];
    }
    const draft = await getOnboardingDraft();
    const fridge = await api.createFridge(draft?.fridgeName?.trim() || "My Fridge");
    await clearOnboardingDraft();
    return fridge;
  } catch {
    return null; // leave the draft — ensureFridgeId will retry on first item add
  }
}

export async function hydrateOnboarding(): Promise<void> {
  const draft = await getOnboardingDraft();
  if (!draft) return;

  const failures: string[] = [];

  // 1. Preference tags (kept as tags — no concrete UserGoal is seeded, decision §10.4).
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

  // 2. First fridge (server-checked, so it can't collide with ensureFridgeId).
  if (!(await ensureOnboardingFridge())) failures.push("fridge");

  // 3. Reminder — the draft records the intent; scheduling + the permission prompt land
  //    in Phase 4 (they need the notification-scheduling helper and careful timing).

  track("onboarding_hydrated", {
    named_fridge: !!draft.fridgeName,
    goal: draft.goal ?? null,
    failures: failures.length ? failures : null,
  });
}
