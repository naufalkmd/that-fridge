import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme", () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => "#888888" }),
  }),
}));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/lib/social", () => ({
  useSocial: () => ({ myInvites: [], acceptInvite: jest.fn(), declineInvite: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/lib/recipes", () => ({ useRecipes: () => ({ setFavorite: jest.fn() }) }));

const mockSearchUsers = jest.fn();
const mockGetFriendProfile = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    searchUsers: (...a: unknown[]) => mockSearchUsers(...a),
    getFriendProfile: (...a: unknown[]) => mockGetFriendProfile(...a),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    requestToJoinFridge: jest.fn(),
  },
}));

const mockHistory = {
  get: jest.fn(),
  record: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
};
jest.mock("@/lib/friendSearchHistory", () => ({
  getFriendSearchHistory: (...a: unknown[]) => mockHistory.get(...a),
  recordFriendSearchSelection: (...a: unknown[]) => mockHistory.record(...a),
  removeFriendSearchHistoryEntry: (...a: unknown[]) => mockHistory.remove(...a),
  clearFriendSearchHistory: (...a: unknown[]) => mockHistory.clear(...a),
}));

import FindFriend from "@/app/find-friend";

const profile = { id: "2", name: "Sam Baker", username: "sam", fridges: [], recipes: [], blockedByMe: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.get.mockResolvedValue([]);
  mockHistory.record.mockImplementation(async (u: string) => [u]);
  mockHistory.remove.mockResolvedValue([]);
  mockHistory.clear.mockResolvedValue(undefined);
  mockSearchUsers.mockResolvedValue([]);
});

describe("FindFriend screen", () => {
  test("shows recent searches when the box is empty and opens one", async () => {
    mockHistory.get.mockResolvedValue(["sam", "kim"]);
    mockGetFriendProfile.mockResolvedValue(profile);

    await render(<FindFriend />);

    await waitFor(() => expect(screen.getByText("@sam")).toBeTruthy());
    expect(screen.getByText("@kim")).toBeTruthy();

    await fireEvent.press(screen.getByText("@sam"));

    await waitFor(() => expect(screen.getByText("Sam Baker")).toBeTruthy());
    expect(mockGetFriendProfile).toHaveBeenCalledWith("sam");
    expect(mockHistory.record).toHaveBeenCalledWith("sam");
  });

  test("Clear empties the recent searches", async () => {
    mockHistory.get.mockResolvedValue(["sam"]);

    await render(<FindFriend />);
    await waitFor(() => expect(screen.getByText("@sam")).toBeTruthy());

    await fireEvent.press(screen.getByText("Clear"));

    await waitFor(() => expect(mockHistory.clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("@sam")).toBeNull());
  });

  test("typing two or more characters searches after the debounce, and a result opens the profile", async () => {
    jest.useFakeTimers();
    try {
      mockSearchUsers.mockResolvedValue([{ id: "2", name: "Sam Baker", username: "sam" }]);
      mockGetFriendProfile.mockResolvedValue(profile);
      await render(<FindFriend />);

      await fireEvent.changeText(screen.getByPlaceholderText("Search by username…"), "s");
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(mockSearchUsers).not.toHaveBeenCalled(); // one character: no search

      await fireEvent.changeText(screen.getByPlaceholderText("Search by username…"), "sa");
      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      expect(mockSearchUsers).toHaveBeenCalledWith("sa");
      await waitFor(() => expect(screen.getByText("Sam Baker")).toBeTruthy());
    } finally {
      jest.useRealTimers();
    }
  });

  test("a profile that fails to load alerts and drops the stale recent-search entry", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockHistory.get.mockResolvedValue(["ghost"]);
    mockGetFriendProfile.mockRejectedValue(new Error("nope"));

    await render(<FindFriend />);
    await waitFor(() => expect(screen.getByText("@ghost")).toBeTruthy());
    await fireEvent.press(screen.getByText("@ghost"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Error", expect.any(String)));
    expect(mockHistory.remove).toHaveBeenCalledWith("ghost");
    alert.mockRestore();
  });

  test("shows an empty state when nobody matches", async () => {
    jest.useFakeTimers();
    try {
      mockSearchUsers.mockResolvedValue([]);
      await render(<FindFriend />);
      await fireEvent.changeText(screen.getByPlaceholderText("Search by username…"), "zz");
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      await waitFor(() => expect(screen.getByText(/No one matches/)).toBeTruthy());
    } finally {
      jest.useRealTimers();
    }
  });
});
