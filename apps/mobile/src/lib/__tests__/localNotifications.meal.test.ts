const mockSchedule = jest.fn();
const mockCancel = jest.fn();
const mockGetAll = jest.fn();
const mockGetPerms = jest.fn();
const mockRequestPerms = jest.fn();
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: (...a: unknown[]) => mockGetAll(...a),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...a),
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  getPermissionsAsync: (...a: unknown[]) => mockGetPerms(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPerms(...a),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { cancelMealReminder, syncMealReminder } from "@/lib/localNotifications";

const entry = (over = {}) => ({
  id: "5", title: "Tacos", slot: "Dinner", date: "2026-10-02", time: "18:30", status: "planned" as const, ...over,
});

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 8, 30, 12),
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockGetPerms.mockResolvedValue({ status: "granted" });
});

describe("syncMealReminder", () => {
  test("schedules a local notification at the entry's date and time", async () => {
    await syncMealReminder(entry());

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const arg = mockSchedule.mock.calls[0][0];
    expect(arg.content.title).toBe("Tacos");
    expect(arg.content.body).toBe("Dinner · 18:30");
    expect(arg.content.data).toMatchObject({ kind: "meal", entryId: "5" });
    expect(arg.trigger.date).toEqual(new Date(2026, 9, 2, 18, 30));
  });

  test("replaces an existing reminder for the same entry, leaving other notifications alone", async () => {
    mockGetAll.mockResolvedValue([
      { identifier: "old", content: { data: { kind: "meal", entryId: "5" } } },
      { identifier: "other-meal", content: { data: { kind: "meal", entryId: "6" } } },
      { identifier: "expiry", content: { data: { kind: "expiry" } } },
    ]);

    await syncMealReminder(entry());

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith("old");
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["no time", { time: null }],
    ["already cooked", { status: "cooked" as const }],
    ["skipped", { status: "skipped" as const }],
    ["a time in the past", { date: "2026-09-29" }],
    ["under a minute away", { date: "2026-09-30", time: "12:00" }],
  ])("schedules nothing for %s (but still clears the old one)", async (_name, over) => {
    mockGetAll.mockResolvedValue([{ identifier: "old", content: { data: { kind: "meal", entryId: "5" } } }]);

    await syncMealReminder(entry(over));

    expect(mockCancel).toHaveBeenCalledWith("old");
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  test("asks for permission when needed and stays quiet if it is refused", async () => {
    mockGetPerms.mockResolvedValue({ status: "undetermined" });
    mockRequestPerms.mockResolvedValue({ status: "denied" });

    await syncMealReminder(entry());

    expect(mockRequestPerms).toHaveBeenCalledTimes(1);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  test("never throws when the notification module fails", async () => {
    mockGetAll.mockRejectedValue(new Error("no native module"));

    await expect(syncMealReminder(entry())).resolves.toBeUndefined();
    await expect(cancelMealReminder("5")).resolves.toBeUndefined();
  });
});

describe("cancelMealReminder", () => {
  test("cancels only that entry's meal reminders", async () => {
    mockGetAll.mockResolvedValue([
      { identifier: "a", content: { data: { kind: "meal", entryId: "5" } } },
      { identifier: "b", content: { data: { kind: "meal", entryId: "6" } } },
    ]);

    await cancelMealReminder("5");

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith("a");
  });
});
