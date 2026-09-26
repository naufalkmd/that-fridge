import { render } from "@testing-library/react-native";

const mockHide = jest.fn(() => Promise.resolve());
jest.mock("expo-splash-screen", () => ({ hideAsync: () => mockHide() }));
let mockStatus: "loading" | "signedIn" | "signedOut" = "loading";
let mockOnboardingReady = false;
let mockInventoryLoading = true;
jest.mock("@/lib/auth", () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock("@/lib/onboarding", () => ({ useOnboarding: () => ({ ready: mockOnboardingReady }) }));
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ loading: mockInventoryLoading }) }));

import { SplashGate, SPLASH_MAX_MS } from "@/components/splash-gate";

beforeEach(() => {
  jest.useFakeTimers();
  mockHide.mockClear();
  mockStatus = "loading";
  mockOnboardingReady = false;
  mockInventoryLoading = true;
});
afterEach(() => jest.useRealTimers());

describe("SplashGate", () => {
  test("stays up while the session is still being restored", async () => {
    mockOnboardingReady = true;
    await render(<SplashGate />);

    expect(mockHide).not.toHaveBeenCalled();
  });

  test("a signed-in user's splash waits for the fridges, then lifts", async () => {
    mockStatus = "signedIn";
    mockOnboardingReady = true;
    const view = await render(<SplashGate />);
    expect(mockHide).not.toHaveBeenCalled(); // session known, data not in yet

    mockInventoryLoading = false;
    await view.rerender(<SplashGate />);

    expect(mockHide).toHaveBeenCalled();
  });

  test("a signed-out user's splash lifts as soon as the session and onboarding flags are known", async () => {
    mockStatus = "signedOut";
    mockOnboardingReady = true;
    await render(<SplashGate />);

    expect(mockHide).toHaveBeenCalled(); // no fridges to wait for
  });

  test("a slow network can't keep the splash up forever", async () => {
    mockStatus = "signedIn";
    mockOnboardingReady = true;
    await render(<SplashGate />);
    expect(mockHide).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SPLASH_MAX_MS + 50);

    expect(mockHide).toHaveBeenCalled();
  });
});
