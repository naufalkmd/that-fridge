import type { Recipe } from "@thatfridge/core";

/**
 * The calories line for a recipe: an estimate for ONE serving, worked out server-side from its
 * ingredients (the nutrition table, or the model where the table can't cover them). Always shown
 * with "≈" because it is an estimate; null when a recipe has no number yet.
 */
export function caloriesLabel(recipe: Pick<Recipe, "calories">, perServing = false): string | null {
  const kcal = recipe.calories;
  if (typeof kcal !== "number" || !Number.isFinite(kcal) || kcal <= 0) return null;
  return `≈ ${Math.round(kcal)} kcal${perServing ? " per serving" : ""}`;
}

/** " · ≈ 420 kcal" to append to a meta line like "20 min", or "" when there is no number. */
export function caloriesSuffix(recipe: Pick<Recipe, "calories">, perServing = false): string {
  const label = caloriesLabel(recipe, perServing);
  return label ? ` · ${label}` : "";
}
