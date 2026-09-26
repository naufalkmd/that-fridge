import { freshnessTip, hasMissingDetails, openedSummary } from "@/lib/itemDetails";

const complete = { weight: 500, calories: 300, nutritionCategory: "dairy" as const, customFields: [{ id: "1", label: "Protein", value: "20 g" }] };

describe("freshnessTip", () => {
  test("gets calmer as freshness rises", () => {
    expect(freshnessTip("Milk", 10)).toEqual({ text: "Use milk today for best quality.", tone: "urgent" });
    expect(freshnessTip("Milk", 45)).toEqual({ text: "Plan to use milk within the next couple of days.", tone: "soon" });
    expect(freshnessTip("Milk", 90)).toEqual({ text: "Milk is holding up well. No action needed.", tone: "fine" });
  });

  test("the boundaries belong to the calmer band", () => {
    expect(freshnessTip("Milk", 30).tone).toBe("soon");
    expect(freshnessTip("Milk", 60).tone).toBe("fine");
  });
});

describe("hasMissingDetails", () => {
  test("a fully filled item has nothing for Autofill to do", () => {
    expect(hasMissingDetails(complete)).toBe(false);
  });

  test.each([
    ["weight", { weight: null }],
    ["calories", { calories: null }],
    ["food group", { nutritionCategory: null }],
    ["an empty custom field", { customFields: [{ id: "1", label: "Protein", value: "  " }] }],
  ])("a blank %s counts as missing", (_name, patch) => {
    expect(hasMissingDetails({ ...complete, ...patch })).toBe(true);
  });

  test("a custom row with no label is not something to fill", () => {
    expect(hasMissingDetails({ ...complete, customFields: [{ id: "1", label: " ", value: "" }] })).toBe(false);
  });
});

describe("openedSummary", () => {
  test("says sealed, or how long an opened item keeps", () => {
    expect(openedSummary({ opened: false })).toBe("Sealed");
    expect(openedSummary({ opened: true, openedShelfLifeDays: 5 })).toBe("Opened · ~5 days");
    expect(openedSummary({ opened: true })).toBe("Opened · ~3 days");
  });
});
