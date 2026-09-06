import { useEffect } from "react";

import { useInventory } from "@/lib/inventory";
import { useNotifications } from "@/lib/notifications";
import { cancelAllExpiryReminders, syncExpiryReminders } from "@/lib/localNotifications";
import { syncFridgeCheckIn } from "@/lib/fridgeReminder";

// Keeps the on-device reminder queue in sync with inventory + the user's expiry-alert pref,
// and rebuilds the recurring "check your fridge" nudge from its stored cadence. Renders nothing.
export function ExpiryReminderSync() {
  const { items, loading } = useInventory();
  const { prefs } = useNotifications();

  const expiryAlerts = prefs?.expiryAlerts ?? true;

  useEffect(() => {
    if (loading) return;
    syncFridgeCheckIn();
    if (!expiryAlerts) {
      cancelAllExpiryReminders();
      return;
    }
    syncExpiryReminders(items);
  }, [items, loading, expiryAlerts]);

  return null;
}
