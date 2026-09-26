import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth";
import { hydrate, writeCache } from "@/lib/persist";

/**
 * Stale-while-revalidate for a provider's data. Once signed in it immediately hands the last saved copy to `apply` (so the
 * screen paints at once instead of empty), and after the provider has loaded fresh data (`markFresh()` right before
 * setting it) every change to `value` is saved back for next launch. Fresh data always wins: a slow disk read that
 * finishes after the network answered is ignored.
 */
export function useStaleCache<T>(key: string, value: T, apply: (cached: T) => void) {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const fresh = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (status !== "signedIn" || !userId) return;
    fresh.current = false;
    const h = hydrate<T>(key, userId, (cached) => applyRef.current(cached), () => fresh.current);

    return h.stop;
  }, [status, userId, key]);

  useEffect(() => {
    if (fresh.current && userIdRef.current) writeCache(key, userIdRef.current, value);
  }, [key, value]);

  return { markFresh: useCallback(() => void (fresh.current = true), []) };
}
