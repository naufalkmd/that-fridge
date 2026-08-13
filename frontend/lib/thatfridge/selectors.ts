import { EMPTY_ICON, FOOD_GROUP_LABELS, FRIDGE_STYLES, ICON_LABELS, ICON_SECTION, ICONS } from "./data";
import { freshColor } from "./utils";
import type { Item, RecipeAttachment, RecipeCategory, Section } from "./types";
import type { ThatFridgeState } from "./useThatFridge";

export function findSectionIdForGroup(sections: Section[], group: string): string | null {
  const byId = sections.find((sec) => sec.id === group);
  if (byId) return byId.id;
  const byName = sections.find((sec) => sec.name.toLowerCase().includes(group));
  return byName ? byName.id : null;
}

export interface ItemWithSection extends Item {
  sectionName: string;
  sectionId: string;
  fridgeId: string;
  fridgeName: string;
}

export function getActiveFridgeItems(state: ThatFridgeState): ItemWithSection[] {
  const fridge = state.fridges[state.activeFridge];
  return fridge.sections.flatMap((sec) =>
    sec.items.map((item) => ({ ...item, sectionName: sec.name, sectionId: sec.id, fridgeId: fridge.id, fridgeName: fridge.name }))
  );
}

export function getAllItemsAllFridges(state: ThatFridgeState): ItemWithSection[] {
  return state.fridges.flatMap((fridge) =>
    fridge.sections.flatMap((sec) =>
      sec.items.map((item) => ({ ...item, sectionName: sec.name, sectionId: sec.id, fridgeId: fridge.id, fridgeName: fridge.name }))
    )
  );
}

export function getScopedItems(state: ThatFridgeState): ItemWithSection[] {
  return state.kitchenScope === "all" ? getAllItemsAllFridges(state) : getActiveFridgeItems(state);
}

export function getScopeLabel(state: ThatFridgeState): string {
  return state.kitchenScope === "all" ? "All Fridges" : state.fridges[state.activeFridge]?.name || "This Fridge";
}

export function findItem(state: ThatFridgeState, id: string): { item: Item; section: Section; fridgeIndex: number } | null {
  for (let fi = 0; fi < state.fridges.length; fi++) {
    for (const sec of state.fridges[fi].sections) {
      const item = sec.items.find((i) => i.id === id);
      if (item) return { item, section: sec, fridgeIndex: fi };
    }
  }
  return null;
}

export function getGuardianItem(state: ThatFridgeState): ItemWithSection | null {
  const items = getScopedItems(state);
  return items.length ? items.reduce((a, b) => (a.freshness < b.freshness ? a : b)) : null;
}

export function getLowStockItem(state: ThatFridgeState): ItemWithSection | null {
  const guardian = getGuardianItem(state);
  return getScopedItems(state).find((i) => i.qty <= 2 && i.id !== guardian?.id) || null;
}

export interface BuyAgainSuggestion {
  key: string;
  name: string;
  icon: string;
  count: number;
}

export function getBuyAgainSuggestions(state: ThatFridgeState, limit = 5): BuyAgainSuggestion[] {
  const stockedNames = new Set(getScopedItems(state).map((i) => i.name.trim().toLowerCase()));
  const listedNames = new Set(state.shoppingList.filter((i) => !i.checked).map((i) => i.name.trim().toLowerCase()));
  return state.usageHistory
    .filter((h) => !stockedNames.has(h.key) && !listedNames.has(h.key))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit)
    .map((h) => ({ key: h.key, name: h.name, icon: h.icon, count: h.count }));
}

export function getExpiringOwnedItems(state: ThatFridgeState, limit = 5): ItemWithSection[] {
  return getScopedItems(state)
    .slice()
    .sort((a, b) => a.freshness - b.freshness)
    .filter((i) => i.freshness < 50)
    .slice(0, limit);
}

export interface FridgeSummary {
  id: string;
  name: string;
  itemCount: number;
  freshness: number;
  color: string;
  style: string;
}

export function getFridgeSummaries(state: ThatFridgeState): FridgeSummary[] {
  return state.fridges.map((f) => {
    const items = f.sections.flatMap((s) => s.items);
    const freshness = items.length ? Math.round(items.reduce((a, i) => a + i.freshness, 0) / items.length) : 0;
    return { id: f.id, name: f.name, itemCount: items.length, freshness, color: freshColor(freshness), style: f.style || "photo" };
  });
}

export function iconFor(icon: string) {
  return ICONS[icon] || EMPTY_ICON;
}

export interface RecipeView {
  id: string;
  name: string;
  minutes: number;
  icon: string;
  category: RecipeCategory | null;
  isFavorite: boolean;
  isCustom: boolean;
  attachments: RecipeAttachment[];
  haveCount: number;
  total: number;
  ratioLabel: string;
  ratioColor: string;
  ratioBg: string;
  ingredientsView: { icon: string; name: string; have: boolean; badgeBg: string; statusLabel: string }[];
  stepsView: { n: number; text: string }[];
}

