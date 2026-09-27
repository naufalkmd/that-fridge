// Crew missions: each crew member looks at the kitchen from its own job, decides what to do about
// each thing it finds, and the user approves the whole plan with one press (Crew tab → Activate). Everything here is
// computed on the phone from data the app already has, so a mission is instant and costs no
// credits; the only paid step is Organizer's optional storage check, which asks first.
//
// Roles:
//   Guardian   - stop food going to waste: rescue what's about to turn, clear what already has.
//   Chef       - cook from what you have, starting with what's about to expire.
//   Shopkeeper - keep the list honest: restock what runs out, drop what's already home.
//   Organizer  - keep the inventory in order: food groups, storage spots.

import {
  guessFoodIcon,
  normalizeItemName,
  nutritionCategoryForIcon,
  type FlatItem,
  type NutritionCategory,
  type Recipe,
  type RecipeIngredient,
  type ShoppingItem,
  type ShoppingRecommendation,
  type StorageLocation,
  type UsageHistoryEntry,
} from "@thatfridge/core";

export type MissionTask =
  /** Guardian: an item about to turn. */
  | { kind: "rescue"; id: string; item: FlatItem; recipe: Recipe | null; canFreeze: boolean }
  /** Guardian: an item already past its date. */
  | { kind: "expired"; id: string; item: FlatItem }
  /** Chef: a recipe to cook, ranked by how much of what's expiring it uses. */
  | { kind: "cook"; id: string; recipe: Recipe; have: number; total: number; missing: RecipeIngredient[]; rescues: FlatItem[] }
  /** Chef: nothing in the recipe book fits what's expiring - ask Chef for an idea. */
  | { kind: "ask-chef"; id: string; items: FlatItem[] }
  /** Shopkeeper: on the shopping list but already at home. */
  | { kind: "list-have"; id: string; entry: ShoppingItem; item: FlatItem }
  /** Shopkeeper: something you use a lot is down to its last one. */
  | { kind: "running-low"; id: string; item: FlatItem; uses: number }
  /** Shopkeeper: a restock suggestion (a recipe you're close to, or a habit). */
  | { kind: "restock"; id: string; rec: ShoppingRecommendation }
  /** Organizer: an item with no food group. */
  | { kind: "sort-group"; id: string; item: FlatItem }
  /** Organizer: offer the AI storage check (costs credits, asks first). */
  | { kind: "check-storage"; id: string; count: number }
  /** Organizer: the storage check found something in the wrong spot. */
  | { kind: "move"; id: string; move: { id: string; name: string; icon: string; from: StorageLocation; to: StorageLocation } };

export type MissionAgent = "Guardian" | "Chef" | "Shopkeeper" | "Organizer";

/** Tasks per mission: short enough to finish in half a minute. */
export const MISSION_SIZE = 5;

/** Freshness below this counts as about to turn (same line as the Guardian panel's "at risk"). */
export const AT_RISK = 30;

const has = (items: Pick<FlatItem, "name" | "icon">[], ing: RecipeIngredient) =>
  items.some((i) => i.icon === ing.icon || normalizeItemName(i.name) === normalizeItemName(ing.name));

const usesItem = (recipe: Recipe, item: Pick<FlatItem, "name" | "icon">) =>
  recipe.ingredients.some((ing) => ing.icon === item.icon || normalizeItemName(ing.name) === normalizeItemName(item.name));

// ---- Guardian ------------------------------------------------------------------

/** Foods whose texture is ruined by freezing - Guardian doesn't offer to freeze them. */
const DOESNT_FREEZE = [
  "lettuce", "salad", "cucumber", "celery", "radish", "sprout", "watercress", "egg", "yogurt", "yoghurt",
  "mayo", "mayonnaise", "cream cheese", "sour cream", "custard", "watermelon", "melon", "tomato", "potato",
];

export function canFreeze(item: Pick<FlatItem, "name" | "location">): boolean {
  if (item.location === "freezer" || item.location === "pantry") return false;
  const name = normalizeItemName(item.name);
  return !DOESNT_FREEZE.some((w) => name.includes(w));
}

/** Roughly how long something keeps once frozen, for its new date. Conservative - quality, not safety. */
export function frozenShelfLifeDays(category: NutritionCategory | null | undefined): number {
  return category === "protein" || category === "grains" ? 90 : 60;
}

