import * as SecureStore from "expo-secure-store";

// Pre-sign-in onboarding state, held locally until the user creates an account; hydrateOnboarding()
// then creates their fridge and clears it. Per-device, best-effort. See apps/mobile/ONBOARDING.md.
// (The old answers - goal, waste, household, fridge name, reminder - left with their steps.)

const KEY = "thatfridge_onboarding_draft_v1";

export type OnboardingDraft = {
  completedAt?: string;
};

export async function getOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export async function patchOnboardingDraft(
  patch: Partial<OnboardingDraft>,
): Promise<void> {
  try {
    const current = (await getOnboardingDraft()) ?? {};
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    /* best effort */
  }
}

export async function clearOnboardingDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* best effort */
  }
}
