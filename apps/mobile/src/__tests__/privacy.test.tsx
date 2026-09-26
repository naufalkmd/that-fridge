import { Alert, Linking } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/brand", () => {
  const { Text } = require("react-native");
  return { PixelText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock("@/lib/theme", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }),
}));

let mockUser: { preferences: { help_improve?: boolean } } = { preferences: {} };
const mockUpdate = jest.fn();
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mockUser, updateImprovementPreferences: mockUpdate }) }));
const mockDeleteData = jest.fn();
jest.mock("@/lib/api", () => ({ api: { deleteImprovementData: (...a: unknown[]) => mockDeleteData(...a) } }));

import Privacy from "@/app/privacy";

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { preferences: {} };
  mockUpdate.mockResolvedValue(undefined);
  mockDeleteData.mockResolvedValue(undefined);
});

describe("Privacy screen", () => {
  test("sharing is on by default and switching it off is saved", async () => {
    await render(<Privacy />);
    const toggle = screen.getByLabelText("Help improve ThatFridge's suggestions");
    expect(toggle.props.value).toBe(true);

    await fireEvent(toggle, "valueChange", false);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ helpImprove: false }));
  });

  test("an account that opted out shows the switch off", async () => {
    mockUser = { preferences: { help_improve: false } };
    await render(<Privacy />);

    expect(screen.getByLabelText("Help improve ThatFridge's suggestions").props.value).toBe(false);
  });

  test("deleting improvement data asks first, then calls the API", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Privacy />);

    await fireEvent.press(screen.getByText("Delete my improvement data"));
    expect(mockDeleteData).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Delete data")!.onPress!();

    await waitFor(() => expect(mockDeleteData).toHaveBeenCalled());
    alert.mockRestore();
  });

  test("the privacy policy opens in the browser, and the screen explains what is shared", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(<Privacy />);

    await fireEvent.press(screen.getByText("Privacy policy"));

    expect(open).toHaveBeenCalledWith("https://thatfridge.com/privacy");
    expect(screen.getByText("Never shared")).toBeTruthy();
    expect(screen.getByText(/180 days/)).toBeTruthy();
    open.mockRestore();
  });
});
