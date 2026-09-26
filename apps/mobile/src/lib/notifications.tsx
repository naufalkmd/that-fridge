import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  describeError,
  type NotificationEvent,
  type NotificationPrefs,
} from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useStaleCache } from "@/lib/useStaleCache";
import { registerForPush } from "@/lib/push";

// How long a swiped-away notification stays undoable before the delete actually commits to
// the server - long enough to catch an accidental swipe, short enough not to feel stuck.
const UNDO_MS = 4000;

interface NotificationsContextValue {
  events: NotificationEvent[];
  unread: number;
  prefs: NotificationPrefs | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markDone: (id: string, done: boolean) => Promise<void>;
  /** Hides the event immediately and schedules the real delete after UNDO_MS - call
   *  undoRemove() before it fires to bring the event back and skip the delete entirely. */
  requestRemove: (id: string) => void;
  /** The event most recently hidden by requestRemove, still within its undo window - drives
   *  the undo snackbar. Null once the window has passed or undoRemove was called. */
  pendingRemoval: NotificationEvent | null;
  undoRemove: () => void;
  clearAll: () => Promise<void>;
  togglePref: (key: keyof NotificationPrefs) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cachedValue = useMemo(() => ({ events, prefs }), [events, prefs]);
  const { markFresh } = useStaleCache<{ events: NotificationEvent[]; prefs: NotificationPrefs | null }>("notifications", cachedValue, (cached) => {
    setEvents(cached.events);
    setPrefs(cached.prefs);
    setLoading(false);
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [evts, p] = await Promise.all([
        api.listNotificationEvents(),
        api.getNotificationPrefs(),
      ]);
      markFresh();
      setEvents(evts);
      setPrefs(p);
    } catch (err) {
      setError(describeError(err, "Couldn't load notifications."));
    } finally {
      setLoading(false);
    }
  }, [markFresh]);

  useEffect(() => {
    if (status === "signedIn") {
      setLoading(true);
      load();
      registerForPush();
    } else if (status === "signedOut") {
      setEvents([]);
      setPrefs(null);
      setLoading(false);
    }
  }, [status, load]);

  // Tapping a push (foreground, background, or from a cold start) opens the feed; a push
  // that lands while the app is open just refreshes it.
  useEffect(() => {
    if (status !== "signedIn") return;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) router.push("/notifications");
    });

    const tapSub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push("/notifications");
    });
    const inboxSub = Notifications.addNotificationReceivedListener(() => load());

    return () => {
      tapSub.remove();
      inboxSub.remove();
    };
  }, [status, router, load]);

  const markDone = useCallback(async (id: string, done: boolean) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done } : e)));
    try {
      await api.markNotification(id, done);
    } catch {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, done: !done } : e)));
    }
  }, []);

  const pendingRef = useRef<{ event: NotificationEvent; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<NotificationEvent | null>(null);

  const commitRemoval = useCallback(async (event: NotificationEvent) => {
    try {
      await api.deleteNotificationEvent(event.id);
    } catch {
      // Best-effort - if this fails the event just reappears on the next refresh().
    }
  }, []);

  // Commits whatever's currently pending (if anything) right away, without waiting out its
  // undo window - used both by the window's own timeout and whenever a new swipe needs to
  // supersede an still-undoable one (only one row is undoable at a time).
  const finalizePending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingRemoval(null);
    commitRemoval(pending.event);
  }, [commitRemoval]);

  const requestRemove = useCallback(
    (id: string) => {
      finalizePending();
      const event = events.find((e) => e.id === id);
      if (!event) return;
      setEvents((prev) => prev.filter((e) => e.id !== id));
      const timer = setTimeout(finalizePending, UNDO_MS);
      pendingRef.current = { event, timer };
      setPendingRemoval(event);
    },
    [events, finalizePending],
  );

  const undoRemove = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingRemoval(null);
    setEvents((prev) => [pending.event, ...prev].sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  // Sign-out (or unmount) shouldn't leave a delete timer running against a session that's
  // gone - commit or drop it deterministically instead.
  useEffect(() => {
    if (status === "signedOut") finalizePending();
  }, [status, finalizePending]);
  useEffect(() => () => finalizePending(), [finalizePending]);

  const clearAll = useCallback(async () => {
    // "Clear all" is an explicit, already-confirmed bulk action (see the Alert in
    // notifications.tsx) - it commits straight away rather than joining the undo window.
    finalizePending();
    const snapshot = events;
    setEvents([]);
    try {
      await api.clearNotificationEvents();
    } catch {
      setEvents(snapshot);
    }
  }, [events, finalizePending]);

  const togglePref = useCallback(
    async (key: keyof NotificationPrefs) => {
      if (!prefs) return;
      const next = !prefs[key];
      setPrefs({ ...prefs, [key]: next });
      try {
        setPrefs(await api.updateNotificationPrefs({ [key]: next }));
      } catch {
        setPrefs((p) => (p ? { ...p, [key]: !next } : p));
      }
    },
    [prefs],
  );

  const unread = useMemo(() => events.filter((e) => !e.done).length, [events]);

  const value = useMemo(
    () => ({
      events,
      unread,
      prefs,
      loading,
      error,
      refresh: load,
      markDone,
      requestRemove,
      pendingRemoval,
      undoRemove,
      clearAll,
      togglePref,
    }),
    [
      events,
      unread,
      prefs,
      loading,
      error,
      load,
      markDone,
      requestRemove,
      pendingRemoval,
      undoRemove,
      clearAll,
      togglePref,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationsProvider>");
  return ctx;
}
