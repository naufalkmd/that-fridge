import { fireEvent, render, screen } from "@testing-library/react-native";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), navigate: mockNavigate }) }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));

import { CrewDock } from "@/components/home/CrewDock";

const layout = { nativeEvent: { layout: { width: 374, height: 80, x: 0, y: 0 } } };

async function renderDock(props: Partial<Parameters<typeof CrewDock>[0]> = {}) {
  const onExpand = jest.fn();
  const utils = await render(
    <CrewDock
      pending={{ recipe: 3, expiring: 3, lowStock: 0 }}
      score={85}
      streak={6}
      collapsed={false}
      onExpand={onExpand}
      bottom={100}
      {...props}
    />,
  );
  // The strip sizes itself from its width.
  await fireEvent(screen.getByTestId("crew-strip"), "layout", layout);
  return { ...utils, onExpand };
}

beforeEach(() => jest.clearAllMocks());

describe("Crew dock", () => {
  test("shows a pill only for crew members with something to report, each opening its page", async () => {
    await renderDock();

    expect(screen.getByText("3 meals")).toBeTruthy();
    expect(screen.getByText("3 expiring")).toBeTruthy();
    expect(screen.queryByText(/low$/)).toBeNull(); // nothing running low: no pill

    await fireEvent.press(screen.getByLabelText("3 expiring"));
    expect(mockNavigate).toHaveBeenCalledWith("/eat?tab=guardian");
  });

  test("the title opens the Crew tab", async () => {
    await renderDock();
    await fireEvent.press(screen.getByLabelText("Your crew"));
    expect(mockNavigate).toHaveBeenCalledWith("/eat");
  });

  test("collapsed, the strip is one button that opens it again", async () => {
    const { onExpand } = await renderDock({ collapsed: true });
    await fireEvent.press(screen.getByLabelText("Open your crew"));
    expect(onExpand).toHaveBeenCalled();
  });
});
