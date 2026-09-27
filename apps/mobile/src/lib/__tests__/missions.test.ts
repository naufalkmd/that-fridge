import type { FlatItem, Recipe, ShoppingItem, UsageHistoryEntry } from "@thatfridge/core";

import {
  canFreeze,
  chefTasks,
  defaultChoice,
  frozenShelfLifeDays,
  guardianTasks,
  isoDaysFromNow,
  missingDetails,
  organizerTasks,
  shopkeeperTasks,
  taskLine,
} from "../missions";

let n = 0;
const item = (name: string, over: Partial<FlatItem> = {}): FlatItem =>
  ({
    id: `i${n++}`,
    name,
    icon: name.toLowerCase(),
    freshness: 80,
    days: 10,
    note: "",
    qty: 2,
    location: "fridge",
    shopUrl: null,
    customFields: [],
    nutritionCategory: "vegetables",
    sectionId: "s1",
    sectionName: "General",
    fridgeId: "f1",
    fridgeName: "Home",
    ...over,
  }) as FlatItem;

const recipe = (name: string, ingredients: string[]): Recipe =>
  ({
    id: `r-${name}`,
    name,
    minutes: 20,
    category: "dinner",
    icon: null,
    iconUrl: null,
    ingredients: ingredients.map((i) => ({ name: i, icon: i.toLowerCase() })),
    steps: [],
    attachments: [],
    mealType: null,
    vibes: [],
    foodFocus: [],
    madeCount: 0,
    isFavorite: false,
    isCustom: false,
    isMine: true,
    ownerName: null,
    ownerUsername: null,
  }) as Recipe;

const shop = (name: string, checked = false): ShoppingItem =>
  ({ id: `l-${name}`, fridgeId: "f1", fridgeName: "Home", name, icon: null, section: "", checked, shopUrl: null }) as ShoppingItem;

describe("Guardian", () => {
  it("rescues what's about to turn first, soonest first, then what's expired", () => {
    const spinach = item("Spinach", { days: 1, freshness: 10 });
    const chicken = item("Chicken", { days: 0, freshness: 5, nutritionCategory: "protein" });
    const milk = item("Milk", { days: -2, freshness: 0 });
    const fresh = item("Carrot", { days: 12, freshness: 90 });
    const omelette = recipe("Spinach omelette", ["Spinach", "Egg"]);

    const tasks = guardianTasks([spinach, chicken, milk, fresh], [omelette]);

    expect(tasks.map((t) => t.kind)).toEqual(["rescue", "rescue", "expired"]);
    expect(tasks[0].kind === "rescue" && tasks[0].item.name).toBe("Chicken");
    const spinachTask = tasks[1];
    expect(spinachTask.kind === "rescue" && spinachTask.recipe?.name).toBe("Spinach omelette");
  });

  it("only offers to freeze what freezes well and isn't frozen already", () => {
    expect(canFreeze({ name: "Chicken thighs", location: "fridge" })).toBe(true);
    expect(canFreeze({ name: "Romaine lettuce", location: "fridge" })).toBe(false);
    expect(canFreeze({ name: "Eggs", location: "fridge" })).toBe(false);
    expect(canFreeze({ name: "Peas", location: "freezer" })).toBe(false);
    expect(frozenShelfLifeDays("protein")).toBe(90);
    expect(frozenShelfLifeDays("fruit")).toBe(60);
  });
});

describe("Chef", () => {
  it("ranks the dish that rescues expiring food above a better-stocked one", () => {
    const spinach = item("Spinach", { days: 1, freshness: 10 });
    const rice = item("Rice", { location: "pantry" });
    const soy = item("Soy sauce", { location: "pantry" });
    const tasks = chefTasks(
      [spinach, rice, soy],
      [recipe("Fried rice", ["Rice", "Soy sauce"]), recipe("Spinach dal", ["Spinach", "Lentils", "Onion"])],
    );
    expect(tasks[0].kind === "cook" && tasks[0].recipe.name).toBe("Spinach dal");
    const dal = tasks[0];
    expect(dal.kind === "cook" && dal.missing.map((m) => m.name)).toEqual(["Lentils", "Onion"]);
    expect(taskLine(dal)).toBe("This saves your spinach.");
  });

  it("asks Chef for an idea when no recipe uses what's expiring", () => {
    const tasks = chefTasks([item("Kale", { days: 1, freshness: 10 })], [recipe("Toast", ["Bread"])]);
    expect(tasks.map((t) => t.kind)).toEqual(["ask-chef"]);
  });
});

