import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: "success" } }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
const mockRefresh = jest.fn();
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ usageHistory: [], refresh: mockRefresh }) }));
const mockGetFacts = jest.fn();
const mockClear = jest.fn();
const mockDeleteFact = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    getMemoryFacts: (...a: unknown[]) => mockGetFacts(...a),
    clearMemoryFacts: (...a: unknown[]) => mockClear(...a),
    deleteMemoryFact: (...a: unknown[]) => mockDeleteFact(...a),
  },
}));

import AIData from "@/app/ai-data";

const press = (spy: jest.SpyInstance, label: string) => {
  const buttons = spy.mock.calls.at(-1)![2] as { text: string; onPress?: () => void | Promise<void> }[];
  return buttons.find((b) => b.text === label)!.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFacts.mockResolvedValue(["Prefers vegetarian", "Allergic to nuts"]);
});

describe("AI Data & Memory", () => {
  test("clearing memory empties the list once the server has", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockClear.mockResolvedValue(undefined);
    await render(<AIData />);
    await screen.findByText("Prefers vegetarian");

    await fireEvent.press(screen.getByText("Clear all"));
    await press(alert, "Clear");

    await waitFor(() => expect(screen.queryByText("Prefers vegetarian")).toBeNull());
    alert.mockRestore();
  });

  test("a failed clear keeps the list and says so, instead of pretending it worked", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockClear.mockRejectedValue(new Error("boom"));
    await render(<AIData />);
    await screen.findByText("Prefers vegetarian");

    await fireEvent.press(screen.getByText("Clear all"));
    await press(alert, "Clear");

    await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Couldn't clear memory", expect.any(String)));
    expect(screen.getByText("Prefers vegetarian")).toBeTruthy();
    alert.mockRestore();
  });

  test("forgetting one fact shows the server's list; a failure is reported and the list is unchanged", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockDeleteFact.mockResolvedValueOnce(["Allergic to nuts"]);
    await render(<AIData />);
    await screen.findByText("Prefers vegetarian");

    await fireEvent.press(screen.getByLabelText("Forget: Prefers vegetarian"));
    await waitFor(() => expect(screen.queryByText("Prefers vegetarian")).toBeNull());
    expect(mockDeleteFact).toHaveBeenCalledWith(0);

    mockDeleteFact.mockRejectedValueOnce(new Error("boom"));
    await fireEvent.press(screen.getByLabelText("Forget: Allergic to nuts"));
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Couldn't forget that", expect.any(String)));
    expect(screen.getByText("Allergic to nuts")).toBeTruthy();
    alert.mockRestore();
  });
});
