import * as SecureStore from "expo-secure-store";

// Device-local "recent searches" for Find a Friend - never synced, never sent to the server.
// Same SecureStore-backed small-store pattern as fridgeReminder.ts.

const KEY = "thatfridge_friend_search_history_v1";
const MAX_ENTRIES = 10;

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export async function getFriendSearchHistory(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function save(list: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(list));
  } catch {
    /* best effort — device-local convenience only */
  }
}

/** Records a successful profile open - most-recent-first, deduplicated (case-insensitive),
 *  capped at MAX_ENTRIES. Call only once a lookup has actually succeeded. */
export async function recordFriendSearchSelection(username: string): Promise<string[]> {
  const normalized = normalize(username);
  if (!normalized) return getFriendSearchHistory();
  const current = await getFriendSearchHistory();
  const next = [normalized, ...current.filter((u) => u !== normalized)].slice(0, MAX_ENTRIES);
  await save(next);
  return next;
}

/** Drops one entry - called after a block, a report, or a failed lookup, so history never
 *  keeps pointing at someone the user can no longer (or would rather not) find again. */
export async function removeFriendSearchHistoryEntry(username: string): Promise<string[]> {
  const normalized = normalize(username);
  const current = await getFriendSearchHistory();
  const next = current.filter((u) => u !== normalized);
  if (next.length !== current.length) await save(next);
  return next;
}

export async function clearFriendSearchHistory(): Promise<void> {
  await save([]);
}
