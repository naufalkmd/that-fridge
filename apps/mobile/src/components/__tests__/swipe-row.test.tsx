jest.mock("@/lib/theme", () => ({
  useTheme: () => ({ colors: { bad: "#ff5567", canvas: "#0a0a0c" } }),
}));

import { Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { SwipeRow } from "@/components/swipe-row";

describe("SwipeRow", () => {
  test("renders its children", async () => {
    const { getByText } = await render(
      <SwipeRow onDelete={jest.fn()}>
        <Text>Row content</Text>
      </SwipeRow>,
    );

    expect(getByText("Row content")).toBeTruthy();
  });

  test("tapping the revealed Delete action calls onDelete", async () => {
    const onDelete = jest.fn();
    const { getByText } = await render(
      <SwipeRow onDelete={onDelete}>
        <Text>Row content</Text>
      </SwipeRow>,
    );

    fireEvent.press(getByText("Delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("disabled prevents the pan gesture but not the tap action", async () => {
    const onDelete = jest.fn();
    const { getByText } = await render(
      <SwipeRow onDelete={onDelete} disabled>
        <Text>Row content</Text>
      </SwipeRow>,
    );

    fireEvent.press(getByText("Delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
