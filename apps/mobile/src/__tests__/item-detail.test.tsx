import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { FlatItem } from "@thatfridge/core";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "5" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/sheet", () => ({ SheetHeader: () => null }));
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
jest.mock("@/components/tags", () => ({ CategoryTag: () => null }));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/components/draft-item", () => ({ DateField: () => null, daysUntil: () => 3, isoInDays: () => "2026-10-01" }));

let mockItem: FlatItem | undefined;
const mockPatch = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({
    itemById: () => mockItem,
    removeItem: (...a: unknown[]) => mockRemove(...a),
    undoRemoval: jest.fn(),
    patchItem: (...a: unknown[]) => mockPatch(...a),
    setItemQty: jest.fn(),
  }),
}));
const mockAddShopping = jest.fn();
let mockShopping: { name: string; checked: boolean }[] = [];
jest.mock("@/lib/shopping", () => ({ useShopping: () => ({ items: mockShopping, add: (...a: unknown[]) => mockAddShopping(...a) }) }));
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ refresh: jest.fn() }) }));
const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
jest.mock("@/lib/api", () => ({ api: { autofillItem: jest.fn(), correctItemOutcome: jest.fn() } }));
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: 20, setBalance: jest.fn(), refresh: jest.fn() }) }));

import ItemDetail from "@/app/item/[id]";

const base = {
  id: "5", name: "Greek yogurt", icon: "yogurt", iconUrl: null, nutritionCategory: "dairy", freshness: 45, days: 4, note: "", qty: 2,
  opened: false, openable: true, openedShelfLifeDays: null, openedShelfLifeSource: null, location: "fridge", shopUrl: null,
  weight: 500, weightUnit: "g", calories: 300, customFields: [], fridgeName: "Home", sectionId: "1", sectionName: "Top", fridgeId: "1",
} as unknown as FlatItem;

beforeEach(() => {
  jest.clearAllMocks();
  mockItem = { ...base };
  mockShopping = [];
  mockPatch.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue({ id: "9", outcome: "used" });
});

describe("Item page", () => {
  test("groups the details into Storage & freshness, Amount and Details", async () => {
    await render(<ItemDetail />);

    for (const heading of ["Storage & freshness", "Amount", "Details"]) expect(screen.getByText(heading)).toBeTruthy();
    for (const row of ["Storage", "Best before", "Opened", "Quantity", "Weight", "Calories", "Note"]) expect(screen.getByText(row)).toBeTruthy();
  });

  test("freshness and advice are one card: days, percent and a tip", async () => {
    await render(<ItemDetail />);

    expect(screen.getByText("45% fresh")).toBeTruthy();
    expect(screen.getByText("Plan to use greek yogurt within the next couple of days.")).toBeTruthy();
  });

  test("Autofill is offered only when something is missing", async () => {
    await render(<ItemDetail />);
    expect(screen.queryByText("Autofill missing details")).toBeNull(); // weight, calories and food group are all set

    await screen.unmount();
    mockItem = { ...base, calories: null } as FlatItem;
    await render(<ItemDetail />);
    expect(screen.getByText("Autofill missing details")).toBeTruthy();
  });

  test("an item that can't be opened has no Opened row", async () => {
    mockItem = { ...base, openable: false } as FlatItem;
    await render(<ItemDetail />);

    expect(screen.queryByText("Opened")).toBeNull();
    expect(screen.getByText("Best before")).toBeTruthy();
  });

  test("the Opened row marks it opened, then lets the days be changed or the item sealed again", async () => {
    await render(<ItemDetail />);
    expect(screen.getByText("Sealed")).toBeTruthy();

    await fireEvent.press(screen.getByText("Opened"));
    await fireEvent.press(screen.getByText("Mark as opened"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("5", { opened: true }));
    expect(mockToast).toHaveBeenCalledWith("Greek yogurt marked opened");
  });

  test("an opened item: days are validated, saved, and it can be sealed again", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockItem = { ...base, opened: true, openedShelfLifeDays: 4, openedShelfLifeSource: "rule" } as FlatItem;
    await render(<ItemDetail />);

    await fireEvent.press(screen.getByText("Opened · ~4 days"));
    await fireEvent.changeText(screen.getByLabelText("Days after opening"), "0");
    await fireEvent.press(screen.getByText("Save"));
    expect(alert).toHaveBeenCalledWith("Choose a number of days", expect.any(String));
    expect(mockPatch).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Days after opening"), "6");
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("5", { opened_shelf_life_days: 6 }));

    await fireEvent.press(screen.getByText("Mark as sealed again"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("5", { opened: false }));
    alert.mockRestore();
  });

  test("Add to list adds once; when it is already on the list it says so and does nothing", async () => {
    await render(<ItemDetail />);
    await fireEvent.press(screen.getByLabelText("Add to shopping list"));
    expect(mockAddShopping).toHaveBeenCalledWith("Greek yogurt", null);

    await screen.unmount();
    mockAddShopping.mockClear();
    mockShopping = [{ name: "greek YOGURT", checked: false }];
    await render(<ItemDetail />);
    await fireEvent.press(screen.getByLabelText("On your shopping list"));
    expect(mockAddShopping).not.toHaveBeenCalled();
  });

  test("Remove takes the item out, goes back and offers Undo", async () => {
    await render(<ItemDetail />);

    await fireEvent.press(screen.getByLabelText("Remove item"));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("5"));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockToast.mock.calls.at(-1)![0]).toBe("Counted as used · Greek yogurt");
    expect(mockToast.mock.calls.at(-1)![1]).toMatchObject({ actionLabel: "Undo" });
  });

  test("an item that no longer exists says so", async () => {
    mockItem = undefined;
    await render(<ItemDetail />);

    expect(screen.getByText("This item is no longer in your fridge.")).toBeTruthy();
  });
});
