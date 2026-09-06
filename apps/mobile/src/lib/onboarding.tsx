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
const COACH_DISMISSED_KEY = "thatfridge_onboarding_coach_dismissed_v1";

/** Screen rect of the Add (+) tab-bar button, published by the tab bar for the coach spotlight. */
export type Rect = { x: number; y: number; width: number; height: number };

interface OnboardingValue {
  /** Storage reads have completed — routing shouldn't decide before this. */
  ready: boolean;
  /** The intro carousel has been seen (finished or skipped). */
  seen: boolean;
  markSeen: () => Promise<void>;
  /** The "add your first item" coach spotlight was dismissed / satisfied. */
  coachDismissed: boolean;
  dismissCoach: () => Promise<void>;
  /** Where the "+" button is on screen, for the spotlight to draw over. */
  addButtonRect: Rect | null;
  setAddButtonRect: (r: Rect | null) => void;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [addButtonRect, setAddButtonRect] = useState<Rect | null>(null);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(SEEN_KEY).catch(() => null),
      SecureStore.getItemAsync(COACH_DISMISSED_KEY).catch(() => null),
    ])
      .then(([s, d]) => {
        setSeen(s === "1");
        setCoachDismissed(d === "1");
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

  const dismissCoach = useCallback(async () => {
    setCoachDismissed(true);
    try {
      await SecureStore.setItemAsync(COACH_DISMISSED_KEY, "1");
    } catch {
      /* best effort */
    }
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        ready,
        seen,
        markSeen,
        coachDismissed,
        dismissCoach,
        addButtonRect,
        setAddButtonRect,
      }}
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
