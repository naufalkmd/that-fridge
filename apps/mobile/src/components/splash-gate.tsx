import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";

const BOOT_STARTED_AT = Date.now();

/** Longest the native splash may cover a slow start (no saved data and a slow network) before the app shows its own loading states. */
export const SPLASH_MAX_MS = 2500;

/**
 * Hides the native splash when the app can show something real: the session is known (no more blank "loading"
 * screen), the onboarding flags are read, and - when signed in - the fridges are in (saved copy or fresh), so Home opens
 * complete instead of filling in piece by piece. Capped, so a slow network shows the app's own skeletons rather than a
 * splash that never leaves.
 */
export function SplashGate() {
  const { status } = useAuth();
  const onboarding = useOnboarding();
  const { loading } = useInventory();
  const ready = status !== "loading" && onboarding.ready && (status !== "signedIn" || !loading);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), Math.max(0, SPLASH_MAX_MS - (Date.now() - BOOT_STARTED_AT)));
    return () => clearTimeout(t);
  }, []);

  return null;
}
