import { Alert } from "react-native";
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

const mockAddShopping = jest.fn();
const mockAddNote = jest.fn();
const mockToast = jest.fn();
jest.mock("@/lib/shopping", () => ({ useShopping: () => ({ add: (...a: unknown[]) => mockAddShopping(...a) }) }));
jest.mock("@/lib/notes", () => ({ useNotes: () => ({ add: (...a: unknown[]) => mockAddNote(...a) }) }));
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));

let mockUser: { preferences: { meal_slots?: string[] } } = { preferences: { meal_slots: ["Breakfast", "Dinner"] } };
const mockUpdateSlots = jest.fn();
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mockUser, updateMealSlots: mockUpdateSlots }) }));
let mockFridges = [{ id: "1", role: "member" }, { id: "2", role: "owner" }];
const mockRemoveItem = jest.fn();
const mockUndoRemoval = jest.fn();
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({
    fridges: mockFridges,
    removeItem: (...a: unknown[]) => mockRemoveItem(...a),
    undoRemoval: (...a: unknown[]) => mockUndoRemoval(...a),
  }),
}));
const mockRefreshScore = jest.fn();
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ refresh: mockRefreshScore }) }));
jest.mock("@/lib/recipes", () => ({
  useRecipes: () => ({ recipes: [{ id: "9", name: "Pad Thai", calories: 640 }, { id: "10", name: "Green Curry", calories: null }] }),
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
const mockEstimate = jest.fn();
const mockDeleteRun = jest.fn();
const mockClearHistory = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    deleteMachineRun: (...a: unknown[]) => mockDeleteRun(...a),
    clearCalendarHistory: (...a: unknown[]) => mockClearHistory(...a),
    estimateMealCalories: (...a: unknown[]) => mockEstimate(...a),
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
  mockEstimate.mockResolvedValue({ calories: null });
  mockAddShopping.mockResolvedValue(undefined);
  mockAddNote.mockResolvedValue(undefined);
  mockRemoveItem.mockResolvedValue({ id: "77", outcome: "used" });
  mockUndoRemoval.mockResolvedValue(undefined);
  mockDeleteRun.mockResolvedValue(undefined);
  mockClearHistory.mockResolvedValue({ deleted: 2 });
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
    expect(screen.getByText("Expiry")).toBeTruthy(); // this day's section heading
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

  test("one Filter button opens a tag dropdown; unticking a tag hides it from the grid and the day", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", refs: { itemId: "42" } }),
        entry({ kind: "added", date: "2026-09-18", title: "1 item added" }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByLabelText("Filter"));
    for (const label of ["Planned meals", "Cooked meals", "Skipped meals", "Expiring", "Scheduled automations", "Automation runs", "Items added", "Used up", "Thrown out"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByLabelText("Expiring"));
    await fireEvent.press(screen.getByTestId("filter-backdrop"));
    expect(screen.getByLabelText("Filter, 1 hidden")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("day-2026-09-18"));
    expect(await screen.findByText("1 item added")).toBeTruthy();
    expect(screen.queryByText("Yogurt")).toBeNull();
  });

  test("Show all puts every tag back", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", refs: { itemId: "42" } })],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByLabelText("Filter"));
    await fireEvent.press(screen.getByLabelText("Expiring"));
    await fireEvent.press(screen.getByLabelText("Show everything"));
    await fireEvent.press(screen.getByTestId("filter-backdrop"));

    await fireEvent.press(screen.getByTestId("day-2026-09-18"));
    expect(await screen.findByText("Yogurt")).toBeTruthy();
    expect(screen.getByLabelText("Filter")).toBeTruthy();
  });

  test("tags split meals by status, so a cooked meal can be hidden on its own", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        entry({ kind: "meal", date: "2026-09-18", title: "Tacos", slot: "Dinner", status: "planned", refs: { mealEntryId: "1" } }),
        entry({ kind: "meal", date: "2026-09-18", title: "Soup", slot: "Lunch", status: "cooked", refs: { mealEntryId: "2" } }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByLabelText("Filter"));
    await fireEvent.press(screen.getByLabelText("Cooked meals"));
    await fireEvent.press(screen.getByTestId("filter-backdrop"));
    await fireEvent.press(screen.getByTestId("day-2026-09-18"));

    expect(await screen.findByText("Tacos")).toBeTruthy();
    expect(screen.queryByText("Soup")).toBeNull();
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

/** From an open day sheet: the general "+ Add" button, then "Plan a meal" in its menu. */
async function openPlanForm() {
  await fireEvent.press(await screen.findByLabelText("Add"));
  await fireEvent.press(await screen.findByLabelText("Plan a meal"));
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
    expect(screen.getByText("Meals")).toBeTruthy(); // this day's section heading
  });

  test("Plan a meal saves a new entry on the first slot and the user's own fridge, then refetches", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Leftover curry");
    await fireEvent.changeText(screen.getByPlaceholderText("18:30 (optional)"), "19:00");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledTimes(1));
    expect(mockCreateMeal).toHaveBeenCalledWith({
      date: "2026-09-18", slot: "Breakfast", time: "19:00", recipe_id: null, title: "Leftover curry", note: null,
      calories: null, status: "planned", fridge_id: "2", // the fridge the user owns; blank calories = the server estimates
    });
    expect(mockSyncReminder).toHaveBeenCalledWith(expect.objectContaining({ id: "50", time: "19:00" }));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2)); // refreshed
    expect(await screen.findByText("Nothing on this day.")).toBeTruthy(); // back on the list
  });

  test("a single-fridge scope plans on that fridge; picking another slot and a recipe is sent through", async () => {
    mockScope = "1";
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

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
    await openPlanForm();

    await fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText("Add a name or choose a recipe.")).toBeTruthy();
    expect(mockCreateMeal).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "x");
    await fireEvent.changeText(screen.getByPlaceholderText("18:30 (optional)"), "6pm");
    await fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText(/24-hour time/)).toBeTruthy();
    expect(mockCreateMeal).not.toHaveBeenCalled();
  });

  test("a server error is shown in the form and the form stays open", async () => {
    mockCreateMeal.mockRejectedValueOnce(new Error("boom"));
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "x");

    await fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText(/Couldn't save that meal|boom/)).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Chicken rice")).toBeTruthy();
  });

  test("with no slots yet it offers templates; choosing one saves the slots", async () => {
    mockUser = { preferences: {} };
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

    expect(await screen.findByText(/Pick a starting point/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Dinner only"));

    await waitFor(() => expect(mockUpdateSlots).toHaveBeenCalledWith(["Dinner"]));
  });

  test("a brand-new slot label can be typed in and is saved with the list", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

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
    expect(screen.queryByPlaceholderText("e.g. Chicken rice")).toBeNull();
  });
});

