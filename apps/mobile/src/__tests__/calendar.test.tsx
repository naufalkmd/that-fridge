import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { CalendarEntry } from "@thatfridge/core";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
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
let mockScope = "all";
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: mockScope }) }));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));

let mockUser: { preferences: { meal_slots?: string[] } } = { preferences: { meal_slots: ["Breakfast", "Dinner"] } };
const mockUpdateSlots = jest.fn();
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mockUser, updateMealSlots: mockUpdateSlots }) }));
let mockFridges = [{ id: "1", role: "member" }, { id: "2", role: "owner" }];
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ fridges: mockFridges }) }));
jest.mock("@/lib/recipes", () => ({
  useRecipes: () => ({ recipes: [{ id: "9", name: "Pad Thai" }, { id: "10", name: "Green Curry" }] }),
}));
const mockSyncReminder = jest.fn();
const mockCancelReminder = jest.fn();
jest.mock("@/lib/localNotifications", () => ({
  syncMealReminder: (...a: unknown[]) => mockSyncReminder(...a),
  cancelMealReminder: (...a: unknown[]) => mockCancelReminder(...a),
}));

const mockGetCalendar = jest.fn();
const mockCreateMeal = jest.fn();
const mockUpdateMeal = jest.fn();
const mockDeleteMeal = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    getCalendar: (...a: unknown[]) => mockGetCalendar(...a),
    createMealEntry: (...a: unknown[]) => mockCreateMeal(...a),
    updateMealEntry: (...a: unknown[]) => mockUpdateMeal(...a),
    deleteMealEntry: (...a: unknown[]) => mockDeleteMeal(...a),
  },
}));

import CalendarScreen from "@/app/calendar";

const entry = (over: Partial<CalendarEntry> & Pick<CalendarEntry, "kind" | "date" | "title">): CalendarEntry => ({
  id: `${over.kind}:${over.date}`, time: null, meta: null, tone: null, refs: {}, ...over,
});

beforeAll(() => {
  // Fake only Date so "today" is a known day (15 Sep 2026); timers stay real for waitFor.
  jest.useFakeTimers({
    now: new Date(2026, 8, 15, 12),
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = "all";
  mockParams = {};
  mockUser = { preferences: { meal_slots: ["Breakfast", "Dinner"] } };
  mockFridges = [{ id: "1", role: "member" }, { id: "2", role: "owner" }];
  mockGetCalendar.mockResolvedValue({ entries: [], truncated: false, from: "", to: "" });
  mockUpdateSlots.mockResolvedValue(undefined);
  mockCreateMeal.mockImplementation(async (input) => ({ id: "50", by: null, isMine: true, cookedAt: null, recipeId: input.recipe_id ?? null, fridgeId: input.fridge_id ?? null, note: null, ...input }));
  mockUpdateMeal.mockImplementation(async (id, input) => ({ id, slot: "Dinner", title: "Tacos", date: "2026-09-18", time: null, status: "planned", ...input }));
  mockDeleteMeal.mockResolvedValue(undefined);
});

describe("Calendar screen", () => {
  test("opens on the current month and asks the server for the whole 6-week grid in the device timezone", async () => {
    await render(<CalendarScreen />);

    expect(await screen.findByText("September 2026")).toBeTruthy();
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(1));
    expect(mockGetCalendar).toHaveBeenCalledWith({
      from: "2026-08-30", to: "2026-10-10", fridgeId: undefined, tz: "Asia/Kuala_Lumpur",
    });
  });

  test("a single-fridge scope is sent to the server", async () => {
    mockScope = "7";
    await render(<CalendarScreen />);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledWith(expect.objectContaining({ fridgeId: "7" })));
  });

  test("tapping a day opens that day's entries grouped by kind", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", meta: "Home", refs: { itemId: "42" } }),
        entry({ kind: "machine_scheduled", date: "2026-09-18", title: "Morning check", time: "08:00" }),
        entry({ kind: "used", date: "2026-09-18", title: "3 items used up", count: 3 }),
        entry({ kind: "added", date: "2026-09-19", title: "1 item added" }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByTestId("day-2026-09-18"));

    expect(await screen.findByText("Yogurt")).toBeTruthy();
    expect(screen.getByText("Morning check")).toBeTruthy();
    expect(screen.getByText("3 items used up")).toBeTruthy();
    expect(screen.getAllByText("Expiry")).toHaveLength(2); // the filter chip + this day's section heading
    expect(screen.queryByText("1 item added")).toBeNull(); // that's the 19th
  });

  test("every day is tappable: an empty day and a day from the neighbouring month both open a detail", async () => {
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByTestId("day-2026-09-03"));
    expect(await screen.findByText("Nothing on this day.")).toBeTruthy();
    expect(screen.getByText(/^Thursday.*\b3\b.*September|^Thursday.*September.*\b3\b/)).toBeTruthy(); // locale-order independent

    await fireEvent.press(screen.getByTestId("day-2026-10-07")); // greyed, next month
    await waitFor(() => expect(screen.getByText(/^Wednesday.*\b7\b.*October|^Wednesday.*October.*\b7\b/)).toBeTruthy());
  });

  test("tapping an expiring item opens it; an automation goes to Kitchen Lab", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", refs: { itemId: "42" } }),
        entry({ kind: "machine_run", date: "2026-09-19", title: "Morning check", refs: { machineId: "9", runId: "1" } }),
        entry({ kind: "used", date: "2026-09-20", title: "2 items used up", count: 2 }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByTestId("day-2026-09-18"));
    await fireEvent.press(await screen.findByText("Yogurt"));
    expect(mockPush).toHaveBeenLastCalledWith("/item/42");

    await fireEvent.press(await screen.findByTestId("day-2026-09-19"));
    await fireEvent.press(await screen.findByText("Morning check"));
    expect(mockPush).toHaveBeenLastCalledWith("/kitchen-lab");

    mockPush.mockClear();
    await fireEvent.press(await screen.findByTestId("day-2026-09-20"));
    await fireEvent.press(await screen.findByText("2 items used up")); // a summary row goes nowhere
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a filter chip hides its group from the grid and the day detail", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", refs: { itemId: "42" } }),
        entry({ kind: "added", date: "2026-09-18", title: "1 item added" }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByText("Expiry")); // switch the Expiry group off
    await fireEvent.press(screen.getByTestId("day-2026-09-18"));

    expect(await screen.findByText("1 item added")).toBeTruthy();
    expect(screen.queryByText("Yogurt")).toBeNull();
  });

  test("next / previous month fetch that month's grid; Today returns", async () => {
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(await screen.findByText("October 2026")).toBeTruthy();
    await waitFor(() => expect(mockGetCalendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-09-27", to: "2026-11-07" })));

    await fireEvent.press(screen.getByText("Today"));
    expect(await screen.findByText("September 2026")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Previous month"));
    expect(await screen.findByText("August 2026")).toBeTruthy();
  });

  test("a failed load shows a retry that fetches again", async () => {
    mockGetCalendar.mockRejectedValueOnce(new Error("boom"));
    await render(<CalendarScreen />);

    const retry = await screen.findByText(/Tap to retry/);
    await fireEvent.press(retry);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Tap to retry/)).toBeNull());
  });
});

