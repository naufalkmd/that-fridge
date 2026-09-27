// Geometry for the fridge sweep (src/app/sweep.tsx): where a detected item sits on the photo,
// how to crop it into a square tile, and where the tiles land in the grid. Pure functions so the
// animation maths is testable without rendering.

/** [ymin, xmin, ymax, xmax] in 0-1000 of the photo, as the backend's photo scan returns it. */
export type Box = [number, number, number, number];

export type Rect = { x: number; y: number; w: number; h: number };

/** Suggested order for the shots; past the end the HUD just counts. */
export const SHELF_HINTS = ["Door", "Top shelf", "Middle shelf", "Bottom shelf", "Drawers", "Freezer"];

/** Most shots in one sweep - each is a separate photo scan (and its credits). */
export const MAX_SHOTS = 6;

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

/** The HUD label for the shot about to be taken (0-based). */
export function shotLabel(index: number): string {
  return SHELF_HINTS[index] ?? `Shot ${index + 1}`;
}
