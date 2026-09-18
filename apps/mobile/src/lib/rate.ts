import { Linking, Platform } from "react-native";
import * as StoreReview from "expo-store-review";
import * as SecureStore from "expo-secure-store";

// Per-device, local-only throttle on top of the OS's own yearly cap on the in-app prompt —
// same pattern as lib/onboarding.tsx's flags.
const PROMPT_STATE_KEY = "thatfridge_review_prompt_v1";
const MAX_PROMPTS = 3;
const MIN_DAYS_BETWEEN_PROMPTS = 90;

const APP_STORE_ID = "6806239306";
const ANDROID_PACKAGE = "app.thatfridge";

/** Deep link straight into the store's own "write a review" flow — for an explicit, */
/** user-initiated "Rate ThatFridge" row in Settings (not the throttled in-app popup). */
function reviewDeepLink(): string {
  return Platform.OS === "ios"
    ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
    : `market://details?id=${ANDROID_PACKAGE}&showAllReviews=true`;
}

function reviewWebFallback(): string {
  return Platform.OS === "ios"
    ? `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

/** Settings → "Rate ThatFridge": always takes the user to the real store listing. */
export async function openStoreReviewPage() {
  try {
    await Linking.openURL(reviewDeepLink());
  } catch {
    await Linking.openURL(reviewWebFallback()).catch(() => {});
  }
}

interface PromptState {
  count: number;
  lastAt: number;
}

async function readPromptState(): Promise<PromptState> {
  try {
    const raw = await SecureStore.getItemAsync(PROMPT_STATE_KEY);
    if (!raw) return { count: 0, lastAt: 0 };
    const [count, lastAt] = raw.split(",").map(Number);
    return { count: count || 0, lastAt: lastAt || 0 };
  } catch {
    return { count: 0, lastAt: 0 };
  }
}

async function writePromptState(state: PromptState) {
  try {
    await SecureStore.setItemAsync(PROMPT_STATE_KEY, `${state.count},${state.lastAt}`);
  } catch {
    /* best effort */
  }
}

/**
 * Call this from a "delight" moment (marking a recipe made, finishing the Getting Started
 * checklist, etc.) — never from a cold start or an error path. Shows the native star-rating
 * sheet (StoreKit / Play in-app review), gated to a handful of well-spaced attempts so it
 * doesn't nag; the OS enforces its own separate cap on top of this.
 */
export async function maybeRequestReview() {
  const available = await StoreReview.isAvailableAsync().catch(() => false);
  if (!available) return;

  const state = await readPromptState();
  if (state.count >= MAX_PROMPTS) return;

  const now = Date.now();
  const minGapMs = MIN_DAYS_BETWEEN_PROMPTS * 24 * 60 * 60 * 1000;
  if (state.lastAt && now - state.lastAt < minGapMs) return;

  await writePromptState({ count: state.count + 1, lastAt: now });
  await StoreReview.requestReview().catch(() => {});
}
