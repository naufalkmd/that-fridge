import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

import { track } from "@/lib/analytics";
import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";

/**
 * Once per install, right after sign-in: an empty fridge opens "Let's fill your fridge"
 * (/first-scan), the step that replaced the old mock demo. Someone who already has items
 * (a returning account, a reinstall) never sees it - it's just marked as offered, so the Home
 * tour that waits on it still runs.
 */
export function FirstScanGate() {
  const router = useRouter();
  const { ready, seen, firstScanPrompted, markFirstScanPrompted } = useOnboarding();
  const { items, loading } = useInventory();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !ready || !seen || firstScanPrompted || loading) return;
    fired.current = true;
    void markFirstScanPrompted();
    if (items.length === 0) {
      track("onboarding_first_scan_shown");
      router.push("/first-scan");
    }
  }, [ready, seen, firstScanPrompted, loading, items.length, markFirstScanPrompted, router]);

  return null;
}
