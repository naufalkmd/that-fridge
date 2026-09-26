import type { CalendarEntry } from "@thatfridge/core";
import {
  MAX_SLOTS,
  MEAL_TEMPLATES,
  compareMeals,
  defaultFridgeId,
  draftFromEntry,
  draftToInput,
  isValidTime,
  newDraft,
  normalizeSlots,
  userSlots,
  validateDraft,
} from "@/lib/mealPlan";

const meal = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "meal:1", kind: "meal", date: "2026-10-02", time: null, title: "Tacos", meta: "Dinner", tone: null,
  slot: "Dinner", status: "planned", note: null, by: null, refs: { mealEntryId: "1", fridgeId: "3" }, ...over,
});

describe("normalizeSlots", () => {
  test("trims, drops blanks and case-insensitive duplicates, keeps order", () => {
    expect(normalizeSlots([" Breakfast ", "Dinner", "dinner", "", "  ", "Meal prep"])).toEqual(["Breakfast", "Dinner", "Meal prep"]);
  });

  test("caps the count and the label length like the server does", () => {
    expect(normalizeSlots(Array.from({ length: 12 }, (_, i) => `Slot ${i}`))).toHaveLength(MAX_SLOTS);
    expect(normalizeSlots(["x".repeat(60)])[0]).toHaveLength(40);
  });
});

describe("userSlots", () => {
  test("reads preferences.meal_slots and tolerates junk", () => {
    expect(userSlots({ preferences: { meal_slots: ["Lunch", "Dinner"] } })).toEqual(["Lunch", "Dinner"]);
    expect(userSlots({ preferences: { meal_slots: "nope" } } as never)).toEqual([]);
    expect(userSlots({ preferences: { meal_slots: ["A", 3, null, "B"] } } as never)).toEqual(["A", "B"]);
    expect(userSlots({ preferences: null })).toEqual([]);
    expect(userSlots(null)).toEqual([]);
  });
});

describe("templates", () => {
  test("every template is already a valid slot list", () => {
    for (const t of MEAL_TEMPLATES) expect(normalizeSlots(t.slots)).toEqual(t.slots);
    expect(MEAL_TEMPLATES.map((t) => t.id)).toEqual(["classic", "dinner", "prep", "kids"]);
  });
});

describe("defaultFridgeId", () => {
  const fridges = [{ id: "1", role: "member" as const }, { id: "2", role: "owner" as const }];

  test("a single-fridge scope uses that fridge", () => {
    expect(defaultFridgeId(fridges, "1")).toBe("1");
  });

  test("All Fridges uses the fridge the user owns, or none (personal)", () => {
    expect(defaultFridgeId(fridges, "all")).toBe("2");
    expect(defaultFridgeId([{ id: "1", role: "member" as const }], "all")).toBeNull();
    expect(defaultFridgeId([], "all")).toBeNull();
  });
});

describe("drafts", () => {
  test("a new draft starts on the first slot and can be seeded with a recipe", () => {
    expect(newDraft("2026-10-02", ["Lunch", "Dinner"], "3")).toMatchObject({ id: null, slot: "Lunch", title: "", recipeId: null, fridgeId: "3", status: "planned" });
    expect(newDraft("2026-10-02", [], null, { id: "9", name: "Pad Thai" })).toMatchObject({ slot: "", title: "Pad Thai", recipeId: "9" });
  });

  test("editing round-trips an entry", () => {
    const d = draftFromEntry(meal({ time: "18:30", note: "use rice", refs: { mealEntryId: "7", recipeId: "9", fridgeId: "3" } }));
    expect(d).toMatchObject({ id: "7", time: "18:30", note: "use rice", recipeId: "9", fridgeId: "3", slot: "Dinner" });
  });

  test("validateDraft reports the first problem", () => {
    const ok = newDraft("2026-10-02", ["Dinner"], null);
    expect(validateDraft({ ...ok, title: "  " })).toMatch(/name or choose a recipe/);
    expect(validateDraft({ ...ok, title: "x", slot: " " })).toMatch(/slot/);
    expect(validateDraft({ ...ok, title: "x", time: "6pm" })).toMatch(/24-hour/);
    expect(validateDraft({ ...ok, title: "x", time: "18:30" })).toBeNull();
    expect(validateDraft({ ...ok, title: "x" })).toBeNull();
  });

  test("isValidTime accepts only HH:MM in range", () => {
    expect(["00:00", "09:05", "23:59"].every(isValidTime)).toBe(true);
    expect(["24:00", "9:05", "12:60", "12", ""].some(isValidTime)).toBe(false);
  });

  test("draftToInput trims, nulls blanks, and sends fridge_id only on create", () => {
    const created = draftToInput({ ...newDraft("2026-10-02", ["Dinner"], "3"), title: " Tacos ", note: " ", time: "" });
    expect(created).toEqual({ date: "2026-10-02", slot: "Dinner", time: null, recipe_id: null, title: "Tacos", note: null, status: "planned", fridge_id: "3" });

    const edited = draftToInput({ ...draftFromEntry(meal()), title: "Curry", time: "19:00" });
    expect(edited).not.toHaveProperty("fridge_id");
    expect(edited).toMatchObject({ title: "Curry", time: "19:00" });
  });
});

describe("compareMeals", () => {
  test("timed first by time, then the viewer's slot order, then title", () => {
    const list = [
      meal({ id: "a", title: "Zed", slot: "Dinner" }),
      meal({ id: "b", title: "Late", slot: "Snack", time: "21:00" }),
      meal({ id: "c", title: "Oats", slot: "Breakfast" }),
      meal({ id: "d", title: "Early", slot: "Snack", time: "07:30" }),
      meal({ id: "e", title: "Mystery", slot: "Brunch" }),
      meal({ id: "f", title: "Apple", slot: "Dinner" }),
    ];
    expect([...list].sort(compareMeals(["Breakfast", "Lunch", "Dinner"])).map((m) => m.id)).toEqual(["d", "b", "c", "f", "a", "e"]);
  });
});
