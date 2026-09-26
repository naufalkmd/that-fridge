import { Keyboard, Platform } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

import { useKeyboardHeight } from "@/lib/keyboard";

type Handler = (e?: { endCoordinates?: { height: number } }) => void;

describe("useKeyboardHeight", () => {
  let handlers: Record<string, Handler>;
  let removed: string[];

  beforeEach(() => {
    handlers = {};
    removed = [];
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, handler: Handler) => {
      handlers[event] = handler;
      return { remove: () => removed.push(event) };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const events = () => (Platform.OS === "ios" ? ["keyboardWillShow", "keyboardWillHide"] : ["keyboardDidShow", "keyboardDidHide"]);

  test("starts at 0, follows the keyboard up and back down", async () => {
    const { result } = await renderHook(() => useKeyboardHeight());
    const [show, hide] = events();
    expect(result.current).toBe(0);

    await act(async () => handlers[show]({ endCoordinates: { height: 336 } }));
    expect(result.current).toBe(336);

    await act(async () => handlers[hide]());
    expect(result.current).toBe(0);
  });

  test("a show event without coordinates does not break it, and listeners are removed on unmount", async () => {
    const { result, unmount } = await renderHook(() => useKeyboardHeight());
    await act(async () => handlers[events()[0]]({}));
    expect(result.current).toBe(0);

    await unmount();
    expect(removed.sort()).toEqual([...events()].sort());
  });
});
