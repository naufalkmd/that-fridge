import { fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));

import { KitchenScorePill } from "@/components/home/KitchenScore";

describe("Kitchen score pill", () => {
  test("shows the score, a word for it and the streak, and opens Insights", async () => {
    await render(<KitchenScorePill score={85} streak={6} />);

    expect(screen.getByText("85")).toBeTruthy();
    expect(screen.getByText("Great")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button"));
    expect(mockPush).toHaveBeenCalledWith("/insights");
  });

  test("before there is a score it says it's building, with no streak", async () => {
    await render(<KitchenScorePill score={null} streak={0} />);

    expect(screen.getByText("Building")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
