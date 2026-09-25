import type { Machine, MachineTrigger } from "@thatfridge/core";

/**
 * Whether two triggers are close enough to fire together and plausibly send a duplicate
 * notification - same type and, for the trigger types that actually specify *when* (schedule,
 * threshold), the same condition. `item_added`/`recipe_made` overlap only on an exact match
 * (a search substring or location filter isn't compared loosely - two different filters are a
 * different Machine by design, not a near-duplicate).
 */
export function triggersOverlap(a: MachineTrigger, b: MachineTrigger): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case "schedule": {
      const cfg = b as Extract<MachineTrigger, { type: "schedule" }>;
      return (
        a.config.frequency === cfg.config.frequency &&
        a.config.time === cfg.config.time &&
        a.config.weekday === cfg.config.weekday
      );
    }
    case "threshold": {
      const cfg = b as Extract<MachineTrigger, { type: "threshold" }>;
      return (
        a.config.field === cfg.config.field &&
        a.config.op === cfg.config.op &&
        a.config.value === cfg.config.value &&
        a.config.unit === cfg.config.unit &&
        a.config.custom_field_label === cfg.config.custom_field_label
      );
    }
    case "item_added": {
      const cfg = b as Extract<MachineTrigger, { type: "item_added" }>;
      return a.config.search === cfg.config.search && a.config.location === cfg.config.location;
    }
    case "recipe_made": {
      const cfg = b as Extract<MachineTrigger, { type: "recipe_made" }>;
      return a.config.recipe_id === cfg.config.recipe_id;
    }
  }
}

/**
 * The first other *enabled* Machine, on the same fridge, whose trigger overlaps the given one
 * - what would actually cause a duplicate notification if this trigger goes live too. Never
 * matches a Machine excluded by id (the one being edited/enabled itself), and never matches a
 * disabled Machine (nothing fires from those, so there's nothing to duplicate).
 */
export function findOverlappingMachine(
  machines: Machine[],
  trigger: MachineTrigger,
  fridgeId: string,
  excludeId: string | null,
): Machine | null {
  return (
    machines.find(
      (m) =>
        m.id !== excludeId &&
        m.enabled &&
        m.fridgeId === fridgeId &&
        triggersOverlap(m.trigger, trigger),
    ) ?? null
  );
}
