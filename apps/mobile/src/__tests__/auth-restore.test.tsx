import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { ApiError, type CurrentUser } from "@thatfridge/core";

jest.mock("expo-apple-authentication", () => ({}));
jest.mock("@/lib/push", () => ({ unregisterPush: () => Promise.resolve() }));
jest.mock("@/lib/analytics", () => ({ track: jest.fn() }));
jest.mock("@/lib/hydrateOnboarding", () => ({ hydrateOnboarding: jest.fn() }));
jest.mock("@/lib/google-auth", () => ({ googleSignInIdToken: jest.fn(), googleSignOut: () => Promise.resolve() }));
const mockToken = { get: jest.fn(), clear: jest.fn(() => Promise.resolve()) };
const mockMe = jest.fn();
// Referenced lazily (inside the functions): the factory runs before these consts are initialised.
jest.mock("@/lib/api", () => ({
  api: { me: (...a: unknown[]) => mockMe(...a), logout: () => Promise.resolve() },
  secureTokenStore: { get: () => mockToken.get(), clear: () => mockToken.clear() },
}));
const mockReadCache = jest.fn();
const mockWriteCache = jest.fn();
const mockClearCache = jest.fn();
jest.mock("@/lib/persist", () => ({
  readCache: (...a: unknown[]) => mockReadCache(...a),
  writeCache: (...a: unknown[]) => mockWriteCache(...a),
  clearCache: () => mockClearCache(),
}));

import { AuthProvider, useAuth } from "@/lib/auth";

const user = (name: string) => ({ id: "7", name, username: "sam", email: "s@x.com", credits: 12 }) as unknown as CurrentUser;

function Probe() {
  const { status, user: u, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="name">{u?.name ?? "-"}</Text>
      <Text testID="signout" onPress={() => void signOut()}>out</Text>
    </>
  );
}

const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const status = () => screen.getByTestId("status").props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockToken.get.mockResolvedValue("tok");
  mockReadCache.mockResolvedValue(null);
});

describe("AuthProvider: restoring a session", () => {
  test("with a saved profile the app is signed in before the server has answered", async () => {
    mockReadCache.mockResolvedValue(user("Saved Sam"));
    let resolveMe!: (u: CurrentUser) => void;
    mockMe.mockReturnValue(new Promise<CurrentUser>((r) => (resolveMe = r)));
    await mount();

    await waitFor(() => expect(status()).toBe("signedIn")); // no network answer yet
    expect(screen.getByTestId("name").props.children).toBe("Saved Sam");

    await act(async () => resolveMe(user("Fresh Sam")));
    await waitFor(() => expect(screen.getByTestId("name").props.children).toBe("Fresh Sam")); // the server's copy replaces it
  });

  test("the profile is saved for the next launch", async () => {
    mockMe.mockResolvedValue(user("Sam"));
    await mount();

    await waitFor(() => expect(mockWriteCache).toHaveBeenCalledWith("user", "7", expect.objectContaining({ name: "Sam" })));
  });

  test("being offline at launch does not sign anyone out: the saved session stays and the token is kept", async () => {
    mockReadCache.mockResolvedValue(user("Saved Sam"));
    mockMe.mockRejectedValue(new ApiError(0, "You're offline"));
    await mount();

    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    await act(async () => {});
    expect(status()).toBe("signedIn");
    expect(mockToken.clear).not.toHaveBeenCalled();
  });

  test("offline with nothing saved shows sign-in but keeps the token for next time", async () => {
    mockMe.mockRejectedValue(new ApiError(0, "You're offline"));
    await mount();

    await waitFor(() => expect(status()).toBe("signedOut"));
    expect(mockToken.clear).not.toHaveBeenCalled();
  });

  test("the server rejecting the token ends the session and wipes the saved data", async () => {
    mockReadCache.mockResolvedValue(user("Saved Sam"));
    mockMe.mockRejectedValue(new ApiError(401, "Unauthenticated"));
    await mount();

    await waitFor(() => expect(status()).toBe("signedOut"));
    expect(mockToken.clear).toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalled();
    expect(screen.getByTestId("name").props.children).toBe("-");
  });

  test("with no token it goes straight to signed out without asking the server", async () => {
    mockToken.get.mockResolvedValue(null);
    await mount();

    await waitFor(() => expect(status()).toBe("signedOut"));
    expect(mockMe).not.toHaveBeenCalled();
  });

  test("signing out wipes the saved data", async () => {
    mockMe.mockResolvedValue(user("Sam"));
    await mount();
    await waitFor(() => expect(status()).toBe("signedIn"));

    await act(async () => screen.getByTestId("signout").props.onPress());

    expect(mockClearCache).toHaveBeenCalled();
    await waitFor(() => expect(status()).toBe("signedOut"));
  });
});
