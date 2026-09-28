// Logic for the kitchen scan (src/app/sweep.tsx, plan in SCAN_PLAN.md): which space each shot is
// of, merging what the shots found, comparing it with what's already tracked, plus the geometry
// for the reveal - where a detected item sits on the photo, how to crop it into a square tile and
// where the tiles land. Pure functions, so all of it is testable without rendering.

import { normalizeItemName, type NutritionCategory, type StorageLocation } from "@thatfridge/core";

/** [ymin, xmin, ymax, xmax] in 0-1000 of the photo, as the backend's photo scan returns it. */
export type Box = [number, number, number, number];

export type Rect = { x: number; y: number; w: number; h: number };

/** What the camera captures: shelf photos, a receipt, or barcodes (live, no shutter). */
export type CaptureMode = "photo" | "receipt" | "barcode";

export const MODES: { key: CaptureMode; label: string; hint: string; cost: string }[] = [
  { key: "photo", label: "Photo", hint: "", cost: "3 credits / shot" },
  { key: "receipt", label: "Receipt", hint: "Fit the whole receipt in the frame", cost: "3 credits / receipt" },
  { key: "barcode", label: "Barcode", hint: "Hold a barcode in the strip — it adds itself", cost: "Free" },
];

/** What a shot is of. Groceries = a haul laid out, not yet put away. */
export type Space = "fridge" | "freezer" | "pantry" | "groceries";

export const SPACES: { key: Space; label: string; hint: string }[] = [
  { key: "fridge", label: "Fridge", hint: "The door, then each shelf and drawer" },
  { key: "freezer", label: "Freezer", hint: "Each drawer or shelf" },
  { key: "pantry", label: "Pantry", hint: "Each shelf or cupboard" },
  { key: "groceries", label: "Groceries", hint: "Lay out what you just bought" },
];

/** What the vision model says a photo shows. */
export type Scene = "fridge" | "freezer" | "pantry" | "counter" | "unclear";

/** Most shots in one sweep - each is a separate photo scan (and its credits). */
export const MAX_SHOTS = 10;

export const CREDITS_PER_SHOT = 3;

/** Below this the tile is flagged for the user to check. */
export const LOW_CONFIDENCE = 0.6;

/** The largest rect with the photo's aspect (width / height) that fits in `area`, centered. */
export function fitFrame(aspect: number, area: Rect): Rect {
  const safe = aspect > 0 && Number.isFinite(aspect) ? aspect : 3 / 4;
  let w = area.w;
  let h = w / safe;
  if (h > area.h) {
    h = area.h;
    w = h * safe;
  }
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** The box as an on-screen rect inside the photo's frame. */
export function boxToRect(box: Box, frame: Rect): Rect {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: frame.x + (xmin / 1000) * frame.w,
    y: frame.y + (ymin / 1000) * frame.h,
    w: ((xmax - xmin) / 1000) * frame.w,
    h: ((ymax - ymin) / 1000) * frame.h,
  };
}

/** The box grown by `pad` (a fraction of its size) on every side, kept inside the photo. */
export function padBox(box: Box, pad = 0.08): Box {
  const [ymin, xmin, ymax, xmax] = box;
  const dy = (ymax - ymin) * pad;
  const dx = (xmax - xmin) * pad;
  const clamp = (v: number) => Math.min(1000, Math.max(0, v));
  return [clamp(ymin - dy), clamp(xmin - dx), clamp(ymax + dy), clamp(xmax + dx)];
}

/**
 * Size and offset for the full photo inside a `tile`-square view with overflow hidden, so the
 * box fills the tile (cover: the shorter side of the box fits, the longer is trimmed, centered).
 * No image processing - the tile just shows the right part of the one photo.
 */
export function cropStyle(box: Box, aspect: number, tile: number) {
  const [ymin, xmin, ymax, xmax] = box;
  // In units where the photo is 1 wide and 1/aspect tall.
  const bw = Math.max((xmax - xmin) / 1000, 0.001);
  const bh = Math.max((ymax - ymin) / 1000 / aspect, 0.001);
  const scale = Math.max(tile / bw, tile / bh);
  return {
    width: scale,
    height: scale / aspect,
    left: -(xmin / 1000) * scale + (tile - bw * scale) / 2,
    top: -((ymin / 1000) / aspect) * scale + (tile - bh * scale) / 2,
  };
}

