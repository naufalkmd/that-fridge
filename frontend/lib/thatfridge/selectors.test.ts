import { describe, it, expect } from "vitest";
import {
  getGuardianItem,
  getLowStockItem,
  getScopedItems,
  getBuyAgainSuggestions,
  getExpiringOwnedItems,
  findItem,
  findSectionIdForGroup,
} from "./selectors";
import { initialState, type ThatFridgeState } from "./useThatFridge";
import type { Fridge, Item, Section } from "./types";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    name: "Milk",
    icon: "milk",
    freshness: 80,
    days: 5,
    note: "",
    qty: 1,
    ...overrides,
  };
}

function makeSection(overrides: Partial<Section> = {}): Section {
  return { id: "sec-1", name: "General", items: [], ...overrides };
}

function makeFridge(overrides: Partial<Fridge> = {}): Fridge {
  return { id: "fridge-1", name: "My Fridge", sections: [], ...overrides };
}

function makeState(overrides: Partial<ThatFridgeState> = {}): ThatFridgeState {
  return { ...initialState(), ...overrides };
}

describe("getLowStockItem", () => {
  // Regression coverage for the bug where low-stock detection additionally required
  // /left|remaining/i to match the item's free-text note - which also matched notes
  // like "Leftovers from Tuesday", and excluded genuinely low-stock items whose notes
  // didn't happen to contain those words.
  it("flags an item by quantity alone, regardless of what its note says", () => {
    const state = makeState({
      fridges: [
        makeFridge({
          sections: [
            makeSection({
              items: [
                // A second, unrelated item so this one isn't also picked as the guardian
                // (lowest-freshness) item, which getLowStockItem deliberately excludes.
                makeItem({ id: "other", name: "Bread", qty: 10, freshness: 20 }),
                makeItem({ id: "a", name: "Eggs", qty: 1, note: "fresh carton", freshness: 90 }),
              ],
            }),
          ],
        }),
      ],
    });

    expect(getLowStockItem(state)?.id).toBe("a");
  });

  it("does not flag a well-stocked item just because its note mentions leftovers", () => {
    const state = makeState({
      fridges: [
        makeFridge({
          sections: [
            makeSection({
              items: [
                makeItem({ id: "other", name: "Bread", qty: 10, freshness: 20 }),
                makeItem({ id: "a", name: "Rice", qty: 5, note: "Leftovers from Tuesday", freshness: 90 }),
              ],
            }),
          ],
        }),
      ],
    });

    expect(getLowStockItem(state)).toBeNull();
  });

  it("does not double up with the guardian (most-expiring) item", () => {
    const state = makeState({
      fridges: [
        makeFridge({
          sections: [
            makeSection({
              items: [
                makeItem({ id: "guardian", name: "Spinach", qty: 1, freshness: 5 }),
                makeItem({ id: "other-low", name: "Milk", qty: 2, freshness: 90 }),
              ],
            }),
          ],
        }),
      ],
    });

    // "guardian" has the lowest freshness so getGuardianItem picks it; low-stock should
    // skip it even though it also qualifies by quantity, and surface the other item instead.
    expect(getGuardianItem(state)?.id).toBe("guardian");
    expect(getLowStockItem(state)?.id).toBe("other-low");
  });

  it("returns null when nothing is low on stock", () => {
    const state = makeState({
      fridges: [makeFridge({ sections: [makeSection({ items: [makeItem({ qty: 10 })] })] })],
    });

    expect(getLowStockItem(state)).toBeNull();
  });
});

describe("getScopedItems", () => {
  const twoFridgeState = makeState({
    activeFridge: 0,
    fridges: [
      makeFridge({ id: "f1", sections: [makeSection({ items: [makeItem({ id: "a" })] })] }),
      makeFridge({ id: "f2", sections: [makeSection({ items: [makeItem({ id: "b" })] })] }),
    ],
  });

  it("only returns the active fridge's items when scope is 'active'", () => {
    const state = { ...twoFridgeState, kitchenScope: "active" as const };
    expect(getScopedItems(state).map((i) => i.id)).toEqual(["a"]);
  });

  it("returns items across every fridge when scope is 'all'", () => {
    const state = { ...twoFridgeState, kitchenScope: "all" as const };
    expect(getScopedItems(state).map((i) => i.id).sort()).toEqual(["a", "b"]);
  });
});

