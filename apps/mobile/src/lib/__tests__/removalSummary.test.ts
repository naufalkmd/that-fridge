import { summarizeRemovals } from "@/lib/removalSummary";

const r = (outcome: "used" | "wasted" | "entry_mistake") => ({ outcome });

describe("summarizeRemovals", () => {
  test("says how many were counted as used and thrown out", () => {
    expect(summarizeRemovals([r("used"), r("used"), r("used"), r("wasted")])).toBe("Removed 4 items · 3 used, 1 thrown out");
  });

  test("omits a zero part and pluralises the total", () => {
    expect(summarizeRemovals([r("wasted")])).toBe("Removed 1 item · 1 thrown out");
    expect(summarizeRemovals([r("used"), r("used")])).toBe("Removed 2 items · 2 used");
  });

  test("entry mistakes count toward the total only", () => {
    expect(summarizeRemovals([r("entry_mistake"), r("entry_mistake")])).toBe("Removed 2 items");
    expect(summarizeRemovals([r("entry_mistake"), r("used")])).toBe("Removed 2 items · 1 used");
  });
});
