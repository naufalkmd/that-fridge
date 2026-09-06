import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";

import { clearOnboardingDraft } from "@/lib/onboardingDraft";

// First-run onboarding is a per-device, local-only flag — same pattern as
// `lib/chatQuota.ts`. Seeing the intro again after a reinstall is acceptable.
// Bump the key suffix if the carousel changes enough to be worth re-showing.
const SEEN_KEY = "thatfridge_onboarding_v1";
const COACH_DISMISSED_KEY = "thatfridge_onboarding_coach_dismissed_v1";
const CHECKLIST_DISMISSED_KEY = "thatfridge_onboarding_checklist_dismissed_v1";
const CHECKLIST_VISITED_KEY = "thatfridge_onboarding_checklist_visited_v1";
const COACH_TOUR_SEEN_KEY = "thatfridge_onboarding_coach_tour_seen_v1";

/** Screen rect of a tab-bar button, published by the tab bar for the coach spotlight. */
export type Rect = { x: number; y: number; width: number; height: number };

/** Tab-bar targets the spotlight tour can point at. "add" is the centre "+" FAB. */
export type CoachTarget = "add" | "home" | "inventory" | "chat" | "eat";

interface OnboardingValue {
  /** Storage reads have completed — routing shouldn't decide before this. */
  ready: boolean;
  /** The intro carousel has been seen (finished or skipped). */
  seen: boolean;
  markSeen: () => Promise<void>;
  /** The coach spotlight tour was dismissed / finished. */
  coachDismissed: boolean;
  dismissCoach: () => Promise<void>;
  /** Measured screen rects of the tab-bar buttons, for the spotlight to draw over. */
  coachRects: Partial<Record<CoachTarget, Rect>>;
  setCoachRect: (target: CoachTarget, r: Rect | null) => void;
  /** The post-first-item "look around" tour has been shown for a session already. */
  coachTourSeen: boolean;
  markCoachTourSeen: () => Promise<void>;
  /** The Home "Getting started" checklist card was hidden by the user. */
  checklistDismissed: boolean;
  dismissChecklist: () => Promise<void>;
  /** Ids of checklist steps completed by tapping through (no data signal of their own). */
  checklistVisited: string[];
  markChecklistVisited: (id: string) => Promise<void>;
  /** Wipe every first-run flag so the carousel, spotlight and checklist all show again. */
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [coachRects, setCoachRects] = useState<Partial<Record<CoachTarget, Rect>>>(
    {},
  );
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [checklistVisited, setChecklistVisited] = useState<string[]>([]);
  const [coachTourSeen, setCoachTourSeen] = useState(false);

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync(SEEN_KEY).catch(() => null),
      SecureStore.getItemAsync(COACH_DISMISSED_KEY).catch(() => null),
      SecureStore.getItemAsync(CHECKLIST_DISMISSED_KEY).catch(() => null),
      SecureStore.getItemAsync(CHECKLIST_VISITED_KEY).catch(() => null),
      SecureStore.getItemAsync(COACH_TOUR_SEEN_KEY).catch(() => null),
    ])
      .then(([s, d, cd, cv, ct]) => {
        setSeen(s === "1");
        setCoachDismissed(d === "1");
        setChecklistDismissed(cd === "1");
        setChecklistVisited(cv ? cv.split(",").filter(Boolean) : []);
        setCoachTourSeen(ct === "1");
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

  const setCoachRect = useCallback((target: CoachTarget, r: Rect | null) => {
    setCoachRects((prev) => {
      if (r === null) {
        if (!(target in prev)) return prev;
        const next = { ...prev };
        delete next[target];
        return next;
      }
      const cur = prev[target];
      if (
        cur &&
        cur.x === r.x &&
        cur.y === r.y &&
        cur.width === r.width &&
        cur.height === r.height
      ) {
        return prev;
      }
      return { ...prev, [target]: r };
    });
  }, []);

  const markCoachTourSeen = useCallback(async () => {
    setCoachTourSeen(true);
    try {
      await SecureStore.setItemAsync(COACH_TOUR_SEEN_KEY, "1");
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

  const resetOnboarding = useCallback(async () => {
    setSeen(false);
    setCoachDismissed(false);
    setChecklistDismissed(false);
    setChecklistVisited([]);
    setCoachTourSeen(false);
    await Promise.all([
      ...[
        SEEN_KEY,
        COACH_DISMISSED_KEY,
        CHECKLIST_DISMISSED_KEY,
        CHECKLIST_VISITED_KEY,
        COACH_TOUR_SEEN_KEY,
      ].map((k) => SecureStore.deleteItemAsync(k).catch(() => {})),
      clearOnboardingDraft(),
    ]);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      seen,
      markSeen,
      coachDismissed,
      dismissCoach,
      coachRects,
      setCoachRect,
      coachTourSeen,
      markCoachTourSeen,
      checklistDismissed,
      dismissChecklist,
      checklistVisited,
      markChecklistVisited,
      resetOnboarding,
    }),
    [
      ready,
      seen,
      markSeen,
      coachDismissed,
      dismissCoach,
      coachRects,
      setCoachRect,
      coachTourSeen,
      markCoachTourSeen,
      checklistDismissed,
      dismissChecklist,
      checklistVisited,
      markChecklistVisited,
      resetOnboarding,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
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
