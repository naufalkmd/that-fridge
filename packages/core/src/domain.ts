import type { NutritionCategory, StorageLocation } from "./types";
import type { ChatAgentName } from "./api";

// Picks which crew member should answer a Quick Chat message, from keywords — mirrors
// routeChatAgent in apps/web. Defaults to Chef.
const AGENT_KEYWORDS: { agent: ChatAgentName; pattern: RegExp }[] = [
  {
    agent: "Guardian",
    pattern:
      /\b(expir(e|es|ing|ed|y)|spoil(ed|ing)?|go(es|ing)? bad|moldy|mold|smell(s|y)?|safe to eat|food safety|throw (it|them) out|how('?s| is)( my| the)? fridge( doing)?)\b/i,
  },
  {
    agent: "Shopkeeper",
    pattern:
      /\b(buy|shopping|shopping list|restock|grocery|groceries|running low|need to (get|buy)|out of|purchase)\b/i,
  },
  {
    agent: "Organizer",
    pattern:
      /\b(organi[sz]e|storage|store (it|them)|arrange|where should|which shelf|fridge vs freezer|freezer or fridge)\b/i,
  },
  {
    agent: "Chef",
    pattern:
      /\b(cook|recipe|meal|make (for|tonight)|dinner|lunch|breakfast|dish|ingredients)\b/i,
  },
];

export function routeChatAgent(message: string): ChatAgentName {
  for (const { agent, pattern } of AGENT_KEYWORDS) {
    if (pattern.test(message)) return agent;
  }
  return "Chef";
}

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

// A pasted "amazon.com/dp/..." with no scheme would trip the backend's `url` validator —
// prepend https:// rather than rejecting it, since that's obviously what was meant.
// Mirrors normalizeShopUrl in apps/web/lib/thatfridge/useThatFridge.ts.
export function normalizeShopUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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

export function guessNutritionCategory(
  icon: string | null | undefined,
): NutritionCategory | null {
  return (icon && ICON_NUTRITION_CATEGORY[icon]) || null;
}

export const NUTRITION_CATEGORIES: { key: NutritionCategory; label: string }[] =
  [
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
