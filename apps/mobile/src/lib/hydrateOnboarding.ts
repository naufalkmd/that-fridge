import type { Fridge } from "@thatfridge/core";

import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { clearOnboardingDraft, getOnboardingDraft } from "@/lib/onboardingDraft";

// Runs once after the first successful auth that followed /welcome: makes sure the account has a
// fridge. See apps/mobile/ONBOARDING.md. Best-effort - a failure logs a beacon and moves on;
// "Let's fill your fridge" and the Home "Getting started" card are the backstop.

/**
 * Return the user's first fridge, creating "My Fridge" if they have none. Always checks the server
 * first, so the two callers (hydrateOnboarding right after auth, and inventory's ensureFridgeId on
 * first-item-add) can never both create one. Clears the draft once a fridge is confirmed.
 */
export async function ensureOnboardingFridge(): Promise<Fridge | null> {
  try {
    const existing = await api.listFridges();
    if (existing.length > 0) {
      await clearOnboardingDraft();
      return existing[0];
    }
    const fridge = await api.createFridge("My Fridge");
    await clearOnboardingDraft();
    return fridge;
  } catch {
    return null; // leave the draft — ensureFridgeId will retry on first item add
  }
}

export async function hydrateOnboarding(): Promise<void> {
  const draft = await getOnboardingDraft();
  if (!draft) return;
  const fridge = await ensureOnboardingFridge();
  track("onboarding_hydrated", { failures: fridge ? null : ["fridge"] });
}
