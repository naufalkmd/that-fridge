import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/lib/fridgeReminder", () => ({
  getFridgeReminder: () => Promise.resolve("off"),
  setFridgeReminder: jest.fn(),
}));
const mockToggle = jest.fn();
jest.mock("@/lib/notifications", () => ({
  useNotifications: () => ({
    prefs: { expiryAlerts: true, lowStock: true, recipeTips: false, weeklyDigest: true, social: true, crewActionsEnabled: false },
    togglePref: (...a: unknown[]) => mockToggle(...a),
  }),
}));

import NotificationSettings from "@/app/notification-settings";

describe("Notification settings", () => {
  test("lists only switches that do something (no weekly digest, which nothing sends)", async () => {
    await render(<NotificationSettings />);

    for (const label of ["Expiry alerts", "Low stock reminders", "Recipe suggestions", "Invites & members", "Crew activity"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Weekly digest")).toBeNull();
  });

  test("a switch toggles its own preference", async () => {
    await render(<NotificationSettings />);

    await fireEvent(screen.getAllByRole("switch")[2], "valueChange", true);

    expect(mockToggle).toHaveBeenCalledWith("recipeTips");
  });
});
