import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPatchItem = jest.fn(async () => {});
const mockRemoveItem = jest.fn(async () => ({ id: "o1", outcome: "used" as const, confidence: "high" as const }));
const mockAdd = jest.fn(async () => {});
const mockCorrect = jest.fn(async () => ({ id: "o1", outcome: "wasted" as const }));
const mockPush = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/lib/theme", () => ({
  useTheme: () => ({
    colors: { surface: "#111", surface2: "#222", hairline: "#333", ink: "#fff", muted: "#aaa", faint: "#777", good: "#0f0", bad: "#f00", onAccent: "#000" },
  }),
}));
jest.mock("@/lib/keyboard", () => ({ useKeyboardHeight: () => 0 }));
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: "all" }) }));
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({ fridges: [], patchItem: mockPatchItem, removeItem: mockRemoveItem, undoRemoval: jest.fn() }),
}));
jest.mock("@/lib/shopping", () => ({ useShopping: () => ({ add: mockAdd, remove: jest.fn() }) }));
jest.mock("@/lib/api", () => ({ api: { correctItemOutcome: (...a: unknown[]) => mockCorrect(...(a as [])), createMealEntry: jest.fn() } }));
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));

import type { FlatItem } from "@thatfridge/core";
import { MissionSheet } from "@/components/crew/MissionSheet";
import type { MissionTask } from "@/lib/missions";

const chicken = { id: "i1", name: "Chicken", icon: "chicken", days: 1, freshness: 10, location: "fridge", nutritionCategory: "protein" } as FlatItem;

const sheet = (tasks: MissionTask[], done = {}, onOutcome = jest.fn()) => (
  <MissionSheet
    visible
    onClose={jest.fn()}
    agent="Guardian"
    color="#f55"
    gif={0}
    scoreLabel="Waste Saver"
    score={70}
    startScore={64}
    tasks={tasks}
    done={done}
    onOutcome={onOutcome}
    storage={{ checking: false, start: jest.fn(), apply: jest.fn(), dismiss: jest.fn() }}
    onAskTip={jest.fn()}
    tip={null}
    tipBusy={false}
  />
);

beforeEach(() => jest.clearAllMocks());

describe("MissionSheet", () => {
  test("Guardian's freeze moves the item to the freezer with a new date and settles the task", async () => {
    const onOutcome = jest.fn();
    await render(sheet([{ kind: "rescue", id: "rescue-i1", item: chicken, recipe: null, canFreeze: true }], {}, onOutcome));

    expect(screen.getByText("+6")).toBeTruthy(); // live score change since the mission started
    await fireEvent.press(screen.getByText("Freeze it"));

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("rescue-i1", "frozen"));
    expect(mockPatchItem).toHaveBeenCalledWith("i1", expect.objectContaining({ location: "freezer", shelf_life_days: 90 }));
    expect(screen.getByText(/moved to the freezer/)).toBeTruthy();
  });

  test("Tossed removes the item and corrects the outcome when the app guessed differently", async () => {
    const onOutcome = jest.fn();
    await render(sheet([{ kind: "rescue", id: "rescue-i1", item: chicken, recipe: null, canFreeze: false }], {}, onOutcome));

    expect(screen.queryByText("Freeze it")).toBeNull();
    await fireEvent.press(screen.getByText("Tossed"));

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("rescue-i1", "tossed"));
    expect(mockRemoveItem).toHaveBeenCalledWith("i1");
    expect(mockCorrect).toHaveBeenCalledWith("o1", "wasted");
  });

  test("Shopkeeper's restock adds to the shopping list", async () => {
    const onOutcome = jest.fn();
    await render(
      sheet([{ kind: "restock", id: "rec-bread", rec: { key: "bread", source: "habit", name: "Bread", icon: "bread", reason: "You buy it often" } }], {}, onOutcome),
    );

    await fireEvent.press(screen.getByText("Add to list"));

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("rec-bread", "added"));
    expect(mockAdd).toHaveBeenCalledWith("Bread");
  });

  test("a finished mission tallies what was done", async () => {
    await render(
      sheet(
        [
          { kind: "rescue", id: "a", item: chicken, recipe: null, canFreeze: true },
          { kind: "expired", id: "b", item: { ...chicken, id: "i2", days: -1 } },
        ],
        { a: "frozen", b: "tossed" },
      ),
    );

    expect(screen.getByText("Mission complete")).toBeTruthy();
    expect(screen.getByText("1 frozen · 1 cleared")).toBeTruthy();
  });
});