// ---- calories in meal planning ---------------------------------------------------------------

describe("Calendar meal calories", () => {
  test("typing a name shows the estimate as the calories hint; saving without a number leaves it to the server", async () => {
    mockEstimate.mockResolvedValue({ calories: 98 });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Banana");

    expect(await screen.findByPlaceholderText("≈ 98 kcal")).toBeTruthy();
    expect(screen.getByText("Estimated from the name. Type a number to change it.")).toBeTruthy();
    expect(mockEstimate).toHaveBeenLastCalledWith("Banana");

    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ title: "Banana", calories: null })));
  });

  test("a typed number is sent as-is and only digits are accepted", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Mum's stew");

    await fireEvent.changeText(screen.getByLabelText("Calories"), "4a5b0");
    expect(screen.getByDisplayValue("450")).toBeTruthy();
    expect(screen.getByText("Using the number you typed.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ calories: 450 })));
  });

  test("choosing a recipe shows its calories in the list and as the hint, without asking the server", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

    await fireEvent.press(screen.getByText("Choose from your recipes"));
    expect(screen.getByText("≈ 640 kcal")).toBeTruthy(); // Pad Thai's number beside its name
    await fireEvent.press(screen.getByText("Pad Thai"));

    expect(await screen.findByPlaceholderText("≈ 640 kcal")).toBeTruthy();
    expect(screen.getByText("Estimated from the recipe. Type a number to change it.")).toBeTruthy();
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  test("a name we cannot estimate says so instead of showing a made-up number", async () => {
    mockEstimate.mockResolvedValue({ calories: null });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Zorblax surprise");

    expect(await screen.findByText(/No estimate for this name/)).toBeTruthy();
    expect(screen.getByPlaceholderText("kcal (optional)")).toBeTruthy();
  });

  test("a failing estimate call never blocks planning", async () => {
    mockEstimate.mockRejectedValue(new Error("offline"));
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Banana");

    await waitFor(() => expect(mockEstimate).toHaveBeenCalled());
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalled());
  });

  test("meals show their calories and the day shows a total, noting meals without an estimate", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        meal({ calories: 400, caloriesSource: "estimate" }),
        meal({ id: "meal:8", title: "Oats", slot: "Breakfast", calories: 250, caloriesSource: "recipe", status: "cooked", refs: { mealEntryId: "8" } }),
        meal({ id: "meal:9", title: "Mystery", calories: null, refs: { mealEntryId: "9" } }),
        meal({ id: "meal:10", title: "Skipped cake", calories: 900, status: "skipped", refs: { mealEntryId: "10" } }),
      ],
      truncated: false, from: "", to: "",
    });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");

    expect(await screen.findByText("Dinner · ≈ 400 kcal")).toBeTruthy();
    expect(screen.getByText("≈ 650 kcal · 2 of 3 counted")).toBeTruthy(); // the skipped meal is left out
  });

  test("editing shows a typed number, and clearing it hands the meal back to the estimate", async () => {
    mockGetCalendar.mockResolvedValue({ entries: [meal({ calories: 300, caloriesSource: "manual" })], truncated: false, from: "", to: "" });
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await fireEvent.press(await screen.findByLabelText("Edit Tacos"));

    expect(screen.getByDisplayValue("300")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Calories"), "");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledWith("7", expect.objectContaining({ calories: null })));
  });

  test("a bad calories value is refused with a clear message", async () => {
    await render(<CalendarScreen />);
    await openDay("2026-09-18");
    await openPlanForm();
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "x");
    await fireEvent.changeText(screen.getByLabelText("Calories"), "9999");

    await fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText(/whole number up to 5000/)).toBeTruthy();
    expect(mockCreateMeal).not.toHaveBeenCalled();
  });
});