/**
 * `n` square cells laid out in `cols` columns inside `area`, sized so every one fits
 * (capped at `maxSize`), with the grid centered horizontally.
 */
export function gridCells(n: number, area: Rect, cols: number, gap: number, maxSize: number): Rect[] {
  if (n <= 0) return [];
  const rows = Math.ceil(n / cols);
  const byWidth = (area.w - gap * (cols - 1)) / cols;
  const byHeight = (area.h - gap * (rows - 1)) / rows;
  const size = Math.max(8, Math.min(maxSize, byWidth, byHeight));
  const used = Math.min(n, cols);
  const left = area.x + (area.w - (used * size + (used - 1) * gap)) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: left + (i % cols) * (size + gap),
    y: area.y + Math.floor(i / cols) * (size + gap),
    w: size,
    h: size,
  }));
}

/** Delay between items so a long list still finishes within `total` ms. */
export function staggerStep(n: number, total = 900, max = 110): number {
  return n <= 1 ? 0 : Math.min(max, total / (n - 1));
}

/** Where a tile starts: centered on its box, scaled so it covers the box's longer side. */
export function flyStart(rect: Rect, tile: number) {
  return {
    x: rect.x + rect.w / 2 - tile / 2,
    y: rect.y + rect.h / 2 - tile / 2,
    scale: Math.max(rect.w, rect.h) / tile,
  };
}

export function spaceLabel(space: Space): string {
  return SPACES.find((s) => s.key === space)?.label ?? "Fridge";
}

/** The space a scene suggests, or null when the model couldn't tell. */
export function sceneSpace(scene: Scene | null | undefined): Space | null {
  if (scene === "fridge" || scene === "freezer" || scene === "pantry") return scene;
  if (scene === "counter") return "groceries";
  return null;
}

/** Where an item from a shot of `space` is stored: the space itself, or for a grocery haul the
 *  model's guess for that item (fridge when it had none). */
export function spaceLocation(space: Space, storage?: StorageLocation | null): StorageLocation {
  return space === "groceries" ? (storage ?? "fridge") : space;
}

/** The HUD label for the next shot: "Pantry · shot 3". */
export function shotLabel(space: Space, shotsInSpace: number): string {
  return `${spaceLabel(space)} · shot ${shotsInSpace + 1}`;
}

// ---- merging and comparing -------------------------------------------------

export type SweepDetection = {
  id: string;
  name: string;
  icon: string;
  box: Box | null;
  confidence: number;
  condition: "vibrant" | "wilting" | "past_best" | null;
  storage: StorageLocation | null;
  /** Units of it (a receipt line's quantity). One when absent. */
  qty?: number;
  /** Known up front for barcode products. */
  category?: NutritionCategory | null;
  shelfLifeDays?: number | null;
};

export type SweepShotInput = {
  id: string;
  /** How it was captured (photo when absent). */
  source?: "photo" | "receipt" | "barcode";
  space: Space;
  status: "scanning" | "done" | "failed";
  items: SweepDetection[];
};

/** The bits of an inventory item the comparison needs (a FlatItem fits). */
export type TrackedItem = { id: string; name: string; location?: StorageLocation | null };

export type ResultRow<T extends TrackedItem = TrackedItem> = {
  key: string;
  name: string;
  icon: string;
  space: Space;
  location: StorageLocation;
  /** Most of it seen in any one photo - repeats within a photo are quantity. */
  qty: number;
  /** How many shots it turned up in - more than one is usually overlap, not more stock. */
  seenIn: number;
  confidence: number;
  condition: SweepDetection["condition"];
  source: "photo" | "receipt" | "barcode";
  category: NutritionCategory | null;
  shelfLifeDays: number | null;
  /** The shot and detection to crop the tile from (the one with a box and highest confidence). */
  shotId: string;
  detection: SweepDetection;
  /** Already in inventory at this location - shown as tracked, not added by default. */
  match: T | null;
};

const tokens = (s: string) => normalizeItemName(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether a scanned name and a tracked one are the same thing: equal once normalised ("Eggs" /
 * "egg"), or every word of the shorter name appears in the longer ("Milk" / "Whole milk").
 */
export function sameItem(a: string, b: string): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 0 || !short.some((t) => t.length >= 3)) return false;
  const longSet = new Set(long.map((t) => normalizeItemName(t)));
  return short.every((t) => longSet.has(normalizeItemName(t)));
}

