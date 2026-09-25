jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";
import {
  clearFriendSearchHistory,
  getFriendSearchHistory,
  recordFriendSearchSelection,
  removeFriendSearchHistoryEntry,
} from "@/lib/friendSearchHistory";

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;

// A minimal in-memory backing store standing in for the device's real SecureStore, so
// get/setItemAsync behave like the real thing across calls within a test.
function useFakeSecureStore() {
  let value: string | null = null;
  getItemAsync.mockImplementation(() => Promise.resolve(value));
  setItemAsync.mockImplementation((_key: string, v: string) => {
    value = v;
    return Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useFakeSecureStore();
});

describe("getFriendSearchHistory", () => {
  test("returns an empty list when nothing is stored", async () => {
    expect(await getFriendSearchHistory()).toEqual([]);
  });

  test("returns an empty list if the stored value is corrupt", async () => {
    getItemAsync.mockResolvedValueOnce("not json");
    expect(await getFriendSearchHistory()).toEqual([]);
  });

  test("returns an empty list if SecureStore throws", async () => {
    getItemAsync.mockRejectedValueOnce(new Error("keychain unavailable"));
    expect(await getFriendSearchHistory()).toEqual([]);
  });
});

describe("recordFriendSearchSelection", () => {
  test("normalizes to lowercase and trims", async () => {
    expect(await recordFriendSearchSelection("  Keira  ")).toEqual(["keira"]);
  });

  test("is a no-op for an empty/whitespace username", async () => {
    expect(await recordFriendSearchSelection("   ")).toEqual([]);
    expect(await getFriendSearchHistory()).toEqual([]);
  });

  test("most-recent-first, deduplicated case-insensitively", async () => {
    await recordFriendSearchSelection("keira");
    await recordFriendSearchSelection("avocado");
    const result = await recordFriendSearchSelection("KEIRA");
    expect(result).toEqual(["keira", "avocado"]);
  });

  test("caps at 10 entries, dropping the oldest", async () => {
    for (let i = 0; i < 12; i++) {
      await recordFriendSearchSelection(`user${i}`);
    }
    const result = await getFriendSearchHistory();
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("user11");
    expect(result).not.toContain("user0");
    expect(result).not.toContain("user1");
  });
});

describe("removeFriendSearchHistoryEntry", () => {
  test("drops a matching entry case-insensitively, leaving the rest", async () => {
    await recordFriendSearchSelection("keira");
    await recordFriendSearchSelection("avocado");
    const result = await removeFriendSearchHistoryEntry("KEIRA");
    expect(result).toEqual(["avocado"]);
  });

  test("is a no-op when the entry isn't present", async () => {
    await recordFriendSearchSelection("avocado");
    setItemAsync.mockClear();
    const result = await removeFriendSearchHistoryEntry("nobody");
    expect(result).toEqual(["avocado"]);
    expect(setItemAsync).not.toHaveBeenCalled();
  });
});

describe("clearFriendSearchHistory", () => {
  test("empties the history", async () => {
    await recordFriendSearchSelection("keira");
    await clearFriendSearchHistory();
    expect(await getFriendSearchHistory()).toEqual([]);
  });
});
