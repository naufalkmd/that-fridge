// Name → pixel-art icon resolution, ported from apps/web/lib/thatfridge/data.ts. The curated
// 10 keep their existing names (used in seed data + recipes); every other numbered icon in the
// food-icons asset pack is keyed `icon<manifest-id>`. The PNGs themselves live in
// apps/mobile/assets/food-icons/ (mapped in src/lib/food-icon-assets.ts).

import type { NutritionCategory } from "./types";
import { EXTRA_ICON_ENTRIES } from "./food-icons.generated";

export const CURATED_ICON_KEYS = [
  "milk", "yogurt", "cheese", "eggs", "spinach", "carrot", "apple", "berries", "meat", "leftovers",
] as const;

// Curated key → asset filename.
const CURATED_ICON_FILES: Record<string, string> = {
  milk: "icon-163.png",
  yogurt: "icon-164.png",
  cheese: "icon-017.png",
  eggs: "icon-026.png",
  spinach: "icon-139.png",
  carrot: "icon-066.png",
  apple: "icon-110.png",
  berries: "icon-132.png",
  meat: "icon-015.png",
  leftovers: "icon-007.png",
};

const CURATED_ICON_KEYWORDS: Record<string, string[]> = {
  milk: ["milk"],
  yogurt: ["yogurt", "yoghurt"],
  cheese: ["cheese", "cheddar", "mozzarella", "parmesan", "brie", "feta"],
  eggs: ["egg"],
  spinach: ["spinach", "kale", "lettuce", "greens", "salad"],
  carrot: ["carrot"],
  apple: ["apple"],
  berries: ["berry", "berries", "strawberr", "blueberr", "raspberr"],
  meat: ["meat", "pork"],
  leftovers: ["leftover", "soup", "stew", "casserole", "takeout", "take-out"],
};

/** Every icon key, curated first. */
export const FOOD_ICON_KEYS: string[] = [
  ...CURATED_ICON_KEYS,
  ...EXTRA_ICON_ENTRIES.map((e) => e.key),
];

/** Human label for an icon key ("icon84" → "Sliced deli meat"). */
export const ICON_LABELS: Record<string, string> = {
  milk: "Milk", yogurt: "Yogurt", cheese: "Cheese", eggs: "Eggs", spinach: "Spinach",
  carrot: "Carrots", apple: "Apples", berries: "Berries", meat: "Meat", leftovers: "Leftovers",
  ...Object.fromEntries(EXTRA_ICON_ENTRIES.map((e) => [e.key, e.label])),
};

const KEY_TO_FILE: Record<string, string> = {
  ...CURATED_ICON_FILES,
  ...Object.fromEntries(EXTRA_ICON_ENTRIES.map((e) => [e.key, e.file])),
};

const KEY_TO_NUTRITION: Record<string, NutritionCategory> = {
  eggs: "protein", meat: "protein", milk: "dairy", yogurt: "dairy", cheese: "dairy",
  spinach: "vegetables", carrot: "vegetables", apple: "fruit", berries: "fruit",
  leftovers: "other_extras",
  ...Object.fromEntries(EXTRA_ICON_ENTRIES.map((e) => [e.key, e.nutritionCategory])),
};

/** The asset filename for an icon key, or null if the key isn't in the pack. */
export function foodIconFile(key: string | null | undefined): string | null {
  return key ? KEY_TO_FILE[key] ?? null : null;
}

/** Nutrition category implied by an icon key (for auto-selecting a food group). */
export function nutritionCategoryForIcon(key: string | null | undefined): NutritionCategory | null {
  return key ? KEY_TO_NUTRITION[key] ?? null : null;
}

/**
 * Best icon key for an item name — longest keyword match across the whole pack wins, so
 * "eggplant" beats "egg". Returns null when nothing matches (caller falls back to initials).
 */
export function guessFoodIcon(name: string): string | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  let best: { key: string; len: number } | null = null;
  for (const key of CURATED_ICON_KEYS) {
    const kw = CURATED_ICON_KEYWORDS[key]?.find((k) => q.includes(k));
    if (kw && (!best || kw.length > best.len)) best = { key, len: kw.length };
  }
  for (const e of EXTRA_ICON_ENTRIES) {
    const kw = e.keywords.find((k) => q.includes(k));
    if (kw && (!best || kw.length > best.len)) best = { key: e.key, len: kw.length };
  }
  return best?.key ?? null;
}
