import type { CalendarEntry, CurrentUser, Fridge, MealEntryInput, MealStatus } from "@thatfridge/core";

// Pure meal-plan logic (no React, no I/O) for the calendar's day sheet: suggested slot templates,
// the user's own slot list, the editable draft and its validation. Slots are the user's own free
// labels - the templates are only suggestions to start from.

export const MAX_SLOTS = 8;
export const MAX_SLOT_LENGTH = 40;

export interface MealTemplate {
  id: string;
  label: string;
  slots: string[];
}

export const MEAL_TEMPLATES: MealTemplate[] = [
  { id: "classic", label: "Breakfast, lunch, dinner, snack", slots: ["Breakfast", "Lunch", "Dinner", "Snack"] },
  { id: "dinner", label: "Dinner only", slots: ["Dinner"] },
  { id: "prep", label: "Meal-prep Sunday + weekday lunches", slots: ["Meal prep", "Lunch", "Dinner"] },
  { id: "kids", label: "Kids' lunchbox + dinner", slots: ["Kids' lunchbox", "Dinner"] },
];

export const STATUS_LABEL: Record<MealStatus, string> = {
  planned: "Planned",
  cooked: "Cooked",
  skipped: "Skipped",
};

/** Trim, drop blanks, drop case-insensitive duplicates, cap at MAX_SLOTS (same rules as the server). */
export function normalizeSlots(slots: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of slots) {
    const label = raw.trim().slice(0, MAX_SLOT_LENGTH);
    const key = label.toLowerCase();
    if (label === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length === MAX_SLOTS) break;
  }
  return out;
}

/** The user's saved slot list (preferences.meal_slots), tolerant of a missing or malformed value. */
export function userSlots(user: Pick<CurrentUser, "preferences"> | null | undefined): string[] {
  // Read as unknown: a malformed stored value must not crash the calendar.
  const raw: unknown = user?.preferences?.meal_slots;
  return Array.isArray(raw) ? normalizeSlots(raw.filter((s): s is string => typeof s === "string")) : [];
}

/**
 * Which fridge a new entry belongs to. A single-fridge scope uses that fridge; with "All
 * Fridges" it is the user's own fridge (so the plan reaches the household when the owner is
 * Pro), or none - a personal entry - if they own none.
 */
export function defaultFridgeId(fridges: readonly Pick<Fridge, "id" | "role">[], scope: string): string | null {
  if (scope !== "all") return scope;
  return fridges.find((f) => f.role === "owner")?.id ?? null;
}

export interface MealDraft {
  /** null for a new entry. */
  id: string | null;
  date: string;
  slot: string;
  time: string; // "" or "HH:MM"
  title: string;
  recipeId: string | null;
  note: string;
  /** A number the user typed (whole kcal), or "" to let the server estimate it. */
  calories: string;
  status: MealStatus;
  fridgeId: string | null;
}

export function newDraft(
  date: string,
  slots: readonly string[],
  fridgeId: string | null,
  recipe?: { id: string; name: string } | null,
): MealDraft {
  return {
    id: null, date, slot: slots[0] ?? "", time: "", title: recipe?.name ?? "", recipeId: recipe?.id ?? null,
    note: "", calories: "", status: "planned", fridgeId,
  };
}

export function draftFromEntry(entry: CalendarEntry): MealDraft {
  return {
    id: entry.refs.mealEntryId ?? null,
    date: entry.date,
    slot: entry.slot ?? "",
    time: entry.time ?? "",
    title: entry.title,
    recipeId: entry.refs.recipeId ?? null,
    note: entry.note ?? "",
    // Only a typed number is editable; an estimate shows as the field's placeholder instead.
    calories: entry.caloriesSource === "manual" && entry.calories != null ? String(entry.calories) : "",
    status: entry.status ?? "planned",
    fridgeId: entry.refs.fridgeId ?? null,
  };
}

export const isValidTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export const MAX_MEAL_KCAL = 5000;
export const isValidCalories = (c: string): boolean => /^\d{1,4}$/.test(c) && Number(c) <= MAX_MEAL_KCAL;

/** A user-facing message for the first problem, or null when the draft can be saved. */
export function validateDraft(d: MealDraft): string | null {
  if (d.title.trim() === "") return "Add a name or choose a recipe.";
  if (d.slot.trim() === "") return "Pick a meal slot.";
  if (d.time !== "" && !isValidTime(d.time)) return "Use a 24-hour time like 18:30, or leave it blank.";
  if (d.calories !== "" && !isValidCalories(d.calories)) return `Calories must be a whole number up to ${MAX_MEAL_KCAL}, or leave it blank.`;
  return null;
}

/** The request body. `fridge_id` is sent only when creating - an edit never moves an entry. */
export function draftToInput(d: MealDraft): MealEntryInput {
  const input: MealEntryInput = {
    date: d.date,
    slot: d.slot.trim(),
    time: d.time === "" ? null : d.time,
    recipe_id: d.recipeId,
    title: d.title.trim(),
    note: d.note.trim() === "" ? null : d.note.trim(),
    // Blank = let the server (re)work it out; a typed number is kept as-is.
    calories: d.calories.trim() === "" ? null : Number(d.calories),
    status: d.status,
  };
  if (d.id === null) input.fridge_id = d.fridgeId;
  return input;
}

/** Order a day's meals: by time (untimed last), then the viewer's slot order, then title. */
export function compareMeals(slots: readonly string[]): (a: CalendarEntry, b: CalendarEntry) => number {
  const rank = (slot: string | undefined) => {
    const i = slots.findIndex((s) => s.toLowerCase() === (slot ?? "").toLowerCase());
    return i === -1 ? slots.length : i;
  };
  return (a, b) => {
    if (a.time !== b.time) {
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time < b.time ? -1 : 1;
    }
    const bySlot = rank(a.slot) - rank(b.slot);
    return bySlot !== 0 ? bySlot : a.title.localeCompare(b.title);
  };
}

/** "1,240" - thousands separators without depending on the device locale. */
export const withThousands = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** What one autofill costs in AI credits - keep in step with CreditCost::MEAL_AUTOFILL on the server. */
export const MEAL_AUTOFILL_COST = 3;

export const kcalLabel = (kcal: number): string => `≈ ${withThousands(kcal)} kcal`;

/** What a day's meals add up to: skipped meals do not count, and meals with no estimate are reported
 *  rather than silently treated as zero. */
export function mealsTotal(entries: readonly CalendarEntry[]): { kcal: number; counted: number; total: number } {
  const eaten = entries.filter((e) => e.kind === "meal" && e.status !== "skipped");
  const counted = eaten.filter((e) => typeof e.calories === "number");
  return { kcal: counted.reduce((sum, e) => sum + (e.calories as number), 0), counted: counted.length, total: eaten.length };
}