export function getRecipesView(state: ThatFridgeState): RecipeView[] {
  const allItems = getScopedItems(state);
  return state.recipes.map((r) => {
    const ingredientsView = r.ingredients.map((ing) => {
      const have = allItems.some((i) => i.icon === ing.icon);
      return {
        ...ing,
        have,
        badgeBg: have ? "#3f8f5c" : "rgba(22,50,92,0.35)",
        statusLabel: have ? "Have it" : "Need it",
      };
    });
    const haveCount = ingredientsView.filter((i) => i.have).length;
    const total = ingredientsView.length;
    return {
      id: r.id,
      name: r.name,
      minutes: r.minutes,
      icon: r.ingredients[0].icon,
      category: r.category,
      isFavorite: r.isFavorite,
      isCustom: r.isCustom,
      attachments: r.attachments,
      ingredientsView,
      stepsView: r.steps.map((text, i) => ({ text, n: i + 1 })),
      haveCount,
      total,
      ratioLabel: `${haveCount}/${total} ready`,
      ratioColor: haveCount === total ? "#3f8f5c" : "rgba(22,50,92,0.55)",
      ratioBg: haveCount === total ? "rgba(63,143,92,0.12)" : "rgba(22,50,92,0.06)",
    };
  });
}

export function getTonightPick(recipesView: RecipeView[]): RecipeView | null {
  return recipesView.length
    ? recipesView.reduce((best, r) => (r.haveCount / r.total > best.haveCount / best.total ? r : best))
    : null;
}

export type ShoppingRecommendationSource = "recipe" | "nutrition" | "habit";

export interface ShoppingRecommendation {
  id: string;
  source: ShoppingRecommendationSource;
  name: string;
  icon: string;
  reason: string;
}

export function getShoppingRecommendations(state: ThatFridgeState, limit = 6): ShoppingRecommendation[] {
  const scoped = getScopedItems(state);
  const shoppingNames = new Set(state.shoppingList.filter((i) => !i.checked).map((i) => i.name.trim().toLowerCase()));
  const stockedNames = new Set(scoped.map((i) => i.name.trim().toLowerCase()));
  const recs: ShoppingRecommendation[] = [];

  const habitPicks = getBuyAgainSuggestions(state, 2);
  for (const h of habitPicks) {
    recs.push({ id: `hab-${h.key}`, source: "habit", name: h.name, icon: h.icon, reason: `Bought ${h.count}× before` });
  }

  const recipesView = getRecipesView(state)
    .filter((r) => r.haveCount > 0 && r.haveCount < r.total)
    .sort((a, b) => b.haveCount / b.total - a.haveCount / a.total);
  const closestRecipe = recipesView[0];
  if (closestRecipe) {
    const missing = closestRecipe.ingredientsView.filter((ing) => !ing.have).slice(0, 2);
    for (const ing of missing) {
      if (shoppingNames.has(ing.name.trim().toLowerCase())) continue;
      recs.push({ id: `rec-${closestRecipe.id}-${ing.icon}`, source: "recipe", name: ing.name, icon: ing.icon, reason: `Needed for "${closestRecipe.name}"` });
    }
  }

  const groupCounts: Record<string, number> = { dairy: 0, produce: 0, protein: 0, leftovers: 0 };
  for (const item of scoped) {
    const group = ICON_SECTION[item.icon];
    if (group && group in groupCounts) groupCounts[group] += 1;
  }
  const lowestGroup = Object.entries(groupCounts).sort((a, b) => a[1] - b[1])[0]?.[0];
  if (lowestGroup) {
    const candidates = Object.keys(ICON_SECTION).filter((icon) => ICON_SECTION[icon] === lowestGroup);
    const picks = candidates
      .filter((icon) => !stockedNames.has((ICON_LABELS[icon] || icon).toLowerCase()) && !shoppingNames.has((ICON_LABELS[icon] || icon).toLowerCase()))
      .slice(0, 2);
    for (const icon of picks) {
      recs.push({
        id: `nut-${lowestGroup}-${icon}`,
        source: "nutrition",
        name: ICON_LABELS[icon] || icon,
        icon,
        reason: `Balance your ${FOOD_GROUP_LABELS[lowestGroup] || lowestGroup} intake`,
      });
    }
  }

  return recs.slice(0, limit);
}

export function styleDef(key: string) {
  return FRIDGE_STYLES.find((s) => s.key === key);
}

const DEFAULT_FRIDGE_PHOTO = "/images/thatfridge/fridge-hero.png";

export interface FridgeHeroView {
  id: string;
  name: string;
  itemCount: number;
  freshness: number;
  color: string;
  isCustom: boolean;
  photoSrc: string;
  photoUrl?: string | null;
  bg: string;
}

export function getFridgeHeroViews(state: ThatFridgeState): FridgeHeroView[] {
  return state.fridges.map((f) => {
    const items = f.sections.flatMap((s) => s.items);
    const freshness = items.length ? Math.round(items.reduce((a, i) => a + i.freshness, 0) / items.length) : 0;
    const style = f.style || "photo";
    const isCustom = style === "custom";
    const def = isCustom ? undefined : styleDef(style);
    const photoSrc = isCustom ? f.photoUrl || DEFAULT_FRIDGE_PHOTO : def ? def.photo : DEFAULT_FRIDGE_PHOTO;
    return {
      id: f.id,
      name: f.name,
      itemCount: items.length,
      freshness,
      color: freshColor(freshness),
      isCustom,
      photoSrc,
      photoUrl: f.photoUrl,
      bg: def ? def.bg : "#4a89c9",
    };
  });
}
