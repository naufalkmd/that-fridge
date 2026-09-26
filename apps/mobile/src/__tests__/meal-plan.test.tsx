import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError, type CalendarEntry } from "@thatfridge/core";

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
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
let mockScope = "all";
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: mockScope }) }));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));
jest.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { preferences: { meal_slots: ["Breakfast", "Dinner"] } }, updateMealSlots: jest.fn() }),
}));
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({ fridges: [{ id: "2", role: "owner" }], items: [], refresh: jest.fn() }),
}));
jest.mock("@/lib/recipes", () => ({
  useRecipes: () => ({ recipes: [{ id: "9", name: "Pad Thai", calories: 640 }] }),
}));
jest.mock("@/lib/shopping", () => ({ useShopping: () => ({ items: [], add: jest.fn() }) }));
const mockSync = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/lib/localNotifications", () => ({
  syncMealReminder: (...a: unknown[]) => mockSync(...a),
  cancelMealReminder: (...a: unknown[]) => mockCancel(...a),
}));

const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
let mockCredits: number | null = 20;
const mockSetCredits = jest.fn();
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: mockCredits, setBalance: mockSetCredits }) }));
const mockAutofill = jest.fn();

const mockGetCalendar = jest.fn();
const mockCreateMeal = jest.fn();
const mockUpdateMeal = jest.fn();
const mockDeleteMeal = jest.fn();
const mockEstimate = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    autofillMealPlan: (...a: unknown[]) => mockAutofill(...a),
    getCalendar: (...a: unknown[]) => mockGetCalendar(...a),
    createMealEntry: (...a: unknown[]) => mockCreateMeal(...a),
    updateMealEntry: (...a: unknown[]) => mockUpdateMeal(...a),
    deleteMealEntry: (...a: unknown[]) => mockDeleteMeal(...a),
    estimateMealCalories: (...a: unknown[]) => mockEstimate(...a),
    markRecipeMade: jest.fn(),
  },
}));

import MealPlanScreen from "@/app/meal-plan";

// Today is Tuesday 15 Sep 2026, so the (Sunday-first) week is 13-19 Sep.
const meal = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "meal:7", kind: "meal", date: "2026-09-17", time: null, title: "Tacos", meta: "Dinner", tone: null,
  slot: "Dinner", status: "planned", note: null, calories: 400, caloriesSource: "estimate", by: null,
  refs: { mealEntryId: "7", fridgeId: "2" }, ...over,
});
const recipe = { id: "9", name: "Pad Thai", minutes: 20, calories: 640, icon: null, iconUrl: null, ingredients: [{ icon: "rice", name: "Rice" }], steps: ["Cook"] };

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
  mockParams = {};
  mockCredits = 20;
  mockGetCalendar.mockResolvedValue({ entries: [], truncated: false, from: "", to: "" });
  mockCreateMeal.mockImplementation(async (input) => ({ id: "50", by: null, isMine: true, cookedAt: null, recipeId: input.recipe_id ?? null, fridgeId: input.fridge_id ?? null, note: null, ...input }));
  mockUpdateMeal.mockImplementation(async (id, input) => ({ id, slot: "Dinner", title: "Tacos", date: "2026-09-17", time: null, status: "planned", ...input }));
  mockDeleteMeal.mockResolvedValue(undefined);
  mockEstimate.mockResolvedValue({ calories: null });
});

const loaded = () => waitFor(() => expect(mockGetCalendar).toHaveBeenCalled());

