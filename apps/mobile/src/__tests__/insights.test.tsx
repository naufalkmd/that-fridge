import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { CalendarEntry } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }),
}));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
jest.mock("@/components/fridge-scope", () => ({ FridgeScopePicker: () => null }));
let mockScope = "all";
jest.mock("@/lib/scope", () => ({
  useScope: () => ({ scope: mockScope }),
  scopeItems: (items: { fridgeId: string }[], scope: string) => (scope === "all" ? items : items.filter((i) => i.fridgeId === scope)),
}));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { streak: 4 } }) }));
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({
    items: [
      { id: "1", fridgeId: "1", days: -1 },
      { id: "2", fridgeId: "1", days: 2 },
      { id: "3", fridgeId: "2", days: 20 },
    ],
  }),
}));
const mockUsage = [
  { id: "u1", key: "milk", name: "Milk", icon: "milk", category: "dairy", count: 3, freshUseCount: 0, freshnessSum: 160, freshnessSampleCount: 2, lastAt: 0 },
  { id: "u2", key: "apple", name: "Apple", icon: "apple", category: "fruit", count: 1, freshUseCount: 0, freshnessSum: 0, freshnessSampleCount: 0, lastAt: 0 },
];
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ usageHistory: mockUsage }) }));
const mockGetCalendar = jest.fn();
jest.mock("@/lib/api", () => ({ api: { getCalendar: (...a: unknown[]) => mockGetCalendar(...a) } }));

import Insights from "@/app/insights";

const entry = (over: Partial<CalendarEntry> & Pick<CalendarEntry, "kind" | "date">): CalendarEntry => ({
  id: `${over.kind}:${over.date}:${Math.random()}`, time: null, title: "x", meta: null, tone: null, refs: {}, ...over,
});

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 8, 15, 12),
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = "all";
  mockGetCalendar.mockResolvedValue({ entries: [], truncated: false, from: "", to: "" });
});

describe("Insights screen", () => {
  test("asks for the last four weeks through the end of this one, in the device timezone", async () => {
    await render(<Insights />);

    await waitFor(() =>
      expect(mockGetCalendar).toHaveBeenCalledWith({ from: "2026-08-23", to: "2026-09-19", fridgeId: undefined, tz: "Asia/Kuala_Lumpur" }),
    );
  });

  test("a single-fridge scope narrows both the request and the fridge counts", async () => {
    mockScope = "2";
    await render(<Insights />);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledWith(expect.objectContaining({ fridgeId: "2" })));
    expect(screen.getByText("Right now")).toBeTruthy();
    expect(screen.getAllByText("1")[0]).toBeTruthy(); // one item in that fridge
  });

  test("right now counts what is past date and expiring within three days", async () => {
    await render(<Insights />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    expect(screen.getByText("Expiring in 3 days")).toBeTruthy();
    expect(screen.getByText("Past date")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // three items in the fridge
  });

  test("shows waste, calories, food groups and habits from the feed and usage history", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "used", date: "2026-09-14", count: 6 }),
        entry({ kind: "wasted", date: "2026-09-14", count: 2 }),
        entry({ kind: "meal", date: "2026-09-15", status: "cooked", calories: 600 }),
        entry({ kind: "meal", date: "2026-09-16", status: "planned", calories: 400 }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<Insights />);

    expect(await screen.findAllByText("25%")).toHaveLength(2); // waste rate (2 of 8) and Fruit's share
    expect(screen.getByText("Waste rate")).toBeTruthy();
    expect(screen.getByText("≈ 600 kcal")).toBeTruthy(); // cooked
    expect(screen.getByText("≈ 500 kcal")).toBeTruthy(); // daily average of 600 and 400
    expect(screen.getByText("Dairy")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy(); // freshness when used: 160 / 2
    expect(screen.getByText("3×")).toBeTruthy(); // Milk used three times
  });

  test("empty states explain what is missing instead of showing zeros", async () => {
    await render(<Insights />);

    expect(await screen.findByText(/Nothing used up or thrown out yet/)).toBeTruthy();
    expect(screen.getByText(/No meals with calories on this week/)).toBeTruthy();
  });

  test("a failed load offers a retry", async () => {
    mockGetCalendar.mockRejectedValueOnce(new Error("boom"));
    await render(<Insights />);

    await fireEvent.press(await screen.findByText(/Tap to retry/));

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2));
  });

  test("links to the meal plan", async () => {
    await render(<Insights />);
    await fireEvent.press(screen.getByText("Open the meal plan ›"));
    expect(mockPush).toHaveBeenLastCalledWith("/meal-plan");
  });
});