/**
 * Turn the finished shots into result rows and compare them with `tracked` (the target fridge's
 * items): the same item across shots of one space merges into one row, rows from fridge / freezer
 * / pantry shots are matched to a tracked item at that location, and tracked items in a scanned
 * space that nothing matched come back as `missing`. Grocery hauls are never compared.
 */
export function buildSweepResults<T extends TrackedItem>(
  shots: SweepShotInput[],
  tracked: T[],
): { rows: ResultRow<T>[]; missing: T[]; emptyShots: string[] } {
  const groups = new Map<string, ResultRow<T> & { perShot: Map<string, number> }>();
  const emptyShots: string[] = [];

  for (const shot of shots) {
    if (shot.status !== "done") continue;
    if (shot.items.length === 0) emptyShots.push(shot.id);
    for (const d of shot.items) {
      const key = `${shot.space}|${normalizeItemName(d.name)}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          name: d.name,
          icon: d.icon,
          space: shot.space,
          location: spaceLocation(shot.space, d.storage),
          qty: 0,
          seenIn: 0,
          confidence: d.confidence,
          condition: d.condition,
          source: shot.source ?? "photo",
          category: d.category ?? null,
          shelfLifeDays: d.shelfLifeDays ?? null,
          shotId: shot.id,
          detection: d,
          match: null,
          perShot: new Map(),
        };
        groups.set(key, g);
      }
      g.perShot.set(shot.id, (g.perShot.get(shot.id) ?? 0) + Math.max(1, d.qty ?? 1));
      g.confidence = Math.max(g.confidence, d.confidence);
      g.condition = g.condition ?? d.condition;
      g.category = g.category ?? d.category ?? null;
      g.shelfLifeDays = g.shelfLifeDays ?? d.shelfLifeDays ?? null;
      // Crop from the clearest placed view of it.
      const better = d.box && (!g.detection.box || d.confidence > g.detection.confidence);
      if (better) {
        g.detection = d;
        g.shotId = shot.id;
      }
    }
  }

  const used = new Set<string>();
  const rows: ResultRow<T>[] = [];
  for (const g of groups.values()) {
    const { perShot, ...row } = g;
    row.qty = Math.max(...perShot.values());
    row.seenIn = perShot.size;
    if (row.space !== "groceries") {
      const hit = tracked.find(
        (t) => !used.has(t.id) && (t.location ?? "fridge") === row.location && sameItem(row.name, t.name),
      );
      if (hit) {
        used.add(hit.id);
        row.match = hit;
      }
    }
    rows.push(row);
  }

  const scanned = new Set<StorageLocation>(
    shots
      .filter((s) => s.status === "done" && s.space !== "groceries")
      .map((s) => s.space as StorageLocation),
  );
  const missing = tracked.filter((t) => !used.has(t.id) && scanned.has(t.location ?? "fridge"));

  return { rows, missing, emptyShots };
}

/**
 * The barcode's on-screen rect from the camera's result: its bounds, or the box around its corner
 * points when the bounds come back empty (which happens). Padded a little so the brackets sit
 * just outside the bars. Null when neither is usable - the strip frame then stays as the guide.
 */
export function barcodeRect(r: { bounds?: { origin: { x: number; y: number }; size: { width: number; height: number } }; cornerPoints?: { x: number; y: number }[] }): Rect | null {
  let x: number, y: number, w: number, h: number;
  if (r.bounds && r.bounds.size.width > 4 && r.bounds.size.height > 4) {
    ({ x, y } = r.bounds.origin);
    ({ width: w, height: h } = r.bounds.size);
  } else if (r.cornerPoints && r.cornerPoints.length >= 2) {
    const xs = r.cornerPoints.map((p) => p.x);
    const ys = r.cornerPoints.map((p) => p.y);
    x = Math.min(...xs);
    y = Math.min(...ys);
    w = Math.max(...xs) - x;
    h = Math.max(...ys) - y;
    if (w < 4 || h < 4) return null;
  } else {
    return null;
  }
  const pad = 10;
  return { x: x - pad, y: y - pad, w: w + pad * 2, h: Math.max(h, 24) + pad * 2 };
}