describe("getGuardianItem", () => {
  it("picks the item with the lowest freshness", () => {
    const state = makeState({
      fridges: [
        makeFridge({
          sections: [
            makeSection({
              items: [makeItem({ id: "fresh", freshness: 90 }), makeItem({ id: "stale", freshness: 10 })],
            }),
          ],
        }),
      ],
    });

    expect(getGuardianItem(state)?.id).toBe("stale");
  });

  it("returns null when there are no items", () => {
    expect(getGuardianItem(makeState())).toBeNull();
  });
});

describe("getExpiringOwnedItems", () => {
  it("sorts by freshness ascending and excludes anything at or above 50", () => {
    const state = makeState({
      fridges: [
        makeFridge({
          sections: [
            makeSection({
              items: [
                makeItem({ id: "ok", freshness: 80 }),
                makeItem({ id: "worst", freshness: 5 }),
                makeItem({ id: "mid", freshness: 40 }),
              ],
            }),
          ],
        }),
      ],
    });

    expect(getExpiringOwnedItems(state).map((i) => i.id)).toEqual(["worst", "mid"]);
  });
});

describe("getBuyAgainSuggestions", () => {
  it("excludes items already in stock or already on the shopping list", () => {
    const state = makeState({
      fridges: [makeFridge({ sections: [makeSection({ items: [makeItem({ name: "Milk" })] })] })],
      shoppingList: [{ id: "s1", name: "Bread", icon: "bread", section: "other", checked: false }],
      usageHistory: [
        { id: "u1", key: "milk", name: "Milk", icon: "milk", count: 5, lastAt: 3 },
        { id: "u2", key: "bread", name: "Bread", icon: "bread", count: 4, lastAt: 2 },
        { id: "u3", key: "cheese", name: "Cheese", icon: "cheese", count: 2, lastAt: 1 },
      ],
    });

    const suggestions = getBuyAgainSuggestions(state);
    expect(suggestions.map((s) => s.key)).toEqual(["cheese"]);
  });

  it("ranks by usage count first, then recency", () => {
    const state = makeState({
      usageHistory: [
        { id: "u1", key: "a", name: "A", icon: "item", count: 1, lastAt: 100 },
        { id: "u2", key: "b", name: "B", icon: "item", count: 3, lastAt: 1 },
      ],
    });

    expect(getBuyAgainSuggestions(state).map((s) => s.key)).toEqual(["b", "a"]);
  });
});

describe("findItem", () => {
  it("locates an item by id anywhere across fridges", () => {
    const state = makeState({
      fridges: [
        makeFridge({ id: "f1", sections: [makeSection({ id: "s1", items: [makeItem({ id: "target" })] })] }),
      ],
    });

    const found = findItem(state, "target");
    expect(found?.item.id).toBe("target");
    expect(found?.section.id).toBe("s1");
    expect(found?.fridgeIndex).toBe(0);
  });

  it("returns null when the id doesn't exist", () => {
    expect(findItem(makeState(), "nope")).toBeNull();
  });
});

describe("findSectionIdForGroup", () => {
  it("matches by exact section id first", () => {
    const sections = [makeSection({ id: "dairy", name: "Dairy Shelf" })];
    expect(findSectionIdForGroup(sections, "dairy")).toBe("dairy");
  });

  it("falls back to a case-insensitive name match", () => {
    const sections = [makeSection({ id: "sec-1", name: "Produce Drawer" })];
    expect(findSectionIdForGroup(sections, "produce")).toBe("sec-1");
  });

  it("returns null when nothing matches", () => {
    const sections = [makeSection({ id: "sec-1", name: "Produce Drawer" })];
    expect(findSectionIdForGroup(sections, "meat")).toBeNull();
  });
});