// ---- the general "+" menu ---------------------------------------------------------------------

describe("Calendar + Add menu", () => {
  const openMenu = async (date = "2026-09-18") => {
    await render(<CalendarScreen />);
    await openDay(date);
    await fireEvent.press(await screen.findByLabelText("Add"));
  };

  test("lists everything you can add", async () => {
    await openMenu();

    for (const label of ["Plan a meal", "Add to shopping list", "Leave a note", "Add an item", "New automation", "Ask Quick Chat"]) {
      expect(await screen.findByLabelText(label)).toBeTruthy();
    }
  });

  test("Back returns to the day", async () => {
    await openMenu();
    await fireEvent.press(screen.getByLabelText("Back to the day"));

    expect(await screen.findByText("Nothing on this day.")).toBeTruthy();
  });

  test("Add to shopping list saves the item, confirms, and returns to the day", async () => {
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Add to shopping list"));

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Milk"), "  Milk ");
    await fireEvent.press(screen.getByText("Add"));

    await waitFor(() => expect(mockAddShopping).toHaveBeenCalledWith("Milk"));
    expect(mockToast).toHaveBeenCalledWith('Added "Milk" to your shopping list');
    expect(await screen.findByText("Nothing on this day.")).toBeTruthy();
  });

  test("a blank shopping item or note is refused without calling anything", async () => {
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Add to shopping list"));
    await fireEvent.press(screen.getByText("Add"));
    expect(await screen.findByText("Type what you need to buy.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Back")); // back to the menu
    await fireEvent.press(await screen.findByLabelText("Leave a note"));
    await fireEvent.press(screen.getByText("Add"));
    expect(await screen.findByText("Type your note.")).toBeTruthy();
    expect(mockAddShopping).not.toHaveBeenCalled();
    expect(mockAddNote).not.toHaveBeenCalled();
  });

  test("Leave a note puts it on the fridge the user owns", async () => {
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Leave a note"));

    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Out of rice, back Friday"), "Out of rice");
    await fireEvent.press(screen.getByText("Add"));

    await waitFor(() => expect(mockAddNote).toHaveBeenCalledWith("2", "Out of rice", "amber"));
    expect(mockToast).toHaveBeenCalledWith("Note left on the fridge");
  });

  test("a note with no fridge says so instead of failing silently", async () => {
    mockFridges = [];
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Leave a note"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Out of rice, back Friday"), "Hello");

    await fireEvent.press(screen.getByText("Add"));

    expect(await screen.findByText("Create or join a fridge first.")).toBeTruthy();
    expect(mockAddNote).not.toHaveBeenCalled();
  });

  test("a failing save shows the error and keeps what was typed", async () => {
    mockAddShopping.mockRejectedValueOnce(new Error("offline"));
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Add to shopping list"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Milk"), "Milk");

    await fireEvent.press(screen.getByText("Add"));

    expect(await screen.findByText(/Couldn't save that|offline/)).toBeTruthy();
    expect(screen.getByDisplayValue("Milk")).toBeTruthy();
  });

  test("Add an item and New automation hand off to their own screens", async () => {
    await openMenu();
    await fireEvent.press(await screen.findByLabelText("Add an item"));
    expect(mockPush).toHaveBeenLastCalledWith("/add");

    await fireEvent.press(await screen.findByLabelText("Add to the calendar")); // reopen via the floating +
    await fireEvent.press(await screen.findByLabelText("New automation"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/kitchen-lab", params: { new: "1" } });
  });

  test("Ask Quick Chat hands the day over to the chat composer", async () => {
    await openMenu("2026-09-18");
    await fireEvent.press(await screen.findByLabelText("Ask Quick Chat"));

    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/chat",
      params: { prefill: expect.stringMatching(/^Add to .*: $/), contextDay: "2026-09-18" },
    });
  });

  test("the floating + opens the menu for today, without picking a day first", async () => {
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

    await fireEvent.press(await screen.findByLabelText("Add to the calendar"));
    await fireEvent.press(await screen.findByLabelText("Plan a meal"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Soup");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-15", title: "Soup" })));
  });

  test("the fridge picker sits on the calendar like Home and Crew, and follows the shared scope", async () => {
    mockScope = "2";
    await render(<CalendarScreen />);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledWith(expect.objectContaining({ fridgeId: "2" })));
    expect(screen.getByText("This Fridge")).toBeTruthy(); // the picker pill (no fridge names in this mock)
  });

  test("links across to the meal plan", async () => {
    await render(<CalendarScreen />);

    await fireEvent.press(await screen.findByLabelText("Open the meal plan"));

    expect(mockPush).toHaveBeenLastCalledWith("/meal-plan");
  });
});

