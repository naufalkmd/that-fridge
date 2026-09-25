jest.mock("@/lib/api", () => ({
  api: {
    suggestItemDetails: jest.fn(),
    listGeneratedIcons: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({ ensureSectionId: jest.fn().mockResolvedValue("section-1") }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { api } from "@/lib/api";
import { blankDraft, toCreatePayload, useDraftItems } from "@/components/draft-item";

const suggestItemDetails = api.suggestItemDetails as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("blankDraft", () => {
  test("has no food group by default", () => {
    expect(blankDraft().category).toBeNull();
  });

  test("a caller can still seed a category (e.g. a deep-linked Inventory category)", () => {
    expect(blankDraft({ category: "dairy" }).category).toBe("dairy");
  });
});

describe("toCreatePayload", () => {
  test("carries nutrition_category through even with no visible control for it", () => {
    const draft = blankDraft({ name: "Milk", category: "dairy" });
    expect(toCreatePayload(draft).nutrition_category).toBe("dairy");
  });

  test("carries a null category through as null, not a forced default", () => {
    const draft = blankDraft({ name: "Mystery item" });
    expect(toCreatePayload(draft).nutrition_category).toBeNull();
  });
});

describe("useDraftItems - Auto-fill and food-group preservation", () => {
  test("suggestItemDetails filling in a category still lands on the draft", async () => {
    suggestItemDetails.mockResolvedValue({
      location: "fridge",
      shelf_life_days: 7,
      nutrition_category: "dairy",
    });
    const draft = blankDraft({ name: "Milk" });
    const { result } = await renderHook(() => useDraftItems(() => [draft]));

    await act(async () => {
      await result.current.fillOne(draft);
    });

    expect(result.current.items[0].category).toBe("dairy");
  });

  test("a null AI answer never erases a category the draft already had", async () => {
    // Mirrors what Phase 2's FoodGroupClassifier now does for a genuinely unclassifiable
    // name - the whole point of removing the manual control is that this must never wipe
    // out a category that was already set (e.g. seeded from a barcode lookup).
    suggestItemDetails.mockResolvedValue({
      location: "fridge",
      shelf_life_days: 7,
      nutrition_category: null,
    });
    const draft = blankDraft({ name: "Fictional Snack Bar 3000", category: "other_extras" });
    const { result } = await renderHook(() => useDraftItems(() => [draft]));

    await act(async () => {
      await result.current.fillOne(draft);
    });

    expect(result.current.items[0].category).toBe("other_extras");
  });
});
