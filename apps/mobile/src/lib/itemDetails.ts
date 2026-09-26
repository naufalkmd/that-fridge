import type { FlatItem } from "@thatfridge/core";

// Pure helpers for the item detail screen (no React, no I/O).

/** One short line of advice under the freshness bar. */
export function freshnessTip(name: string, freshness: number): { text: string; tone: "urgent" | "soon" | "fine" } {
  const lower = name.toLowerCase();
  if (freshness < 30) return { text: `Use ${lower} today for best quality.`, tone: "urgent" };
  if (freshness < 60) return { text: `Plan to use ${lower} within the next couple of days.`, tone: "soon" };
  return { text: `${name} is holding up well. No action needed.`, tone: "fine" };
}

/** True when Autofill would have something to propose: a blank weight, calories or food group, or an empty custom field. (Best-before is always set on the client.) */
export function hasMissingDetails(
  item: Pick<FlatItem, "weight" | "calories" | "nutritionCategory" | "customFields">,
): boolean {
  return (
    item.weight == null ||
    item.calories == null ||
    item.nutritionCategory == null ||
    (item.customFields ?? []).some((f) => f.label.trim() !== "" && f.value.trim() === "")
  );
}

/** "Opened · ~3 days" / "Sealed" for the Opened row's collapsed value. */
export function openedSummary(item: Pick<FlatItem, "opened" | "openedShelfLifeDays">): string {
  return item.opened ? `Opened · ~${item.openedShelfLifeDays ?? 3} days` : "Sealed";
}
