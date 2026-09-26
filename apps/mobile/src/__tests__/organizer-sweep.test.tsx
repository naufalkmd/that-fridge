import { Alert } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ApiError } from "@thatfridge/core";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
const mockPatch = jest.fn();
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ patchItem: (...a: unknown[]) => mockPatch(...a) }) }));
const mockRefreshScore = jest.fn();
jest.mock("@/lib/kitchenScore", () => ({ useKitchenScore: () => ({ refresh: mockRefreshScore }) }));
let mockCredits: number | null = 40;
const mockRefreshCredits = jest.fn();
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: mockCredits, refresh: mockRefreshCredits }) }));
const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
const mockSuggest = jest.fn();
const mockTally = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { suggestItemDetails: (...a: unknown[]) => mockSuggest(...a), incrementOrganizerTally: (...a: unknown[]) => mockTally(...a) },
}));

import { useOrganizerSweep } from "@/lib/useOrganizerSweep";

type Item = { id: string; name: string; icon: string; location: string };
const items = (n: number): never[] => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `Item ${i + 1}`, icon: "x", location: "fridge" })) as never[];
const confirm = (spy: jest.SpyInstance, label: string) => {
  const buttons = spy.mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)!.onPress?.();
};
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockCredits = 40;
  mockSuggest.mockResolvedValue({ location: "fridge" });
  mockTally.mockResolvedValue(undefined);
  mockRefreshScore.mockResolvedValue(undefined);
  mockRefreshCredits.mockResolvedValue(undefined);
});
afterEach(() => alert.mockRestore());

describe("useOrganizerSweep", () => {
  test("says what it costs before it does anything, and cancelling spends nothing", async () => {
    const { result } = await renderHook(() => useOrganizerSweep());

    await act(async () => { result.current.start(items(3)); });

    expect(alert.mock.calls[0][0]).toBe("Check 3 items?");
    expect(alert.mock.calls[0][1]).toMatch(/uses 3 credits \(you have 40\)/);
    confirm(alert, "Cancel");
    expect(mockSuggest).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  test("a big fridge is checked in a batch of 15, and checking again carries on with the rest", async () => {
    const { result } = await renderHook(() => useOrganizerSweep());
    const all = items(20);

    await act(async () => { result.current.start(all); });
    expect(alert.mock.calls[0][0]).toBe("Check 15 items?");
    expect(alert.mock.calls[0][1]).toMatch(/Your fridge has 20 items/);
    await act(async () => confirm(alert, "Check"));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(mockSuggest).toHaveBeenCalledTimes(15);

    await act(async () => { result.current.start(all); });
    expect(alert.mock.calls.at(-1)![0]).toBe("Check 5 items?"); // the ones not yet checked
  });

  test("collects suggested moves, counts only checked items in the tidiness tally, and refreshes credits", async () => {
    mockSuggest.mockImplementation(async (name: string) => ({ location: name === "Item 2" ? "freezer" : "fridge" }));
    const { result } = await renderHook(() => useOrganizerSweep());

    await act(async () => { result.current.start(items(3)); });
    await act(async () => confirm(alert, "Check"));
    await waitFor(() => expect(result.current.status).toBe("done"));

    expect(result.current.moves.map((m) => [m.id, m.to])).toEqual([["2", "freezer"]]);
    await waitFor(() => expect(mockTally).toHaveBeenCalledWith({ checked: 3, correct: 2 }));
    expect(mockRefreshCredits).toHaveBeenCalled();

    await act(async () => { await result.current.apply(result.current.moves[0]); });
    expect(mockPatch).toHaveBeenCalledWith("2", { location: "freezer" });
    expect(result.current.moves).toHaveLength(0);
  });

  test("running out of credits mid-sweep stops, counts only what was checked, and offers to top up", async () => {
    let calls = 0;
    mockSuggest.mockImplementation(async () => {
      calls += 1;
      if (calls > 1) throw new ApiError(402, "insufficient_credits");
      return { location: "fridge" };
    });
    const { result } = await renderHook(() => useOrganizerSweep());

    await act(async () => { result.current.start(items(3)); });
    await act(async () => confirm(alert, "Check"));
    await waitFor(() => expect(result.current.status).toBe("done"));

    expect(mockToast).toHaveBeenCalledWith("Out of credits after 1 check", expect.objectContaining({ actionLabel: "Get credits" }));
    expect(mockTally).toHaveBeenCalledWith({ checked: 1, correct: 1 }); // not 3
    mockToast.mock.calls.at(-1)![1].onAction();
    expect(mockPush).toHaveBeenLastCalledWith("/credits");
  });

  test("when nothing could be checked nothing is counted", async () => {
    mockSuggest.mockRejectedValue(new Error("boom"));
    const { result } = await renderHook(() => useOrganizerSweep());

    await act(async () => { result.current.start(items(3)); });
    await act(async () => confirm(alert, "Check"));
    await waitFor(() => expect(result.current.status).toBe("done"));

    expect(result.current.checked).toBe(0);
    expect(mockTally).not.toHaveBeenCalled();
  });

  test("with no credits left it offers to get some instead of starting", async () => {
    mockCredits = 0;
    const { result } = await renderHook(() => useOrganizerSweep());

    await act(async () => { result.current.start(items(3)); });

    expect(alert.mock.calls[0][0]).toBe("Not enough credits");
    confirm(alert, "Get credits");
    expect(mockPush).toHaveBeenLastCalledWith("/credits");
    expect(mockSuggest).not.toHaveBeenCalled();
  });
});