describe("Shopkeeper", () => {
  it("drops list items already at home, flags staples on their last one, then restocks", () => {
    const eggs = item("Eggs");
    const butter = item("Butter", { qty: 1 });
    const usage = [{ name: "Butter", count: 5 } as UsageHistoryEntry];
    const recs = [
      { key: "hab-bread", source: "habit" as const, name: "Bread", icon: "bread", reason: "You buy it often" },
      { key: "hab-eggs", source: "habit" as const, name: "Eggs", icon: "egg", reason: "You buy it often" },
    ];

    const tasks = shopkeeperTasks([eggs, butter], [shop("eggs"), shop("Milk", true)], usage, recs);

    expect(tasks.map((t) => t.kind)).toEqual(["list-have", "running-low", "restock"]);
    const restock = tasks[2];
    expect(restock.kind === "restock" && restock.rec.name).toBe("Bread"); // eggs are already on the list
  });

  it("doesn't call a list item redundant when the one at home is about to go", () => {
    const tasks = shopkeeperTasks([item("Milk", { freshness: 10, days: 1 })], [shop("Milk")], [], []);
    expect(tasks).toEqual([]);
  });
});

describe("Organizer", () => {
  const complete = { weight: 200, calories: 90, customFields: [] };

  it("sorts items with no food group, then offers the storage check once", () => {
    const tasks = organizerTasks([item("Mystery jar", { nutritionCategory: null, ...complete }), item("Carrot", complete)], false);
    expect(tasks.map((t) => t.kind)).toEqual(["sort-group", "check-storage"]);
    expect(organizerTasks([item("Carrot", complete)], true)).toEqual([]);
  });

  it("gathers items with blank details, the user's own fields first", () => {
    const protein = item("Tofu", { ...complete, customFields: [{ id: "c1", label: "Protein", value: "" }] });
    const noWeight = item("Rice", { ...complete, weight: null });
    const tasks = organizerTasks([noWeight, protein, item("Carrot", complete)], true);

    expect(tasks.map((t) => t.kind)).toEqual(["fill-details"]);
    const fill = tasks[0];
    expect(fill.kind === "fill-details" && fill.items.map((x) => x.item.name)).toEqual(["Tofu", "Rice"]);
    expect(taskLine(fill)).toBe("2 items are missing Protein, weight.");
    expect(defaultChoice(fill, 0)).toEqual({ action: "fill", ticked: false }); // costs credits
  });

  it("counts only empty fields as missing", () => {
    expect(missingDetails({ weight: null, calories: 0, customFields: [{ id: "a", label: "Fibre", value: " " }, { id: "b", label: "Brand", value: "Acme" }] })).toEqual([
      "weight",
      "Fibre",
    ]);
  });
});

describe("isoDaysFromNow", () => {
  it("counts in local days", () => {
    expect(isoDaysFromNow(1, new Date(2026, 11, 31, 22))).toBe("2027-01-01");
  });
});

describe("the crew's own decisions", () => {
  const chicken = item("Chicken", { days: 1, freshness: 10, nutritionCategory: "protein" });
  const lettuce = item("Lettuce", { days: 1, freshness: 10 });

  it("Guardian freezes what freezes, otherwise puts it on tonight's plan", () => {
    expect(defaultChoice({ kind: "rescue", id: "a", item: chicken, recipe: null, canFreeze: true }, 0)).toEqual({ action: "freeze", ticked: true });
    expect(defaultChoice({ kind: "rescue", id: "b", item: lettuce, recipe: null, canFreeze: false }, 0)).toEqual({ action: "plan-use-up", ticked: true });
    expect(defaultChoice({ kind: "rescue", id: "c", item: lettuce, recipe: recipe("Salad", ["Lettuce"]), canFreeze: false }, 0).action).toBe("plan-tonight");
  });

  it("never clears food or spends credits without the user opting in", () => {
    expect(defaultChoice({ kind: "expired", id: "e", item: chicken }, 0)).toEqual({ action: "toss", ticked: false });
    expect(defaultChoice({ kind: "check-storage", id: "s", count: 20 }, 0).ticked).toBe(false);
  });

  it("Chef plans the best dish tonight and keeps the rest as options", () => {
    const cook = (missing: string[]) => ({ kind: "cook" as const, id: "k", recipe: recipe("Dal", ["Lentils"]), have: 1, total: 2, missing: missing.map((m) => ({ name: m, icon: m })), rescues: [] });
    expect(defaultChoice(cook(["Onion"]), 0)).toEqual({ action: "plan-tonight-shop", ticked: true });
    expect(defaultChoice(cook([]), 0)).toEqual({ action: "plan-tonight", ticked: true });
    expect(defaultChoice(cook([]), 1)).toEqual({ action: "plan-tomorrow", ticked: false });
  });

  it("Organizer files an item under the group its icon implies, and asks when it can't tell", () => {
    const milk = item("Milk", { icon: "milk", nutritionCategory: null });
    expect(defaultChoice({ kind: "sort-group", id: "g", item: milk }, 0)).toEqual({ action: "group:dairy", ticked: true });
    const jar = item("Mystery jar", { icon: "zzz", nutritionCategory: null });
    expect(defaultChoice({ kind: "sort-group", id: "h", item: jar }, 0)).toEqual({ action: null, ticked: false });
  });
});
