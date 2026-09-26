import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
}));

import { useOrganizerAuto } from "@/lib/organizerPref";

beforeEach(() => mockStore.clear());

describe("useOrganizerAuto", () => {
  test("is off by default", async () => {
    const { result } = await renderHook(() => useOrganizerAuto());
    await act(async () => {});

    expect(result.current.auto).toBe(false);
  });

  test("switching it on is remembered on this device", async () => {
    const first = await renderHook(() => useOrganizerAuto());
    await act(async () => first.result.current.setAuto(true));
    expect(first.result.current.auto).toBe(true);
    await first.unmount();

    const second = await renderHook(() => useOrganizerAuto());
    await act(async () => {});
    await waitFor(() => expect(second.result.current.auto).toBe(true));
  });

  test("and switching it off is remembered too", async () => {
    mockStore.set("thatfridge_organizer_auto_v1", "1");
    const hook = await renderHook(() => useOrganizerAuto());
    await act(async () => {});
    await waitFor(() => expect(hook.result.current.auto).toBe(true));

    await act(async () => hook.result.current.setAuto(false));

    expect(mockStore.get("thatfridge_organizer_auto_v1")).toBe("0");
  });
});
