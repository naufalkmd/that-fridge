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
