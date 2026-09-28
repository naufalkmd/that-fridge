import { coversIngredient, rankRecipesToCook, recipeCoverage, sameFood, type Recipe } from "@thatfridge/core";

const recipe = (name: string, ingredients: [string, string][]): Recipe =>
  ({ id: name, name, ingredients: ingredients.map(([n, icon]) => ({ name: n, icon })) }) as unknown as Recipe;
const item = (name: string, icon: string, over: { days?: number; freshness?: number } = {}) => ({ name, icon, days: 10, freshness: 80, ...over });

describe("the app-wide recipe match (core/recipeMatch)", () => {
  it("matches the same food by name, with plurals and extra words", () => {
    expect(sameFood("Eggs", "egg")).toBe(true);
    expect(sameFood("Milk", "Whole milk")).toBe(true);
    expect(sameFood("Oat milk", "Almond milk")).toBe(false);
  });

  it("matches a shared specific icon, never a fallback one", () => {
    expect(coversIngredient(item("Cheddar", "cheese"), { name: "Cheese", icon: "cheese" })).toBe(true);
    expect(coversIngredient(item("Leftover soup", "leftovers"), { name: "Galangal", icon: "leftovers" })).toBe(false);
    expect(coversIngredient(item("Mystery", "generic"), { name: "Tamarind", icon: "generic" })).toBe(false);
  });

  it("reports coverage with what's missing", () => {
    const c = recipeCoverage(recipe("Omelette", [["Eggs", "eggs"], ["Spinach", "spinach"], ["Feta", "icon5"]]), [item("egg", "generic"), item("Baby spinach", "spinach")]);
    expect(c.have).toBe(2);
    expect(c.missing.map((m) => m.name)).toEqual(["Feta"]);
  });

  it("ranks a dish that uses up expiring food above a better-stocked one", () => {
    const items = [item("Spinach", "spinach", { days: 1, freshness: 10 }), item("Rice", "icon6"), item("Soy sauce", "generic")];
    const ranked = rankRecipesToCook(
      [recipe("Fried rice", [["Rice", "icon6"], ["Soy sauce", "generic"]]), recipe("Spinach dal", [["Spinach", "spinach"], ["Lentils", "generic"]])],
      items,
    );
    expect(ranked.map((r) => r.recipe.name)).toEqual(["Spinach dal", "Fried rice"]);
    expect(ranked[0].rescues.map((i) => i.name)).toEqual(["Spinach"]);
  });

  it("leaves out recipes with nothing in stock", () => {
    expect(rankRecipesToCook([recipe("Laksa", [["Laksa paste", "generic"]])], [item("Milk", "milk")])).toEqual([]);
  });
});
