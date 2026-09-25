import type { Machine, MachineTrigger, WeightUnit } from "@thatfridge/core";
import { findOverlappingMachine, triggersOverlap } from "@/lib/machineOverlap";

function schedule(overrides: Partial<{ frequency: "daily" | "weekly"; time: string; weekday: number | null }> = {}): MachineTrigger {
  return {
    type: "schedule",
    config: { frequency: "daily", time: "08:00", weekday: null, timezone: "UTC", ...overrides },
  };
}

function threshold(overrides: Partial<{ field: "quantity" | "weight" | "calories" | "custom"; op: "lt" | "lte" | "gt" | "gte"; value: number; unit: WeightUnit | null; custom_field_label: string | null }> = {}): MachineTrigger {
  return {
    type: "threshold",
    config: { field: "quantity", custom_field_label: null, unit: null, op: "lte", value: 5, ...overrides },
  };
}

function machine(overrides: Partial<Machine> = {}): Machine {
  return {
    id: "m1",
    name: "Machine",
    prompt: null,
    fridgeId: "fridge-1",
    trigger: schedule(),
    steps: [{ tool: "notify_user", args: { message: "hi" } }],
    enabled: true,
    version: 1,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    runCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("triggersOverlap", () => {
  test("identical schedules overlap", () => {
    expect(triggersOverlap(schedule(), schedule())).toBe(true);
  });

  test("schedules at a different time do not overlap", () => {
    expect(triggersOverlap(schedule({ time: "08:00" }), schedule({ time: "09:00" }))).toBe(false);
  });

  test("schedules on a different weekday do not overlap", () => {
    expect(
      triggersOverlap(
        schedule({ frequency: "weekly", weekday: 1 }),
        schedule({ frequency: "weekly", weekday: 2 }),
      ),
    ).toBe(false);
  });

  test("identical thresholds overlap", () => {
    expect(triggersOverlap(threshold(), threshold())).toBe(true);
  });

  test("thresholds with a different value do not overlap", () => {
    expect(triggersOverlap(threshold({ value: 5 }), threshold({ value: 2 }))).toBe(false);
  });

  test("different trigger types never overlap", () => {
    expect(triggersOverlap(schedule(), threshold())).toBe(false);
  });

  test("item_added triggers overlap only on an exact search+location match", () => {
    const a: MachineTrigger = { type: "item_added", config: { search: "milk", location: "fridge" } };
    const b: MachineTrigger = { type: "item_added", config: { search: "milk", location: "fridge" } };
    const c: MachineTrigger = { type: "item_added", config: { search: "milk", location: "freezer" } };
    expect(triggersOverlap(a, b)).toBe(true);
    expect(triggersOverlap(a, c)).toBe(false);
  });

  test("recipe_made triggers overlap only on the same recipe_id (or both null/any)", () => {
    const anyRecipe: MachineTrigger = { type: "recipe_made", config: { recipe_id: null } };
    const specific: MachineTrigger = { type: "recipe_made", config: { recipe_id: 7 } };
    expect(triggersOverlap(anyRecipe, { type: "recipe_made", config: { recipe_id: null } })).toBe(true);
    expect(triggersOverlap(specific, { type: "recipe_made", config: { recipe_id: 7 } })).toBe(true);
    expect(triggersOverlap(anyRecipe, specific)).toBe(false);
  });
});

describe("findOverlappingMachine", () => {
  test("finds an enabled machine on the same fridge with an overlapping trigger", () => {
    const other = machine({ id: "m2", name: "Other", trigger: schedule() });
    const result = findOverlappingMachine([other], schedule(), "fridge-1", null);
    expect(result?.id).toBe("m2");
  });

  test("ignores a disabled machine even with the same trigger", () => {
    const other = machine({ id: "m2", enabled: false, trigger: schedule() });
    expect(findOverlappingMachine([other], schedule(), "fridge-1", null)).toBeNull();
  });

  test("ignores a machine on a different fridge", () => {
    const other = machine({ id: "m2", fridgeId: "fridge-2", trigger: schedule() });
    expect(findOverlappingMachine([other], schedule(), "fridge-1", null)).toBeNull();
  });

  test("excludes the machine being edited/enabled itself", () => {
    const self = machine({ id: "m1", trigger: schedule() });
    expect(findOverlappingMachine([self], schedule(), "fridge-1", "m1")).toBeNull();
  });

  test("returns null when nothing overlaps", () => {
    const other = machine({ id: "m2", trigger: schedule({ time: "20:00" }) });
    expect(findOverlappingMachine([other], schedule({ time: "08:00" }), "fridge-1", null)).toBeNull();
  });
});
