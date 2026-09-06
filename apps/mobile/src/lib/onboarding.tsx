import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

// First-run onboarding is a per-device, local-only flag — same pattern as
// `lib/chatQuota.ts`. Seeing the intro again after a reinstall is acceptable.
// Bump the key suffix if the carousel changes enough to be worth re-showing.
const SEEN_KEY = "thatfridge_onboarding_v1";
const CHECKLIST_DISMISSED_KEY = "thatfridge_onboarding_checklist_dismissed_v1";

interface OnboardingValue {
  /** Storage reads have completed — routing shouldn't decide before this. */
  ready: boolean;
  /** The intro carousel has been seen (finished or skipped). */
  seen: boolean;
  markSeen: () => Promise<void>;
  /** The Home first-run checklist card was dismissed. */
  checklistDismissed: boolean;
  dismissChecklist: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(SEEN_KEY).catch(() => null),
      SecureStore.getItemAsync(CHECKLIST_DISMISSED_KEY).catch(() => null),
    ])
      .then(([s, d]) => {
        setSeen(s === "1");
        setChecklistDismissed(d === "1");
      })
      .finally(() => setReady(true));
  }, []);

  const markSeen = useCallback(async () => {
    setSeen(true);
    try {
      await SecureStore.setItemAsync(SEEN_KEY, "1");
    } catch {
      /* best effort — worst case they see it once more */
    }
  }, []);

  const dismissChecklist = useCallback(async () => {
    setChecklistDismissed(true);
    try {
      await SecureStore.setItemAsync(CHECKLIST_DISMISSED_KEY, "1");
    } catch {
      /* best effort */
    }
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ ready, seen, markSeen, checklistDismissed, dismissChecklist }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return value;
}
