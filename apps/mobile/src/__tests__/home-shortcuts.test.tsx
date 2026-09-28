/// <reference types="node" />
import fs from "fs";
import path from "path";
import { fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));

import { SHORTCUTS, Shortcuts } from "@/components/home/Shortcuts";

describe("Home shortcuts", () => {
  test("shows a labelled button for each place and opens it", async () => {
    await render(<Shortcuts />);

    for (const s of SHORTCUTS) {
      await fireEvent.press(screen.getByLabelText(s.label));
      expect(mockPush).toHaveBeenLastCalledWith(s.href);
    }
    expect(SHORTCUTS.map((s) => s.label)).toEqual(["Explore", "Calendar", "Meal plan", "Shopping", "Kitchen Lab"]);
  });

  test("every shortcut points at a screen that exists", () => {
    for (const s of SHORTCUTS) {
      expect(fs.existsSync(path.resolve(__dirname, "..", "app", `${String(s.href).slice(1)}.tsx`))).toBe(true);
    }
  });
});
