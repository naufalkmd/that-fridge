import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  describeError,
  type NotificationEvent,
  type NotificationPrefs,
} from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { registerForPush } from "@/lib/push";

interface NotificationsContextValue {
  events: NotificationEvent[];
  unread: number;
  prefs: NotificationPrefs | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markDone: (id: string, done: boolean) => Promise<void>;
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [evts, p] = await Promise.all([
        api.listNotificationEvents(),
        api.getNotificationPrefs(),
      ]);
      setEvents(evts);
      setPrefs(p);
    } catch (err) {
      setError(describeError(err, "Couldn't load notifications."));
    } finally {
      setLoading(false);
    }
  }, []);

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
    () => ({ events, unread, prefs, loading, error, refresh: load, markDone, togglePref }),
    [events, unread, prefs, loading, error, load, markDone, togglePref],
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
