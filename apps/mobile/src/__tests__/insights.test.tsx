import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { CalendarEntry } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
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
let mockStreak = 4;
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { streak: mockStreak } }) }));
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
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ usageHistory: mockUsage, scoreSnapshots: [] }) }));
jest.mock("@/lib/useKitchenScoreInput", () => ({ useKitchenScoreInput: () => ({ items: [] }) }));
let mockResults: { key: string; label: string; score: number | null; headline: string; detail: string }[] = [];
jest.mock("@thatfridge/core", () => ({
  ...jest.requireActual("@thatfridge/core"),
  kitchenScoreResults: () => mockResults,
  getOverallScore: (r: { score: number | null }[]) => {
    const s = r.map((x) => x.score).filter((x): x is number => x !== null);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  },
  getScoreTrend: () => null,
}));
const mockGetCalendar = jest.fn();
jest.mock("@/lib/api", () => ({ api: { getCalendar: (...a: unknown[]) => mockGetCalendar(...a) } }));

import Insights from "@/app/insights";

const entry = (over: Partial<CalendarEntry> & Pick<CalendarEntry, "kind" | "date">): CalendarEntry => ({
  id: `${over.kind}:${over.date}:${Math.random()}`, time: null, title: "x", meta: null, tone: null, refs: {}, ...over,
});
const result = (key: string, label: string, score: number | null, headline = "H", detail = "D") => ({ key, label, score, headline, detail });

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
  mockStreak = 4;
  mockGetCalendar.mockResolvedValue({ entries: [], truncated: false, from: "", to: "" });
  mockResults = [
    result("waste", "Waste Saver", 90, "Little waste", "Only a few items went off."),
    result("balance", "Food Balance", 70),
    result("organizer", "Tidiness", 80),
    result("shopkeeper", "Restocking", 60),
  ];
});

describe("Insights (score and insights, merged)", () => {
  test("asks for the last four weeks through the end of this one, in the device timezone", async () => {
    await render(<Insights />);

    await waitFor(() =>
      expect(mockGetCalendar).toHaveBeenCalledWith({ from: "2026-08-23", to: "2026-09-19", fridgeId: undefined, tz: "Asia/Kuala_Lumpur" }),
    );
  });

  test("one score in words, a bar per crew member, and the streak", async () => {
    mockResults = [result("waste", "Waste Saver", 90), result("balance", "Food Balance", 80), result("organizer", "Tidiness", 85), result("shopkeeper", "Restocking", 90)];
    await render(<Insights />);

    expect(screen.getByText("Great")).toBeTruthy();
    for (const name of ["Guardian", "Chef", "Organizer", "Shopkeeper"]) expect(screen.getByLabelText(new RegExp(`^${name},`))).toBeTruthy();
    expect(screen.getByText("4-day streak")).toBeTruthy();
    expect(screen.getByText("Your kitchen score, from the whole crew.")).toBeTruthy();
  });

  test("tapping a crew bar explains it; tapping again hides it", async () => {
    await render(<Insights />);

    await fireEvent.press(screen.getByLabelText("Guardian, 90"));
    expect(screen.getByText("Little waste")).toBeTruthy();
    expect(screen.getByText("Only a few items went off.")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Guardian, 90"));
    expect(screen.queryByText("Little waste")).toBeNull();
  });

  test("with no score yet it says it is building and shows dashes, not zeros", async () => {
    mockResults = ["waste", "balance", "organizer", "shopkeeper"].map((k) => result(k, k, null));
    mockStreak = 0;
    await render(<Insights />);

    expect(screen.getByText("Building")).toBeTruthy();
    expect(screen.getByText("Keep using ThatFridge and your score appears here.")).toBeTruthy();
    expect(screen.queryByText(/streak/)).toBeNull();
  });

  test("right now is a sentence per problem, not a row of counters", async () => {
    await render(<Insights />);

    expect(screen.getByText("1 item is past its date")).toBeTruthy();
    expect(screen.getByText("1 item to use in the next 3 days")).toBeTruthy();
  });

  test("a single fridge narrows it: nothing close to its date says so", async () => {
    mockScope = "2";
    await render(<Insights />);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledWith(expect.objectContaining({ fridgeId: "2" })));
    expect(screen.getByText("Nothing is close to its date. Nice.")).toBeTruthy();
  });

  test("waste is one sentence and four week columns, newest last", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [entry({ kind: "used", date: "2026-09-14", count: 6 }), entry({ kind: "wasted", date: "2026-09-14", count: 2 })],
      truncated: false, from: "", to: "",
    });
    await render(<Insights />);

    expect(await screen.findByText("You used up 6 of 8 items. 2 were thrown out.")).toBeTruthy();
    for (const label of ["3w ago", "2w ago", "Last", "This"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Used up")).toBeTruthy();
    expect(screen.getByText("Thrown out")).toBeTruthy();
  });

  test("calories are one rounded number with what it means, and a chart of the week", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "meal", date: "2026-09-15", status: "cooked", calories: 1800 }),
        entry({ kind: "meal", date: "2026-09-16", status: "planned", calories: 1901 }),
        entry({ kind: "meal", date: "2026-09-17", status: "planned", calories: null }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<Insights />);

    expect(await screen.findByText("≈ 1,850")).toBeTruthy(); // (1800+1901)/2 = 1850.5, rounded to the nearest 50
    expect(screen.getByText("kcal a day, planned and cooked")).toBeTruthy();
    expect(screen.getByText("1 meal without an estimate isn't counted.")).toBeTruthy();
  });

  test("food groups are bars with a plain nudge, not a table of percentages", async () => {
    await render(<Insights />);

    expect(screen.getByText("Dairy")).toBeTruthy();
    expect(screen.getByText("Fruit")).toBeTruthy();
    expect(screen.getByText("Protein")).toBeTruthy(); // present, but muted: it hasn't come up
    expect(screen.getByText("Protein hasn't come up yet. Adding some would round out your plate.")).toBeTruthy();
    expect(screen.queryByText("75%")).toBeNull();
  });

  test("habits show freshness and the top few, not five rows of counts", async () => {
    await render(<Insights />);

    expect(screen.getByText("80%")).toBeTruthy(); // 160 / 2 samples
    expect(screen.getByText("You use these most")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.queryByText("3×")).toBeNull();
  });

  test("empty states explain what is missing", async () => {
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
