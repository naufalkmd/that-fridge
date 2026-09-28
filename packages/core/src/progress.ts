// Restock suggestions + the badge catalog — mobile ports of apps/web's logic, adapted to explicit
// inputs instead of the web's ThatFridgeState. (The goal tracker was removed with the Goal screen.)

import type { FlatItem } from "./api";
import type {
  BadgeKey,
  Recipe,
  ShoppingItem,
  UsageHistoryEntry,
} from "./types";

// ---- Shopping recommendations -------------------------------------------------------
// A lightweight port of apps/web's getShoppingRecommendations: what to restock, from data
// the app already has — recipe gaps first, then habit ("bought before") picks.

export interface ShoppingRecommendation {
  key: string;
  source: "recipe" | "habit";
  name: string;
  icon: string;
  reason: string;
}

export function getShoppingRecommendations(input: {
  items: Pick<FlatItem, "name" | "icon">[];
  recipes: Recipe[];
  shoppingList: Pick<ShoppingItem, "name" | "checked">[];
  usageHistory: UsageHistoryEntry[];
  limit?: number;
}): ShoppingRecommendation[] {
  const { items, recipes, shoppingList, usageHistory, limit = 6 } = input;
  const stocked = new Set(items.map((i) => i.name.trim().toLowerCase()));
  const onList = new Set(
    shoppingList.filter((s) => !s.checked).map((s) => s.name.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const out: ShoppingRecommendation[] = [];
  const push = (r: ShoppingRecommendation) => {
    const k = r.name.trim().toLowerCase();
    if (seen.has(k) || stocked.has(k) || onList.has(k)) return;
    seen.add(k);
    out.push(r);
  };

  // Recipes you're close to being able to make — surface what's missing.
  const close = recipes
    .map((r) => {
      const have = r.ingredients.filter((ing) =>
        items.some(
          (i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase(),
        ),
      ).length;
      return { r, have, total: r.ingredients.length };
    })
    .filter((x) => x.total > 0 && x.have > 0 && x.have < x.total)
    .sort((a, b) => b.have / b.total - a.have / a.total);

  for (const { r } of close.slice(0, 2)) {
    for (const ing of r.ingredients) {
      if (items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()))
        continue;
      push({
        key: `rec-${r.id}-${ing.name}`,
        source: "recipe",
        name: ing.name,
        icon: ing.icon,
        reason: `Needed for "${r.name}"`,
      });
    }
  }

  // Habit picks — things you use often that aren't in the fridge right now.
  for (const h of [...usageHistory].sort((a, b) => b.count - a.count).slice(0, 6)) {
    push({
      key: `hab-${h.key}`,
      source: "habit",
      name: h.name,
      icon: h.icon,
      reason: `Bought ${h.count}× before`,
    });
  }

  return out.slice(0, limit);
}


// ---- Badges (static catalog, mirrors App\Services\BadgeService::BADGES) --------------

export const BADGE_CATALOG: { key: BadgeKey; label: string; description: string; target: number }[] = [
  {
    key: "rescued_10",
    label: "Item Rescuer",
    description: "Marked 10 items used via a recipe while they still had 3 days or less left.",
    target: 10,
  },
  {
    key: "first_link_recipe",
    label: "Link Master",
    description: "Imported your first recipe straight from a link.",
    target: 1,
  },
  {
    key: "full_week_variety",
    label: "Balanced Plate",
    description: "Hit all 5 food groups in your Food Balance score.",
    target: 1,
  },
  {
    key: "zero_waste_week",
    label: "Zero Waste Week",
    description: "Had nothing overdue at a weekly check-in.",
    target: 1,
  },
];
