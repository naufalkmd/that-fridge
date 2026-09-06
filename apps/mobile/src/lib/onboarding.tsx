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
const CHECKLIST_DISMISSED_KEY = "thatfridge_onboarding_checklist_dismissed_v1";
const CHECKLIST_VISITED_KEY = "thatfridge_onboarding_checklist_visited_v1";

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
  /** The Home "Getting started" checklist card was hidden by the user. */
  checklistDismissed: boolean;
  dismissChecklist: () => Promise<void>;
  /** Ids of checklist steps completed by tapping through (no data signal of their own). */
  checklistVisited: string[];
  markChecklistVisited: (id: string) => Promise<void>;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [addButtonRect, setAddButtonRect] = useState<Rect | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [checklistVisited, setChecklistVisited] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(SEEN_KEY).catch(() => null),
      SecureStore.getItemAsync(COACH_DISMISSED_KEY).catch(() => null),
      SecureStore.getItemAsync(CHECKLIST_DISMISSED_KEY).catch(() => null),
      SecureStore.getItemAsync(CHECKLIST_VISITED_KEY).catch(() => null),
    ])
      .then(([s, d, cd, cv]) => {
        setSeen(s === "1");
        setCoachDismissed(d === "1");
        setChecklistDismissed(cd === "1");
        setChecklistVisited(cv ? cv.split(",").filter(Boolean) : []);
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

  const dismissChecklist = useCallback(async () => {
    setChecklistDismissed(true);
    try {
      await SecureStore.setItemAsync(CHECKLIST_DISMISSED_KEY, "1");
    } catch {
      /* best effort */
    }
  }, []);

  const markChecklistVisited = useCallback(async (id: string) => {
    let next: string[] = [];
    setChecklistVisited((prev) => {
      next = prev.includes(id) ? prev : [...prev, id];
      return next;
    });
    try {
      await SecureStore.setItemAsync(CHECKLIST_VISITED_KEY, next.join(","));
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
        checklistDismissed,
        dismissChecklist,
        checklistVisited,
        markChecklistVisited,
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
