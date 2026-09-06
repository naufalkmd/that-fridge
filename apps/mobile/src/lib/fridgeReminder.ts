import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { ensureNotificationPermission } from "@/lib/localNotifications";

// A recurring "check your fridge" nudge, chosen in onboarding ("Set your intention").
// Per-device, local-only. Scheduled notifications are tagged `data.kind === "checkin"` so
// the expiry-reminder sync (which owns the `expiry` kind) leaves them alone.

const KEY = "thatfridge_fridge_reminder_v1";
const HOUR = 18;
const MINUTE = 30;

export type ReminderCadence = "evening" | "twice_weekly" | "off";

export async function getFridgeReminder(): Promise<ReminderCadence> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v === "evening" || v === "twice_weekly" ? v : "off";
  } catch {
    return "off";
  }
}

/** Store the preference and (re)build the scheduled notification(s). */
export async function setFridgeReminder(cadence: ReminderCadence): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, cadence);
  } catch {
    /* best effort */
  }
  await syncFridgeCheckIn();
}

/** Rebuild the check-in reminder from the stored preference. Called on app launch too. */
export async function syncFridgeCheckIn(): Promise<void> {
  try {
    if (!(await ensureNotificationPermission())) return;

    await cancelCheckIns();

    const cadence = await getFridgeReminder();
    if (cadence === "off") return;

    const content = {
      title: "Check your fridge",
      body: "A quick look keeps things from going to waste.",
      data: { kind: "checkin" as const },
    };

    if (cadence === "evening") {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: HOUR,
          minute: MINUTE,
        },
      });
    } else {
      // twice a week — Wednesday + Sunday (weekday 1 = Sunday)
      for (const weekday of [4, 1]) {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: HOUR,
            minute: MINUTE,
          },
        });
      }
    }
  } catch {
    /* swallowed — the nudge is best-effort, same as expiry reminders */
  }
}

async function cancelCheckIns(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.content.data?.kind === "checkin")
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    /* noop */
  }
}
