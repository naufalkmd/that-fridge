import type { FlatItem, Recipe, ShoppingItem, UsageHistoryEntry } from "@thatfridge/core";

import {
  canFreeze,
  chefTasks,
  frozenShelfLifeDays,
  guardianTasks,
  isoDaysFromNow,
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
  it("sorts items with no food group, then offers the storage check once", () => {
    const tasks = organizerTasks([item("Mystery jar", { nutritionCategory: null }), item("Carrot")], false);
    expect(tasks.map((t) => t.kind)).toEqual(["sort-group", "check-storage"]);
    expect(organizerTasks([item("Carrot")], true)).toEqual([]);
  });
});

describe("isoDaysFromNow", () => {
  it("counts in local days", () => {
    expect(isoDaysFromNow(1, new Date(2026, 11, 31, 22))).toBe("2027-01-01");
  });
});
