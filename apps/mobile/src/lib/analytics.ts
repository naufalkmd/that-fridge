import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { AnalyticsEventInput } from "@thatfridge/core";

import { api } from "@/lib/api";

// First-party analytics. Deliberately tiny and best-effort: events are buffered in memory,
// flushed on a timer / when the buffer fills / when the app backgrounds, and every failure
// is swallowed. Nothing here may ever block or slow a user interaction.
//
// The `anon_id` is a stable per-install id kept in SecureStore so pre-sign-in onboarding
// events can be stitched to the eventual signup (the backend keeps it on every row).

const ANON_KEY = "thatfridge_anon_id_v1";
const APP_VERSION = String(Constants.expoConfig?.version ?? "dev");
const FLUSH_AFTER_MS = 8000;
const FLUSH_AT_COUNT = 20;
const MAX_BATCH = 50;

let anonId: string | null = null;
let queue: AnalyticsEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function ensureAnonId(): Promise<string> {
  if (anonId) return anonId;
  try {
    let stored = await SecureStore.getItemAsync(ANON_KEY);
    if (!stored) {
      stored = `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await SecureStore.setItemAsync(ANON_KEY, stored);
    }
    anonId = stored;
  } catch {
    // A private/blocked keystore — use an ephemeral id rather than losing the event.
    anonId = `a_eph_${Math.random().toString(36).slice(2, 12)}`;
  }
  return anonId;
}

/** Read the stable install id (creating it if needed). Used by hydrateFromOnboarding. */
export function getAnonId(): Promise<string> {
  return ensureAnonId();
}

export function track(name: string, props?: Record<string, unknown>): void {
  void ensureAnonId().then((id) => {
    queue.push({
      name,
      props,
      anon_id: id,
      platform: Platform.OS,
      app_version: APP_VERSION,
      ts: Date.now(),
    });
    if (queue.length >= FLUSH_AT_COUNT) {
      void flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, FLUSH_AFTER_MS);
    }
  });
}

export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await api.trackEvents(batch);
  } catch {
    // Drop on failure. Analytics is not worth a retry storm or a growing buffer.
  }
}

/** Call once from the root layout. */
export function initAnalytics(): void {
  if (started) return;
  started = true;
  void ensureAnonId();
  AppState.addEventListener("change", (state) => {
    if (state !== "active") void flush();
  });
}
