import { fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
const mockResults = jest.fn();
jest.mock("@thatfridge/core", () => ({
  ...jest.requireActual("@thatfridge/core"),
  kitchenScoreResults: () => mockResults(),
}));

import { KitchenScore } from "@/components/home/KitchenScore";

const result = (key: string, score: number | null) => ({ key, score, label: "", headline: "", detail: "" });

describe("Home kitchen score row", () => {
  test("shows the score, a word for it and the streak, and opens Insights", async () => {
    mockResults.mockReturnValue([result("waste", 90), result("balance", 80), result("organizer", 85), result("shopkeeper", 85)]);
    await render(<KitchenScore input={{} as never} streak={6} />);

    expect(screen.getByText("85")).toBeTruthy();
    expect(screen.getByText("Great")).toBeTruthy();
    expect(screen.getByText("6 days")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledWith("/insights");
  });

  test("before there is a score it says when one appears, and hides an empty streak", async () => {
    mockResults.mockReturnValue([result("waste", null), result("balance", null), result("organizer", null), result("shopkeeper", null)]);
    await render(<KitchenScore input={{} as never} streak={0} />);

    expect(screen.getByText("Appears after a few days of use")).toBeTruthy();
    expect(screen.queryByText("0 days")).toBeNull();
  });
});
