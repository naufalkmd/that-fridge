import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError, type ExploreItem } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/components/bottom-sheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));
let mockScope = "all";
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: mockScope }) }));
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ fridges: [{ id: "2", role: "owner" }] }) }));
const mockRefreshRecipes = jest.fn();
jest.mock("@/lib/recipes", () => ({ useRecipes: () => ({ refresh: mockRefreshRecipes }) }));
const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
const mockGetExplore = jest.fn();
const mockUse = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { getExplore: (...a: unknown[]) => mockGetExplore(...a), useExploreItem: (...a: unknown[]) => mockUse(...a) },
}));

import Explore from "@/app/explore";

const item = (over: Partial<ExploreItem>): ExploreItem => ({
  id: "1", type: "recipe", title: "Chicken rice", blurb: "30 min · Dinner", tags: ["chicken"], featured: false,
  imageUrl: null, recipe: { minutes: 30, calories: 640, mealType: "dinner", icon: null, iconUrl: null, ingredients: 2 }, payload: null, ...over,
});
const machine = item({
  id: "2", type: "machine", title: "Weekly expiry check", blurb: "Every Monday", recipe: null,
  payload: { name: "Weekly expiry check", trigger: { type: "schedule", config: { frequency: "weekly", time: "08:00", weekday: 1 } }, steps: [{ tool: "notify_user", args: {} }] } as never,
});
const plan = item({
  id: "3", type: "meal_plan", title: "Simple week", blurb: "easy", recipe: null,
  payload: { days: [{ day: 0, slot: "Dinner", title: "Chicken rice" }, { day: 1, slot: "Dinner", title: "Fried rice" }] },
});
const icon = item({ id: "4", type: "icon", title: "Tomato", blurb: null, recipe: null, imageUrl: "https://x/tomato.png" });

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 8, 15, 12),
    doNotFake: ["nextTick", "queueMicrotask", "setImmediate", "clearImmediate", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = "all";
  mockGetExplore.mockResolvedValue({ featured: [machine], items: [item({}), machine, plan, icon] });
});

const settle = () => act(async () => { jest.advanceTimersByTime(400); });

describe("Explore screen", () => {
  test("browsing shows featured, then a section per library", async () => {
    await render(<Explore />);
    await settle();

    expect(mockGetExplore).toHaveBeenCalledWith({ q: undefined, type: undefined });
    expect(await screen.findByText("Featured")).toBeTruthy();
    expect(screen.getByLabelText("Featured Machine: Weekly expiry check")).toBeTruthy();
    for (const label of ["Recipes", "Machines", "Meal plans", "Food icons"]) expect(screen.getAllByText(label)).toHaveLength(2); // the chip and the section heading
    expect(screen.getByLabelText("Recipe: Chicken rice")).toBeTruthy();
    expect(screen.getByLabelText("Food icon: Tomato")).toBeTruthy();
  });

  test("typing searches after a short pause, with no featured block", async () => {
    await render(<Explore />);
    await settle();
    mockGetExplore.mockResolvedValue({ featured: [], items: [item({})] });

    await fireEvent.changeText(screen.getByLabelText("Search Explore"), "chicken");
    expect(mockGetExplore).toHaveBeenCalledTimes(1); // not yet: waiting for the pause
    await settle();

    expect(mockGetExplore).toHaveBeenLastCalledWith({ q: "chicken", type: undefined });
    expect(await screen.findByText("1 result")).toBeTruthy();
    expect(screen.queryByText("Featured")).toBeNull();
  });

  test("no matches says so", async () => {
    await render(<Explore />);
    await settle();
    mockGetExplore.mockResolvedValue({ featured: [], items: [] });

    await fireEvent.changeText(screen.getByLabelText("Search Explore"), "zzz");
    await settle();

    expect(await screen.findByText(/Nothing found for "zzz"/)).toBeTruthy();
  });

  test("a library chip narrows to that type", async () => {
    await render(<Explore />);
    await settle();

    await fireEvent.press(screen.getAllByText("Meal plans")[0]); // the chip
    await settle();

    expect(mockGetExplore).toHaveBeenLastCalledWith({ q: undefined, type: "meal_plan" });
  });

  test("a recipe is copied into the book, the recipe list refreshes, and the toast offers to open it", async () => {
    mockUse.mockResolvedValue({ type: "recipe", recipe: { id: "77", name: "Chicken rice" } });
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByLabelText("Recipe: Chicken rice"));
    await fireEvent.press(await screen.findByText("Add to my recipes"));

    await waitFor(() => expect(mockUse).toHaveBeenCalledWith("1", undefined));
    await waitFor(() => expect(mockRefreshRecipes).toHaveBeenCalled());
    const [message, options] = mockToast.mock.calls.at(-1)!;
    expect(message).toBe('Added "Chicken rice" to your recipes');
    options.onAction();
    expect(mockPush).toHaveBeenLastCalledWith("/recipe/77");
  });

  test("a Machine opens Kitchen Lab with its draft and the device timezone", async () => {
    mockUse.mockResolvedValue({ type: "machine", draft: (machine.payload as object) });
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByLabelText("Machine: Weekly expiry check"));
    expect(screen.getByText(/Nothing runs until you turn it on/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Use this Machine"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const { pathname, params } = mockPush.mock.calls.at(-1)![0];
    expect(pathname).toBe("/kitchen-lab");
    expect(JSON.parse(params.draft).trigger.config.timezone).toBe("Asia/Kuala_Lumpur");
  });

  test("a meal plan asks when to start, then adds it on the user's own fridge and reports what was skipped", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUse.mockResolvedValue({ type: "meal_plan", created: [{ id: "1" }, { id: "2" }], skipped: 1 });
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByLabelText("Meal plan: Simple week"));
    expect(screen.getByText("Day 1 · Dinner · Chicken rice")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add to my plan"));
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Start next Monday")!.onPress!();

    await waitFor(() => expect(mockUse).toHaveBeenCalledWith("3", { start: "2026-09-21", fridge_id: "2" }));
    await waitFor(() => expect(mockToast.mock.calls.at(-1)![0]).toBe("Added 2 meals to your plan · 1 slot already taken"));
    alert.mockRestore();
  });

  test("an icon shows its picture and points at the icon picker instead of offering to copy", async () => {
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByLabelText("Food icon: Tomato"));

    expect(screen.getByText(/icon picker/)).toBeTruthy();
    expect(screen.queryByText("Add to my recipes")).toBeNull();
  });

  test("something removed while looking at it is dropped with a message", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUse.mockRejectedValue(new ApiError(404, "gone"));
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByLabelText("Recipe: Chicken rice"));
    await fireEvent.press(await screen.findByText("Add to my recipes"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("No longer available", expect.any(String)));
    alert.mockRestore();
  });

  test("a failed load offers a retry", async () => {
    mockGetExplore.mockRejectedValueOnce(new Error("boom"));
    await render(<Explore />);
    await settle();

    await fireEvent.press(await screen.findByText(/Tap to retry/));
    await settle();

    expect(mockGetExplore).toHaveBeenCalledTimes(2);
  });
});