describe("Meal plan screen", () => {
  test("shows this week day by day with today highlighted and asks the server for exactly that week", async () => {
    await render(<MealPlanScreen />);
    await loaded();

    expect(await screen.findByText("This week")).toBeTruthy();
    for (const day of ["13", "14", "15", "16", "17", "18", "19"]) expect(screen.getByTestId(`plan-day-2026-09-${day}`)).toBeTruthy();
    expect(screen.getByText(/^Today · 15$/)).toBeTruthy();
    expect(mockGetCalendar).toHaveBeenCalledWith({ from: "2026-09-13", to: "2026-09-19", fridgeId: undefined, tz: "Asia/Kuala_Lumpur" });
    expect(screen.getAllByText("Nothing planned")).toHaveLength(7);
  });

  test("a single-fridge scope is sent to the server", async () => {
    mockScope = "2";
    await render(<MealPlanScreen />);

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledWith(expect.objectContaining({ fridgeId: "2" })));
  });

  test("planned meals appear on their day, with calories, a day total and a week total; non-meals are ignored", async () => {
    mockGetCalendar.mockResolvedValue({
      entries: [
        meal(),
        meal({ id: "meal:8", title: "Oats", slot: "Breakfast", calories: 250, refs: { mealEntryId: "8" } }),
        { id: "expiry:1", kind: "expiry", date: "2026-09-17", time: null, title: "Yogurt", meta: null, tone: null, refs: {} } as CalendarEntry,
      ],
      truncated: false, from: "", to: "",
    });
    await render(<MealPlanScreen />);

    expect(await screen.findByText("Tacos")).toBeTruthy();
    expect(screen.getByText("Oats")).toBeTruthy();
    expect(screen.queryByText("Yogurt")).toBeNull();
    expect(screen.getByText("Dinner · ≈ 400 kcal")).toBeTruthy();
    expect(screen.getAllByText("≈ 650 kcal").length).toBeGreaterThanOrEqual(1); // the day's total
    expect(screen.getAllByText(/≈ 650 kcal planned/).length).toBe(1); // the week's total in the header
    expect(screen.getAllByText("Nothing planned")).toHaveLength(6);
  });

  test("+ on a day opens the meal form on that day and saves it there", async () => {
    await render(<MealPlanScreen />);
    await loaded();

    await fireEvent.press(await screen.findByLabelText("Add a meal on Sat 19"));
    expect(screen.getByTestId("day-chip-2026-09-19").props.accessibilityState.selected).toBe(true);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Soup");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-19", title: "Soup", slot: "Breakfast", fridge_id: "2" })));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2)); // refreshed
  });

  test("the Day chips move a meal to another day of the week", async () => {
    await render(<MealPlanScreen />);
    await loaded();
    await fireEvent.press(await screen.findByLabelText("Add a meal on Tue 15"));

    await fireEvent.press(screen.getByTestId("day-chip-2026-09-18"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Chicken rice"), "Curry");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockCreateMeal).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-18", title: "Curry" })));
  });

  test("tapping a meal edits it (without moving fridges); Delete removes it and its reminder", async () => {
    mockGetCalendar.mockResolvedValue({ entries: [meal({ time: "18:30" })], truncated: false, from: "", to: "" });
    await render(<MealPlanScreen />);

    await fireEvent.press(await screen.findByLabelText("Edit Tacos"));
    expect(screen.getByDisplayValue("Tacos")).toBeTruthy();
    expect(screen.getByDisplayValue("18:30")).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue("Tacos"), "Burritos");
    await fireEvent.press(screen.getByText("Save"));

    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledTimes(1));
    const [id, body] = mockUpdateMeal.mock.calls[0];
    expect(id).toBe("7");
    expect(body).toMatchObject({ title: "Burritos", date: "2026-09-17" });
    expect(body).not.toHaveProperty("fridge_id");

    await fireEvent.press(await screen.findByLabelText("Edit Tacos"));
    await fireEvent.press(screen.getByText("Delete meal"));
    await waitFor(() => expect(mockDeleteMeal).toHaveBeenCalledWith("7"));
    expect(mockCancel).toHaveBeenCalledWith("7");
  });

  test("the tick marks a planned meal cooked", async () => {
    mockGetCalendar.mockResolvedValue({ entries: [meal()], truncated: false, from: "", to: "" });
    await render(<MealPlanScreen />);

    await fireEvent.press(await screen.findByLabelText("Mark Tacos cooked"));

    await waitFor(() => expect(mockUpdateMeal).toHaveBeenCalledWith("7", { status: "cooked" }));
  });

  test("week arrows load the next and previous weeks; a link returns to this week", async () => {
    await render(<MealPlanScreen />);
    await loaded();

    await fireEvent.press(screen.getByLabelText("Next week"));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-09-20", to: "2026-09-26" })));
    expect(screen.queryByText("This week")).toBeNull();

    await fireEvent.press(screen.getByText("Back to this week"));
    expect(await screen.findByText("This week")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Previous week"));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-09-06", to: "2026-09-12" })));
  });

  test("links across to the calendar", async () => {
    await render(<MealPlanScreen />);

    await fireEvent.press(await screen.findByLabelText("Open the calendar"));

    expect(mockPush).toHaveBeenLastCalledWith("/calendar");
  });

  test("a failed load shows a retry", async () => {
    mockGetCalendar.mockRejectedValueOnce(new Error("boom"));
    await render(<MealPlanScreen />);

    await fireEvent.press(await screen.findByText(/Tap to retry/));

    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2));
  });
});

