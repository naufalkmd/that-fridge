import { render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => {
  const { Text } = jest.requireActual("react-native");
  // Render the asset's name so the test can see which icon was chosen.
  return { Image: ({ source }: { source: unknown }) => <Text>{`img:${String(source)}`}</Text> };
});
jest.mock("@/lib/food-icon-assets", () => ({
  FOOD_ICON_ASSETS: new Proxy({}, { get: (_t, file: string) => file }),
}));
jest.mock("@/components/brand", () => {
  const { Text } = jest.requireActual("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});

import { FoodIcon, initials } from "@/components/food-icon";

describe("FoodIcon", () => {
  test("a pack match wins", async () => {
    await render(<FoodIcon icon="generic" name="Milk" />);
    expect(screen.getByText("img:icon-163.png")).toBeTruthy();
  });

  test("peanut butter shows the jar, never the old cheese grid", async () => {
    await render(<FoodIcon icon="generic" name="Peanut Butter" />);
    expect(screen.getByText("img:icon-005.png")).toBeTruthy();
  });

  test("an unknown food shows its initials in pixel font", async () => {
    await render(<FoodIcon icon="generic" name="Rambutan" />);
    expect(screen.getByText("RA")).toBeTruthy();
  });

  test("initials take the first letter of the first two words", () => {
    expect(initials("Peanut Butter")).toBe("PB");
    expect(initials("  kaya ")).toBe("KA");
    expect(initials("")).toBe("?");
  });
});
