import { ApiError, type MachineStep, type MachineTrigger } from "@thatfridge/core";

/** A path into a step's `args`: object keys and array indexes, e.g. ["items", 0, "quantity"]. */
export type ArgPath = (string | number)[];

/** Keys whose values come from a closed list on the backend (MachineDraftValidator /
 *  AgentToolbox schemas) - rendered as a picker instead of free text. */
export const ARG_OPTIONS: Record<string, string[]> = {
  location: ["fridge", "freezer", "pantry"],
  field: ["quantity", "weight", "calories", "custom"],
  unit: ["g", "kg", "mg", "ml", "l", "oz", "lb"],
  weight_unit: ["g", "kg", "mg", "ml", "l", "oz", "lb"],
  op: ["lt", "lte", "gt", "gte"],
  color: ["amber", "blue", "good", "warn", "bad"],
};

export const OP_OPTIONS: { key: "lt" | "lte" | "gt" | "gte"; label: string }[] = [
  { key: "lt", label: "below" },
  { key: "lte", label: "at or below" },
  { key: "gt", label: "above" },
  { key: "gte", label: "at or above" },
];

/** Parses what a numeric field's text box holds. Null for anything that isn't a finite number
 *  (empty, "-", "1.", "abc") so the caller keeps the last good value instead of writing NaN. */
export function parseNumber(text: string, opts: { integer?: boolean } = {}): number | null {
  const trimmed = text.trim();
  const pattern = opts.integer ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/;
  if (!pattern.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Arguments the backend's tool schemas type as "integer" - a decimal there would only come
 *  back as a validation error, so the number field just refuses it up front. */
export const INTEGER_KEYS = new Set(["quantity", "shelf_life_days", "expiring_within_days", "calories", "recipe_id", "fridge_id", "step"]);

/** "HH:MM", 24h - the same rule MachineDraftValidator::validateScheduleTrigger enforces. */
export function isValidTime(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

function setIn(node: unknown, path: ArgPath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[head as number] = setIn(copy[head as number], rest, value);
    return copy;
  }
  const obj = (node ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setIn(obj[head], rest, value) };
}

/** Returns new steps with one argument (possibly nested) replaced - never mutates the input. */
export function setStepArg(steps: MachineStep[], stepIndex: number, path: ArgPath, value: unknown): MachineStep[] {
  return steps.map((step, i) => (i === stepIndex ? { ...step, args: setIn(step.args, path, value) as MachineStep["args"] } : step));
}

/** Returns new steps with a step's condition value replaced (its step reference and operator
 *  are edited via setStepCondition). */
export function setStepCondition(
  steps: MachineStep[],
  stepIndex: number,
  patch: Partial<NonNullable<MachineStep["condition"]>>,
): MachineStep[] {
  return steps.map((step, i) =>
    i === stepIndex && step.condition ? { ...step, condition: { ...step.condition, ...patch } } : step,
  );
}

/**
 * Applies a patch to a trigger's config and keeps the fields that only make sense together
 * consistent, so an edit can't produce a shape the server would reject on a technicality:
 * a daily schedule has no weekday, a weekly one needs one, `unit` exists only for a weight
 * threshold and the custom label only for a custom field.
 */
export function patchTrigger(trigger: MachineTrigger, patch: Record<string, unknown>): MachineTrigger {
  if (trigger.type === "schedule") {
    const config = { ...trigger.config, ...patch } as typeof trigger.config;
    if (config.frequency === "daily") config.weekday = null;
    else if (config.weekday === null || config.weekday === undefined) config.weekday = 1;
    return { type: "schedule", config };
  }
  if (trigger.type === "threshold") {
    const config = { ...trigger.config, ...patch } as typeof trigger.config;
    config.unit = config.field === "weight" ? (config.unit ?? "g") : null;
    config.custom_field_label = config.field === "custom" ? (config.custom_field_label ?? "") : null;
    return { type: "threshold", config };
  }
  if (trigger.type === "item_added") {
    const config = { ...trigger.config, ...patch } as typeof trigger.config;
    if (config.search === "") config.search = null;
    return { type: "item_added", config };
  }
  return trigger;
}

/** The server rejects an invalid Machine with a plain list of sentences (no `message`), which
 *  would otherwise surface as a useless "Request failed (422)". */
export function describeMachineError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const details = err.errors ? Object.values(err.errors).flat().filter(Boolean) : [];
    if (details.length > 0) return details.join("\n");
    return err.message;
  }
  return fallback;
}