export function guardianTasks(items: FlatItem[], recipes: Recipe[]): MissionTask[] {
  const expired = items
    .filter((i) => i.days < 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2)
    .map((item): MissionTask => ({ kind: "expired", id: `expired-${item.id}`, item }));

  const rescue = items
    .filter((i) => i.days >= 0 && i.freshness < AT_RISK)
    .sort((a, b) => a.days - b.days || a.freshness - b.freshness)
    .map((item): MissionTask => {
      // The recipe that uses it and needs the least else.
      const recipe =
        recipes
          .filter((r) => usesItem(r, item))
          .map((r) => ({ r, have: r.ingredients.filter((ing) => has(items, ing)).length / Math.max(1, r.ingredients.length) }))
          .sort((a, b) => b.have - a.have)[0]?.r ?? null;
      return { kind: "rescue", id: `rescue-${item.id}`, item, recipe, canFreeze: canFreeze(item) };
    });

  return [...rescue, ...expired].slice(0, MISSION_SIZE);
}

// ---- Chef ----------------------------------------------------------------------

/**
 * Recipes worth cooking now: each scores 2 points for every ingredient that's about to turn and
 * 1 for coverage, so a dish that rescues the spinach beats one that merely uses the pantry.
 */
export function chefTasks(items: FlatItem[], recipes: Recipe[]): MissionTask[] {
  const expiring = items.filter((i) => i.days >= 0 && i.freshness < AT_RISK);
  const ranked = recipes
    .filter((r) => r.ingredients.length > 0)
    .map((recipe) => {
      const have = recipe.ingredients.filter((ing) => has(items, ing)).length;
      const rescues = expiring.filter((i) => usesItem(recipe, i));
      const missing = recipe.ingredients.filter((ing) => !has(items, ing));
      const score = rescues.length * 2 + have / recipe.ingredients.length;
      return { recipe, have, total: recipe.ingredients.length, rescues, missing, score };
    })
    .filter((x) => x.have > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x): MissionTask => ({ kind: "cook", id: `cook-${x.recipe.id}`, ...x }));

  // Expiring food no recipe uses: ask Chef for an idea rather than let it go.
  const uncovered = expiring.filter((i) => !ranked.some((t) => t.kind === "cook" && t.rescues.some((r) => r.id === i.id)));
  if (uncovered.length > 0) ranked.push({ kind: "ask-chef", id: "ask-chef", items: uncovered.slice(0, 3) });
  return ranked.slice(0, MISSION_SIZE);
}

// ---- Shopkeeper ------------------------------------------------------------------

export function shopkeeperTasks(
  items: FlatItem[],
  list: ShoppingItem[],
  usage: UsageHistoryEntry[],
  recs: ShoppingRecommendation[],
): MissionTask[] {
  const out: MissionTask[] = [];
  const open = list.filter((s) => !s.checked);

  // On the list, but a fresh one is already at home.
  for (const entry of open) {
    const item = items.find((i) => normalizeItemName(i.name) === normalizeItemName(entry.name) && i.freshness >= AT_RISK);
    if (item) out.push({ kind: "list-have", id: `have-${entry.id}`, entry, item });
  }

  // Staples (used 3+ times) down to their last one and not already on the list.
  const onList = new Set(open.map((s) => normalizeItemName(s.name)));
  for (const item of items) {
    const key = normalizeItemName(item.name);
    const uses = usage.find((u) => normalizeItemName(u.name) === key)?.count ?? 0;
    if (item.qty <= 1 && uses >= 3 && !onList.has(key)) {
      out.push({ kind: "running-low", id: `low-${item.id}`, item, uses });
      onList.add(key);
    }
  }

  for (const rec of recs) {
    if (!onList.has(normalizeItemName(rec.name))) out.push({ kind: "restock", id: `rec-${rec.key}`, rec });
  }
  return out.slice(0, MISSION_SIZE);
}

// ---- Organizer -------------------------------------------------------------------

export function organizerTasks(items: FlatItem[], storageChecked: boolean): MissionTask[] {
  const out: MissionTask[] = items
    .filter((i) => !i.nutritionCategory)
    .slice(0, MISSION_SIZE - 1)
    .map((item) => ({ kind: "sort-group", id: `group-${item.id}`, item }));
  if (!storageChecked && items.length > 0) out.push({ kind: "check-storage", id: "check-storage", count: items.length });
  return out;
}

