import type { CustomField, UpdateItemInput } from "@thatfridge/core";

// Pure helpers for the item page's Autofill review card (no React, no I/O).

export type CustomFieldSource = "history" | "table" | "ai";

export interface CustomFieldProposal {
  label: string;
  value: string;
  source: CustomFieldSource | null;
}

/** The custom-field rows Autofill is proposing to fill: rows that are empty on the item and have a value in the proposal. */
export function customFieldProposals(
  current: CustomField[],
  proposed: UpdateItemInput["custom_fields"] | undefined,
  sources: Record<string, CustomFieldSource> | undefined,
): CustomFieldProposal[] {
  if (!proposed) return [];
  const byId = new Map(current.map((f) => [f.id, f]));
  const sourceFor = (label: string): CustomFieldSource | null => {
    const key = Object.keys(sources ?? {}).find((k) => k.trim().toLowerCase() === label.trim().toLowerCase());
    return key ? (sources![key] ?? null) : null;
  };

  return proposed
    .filter((row) => {
      const before = row.id ? byId.get(row.id) : undefined;
      return row.value.trim() !== "" && (before?.value ?? "").trim() === "";
    })
    .map((row) => ({ label: row.label, value: row.value, source: sourceFor(row.label) }));
}

/** How a proposed value came about, in a few words for the card. */
export function sourceLabel(source: CustomFieldSource | null): string | null {
  switch (source) {
    case "history":
      return "from your other items";
    case "table":
      return "worked out from the food and its weight";
    case "ai":
      return "estimated";
    default:
      return null;
  }
}
