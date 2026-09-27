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
jest.mock("@/lib/api", () => ({
  api: {
    correctItemOutcome: (...a: unknown[]) => mockCorrect(...(a as [])),
    createMealEntry: (...a: unknown[]) => mockCreateMeal(...(a as [])),
    deleteMealEntry: jest.fn(),
  },
}));
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

const mockCreateMeal = jest.fn(async () => ({ id: "m1" }));

describe("MissionSheet: Activate runs the crew's plan with one press", () => {
  const lettuce = { ...chicken, id: "i2", name: "Lettuce", icon: "lettuce", nutritionCategory: "vegetables" } as FlatItem;
  const expiredMilk = { ...chicken, id: "i3", name: "Milk", days: -2, freshness: 0 } as FlatItem;

  test("does every ticked decision, leaves destructive ones unless opted in, and tallies it", async () => {
    let done: Record<string, string> = {};
    const onOutcome = jest.fn((id: string, o: string) => {
      done = { ...done, [id]: o };
    });
    const tasks: MissionTask[] = [
      { kind: "rescue", id: "rescue-i1", item: chicken, recipe: null, canFreeze: true },
      { kind: "restock", id: "rec-bread", rec: { key: "bread", source: "habit", name: "Bread", icon: "bread", reason: "You buy it often" } },
      { kind: "expired", id: "expired-i3", item: expiredMilk },
    ];
    await render(sheet(tasks, {}, onOutcome));

    expect(screen.getByText("+6")).toBeTruthy(); // live score change since activating
    expect(screen.getByText("Freeze it")).toBeTruthy(); // the crew's decision, shown per line
    await fireEvent.press(screen.getByText("Do it · 2 things")); // the expired milk isn't ticked

    await waitFor(() => expect(onOutcome).toHaveBeenCalledTimes(2));
    expect(mockPatchItem).toHaveBeenCalledWith("i1", expect.objectContaining({ location: "freezer", shelf_life_days: 90 }));
    expect(mockAdd).toHaveBeenCalledWith("Bread");
    expect(mockRemoveItem).not.toHaveBeenCalled();
    expect(onOutcome).toHaveBeenCalledWith("rescue-i1", "frozen");
    expect(onOutcome).toHaveBeenCalledWith("rec-bread", "added");
  });

  test("unticking a line keeps it out of the plan", async () => {
    const onOutcome = jest.fn();
    await render(sheet([{ kind: "rescue", id: "rescue-i1", item: chicken, recipe: null, canFreeze: true }], {}, onOutcome));

    await fireEvent.press(screen.getByLabelText(/Chicken/));
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText(/Do it/)).toBeNull();
  });

  test("an item that can't be frozen goes on tonight's plan instead", async () => {
    const onOutcome = jest.fn();
    await render(sheet([{ kind: "rescue", id: "rescue-i2", item: lettuce, recipe: null, canFreeze: false }], {}, onOutcome));

    await fireEvent.press(screen.getByText("Do it · 1 thing"));

    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("rescue-i2", "planned"));
    expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ title: "Use up Lettuce", slot: "Dinner", recipe_id: null }));
  });

  test("finished lines show what was done, with a tally", async () => {
    await render(
      sheet(
        [
          { kind: "rescue", id: "a", item: chicken, recipe: null, canFreeze: true },
          { kind: "restock", id: "b", rec: { key: "bread", source: "habit", name: "Bread", icon: "bread", reason: "x" } },
        ],
        { a: "frozen", b: "added" },
      ),
    );

    expect(screen.getByText("Frozen")).toBeTruthy();
    expect(screen.getByText("1 frozen · 1 added to your list")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });
});
