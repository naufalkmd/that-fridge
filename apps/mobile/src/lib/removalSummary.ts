import type { ItemRemovalResult } from "@thatfridge/core";

/** Toast text for a batch removal: total, plus how the classifier counted them. Entry mistakes
 *  (just-added items) count toward the total but neither "used" nor "thrown out". */
export function summarizeRemovals(outcomes: Pick<ItemRemovalResult, "outcome">[]): string {
  const total = outcomes.length;
  const used = outcomes.filter((o) => o.outcome === "used").length;
  const wasted = outcomes.filter((o) => o.outcome === "wasted").length;
  const head = `Removed ${total} item${total === 1 ? "" : "s"}`;
  const parts = [used > 0 ? `${used} used` : null, wasted > 0 ? `${wasted} thrown out` : null].filter(Boolean);
  return parts.length > 0 ? `${head} · ${parts.join(", ")}` : head;
}
