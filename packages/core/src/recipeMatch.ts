// "Which recipes can I make?" - one answer for the whole app. The Crew hero line, the recipe book's
// Tonight's pick, restock suggestions, Chef's Activate plan and the scan's inventory check all
// use this, so they agree about the same fridge. (The server's what-to-eat ranking follows the
// same rule in App\Support\IngredientMatch.)
//
// The rule: a stocked item covers an ingredient when they're the same food by name - plurals and
// extra words allowed ("eggs" = "egg", "milk" = "whole milk") - or when both carry the same
// *specific* icon. Fallback icons never match: unrelated unknowns share them.

import { FRESHNESS_AT_RISK, normalizeItemName } from "./domain";
import type { Recipe, RecipeIngredient } from "./types";

/** Icons that mean "no particular food" - never a basis for a match. */
const NON_SPECIFIC_ICONS = new Set(["", "generic", "leftovers"]);

const words = (s: string) => normalizeItemName(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether two names are the same food: equal once normalised ("Eggs" / "egg"), or every word of
 * the shorter appears in the longer ("Milk" / "Whole milk"). A one-word match needs 3+ letters.
 */
export function sameFood(a: string, b: string): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = words(a);
  const wb = words(b);
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.length === 0 || !short.some((w) => w.length >= 3)) return false;
  const longSet = new Set(long.map(normalizeItemName));
  return short.every((w) => longSet.has(normalizeItemName(w)));
}

type Stock = { name: string; icon?: string | null };

export function coversIngredient(item: Stock, ing: Pick<RecipeIngredient, "name" | "icon">): boolean {
  if (sameFood(item.name, ing.name)) return true;
  const icon = ing.icon ?? "";
  return !NON_SPECIFIC_ICONS.has(icon) && item.icon === icon;
}

export function inStock(items: Stock[], ing: Pick<RecipeIngredient, "name" | "icon">): boolean {
  return items.some((i) => coversIngredient(i, ing));
}

export interface RecipeCoverage {
  have: number;
  total: number;
  missing: RecipeIngredient[];
}

export function recipeCoverage(recipe: Pick<Recipe, "ingredients">, items: Stock[]): RecipeCoverage {
  const missing = recipe.ingredients.filter((ing) => !inStock(items, ing));
  return { have: recipe.ingredients.length - missing.length, total: recipe.ingredients.length, missing };
}

type Perishable = Stock & { days: number; freshness: number };

export interface RankedRecipe<R> extends RecipeCoverage {
  recipe: R;
  /** Items about to turn that this recipe uses up. */
  rescues: Perishable[];
  score: number;
}

/**
 * Recipes worth cooking now, best first: 2 points for every ingredient that's about to turn
 * (freshness under FRESHNESS_AT_RISK, not yet past its date) plus the share of ingredients in
 * stock, so a dish that saves the spinach beats one that merely uses the pantry. Recipes with
 * nothing in stock are left out.
 */
export function rankRecipesToCook<R extends Pick<Recipe, "ingredients">>(recipes: R[], items: Perishable[]): RankedRecipe<R>[] {
  const expiring = items.filter((i) => i.days >= 0 && i.freshness < FRESHNESS_AT_RISK);
  return recipes
    .filter((r) => r.ingredients.length > 0)
    .map((recipe) => {
      const cov = recipeCoverage(recipe, items);
      const rescues = expiring.filter((i) => recipe.ingredients.some((ing) => coversIngredient(i, ing)));
      return { recipe, ...cov, rescues, score: rescues.length * 2 + cov.have / cov.total };
    })
    .filter((x) => x.have > 0)
    .sort((a, b) => b.score - a.score);
}
