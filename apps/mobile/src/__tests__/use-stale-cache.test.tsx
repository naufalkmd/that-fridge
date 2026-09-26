import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

let mockStatus: "loading" | "signedIn" | "signedOut" = "signedIn";
let mockUserId: string | null = "u1";
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ status: mockStatus, user: mockUserId ? { id: mockUserId } : null }) }));
const mockRead = jest.fn();
const mockWrite = jest.fn();
jest.mock("@/lib/persist", () => ({
  hydrate: (key: string, userId: string, apply: (d: unknown) => void, isFresh: () => boolean) => {
    let stopped = false;
    void mockRead(key, userId).then((d: unknown) => {
      if (d !== null && !stopped && !isFresh()) apply(d);
    });
    return { stop: () => void (stopped = true) };
  },
  writeCache: (...a: unknown[]) => mockWrite(...a),
}));

import { useStaleCache } from "@/lib/useStaleCache";

let mockMarkFresh: () => void = () => {};
let mockSetList: (l: string[]) => void = () => {};

function Screen() {
  const [list, setList] = useState<string[]>([]);
  const { markFresh } = useStaleCache<string[]>("fridges", list, setList);
  mockMarkFresh = markFresh;
  mockSetList = setList;
  return <Text testID="list">{list.join(",") || "empty"}</Text>;
}

const shown = () => screen.getByTestId("list").props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = "signedIn";
  mockUserId = "u1";
  mockRead.mockResolvedValue(null);
});

describe("useStaleCache", () => {
  test("paints the saved copy at once when signed in", async () => {
    mockRead.mockResolvedValue(["Home", "Office"]);
    await render(<Screen />);

    await waitFor(() => expect(shown()).toBe("Home,Office"));
    expect(mockRead).toHaveBeenCalledWith("fridges", "u1");
  });

  test("fresh data always wins over a saved copy that arrives late", async () => {
    let releaseDisk!: (v: string[]) => void;
    mockRead.mockReturnValue(new Promise((r) => (releaseDisk = r)));
    await render(<Screen />);

    await act(async () => {
      mockMarkFresh(); // the network answered first
      mockSetList(["Fresh"]);
    });
    await act(async () => releaseDisk(["Stale"]));

    expect(shown()).toBe("Fresh");
  });

  test("nothing is saved until fresh data has arrived (so an empty first render never overwrites the good copy)", async () => {
    await render(<Screen />);
    await act(async () => {});
    expect(mockWrite).not.toHaveBeenCalled();

    await act(async () => {
      mockMarkFresh();
      mockSetList(["Home"]);
    });

    expect(mockWrite).toHaveBeenLastCalledWith("fridges", "u1", ["Home"]);
  });

  test("later changes (an item added, an edit) are saved too", async () => {
    await render(<Screen />);
    await act(async () => {
      mockMarkFresh();
      mockSetList(["Home"]);
    });
    await act(async () => mockSetList(["Home", "Office"]));

    expect(mockWrite).toHaveBeenLastCalledWith("fridges", "u1", ["Home", "Office"]);
  });

  test("signed out: no reading and no writing", async () => {
    mockStatus = "signedOut";
    mockUserId = null;
    await render(<Screen />);
    await act(async () => {
      mockMarkFresh();
      mockSetList(["x"]);
    });

    expect(mockRead).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
