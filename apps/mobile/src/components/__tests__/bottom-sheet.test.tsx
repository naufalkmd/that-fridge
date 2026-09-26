import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

let mockKeyboard = 0;
jest.mock("@/lib/keyboard", () => ({ useKeyboardHeight: () => mockKeyboard }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: { surface: "#111", hairline: "#333" } }) }));

import { BottomSheet } from "@/components/bottom-sheet";

const paddingBottom = () => {
  const style = screen.getByTestId("bottom-sheet-overlay").props.style;
  return (Array.isArray(style) ? Object.assign({}, ...style) : style).paddingBottom;
};

describe("BottomSheet and the keyboard", () => {
  test("rests on the bottom of the screen with no keyboard", async () => {
    mockKeyboard = 0;
    await render(<BottomSheet visible onClose={jest.fn()}><Text>hi</Text></BottomSheet>);

    expect(paddingBottom()).toBe(0);
    expect(screen.getByText("hi")).toBeTruthy();
  });

  test("lifts by the keyboard's height so a text field inside is never covered", async () => {
    mockKeyboard = 336;
    await render(<BottomSheet visible onClose={jest.fn()}><Text>hi</Text></BottomSheet>);

    expect(paddingBottom()).toBe(336);
  });
});
