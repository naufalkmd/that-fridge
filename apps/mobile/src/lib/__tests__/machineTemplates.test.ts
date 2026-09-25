import { MACHINE_TEMPLATES } from "@/lib/machineTemplates";
import { darkColors } from "@/lib/theme";
import type { MachineStep, MachineTrigger } from "@thatfridge/core";

// Mirrors AgentToolbox::MACHINE_TOOLS on the backend - what MachineDraftValidator actually
// allows a Machine step to call. Kept in sync manually; if the backend list changes, a
// template using a tool that's no longer machine-eligible should fail loudly here.
const MACHINE_TOOLS = [
  "list_items",
  "list_shopping",
  "get_kitchen_score",
  "sum_item_field",
  "notify_user",
  "add_to_shopping",
  "add_note",
  "add_item",
  "bulk_add_items",
  "mark_recipe_made",
  "mark_items_used_matching",
];

const MAX_STEPS = 10;

/** Mirrors MachineDraftValidator::validateScheduleTrigger/validateThresholdTrigger's actual
 *  rules closely enough to catch a template that Kitchen Lab's review screen would silently
 *  reject on save. */
function assertValidTrigger(trigger: MachineTrigger) {
  if (trigger.type === "schedule") {
    const { frequency, time, weekday, timezone } = trigger.config;
    expect(["daily", "weekly"]).toContain(frequency);
    expect(time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    if (frequency === "weekly") {
      expect(weekday).not.toBeNull();
      expect(weekday).toBeGreaterThanOrEqual(0);
      expect(weekday).toBeLessThanOrEqual(6);
    }
    expect(typeof timezone).toBe("string");
    expect(timezone.length).toBeGreaterThan(0);
    return;
  }
  if (trigger.type === "threshold") {
    const { field, op, value, unit, custom_field_label } = trigger.config;
    expect(["lt", "lte", "gt", "gte"]).toContain(op);
    expect(typeof value).toBe("number");
    if (field === "weight") expect(unit).not.toBeNull();
    if (field === "custom") expect(custom_field_label).not.toBeNull();
    return;
  }
}

function assertValidSteps(steps: MachineStep[]) {
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
  for (const [i, step] of steps.entries()) {
    expect(MACHINE_TOOLS).toContain(step.tool);
    if (step.tool === "sum_item_field") {
      expect(typeof step.args.field).toBe("string");
    }
    if (step.tool === "notify_user") {
      expect(typeof step.args.message).toBe("string");
    }
    // A {stepN} placeholder may only reference an earlier step (MachineDraftValidator's
    // validatePlaceholders / MachineRunner's own substitution convention).
    for (const value of Object.values(step.args)) {
      if (typeof value !== "string") continue;
      for (const match of value.matchAll(/\{step(\d+)\}/g)) {
        expect(Number(match[1])).toBeLessThan(i + 1);
      }
    }
  }
}

describe("MACHINE_TEMPLATES", () => {
  test("has unique ids and labels", () => {
    const ids = MACHINE_TEMPLATES.map((t) => t.id);
    const labels = MACHINE_TEMPLATES.map((t) => t.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test.each(MACHINE_TEMPLATES)("$id builds a machine-eligible draft", (template) => {
    const draft = template.build();
    expect(draft.name.trim().length).toBeGreaterThan(0);
    assertValidTrigger(draft.trigger);
    assertValidSteps(draft.steps);
  });

  test.each(MACHINE_TEMPLATES)("$id resolves a color from theme colors", (template) => {
    expect(template.color(darkColors)).toMatch(/^#/);
  });

  test("weekly expiry check schedules weekly with a real device timezone", () => {
    const draft = MACHINE_TEMPLATES.find((t) => t.id === "weekly-expiry-check")!.build();
    expect(draft.trigger.type).toBe("schedule");
    if (draft.trigger.type !== "schedule") return;
    expect(draft.trigger.config.frequency).toBe("weekly");
    expect(draft.trigger.config.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  test("low stock reminder triggers on a quantity threshold", () => {
    const draft = MACHINE_TEMPLATES.find((t) => t.id === "low-stock-reminder")!.build();
    expect(draft.trigger.type).toBe("threshold");
    if (draft.trigger.type !== "threshold") return;
    expect(draft.trigger.config.field).toBe("quantity");
  });

  test("fridge summary reads the kitchen score before notifying", () => {
    const draft = MACHINE_TEMPLATES.find((t) => t.id === "fridge-summary")!.build();
    expect(draft.steps.map((s) => s.tool)).toEqual(["get_kitchen_score", "notify_user"]);
  });

  test("build() returns a fresh object each call (not a shared mutable draft)", () => {
    const template = MACHINE_TEMPLATES[0];
    const a = template.build();
    const b = template.build();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