describe("Calendar deletes", () => {
  const seed = (entries: CalendarEntry[]) =>
    mockGetCalendar.mockResolvedValue({ entries, truncated: false, from: "", to: "" });
  const openDayOf = async (date: string) => {
    await render(<CalendarScreen />);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());
    await fireEvent.press(await screen.findByTestId(`day-${date}`));
  };
  /** Press the button of the confirm alert with this label. */
  const confirm = (spy: jest.SpyInstance, label: string) => {
    const buttons = spy.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === label)!.onPress?.();
  };

  test("an expiring item is removed through the normal flow, with Undo", async () => {
    seed([entry({ kind: "expiry", date: "2026-09-18", title: "Yogurt", refs: { itemId: "42" } })]);
    await openDayOf("2026-09-18");

    await fireEvent.press(await screen.findByLabelText("Remove Yogurt"));

    await waitFor(() => expect(mockRemoveItem).toHaveBeenCalledWith("42"));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2)); // refetched
    expect(mockRefreshScore).toHaveBeenCalled();
    const [message, options] = mockToast.mock.calls.at(-1)!;
    expect(message).toBe("Removed · Yogurt");
    options.onAction();
    await waitFor(() => expect(mockUndoRemoval).toHaveBeenCalledWith("77"));
  });

  test("an automation's log entry is deleted after a confirm", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    seed([entry({ kind: "machine_run", date: "2026-09-19", title: "Morning check", refs: { machineId: "9", runId: "5" } })]);
    await openDayOf("2026-09-19");

    await fireEvent.press(await screen.findByLabelText("Delete log entry Morning check"));
    expect(mockDeleteRun).not.toHaveBeenCalled(); // nothing until confirmed
    confirm(alert, "Delete");

    await waitFor(() => expect(mockDeleteRun).toHaveBeenCalledWith("9", "5"));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2));
    alert.mockRestore();
  });

  test("a day's used-up / thrown-out history is cleared for that day and outcome, in the device timezone", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    seed([
      entry({ kind: "used", date: "2026-09-20", title: "2 items used up", count: 2 }),
      entry({ kind: "wasted", date: "2026-09-20", title: "1 item thrown out", count: 1 }),
    ]);
    await openDayOf("2026-09-20");

    await fireEvent.press(await screen.findByLabelText("Clear 1 item thrown out"));
    expect(alert.mock.calls.at(-1)![1]).toMatch(/doesn't change your Kitchen Score/);
    confirm(alert, "Clear");

    await waitFor(() => expect(mockClearHistory).toHaveBeenCalledWith({ date: "2026-09-20", outcome: "wasted", tz: "Asia/Kuala_Lumpur" }));
    alert.mockRestore();
  });

  test("cancelling a confirm deletes nothing; a failure is reported", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    seed([entry({ kind: "machine_run", date: "2026-09-19", title: "Morning check", refs: { machineId: "9", runId: "5" } })]);
    await openDayOf("2026-09-19");
    await fireEvent.press(await screen.findByLabelText("Delete log entry Morning check"));
    confirm(alert, "Cancel");
    expect(mockDeleteRun).not.toHaveBeenCalled();

    mockDeleteRun.mockRejectedValueOnce(new Error("boom"));
    confirm(alert, "Delete");
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Couldn't delete that", expect.any(String)));
    alert.mockRestore();
  });

  test("items added and scheduled automations are read-only; meals keep their own delete", async () => {
    seed([
      entry({ kind: "added", date: "2026-09-18", title: "3 items added", count: 3 }),
      entry({ kind: "machine_scheduled", date: "2026-09-18", title: "Weekly sweep", refs: { machineId: "9" } }),
    ]);
    await openDayOf("2026-09-18");

    expect(await screen.findByText("3 items added")).toBeTruthy();
    expect(screen.queryByLabelText(/^(Remove|Clear|Delete log entry)/)).toBeNull();
  });
});
