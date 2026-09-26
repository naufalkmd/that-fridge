/**
 * A small on-device cache so the app can paint last time's data at once and refresh it in the background
 * (stale-while-revalidate), instead of showing empty screens that fill in piece by piece.
 *
 * Stored as one JSON file per key in the OS cache directory (expo-file-system), tagged with the user id so one
 * account can never see another's data. Every operation is best-effort: if the native module is missing (an older
 * build), the API differs, a file is corrupt or the disk is full, it quietly behaves as an empty cache and the app
 * simply loads from the network as it always did.
 */

type FsModule = {
  File: new (...parts: unknown[]) => {
    exists: boolean;
    create: () => void;
    write: (text: string) => void;
    text: () => Promise<string>;
    delete: () => void;
  };
  Paths: { cache: unknown };
};

const VERSION = 1;
const MAX_BYTES = 3_000_000;
const WRITE_DELAY_MS = 400;
const NAMESPACE = "thatfridge-cache";

/** Every key that has been written this session or read: used to wipe the cache on sign-out. */
const KNOWN_KEYS = new Set<string>(["user", "fridges", "recipes", "shopping", "notes", "notifications", "categories"]);

let fs: FsModule | null | undefined;

function fileSystem(): FsModule | null {
  if (fs === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("expo-file-system");
      fs = mod?.File && mod?.Paths ? (mod as FsModule) : null;
    } catch {
      fs = null;
    }
  }
  return fs;
}

/** Test hook: forget the resolved module so a mock can be swapped in. */
export function __resetPersistForTests() {
  fs = undefined;
  pending.forEach((t) => clearTimeout(t.timer));
  pending.clear();
}

function fileFor(key: string) {
  const mod = fileSystem();
  return mod ? new mod.File(mod.Paths.cache, `${NAMESPACE}-${key}.json`) : null;
}

/** The cached value for `key`, or null when there is none, it belongs to another user, or anything went wrong. */
export async function readCache<T>(key: string, userId: string | null): Promise<T | null> {
  try {
    const file = fileFor(key);
    if (!file || !file.exists) return null;
    const parsed = JSON.parse(await file.text()) as { v?: number; userId?: string | null; data?: T };
    if (parsed.v !== VERSION || (userId !== null && parsed.userId !== userId)) return null;

    return parsed.data ?? null;
  } catch {
    return null;
  }
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; userId: string | null; data: unknown }>();

/** Save `data` for `key` shortly from now (rapid changes collapse into one write). Never throws. */
export function writeCache(key: string, userId: string | null, data: unknown): void {
  KNOWN_KEYS.add(key);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    try {
      const file = fileFor(key);
      if (!file) return;
      const text = JSON.stringify({ v: VERSION, userId, savedAt: Date.now(), data });
      if (text.length > MAX_BYTES) return;
      if (!file.exists) file.create();
      file.write(text);
    } catch {
      /* the cache is an optimisation, never a requirement */
    }
  }, WRITE_DELAY_MS);
  pending.set(key, { timer, userId, data });
}

/** Wipe everything (sign-out / account deletion), including writes that have not happened yet. */
export function clearCache(): void {
  pending.forEach((p) => clearTimeout(p.timer));
  pending.clear();
  for (const key of KNOWN_KEYS) {
    try {
      const file = fileFor(key);
      if (file?.exists) file.delete();
    } catch {
      /* best effort */
    }
  }
}

/**
 * Paint cached data first: reads `key` and hands it to `apply` unless fresh data has already arrived (`isFresh`)
 * or the caller has moved on (`stop()`), so a slow disk read can never overwrite newer network data.
 */
export function hydrate<T>(key: string, userId: string | null, apply: (data: T) => void, isFresh: () => boolean) {
  let stopped = false;
  void readCache<T>(key, userId).then((data) => {
    if (data !== null && !stopped && !isFresh()) apply(data);
  });

  return { stop: () => void (stopped = true) };
}
