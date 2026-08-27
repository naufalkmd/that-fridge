import type { NutritionCategory, StorageLocation } from "./types";

// Freshness → colour. Mirrors apps/web/lib/thatfridge/utils.ts.
export const FRESH_GREEN = "#3f8f5c";
export const FRESH_AMBER = "#d99a2b";
export const FRESH_RED = "#c1452e";

export function freshColor(freshness: number): string {
  if (freshness >= 60) return FRESH_GREEN;
  if (freshness >= 30) return FRESH_AMBER;
  return FRESH_RED;
}

export function daysLabel(days: number): string {
  if (days < 0) return "Expired";
  return days <= 1 ? "Today" : `${days}d left`;
}

export function timeAgo(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Best-effort icon → food-group fallback for items added before the category picker existed
// (or anything left uncategorised). Mirrors ICON_NUTRITION_CATEGORY in apps/web's data.ts for
// the icon keys the core pixel set covers.
const ICON_NUTRITION_CATEGORY: Record<string, NutritionCategory> = {
  milk: "dairy",
  yogurt: "dairy",
  cheese: "dairy",
  eggs: "protein",
  meat: "protein",
  spinach: "vegetables",
  carrot: "vegetables",
  apple: "fruit",
  berries: "fruit",
  leftovers: "other_extras",
};

export function guessNutritionCategory(icon: string | null | undefined): NutritionCategory | null {
  return (icon && ICON_NUTRITION_CATEGORY[icon]) || null;
}

export const NUTRITION_CATEGORIES: { key: NutritionCategory; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "vegetables", label: "Vegetables" },
  { key: "fruit", label: "Fruit" },
  { key: "grains", label: "Grains & Starches" },
  { key: "dairy", label: "Dairy" },
  { key: "other_extras", label: "Other/Extras" },
];

export const STORAGE_LOCATIONS: {
  key: StorageLocation;
  label: string;
  short: string;
  color: string;
}[] = [
  { key: "fridge", label: "Fridge", short: "Fr", color: "#2f6fb0" },
  { key: "freezer", label: "Freezer", short: "Fz", color: "#3f5c85" },
  { key: "pantry", label: "Pantry", short: "Pa", color: "#b5702f" },
];
