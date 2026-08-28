import * as Notifications from "expo-notifications";
import type { FlatItem } from "@thatfridge/core";

// Local, on-device expiry reminders (v1 — no server push; see TO_DO.md).
// Best-effort: any failure (Expo Go quirks, denied permission) is swallowed — the in-app
// feed is the source of truth, these are just a nudge.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const REMIND_WITHIN_DAYS = 3;
const REMIND_HOUR = 9;

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Rebuild the scheduled-reminder queue from the current inventory. Called after every
 * inventory sync so edits/deletes are reflected.
 */
export async function syncExpiryReminders(items: FlatItem[]): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const item of items) {
      if (item.location === "freezer") continue;
      if (item.days < 0 || item.days > REMIND_WITHIN_DAYS) continue;

      const fireAt = new Date();
      fireAt.setDate(fireAt.getDate() + Math.max(0, item.days - 1));
      fireAt.setHours(REMIND_HOUR, 0, 0, 0);
      if (fireAt.getTime() < Date.now() + 60_000) continue; // don't schedule in the past

      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.days <= 1 ? `${item.name} expires today` : `${item.name} expires soon`,
          body: `In ${item.fridgeName} · use it up or it goes to waste.`,
          data: { itemId: item.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    }
  } catch {
    // ignore — see file header
  }
}

export async function cancelAllExpiryReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* noop */
  }
}
