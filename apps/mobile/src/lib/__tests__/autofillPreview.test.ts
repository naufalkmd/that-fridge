import type { CustomField } from "@thatfridge/core";

import { customFieldProposals, sourceLabel } from "@/lib/autofillPreview";

const row = (id: string, label: string, value: string): CustomField => ({ id, label, value });

describe("customFieldProposals", () => {
  const current = [row("a", "Supplier", "Tesco"), row("b", "Protein", ""), row("c", "Fat", "")];

  test("lists only the rows that were empty and now have a value, with where each came from", () => {
    const proposals = customFieldProposals(
      current,
      [
        { id: "a", label: "Supplier", value: "Tesco" },
        { id: "b", label: "Protein", value: "155 g" },
        { id: "c", label: "Fat", value: "" },
      ],
      { Protein: "table" },
    );

    expect(proposals).toEqual([{ label: "Protein", value: "155 g", source: "table" }]);
  });

  test("never lists a row that already had a value, even if the proposal echoes it", () => {
    expect(customFieldProposals(current, [{ id: "a", label: "Supplier", value: "Sainsbury's" }], undefined)).toEqual([]);
  });

  test("source labels match case-insensitively; a missing source is null", () => {
    const proposals = customFieldProposals(current, [{ id: "b", label: "protein", value: "20 g" }, { id: "c", label: "Fat", value: "3 g" }], { Protein: "ai" });

    expect(proposals.map((p) => p.source)).toEqual(["ai", null]);
  });

  test("nothing proposed means nothing listed", () => {
    expect(customFieldProposals(current, undefined, undefined)).toEqual([]);
  });
});

describe("sourceLabel", () => {
  test("says where a value came from in plain words", () => {
    expect(sourceLabel("history")).toBe("from your other items");
    expect(sourceLabel("table")).toMatch(/weight/);
    expect(sourceLabel("ai")).toBe("estimated");
    expect(sourceLabel(null)).toBeNull();
  });
});
