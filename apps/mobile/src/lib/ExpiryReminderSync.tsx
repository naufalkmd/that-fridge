import { useEffect } from "react";

import { useInventory } from "@/lib/inventory";
import { useNotifications } from "@/lib/notifications";
import { cancelAllExpiryReminders, syncExpiryReminders } from "@/lib/localNotifications";

// Keeps the on-device reminder queue in sync with inventory + the user's expiry-alert pref.
// Renders nothing.
export function ExpiryReminderSync() {
  const { items, loading } = useInventory();
  const { prefs } = useNotifications();

  const expiryAlerts = prefs?.expiryAlerts ?? true;

  useEffect(() => {
    if (loading) return;
    if (!expiryAlerts) {
      cancelAllExpiryReminders();
      return;
    }
    syncExpiryReminders(items);
  }, [items, loading, expiryAlerts]);

  return null;
}
