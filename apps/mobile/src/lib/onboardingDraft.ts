import * as SecureStore from "expo-secure-store";

// Pre-sign-in onboarding choices, held locally until the user creates an account — then
// hydrateFromOnboarding() replays them to the server and clears this. Per-device,
// best-effort, same pattern as lib/chatQuota.ts. See apps/mobile/ONBOARDING.md.

const KEY = "thatfridge_onboarding_draft_v1";

export type OnboardingDraft = {
  goal?: "waste_less" | "cook_smarter" | "organize" | "save_money";
  wasteFrequency?: "weekly" | "monthly" | "rarely";
  household?: "solo" | "partner" | "household" | "roommates";
  fridgeName?: string;
  reminder?: { cadence: "evening" | "twice_weekly" } | null;
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
    /* best effort — a lost answer just means a plainer first session */
  }
}

export async function clearOnboardingDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* best effort */
  }
}