// ---- meal planning -------------------------------------------------------------------------

const meal = (over: Partial<CalendarEntry> = {}): CalendarEntry =>
  entry({
    kind: "meal", date: "2026-09-18", title: "Tacos", slot: "Dinner", status: "planned", meta: "Dinner",
    refs: { mealEntryId: "7", fridgeId: "2" }, ...over,
  });

async function openDay(date: string) {
  await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());
  await fireEvent.press(await screen.findByTestId(`day-${date}`));
}

describe("Calendar meal planning", () => {
  test("a day lists its meals with slot, time and who planned it", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        meal({ time: "18:30", by: "sam" }),
        meal({ id: "meal:8", title: "Oats", slot: "Breakfast", refs: { mealEntryId: "8" } }),
        meal({ id: "meal:9", title: "Cake", status: "cooked", refs: { mealEntryId: "9" } }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");

    expect(await screen.findByText("Tacos")).toBeTruthy();
    expect(screen.getByText("Dinner · 18:30 · by @sam")).toBeTruthy();
    expect(screen.getByText("Dinner · Cooked")).toBeTruthy();
    expect(screen.getAllByText("Meals")).toHaveLength(2); // the filter chip + this day's section heading
  });

  test("Plan a meal saves a new entry on the first slot and the user's own fridge, then refetches", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));

    await fireEvent.changeText(screen.getByPlaceholderText("What are you having?"), "Leftover curry");
    await fireEvent.changeText(screen.getByPlaceholderText("18:30 (optional)"), "19:00");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledTimes(1));
    expect(mockCreateMeal).toHaveBeenCalledWith({
      date: "2026-09-18", slot: "Breakfast", time: "19:00", recipe_id: null, title: "Leftover curry", note: null,
      status: "planned", fridge_id: "2", // the fridge the user owns
    });
    expect(mockSyncReminder).toHaveBeenCalledWith(expect.objectContaining({ id: "50", time: "19:00" }));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2)); // refreshed
    expect(await screen.findByText("Nothing on this day.")).toBeTruthy(); // back on the list
  });

  test("a single-fridge scope plans on that fridge; picking another slot and a recipe is sent through", async () => {
    mockScope = "1";
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));

    await fireEvent.press(screen.getByText("Dinner"));
    await fireEvent.press(screen.getByText("Choose from your recipes"));
    await fireEvent.press(screen.getByText("Green Curry"));
    expect(screen.getByDisplayValue("Green Curry")).toBeTruthy(); // the empty name is filled from the recipe
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ slot: "Dinner", recipe_id: "10", title: "Green Curry", fridge_id: "1" })));
  });

  test("an incomplete meal shows the problem and calls nothing", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));

    await fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText("Add a name or choose a recipe.")).toBeTruthy();
    expect(mockCreateMeal).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText("What are you having?"), "x");
    await fireEvent.changeText(screen.getByPlaceholderText("18:30 (optional)"), "6pm");
    await fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText(/24-hour time/)).toBeTruthy();
    expect(mockCreateMeal).not.toHaveBeenCalled();
  });

  test("a server error is shown in the form and the form stays open", async () => {
    mockCreateMeal.mockRejectedValueOnce(new Error("boom"));
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));
    await fireEvent.changeText(screen.getByPlaceholderText("What are you having?"), "x");

    await fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText(/Couldn't save that meal|boom/)).toBeTruthy();
    expect(screen.getByPlaceholderText("What are you having?")).toBeTruthy();
  });

  test("with no slots yet it offers templates; choosing one saves the slots", async () => {
    mockUser = { preferences: {} };
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));

    expect(await screen.findByText(/Pick a starting point/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Dinner only"));

    await waitFor(() => expect(mockUpdateSlots).toHaveBeenCalledWith(["Dinner"]));
  });

  test("a brand-new slot label can be typed in and is saved with the list", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByText("Plan a meal"));

    await fireEvent.press(screen.getByText("+ New slot"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Post-workout"), "Post-workout");
    await fireEvent.press(screen.getByText("Add"));

    await waitFor(() => expect(mockUpdateSlots).toHaveBeenCalledWith(["Breakfast", "Dinner", "Post-workout"]));
  });

  test("tapping a meal edits it without moving it between fridges, and Delete removes it and its reminder", async () => {
    mockGetCalendar.mockResolvedValue({ entries: [meal({ time: "18:30" })], truncated: false, from: "", to: "" });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");

    await fireEvent.press(await screen.findByLabelText("Edit Tacos"));
    expect(screen.getByDisplayValue("Tacos")).toBeTruthy();
    expect(screen.getByDisplayValue("18:30")).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue("Tacos"), "Burritos");
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledTimes(1));
    const [id, body] = mockUpdateMeal.mock.calls[0];
    expect(id).toBe("7");
    expect(body).toMatchObject({ title: "Burritos", time: "18:30", slot: "Dinner" });
    expect(body).not.toHaveProperty("fridge_id");

    await fireEvent.press(await screen.findByLabelText("Edit Tacos"));
    await fireEvent.press(screen.getByText("Delete meal"));
    await waitFor(() => expect(mockDeleteMeal).toHaveBeenCalledWith("7"));
    expect(mockCancelReminder).toHaveBeenCalledWith("7");
  });

  test("the tick marks a planned meal cooked without opening the form", async () => {
    mockGetCalendar.mockResolvedValue({ entries: [meal()], truncated: false, from: "", to: "" });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");

    await fireEvent.press(await screen.findByLabelText("Mark Tacos cooked"));

    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledWith("7", { status: "cooked" }));
    expect(mockSyncReminder).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("What are you having?")).toBeNull();
  });

  test("Add to plan from a recipe: pick any day and the form opens with that recipe", async () => {
    mockParams = { recipeId: "9", recipeName: "Pad Thai" };
    await render(<CalendarScreen />);
    expect(await screen.findByText("Pick a day for Pad Thai")).toBeTruthy();

    await openDay("2026-09-21");
    expect(await screen.findByDisplayValue("Pad Thai")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-21", recipe_id: "9", title: "Pad Thai" })));
    await waitFor(() => expect(screen.queryByText("Pick a day for Pad Thai")).toBeNull()); // banner clears once planned
  });

  test("cancelling the recipe banner returns to normal day taps", async () => {
    mockParams = { recipeId: "9", recipeName: "Pad Thai" };
    await render(<CalendarScreen />);
    await fireEvent.press(await screen.findByLabelText("Cancel planning"));

    await openDay("2026-09-21");
    expect(await screen.findByText("Nothing on this day.")).toBeTruthy();
    expect(screen.queryByDisplayValue("Pad Thai")).toBeNull();
  });
});
