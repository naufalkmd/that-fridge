import type { StorageLocation } from "@thatfridge/core";

/** One barcode captured in a multi-scan session, handed from /scan to /add for review. */
export interface ScannedItem {
  barcode: string;
  /** Empty when the barcode wasn't in the product database — the user names it in review. */
  name: string;
  icon: string;
  iconUrl: string | null;
  qty: number;
  location: StorageLocation | null;
  shelfLifeDays: number | null;
}

// A plain module-level buffer, not reactive state: /scan writes it on "Done", the fresh
// /add mount reads it once. Cleared on read so a back-nav doesn't re-load stale scans.
let buffer: ScannedItem[] = [];

export function stashScans(items: ScannedItem[]): void {
  buffer = items;
}

export function takeScans(): ScannedItem[] {
  const out = buffer;
  buffer = [];
  return out;
}
