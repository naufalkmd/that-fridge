import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { CalendarEntry } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
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

const mockGetCalendar = jest.fn();
jest.mock("@/lib/api", () => ({ api: { getCalendar: (...a: unknown[]) => mockGetCalendar(...a) } }));

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
  mockGetCalendar.mockResolvedValue({ entries: [], truncated: false, from: "", to: "" });
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
