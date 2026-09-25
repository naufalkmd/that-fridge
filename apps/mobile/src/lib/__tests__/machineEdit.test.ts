import { ApiError, type MachineStep, type MachineTrigger } from "@thatfridge/core";
import {
  describeMachineError,
  isValidTime,
  parseNumber,
  patchTrigger,
  setStepArg,
  setStepCondition,
} from "@/lib/machineEdit";

describe("parseNumber", () => {
  test("parses integers and decimals", () => {
    expect(parseNumber("5")).toBe(5);
    expect(parseNumber("2.5")).toBe(2.5);
    expect(parseNumber(" 12 ")).toBe(12);
    expect(parseNumber("-3")).toBe(-3);
  });

  test("rejects half-typed or non-numeric text so the last good value is kept", () => {
    for (const bad of ["", "-", "1.", ".5", "abc", "1e3", "1,5"]) expect(parseNumber(bad)).toBeNull();
  });

  test("integer mode refuses a decimal", () => {
    expect(parseNumber("2.5", { integer: true })).toBeNull();
    expect(parseNumber("2", { integer: true })).toBe(2);
  });
});

describe("isValidTime", () => {
  test("accepts 24h HH:MM only", () => {
    expect(isValidTime("08:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("8:00")).toBe(false);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
  });
});

describe("setStepArg", () => {
  const steps: MachineStep[] = [
    { tool: "add_item", args: { name: "Bread", quantity: 1, calories: 250 } },
    { tool: "bulk_add_items", args: { items: [{ name: "Eggs", quantity: 6 }, { name: "Milk" }] } },
  ];

  test("replaces one argument without touching anything else or mutating the input", () => {
    const next = setStepArg(steps, 0, ["quantity"], 3);
    expect(next[0].args).toEqual({ name: "Bread", quantity: 3, calories: 250 });
    expect(next[1]).toBe(steps[1]);
    expect(steps[0].args.quantity).toBe(1);
  });

  test("edits the calorie number", () => {
    expect(setStepArg(steps, 0, ["calories"], 300)[0].args.calories).toBe(300);
  });

  test("reaches into nested arrays of objects", () => {
    const next = setStepArg(steps, 1, ["items", 0, "quantity"], 12);
    expect((next[1].args.items as { quantity: number }[])[0].quantity).toBe(12);
    expect((next[1].args.items as { name: string }[])[1].name).toBe("Milk");
    expect((steps[1].args.items as { quantity: number }[])[0].quantity).toBe(6);
  });

  test("edits an item name", () => {
    const next = setStepArg(steps, 1, ["items", 1, "name"], "Oat milk");
    expect((next[1].args.items as { name: string }[])[1].name).toBe("Oat milk");
  });
});

describe("setStepCondition", () => {
  const steps: MachineStep[] = [
    { tool: "sum_item_field", args: { field: "calories" } },
    { tool: "notify_user", args: { message: "x" }, condition: { step: 1, op: "gt", value: 100 } },
  ];

  test("patches the condition's number and operator", () => {
    const next = setStepCondition(steps, 1, { value: 500, op: "lte" });
    expect(next[1].condition).toEqual({ step: 1, op: "lte", value: 500 });
  });

  test("leaves a step with no condition alone", () => {
    expect(setStepCondition(steps, 0, { value: 1 })[0]).toBe(steps[0]);
  });
});

describe("patchTrigger", () => {
  const weekly = (weekday = 1): MachineTrigger => ({
    type: "schedule",
    config: { frequency: "weekly", time: "08:00", weekday, timezone: "UTC" },
  });

  test("switching to daily clears the weekday; back to weekly restores one", () => {
    const daily = patchTrigger(weekly(4), { frequency: "daily" });
    expect(daily.type === "schedule" && daily.config.weekday).toBeNull();
    const back = patchTrigger(daily, { frequency: "weekly" });
    expect(back.type === "schedule" && back.config.weekday).toBe(1);
  });

  test("changing the time keeps everything else", () => {
    const t = patchTrigger(weekly(4), { time: "18:30" });
    expect(t).toEqual({ type: "schedule", config: { frequency: "weekly", time: "18:30", weekday: 4, timezone: "UTC" } });
  });

  test("threshold: unit only for weight, label only for custom", () => {
    const base: MachineTrigger = {
      type: "threshold",
      config: { field: "quantity", custom_field_label: null, unit: null, op: "lte", value: 5 },
    };
    const weight = patchTrigger(base, { field: "weight" });
    expect(weight.type === "threshold" && weight.config.unit).toBe("g");
    const custom = patchTrigger(weight, { field: "custom" });
    expect(custom.type === "threshold" && custom.config.unit).toBeNull();
    expect(custom.type === "threshold" && custom.config.custom_field_label).toBe("");
    const calories = patchTrigger(custom, { field: "calories", value: 2000 });
    expect(calories.type === "threshold" && calories.config).toMatchObject({ unit: null, custom_field_label: null, value: 2000 });
  });

  test("item_added: a blank search becomes null (any item)", () => {
    const t = patchTrigger({ type: "item_added", config: { search: "milk", location: null } }, { search: "" });
    expect(t.type === "item_added" && t.config.search).toBeNull();
  });
});

describe("describeMachineError", () => {
  test("joins the server's list of validation sentences", () => {
    const err = new ApiError(422, "Request failed (422)", ["step 1: \"quantity\" is required.", "step 2: bad"] as never);
    expect(describeMachineError(err, "fallback")).toBe('step 1: "quantity" is required.\nstep 2: bad');
  });

  test("falls back to the message, then the fallback for non-API errors", () => {
    expect(describeMachineError(new ApiError(500, "Boom"), "fallback")).toBe("Boom");
    expect(describeMachineError(new Error("x"), "fallback")).toBe("fallback");
  });
});