// ---- what the crew says ----------------------------------------------------------

const whenLabel = (days: number) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

/** The crew member's line for a task, in its own voice. No AI. */
export function taskLine(t: MissionTask): string {
  switch (t.kind) {
    case "rescue":
      return t.recipe
        ? `${t.item.name} turns ${whenLabel(t.item.days)}. ${t.recipe.name} uses it.`
        : `${t.item.name} turns ${whenLabel(t.item.days)}. Use it or ${t.canFreeze ? "freeze it" : "cook it"} before it's lost.`;
    case "expired":
      return `${t.item.name} is ${Math.abs(t.item.days)} day${Math.abs(t.item.days) === 1 ? "" : "s"} past its date. Check it, then clear it.`;
    case "cook":
      return t.rescues.length
        ? `This saves your ${t.rescues.map((i) => i.name.toLowerCase()).join(" and ")}.`
        : `You have ${t.have} of ${t.total} ingredients.`;
    case "ask-chef":
      return `Nothing in your book uses ${t.items.map((i) => i.name.toLowerCase()).join(", ")}. Want an idea?`;
    case "list-have":
      return `${t.entry.name} is on your list, but you already have some at home.`;
    case "running-low":
      return `You go through ${t.item.name.toLowerCase()} a lot and you're on your last one.`;
    case "restock":
      return t.rec.reason;
    case "sort-group":
      return `${t.item.name} has no food group, so it doesn't count toward your balance.`;
    case "move":
      return `${t.move.name} keeps better in the ${locationWord[t.move.to]} than the ${locationWord[t.move.from]}.`;
    case "check-storage":
      return `I can check whether your ${t.count} item${t.count === 1 ? " is" : "s are"} stored in the right spot.`;
  }
}

export const FOOD_GROUPS: { key: NutritionCategory; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "vegetables", label: "Veg" },
  { key: "fruit", label: "Fruit" },
  { key: "grains", label: "Grains" },
  { key: "dairy", label: "Dairy" },
  { key: "other_extras", label: "Other" },
];

export const locationWord: Record<StorageLocation, string> = { fridge: "fridge", freezer: "freezer", pantry: "pantry" };

/** YYYY-MM-DD `n` days from today, local time. */
export function isoDaysFromNow(n: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- the crew's own decisions --------------------------------------------------

/** The food group an item's icon (or its name's best icon) implies, with no AI and no credits. */
export function localFoodGroup(item: Pick<FlatItem, "icon" | "name">): NutritionCategory | null {
  return nutritionCategoryForIcon(item.icon) ?? nutritionCategoryForIcon(guessFoodIcon(item.name));
}

/**
 * What the crew member decides to do about a task when activated, and whether that goes in the
 * plan ticked. The rule: act on what's safe and reversible; leave anything destructive (clearing
 * food), anything that costs credits, or anything that needs the user's judgement unticked.
 * `action` null means there's no automatic action - the row only offers choices.
 */
export function defaultChoice(t: MissionTask, index: number): { action: string | null; ticked: boolean } {
  switch (t.kind) {
    case "rescue":
      if (t.canFreeze) return { action: "freeze", ticked: true };
      return { action: t.recipe ? "plan-tonight" : "plan-use-up", ticked: true };
    case "expired":
      return { action: "toss", ticked: false };
    case "cook":
      // The best dish goes on tonight's plan; the others stay as alternatives.
      if (index > 0) return { action: "plan-tomorrow", ticked: false };
      return { action: t.missing.length ? "plan-tonight-shop" : "plan-tonight", ticked: true };
    case "ask-chef":
      return { action: null, ticked: false };
    case "list-have":
      return { action: "remove", ticked: true };
    case "running-low":
    case "restock":
      return { action: "add", ticked: true };
    case "sort-group": {
      const group = localFoodGroup(t.item);
      return group ? { action: `group:${group}`, ticked: true } : { action: null, ticked: false };
    }
    case "check-storage":
      return { action: "check", ticked: false }; // costs credits: the user opts in
    case "move":
      return { action: "move", ticked: true };
  }
}
