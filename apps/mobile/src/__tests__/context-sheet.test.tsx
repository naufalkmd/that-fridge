import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/bottom-sheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({
    items: [
      { id: "11", name: "Milk", fridgeName: "Home", days: 2 },
      { id: "12", name: "Yogurt", fridgeName: "Office", days: -1 },
    ],
    fridges: [{ id: "1", name: "Home" }, { id: "2", name: "Office" }],
  }),
}));
jest.mock("@/lib/recipes", () => ({ useRecipes: () => ({ recipes: [{ id: "9", name: "Pad Thai", minutes: 25 }, { id: "10", name: "Green Curry", minutes: 40 }] }) }));

import { ContextSheet } from "@/components/chat/context-sheet";

const setup = async () => {
  const onPick = jest.fn();
  const onClose = jest.fn();
  await render(<ContextSheet visible onClose={onClose} onPick={onPick} />);

  return { onPick, onClose };
};

describe("ContextSheet", () => {
  test("offers every kind of context", async () => {
    await setup();

    for (const label of ["An item", "A fridge", "A recipe", "A day", "A week of the meal plan", "Shopping list", "What's expiring"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  test("shopping list and what's expiring are added straight away", async () => {
    const { onPick, onClose } = await setup();

    await fireEvent.press(screen.getByLabelText("Shopping list"));
    expect(onPick).toHaveBeenLastCalledWith({ type: "shopping", label: "Shopping list" });
    expect(onClose).toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("What's expiring"));
    expect(onPick).toHaveBeenLastCalledWith({ type: "expiring", label: "Expiring soon" });
  });

  test("an item is searched and picked by id", async () => {
    const { onPick } = await setup();

    await fireEvent.press(screen.getByLabelText("An item"));
    expect(screen.getByText("Home · 2d left")).toBeTruthy();
    expect(screen.getByText("Office · 1d overdue")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search"), "yog");
    expect(screen.queryByLabelText("Milk")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Yogurt"));

    expect(onPick).toHaveBeenCalledWith({ type: "item", id: "12", label: "Yogurt" });
  });

  test("a fridge is picked by id", async () => {
    const { onPick } = await setup();

    await fireEvent.press(screen.getByLabelText("A fridge"));
    await fireEvent.press(screen.getByLabelText("Office"));

    expect(onPick).toHaveBeenLastCalledWith({ type: "fridge", id: "2", label: "Office" });
  });

  test("a recipe is picked by id", async () => {
    const { onPick } = await setup();

    await fireEvent.press(screen.getByLabelText("A recipe"));
    await fireEvent.press(screen.getByLabelText("Pad Thai"));

    expect(onPick).toHaveBeenLastCalledWith({ type: "recipe", id: "9", label: "Pad Thai" });
  });

  test("a day sends its date", async () => {
    const { onPick } = await setup();

    await fireEvent.press(screen.getByLabelText("A day"));
    await fireEvent.press(screen.getAllByRole("button").find((b) => /^Today/.test(b.props.accessibilityLabel ?? ""))!);

    expect(onPick.mock.calls.at(-1)![0]).toMatchObject({ type: "day", label: "Today" });
    expect(onPick.mock.calls.at(-1)![0].id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("a week of the meal plan sends the week's first day", async () => {
    const { onPick } = await setup();

    await fireEvent.press(screen.getByLabelText("A week of the meal plan"));
    await fireEvent.press(screen.getByLabelText("Next week"));

    expect(onPick.mock.calls.at(-1)![0]).toMatchObject({ type: "meal_plan", label: "Meal plan · next week" });
    expect(onPick.mock.calls.at(-1)![0].id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("Back returns to the list of kinds", async () => {
    await setup();

    await fireEvent.press(screen.getByLabelText("A recipe"));
    expect(screen.queryByLabelText("A fridge")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Back to context types"));

    expect(screen.getByLabelText("A fridge")).toBeTruthy();
  });
});
