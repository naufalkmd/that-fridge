import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
jest.mock("@/lib/scope", () => ({
  useScope: () => ({ scope: "all" }),
  scopeItems: (items: unknown[]) => items,
}));
const mockPatch = jest.fn();
let mockItems: { id: string; name: string; icon: string; location: string }[] = [];
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ items: mockItems, patchItem: (...a: unknown[]) => mockPatch(...a) }) }));
const mockRefreshScore = jest.fn();
jest.mock("@/lib/kitchenScore", () => ({
  useKitchenScore: () => ({ organizerTally: { itemsCheckedTotal: 4, itemsCorrectTotal: 3, lastCheckedAt: null }, refresh: mockRefreshScore }),
}));
let mockCredits: number | null = 40;
const mockRefreshCredits = jest.fn();
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: mockCredits, refresh: mockRefreshCredits }) }));
const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
const mockSuggest = jest.fn();
const mockTally = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { suggestItemDetails: (...a: unknown[]) => mockSuggest(...a), incrementOrganizerTally: (...a: unknown[]) => mockTally(...a) },
}));

import Organizer from "@/app/organizer";

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}`, icon: "x", location: "fridge" }));
const confirm = (spy: jest.SpyInstance, label: string) => {
  const buttons = spy.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)!.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCredits = 40;
  mockItems = items(3);
  mockSuggest.mockResolvedValue({ location: "fridge" });
  mockTally.mockResolvedValue(undefined);
  mockRefreshScore.mockResolvedValue(undefined);
  mockRefreshCredits.mockResolvedValue(undefined);
});

describe("Organizer sweep", () => {
  test("says what it costs before it does anything, and cancelling spends nothing", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));

    expect(alert.mock.calls[0][0]).toBe("Check 3 items?");
    expect(alert.mock.calls[0][1]).toMatch(/uses 3 credits \(you have 40\)/);
    confirm(alert, "Cancel");
    expect(mockSuggest).not.toHaveBeenCalled();
    expect(screen.getByText(/Checks up to 15 items at a time · 1 credit each/)).toBeTruthy();
    alert.mockRestore();
  });

  test("a big fridge is checked in a batch of 15, and 'Check again' carries on with the rest", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockItems = items(20);
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));
    expect(alert.mock.calls[0][0]).toBe("Check 15 items?");
    expect(alert.mock.calls[0][1]).toMatch(/Your fridge has 20 items/);
    confirm(alert, "Check");
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledTimes(15));
    await screen.findByText("Check again");

    await fireEvent.press(screen.getByText("Check again"));
    expect(alert.mock.calls.at(-1)![0]).toBe("Check 5 items?"); // the ones not yet checked
    alert.mockRestore();
  });

  test("shows suggested moves, counts only checked items in the tidiness tally, and refreshes the credit balance", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockSuggest.mockImplementation(async (name: string) => ({ location: name === "Item 2" ? "freezer" : "fridge" }));
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));
    confirm(alert, "Check");

    expect(await screen.findByText("1 SUGGESTED MOVE")).toBeTruthy();
    await waitFor(() => expect(mockTally).toHaveBeenCalledWith({ checked: 3, correct: 2 }));
    expect(mockRefreshCredits).toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Move it"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("2", { location: "freezer" }));
    alert.mockRestore();
  });

  test("running out of credits mid-sweep stops, counts only what was checked, and offers to top up", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    let calls = 0;
    mockSuggest.mockImplementation(async () => {
      calls += 1;
      if (calls > 1) throw new ApiError(402, "insufficient_credits");
      return { location: "fridge" };
    });
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));
    confirm(alert, "Check");

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Out of credits after 1 check", expect.objectContaining({ actionLabel: "Get credits" })));
    expect(mockTally).toHaveBeenCalledWith({ checked: 1, correct: 1 }); // not 3
    mockToast.mock.calls.at(-1)![1].onAction();
    expect(mockPush).toHaveBeenLastCalledWith("/credits");
    alert.mockRestore();
  });

  test("when nothing could be checked nothing is counted and the screen says so", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockSuggest.mockRejectedValue(new Error("boom"));
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));
    confirm(alert, "Check");

    expect(await screen.findByText(/Nothing could be checked this time/)).toBeTruthy();
    expect(mockTally).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  test("with no credits left it offers to get some instead of starting", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCredits = 0;
    await render(<Organizer />);

    await fireEvent.press(screen.getByText("Check my fridge"));

    expect(alert.mock.calls[0][0]).toBe("Not enough credits");
    confirm(alert, "Get credits");
    expect(mockPush).toHaveBeenLastCalledWith("/credits");
    expect(mockSuggest).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
