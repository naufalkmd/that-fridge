import type { NotificationEvent, NotificationPrefs } from "@thatfridge/core";

jest.mock("@/lib/api", () => ({
  api: {
    listNotificationEvents: jest.fn(),
    getNotificationPrefs: jest.fn(),
    deleteNotificationEvent: jest.fn(),
    clearNotificationEvents: jest.fn(),
    markNotification: jest.fn(),
    updateNotificationPrefs: jest.fn(),
  },
}));
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ status: "signedIn" }) }));
jest.mock("@/lib/push", () => ({ registerForPush: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { api } from "@/lib/api";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";

const listNotificationEvents = api.listNotificationEvents as jest.Mock;
const getNotificationPrefs = api.getNotificationPrefs as jest.Mock;
const deleteNotificationEvent = api.deleteNotificationEvent as jest.Mock;
const clearNotificationEvents = api.clearNotificationEvents as jest.Mock;

const PREFS: NotificationPrefs = {
  expiryAlerts: true,
  lowStock: true,
  recipeTips: true,
  weeklyDigest: true,
  crewActionsEnabled: true,
  social: true,
};

function event(id: string, overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id,
    fridgeId: "fridge-1",
    fridgeName: "Home Fridge",
    itemId: null,
    kind: "expiring",
    message: `Event ${id}`,
    createdAt: Number(id),
    done: false,
    ...overrides,
  };
}

async function setup(events: NotificationEvent[]) {
  listNotificationEvents.mockResolvedValue(events);
  getNotificationPrefs.mockResolvedValue(PREFS);
  const { result } = await renderHook(() => useNotifications(), {
    wrapper: NotificationsProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  deleteNotificationEvent.mockResolvedValue(undefined);
  clearNotificationEvents.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("requestRemove / pendingRemoval / undoRemove", () => {
  test("hides the event immediately without deleting yet", async () => {
    const result = await setup([event("1"), event("2")]);

    await act(async () => {
      result.current.requestRemove("1");
    });

    expect(result.current.events.map((e) => e.id)).toEqual(["2"]);
    expect(result.current.pendingRemoval?.id).toBe("1");
    expect(deleteNotificationEvent).not.toHaveBeenCalled();
  });

  test("commits the delete once the undo window elapses", async () => {
    const result = await setup([event("1")]);
    jest.useFakeTimers();

    await act(async () => {
      result.current.requestRemove("1");
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(deleteNotificationEvent).toHaveBeenCalledWith("1");
    expect(result.current.pendingRemoval).toBeNull();
  });

  test("undoRemove restores the event and skips the delete entirely", async () => {
    const result = await setup([event("1"), event("2")]);
    jest.useFakeTimers();

    await act(async () => {
      result.current.requestRemove("1");
    });
    await act(async () => {
      result.current.undoRemove();
    });
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    expect(result.current.events.map((e) => e.id).sort()).toEqual(["1", "2"]);
    expect(result.current.pendingRemoval).toBeNull();
    expect(deleteNotificationEvent).not.toHaveBeenCalled();
  });

  test("a second swipe commits the first pending removal immediately", async () => {
    const result = await setup([event("1"), event("2"), event("3")]);
    jest.useFakeTimers();

    await act(async () => {
      result.current.requestRemove("1");
    });
    await act(async () => {
      result.current.requestRemove("2");
    });

    // "1" was superseded and committed right away; "2" is now the undoable one.
    expect(deleteNotificationEvent).toHaveBeenCalledTimes(1);
    expect(deleteNotificationEvent).toHaveBeenCalledWith("1");
    expect(result.current.pendingRemoval?.id).toBe("2");
    expect(result.current.events.map((e) => e.id)).toEqual(["3"]);

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(deleteNotificationEvent).toHaveBeenCalledWith("2");
    expect(deleteNotificationEvent).toHaveBeenCalledTimes(2);
  });

  test("undoRemove is a no-op once nothing is pending", async () => {
    const result = await setup([event("1")]);

    await act(async () => {
      result.current.undoRemove();
    });

    expect(result.current.events.map((e) => e.id)).toEqual(["1"]);
  });
});

describe("clearAll", () => {
  test("commits any pending removal immediately, then clears everything", async () => {
    const result = await setup([event("1"), event("2")]);

    await act(async () => {
      result.current.requestRemove("1");
    });
    await act(async () => {
      await result.current.clearAll();
    });

    expect(deleteNotificationEvent).toHaveBeenCalledWith("1");
    expect(clearNotificationEvents).toHaveBeenCalledTimes(1);
    expect(result.current.events).toEqual([]);
    expect(result.current.pendingRemoval).toBeNull();
  });

  test("restores the list if the server call fails", async () => {
    const result = await setup([event("1"), event("2")]);
    clearNotificationEvents.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      await result.current.clearAll();
    });

    expect(result.current.events.map((e) => e.id).sort()).toEqual(["1", "2"]);
  });
});