describe("Meal plan: from a recipe", () => {
  test("opened from a recipe's Add to plan, the meal form is already open with it", async () => {
    mockParams = { recipeId: "9", recipeName: "Pad Thai" };
    await render(<MealPlanScreen />);

    expect(await screen.findByDisplayValue("Pad Thai")).toBeTruthy();
    expect(screen.getByText("Plan a meal")).toBeTruthy();
  });
});

describe("Meal plan: Ask Chef", () => {
  const confirm = (spy: jest.SpyInstance, label: string) => {
    const buttons = spy.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === label)!.onPress?.();
  };
  const created = [
    { id: "61", date: "2026-09-16", slot: "Dinner", title: "Chicken rice" },
    { id: "62", date: "2026-09-17", slot: "Dinner", title: "Stir fry" },
  ];
  const openSheet = async () => {
    await render(<MealPlanScreen />);
    await loaded();
    await fireEvent.press(await screen.findByLabelText("Ask Chef to plan"));
  };

  test("the card opens a writable box that says what it costs on the button", async () => {
    await openSheet();

    expect(screen.getByPlaceholderText(/vegetarian dinners/)).toBeTruthy();
    expect(screen.getByText("Ask Chef · 3 credits")).toBeTruthy();
    expect(mockAutofill).not.toHaveBeenCalled(); // nothing until the button is pressed
  });

  test("what was typed goes to Chef with the rest of the week, and the usage is reported with Undo", async () => {
    mockAutofill.mockResolvedValue({ created, creditsUsed: 3, balance: 17, message: null });
    mockScope = "2";
    await openSheet();

    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "vegetarian, high protein");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() =>
      expect(mockAutofill).toHaveBeenCalledWith({ from: "2026-09-15", to: "2026-09-19", fridge_id: "2", prompt: "vegetarian, high protein" }),
    );
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Chef planned 2 meals · used 3 credits · 17 left", expect.objectContaining({ actionLabel: "Undo" })));
    expect(mockSetCredits).toHaveBeenCalledWith(17);
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2)); // the week is reloaded

    mockToast.mock.calls.at(-1)![1].onAction();
    await waitFor(() => expect(mockDeleteMeal).toHaveBeenCalledTimes(2));
  });

  test("a tap-to-fill example fills the box; leaving it blank still works (Chef chooses)", async () => {
    mockAutofill.mockResolvedValue({ created, creditsUsed: 3, balance: 17, message: null });
    await openSheet();

    await fireEvent.press(screen.getByLabelText("Use example: Use up what's expiring"));
    expect(screen.getByDisplayValue("Use up what's expiring")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(mockAutofill).toHaveBeenCalledWith(expect.objectContaining({ prompt: undefined })));
  });

  test("when nothing could be planned it says why and keeps the sheet open", async () => {
    mockAutofill.mockResolvedValue({ created: [], creditsUsed: 0, balance: 20, message: "Couldn't come up with a plan this time - nothing was charged." });
    await openSheet();

    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't come up with a plan this time - nothing was charged."));
    expect(screen.getByLabelText("Send to Chef")).toBeTruthy();
  });

  test("with too few credits it offers to get more instead of opening", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockCredits = 2;
    await render(<MealPlanScreen />);
    await loaded();

    await fireEvent.press(await screen.findByLabelText("Ask Chef to plan"));

    expect(alert.mock.calls[0][0]).toBe("Not enough credits");
    confirm(alert, "Get credits");
    expect(mockPush).toHaveBeenLastCalledWith("/credits");
    expect(screen.queryByLabelText("Send to Chef")).toBeNull();
    alert.mockRestore();
  });

  test("a 402 from the server routes to Credits; other failures are shown", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockAutofill.mockRejectedValueOnce(new ApiError(402, "no"));
    await openSheet();
    await fireEvent.press(screen.getByLabelText("Send to Chef"));
    await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith("/credits"));

    mockAutofill.mockRejectedValueOnce(new Error("boom"));
    await fireEvent.press(await screen.findByLabelText("Ask Chef to plan"));
    await fireEvent.press(screen.getByLabelText("Send to Chef"));
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith("Chef couldn't plan that", expect.any(String)));
    alert.mockRestore();
  });

  test("a week that has already passed has nothing to plan, so the card is hidden", async () => {
    await render(<MealPlanScreen />);
    await loaded();
    await fireEvent.press(screen.getByLabelText("Previous week"));
    await waitFor(() => expect(mockGetCalendar).toHaveBeenCalledTimes(2));

    expect(screen.queryByLabelText("Ask Chef to plan")).toBeNull();
  });
});
