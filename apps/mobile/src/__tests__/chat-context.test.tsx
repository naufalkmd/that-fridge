import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Metro finds this through its @2x variant; Jest cannot, so give it a stand-in.
jest.mock("../../assets/images/thatfridge/chat-wallpaper.png", () => 1, { virtual: true });
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const mockColors = new Proxy({}, { get: () => "#888888" });
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock("@/components/bottom-sheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("@/components/markdown-text", () => {
  const { Text } = require("react-native");
  return { MarkdownText: ({ text }: { text: string }) => <Text>{text}</Text> };
});
jest.mock("@/components/recipe-suggestion-card", () => ({ RecipeSuggestionCard: () => null }));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));
const mockVoice = { available: false, listening: false, start: jest.fn(), stop: jest.fn() };
jest.mock("@/lib/voice", () => ({ useVoiceDictation: () => mockVoice }));
// Stable references: the screen puts these in effect dependency lists, so fresh ones every render would loop.
const mockStable = {
  items: [{ id: "11", name: "Milk", fridgeName: "Home", days: 2 }],
  fridges: [{ id: "1", name: "Home" }],
  recipes: [{ id: "9", name: "Pad Thai", minutes: 25 }],
  refresh: jest.fn(),
  markChecklistVisited: jest.fn(),
  setBalance: jest.fn(),
};
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ items: mockStable.items, fridges: mockStable.fridges, refresh: mockStable.refresh }) }));
jest.mock("@/lib/notes", () => ({ useNotes: () => ({ refresh: mockStable.refresh }) }));
jest.mock("@/lib/shopping", () => ({ useShopping: () => ({ refresh: mockStable.refresh }) }));
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: "all" }) }));
jest.mock("@/lib/onboarding", () => ({ useOnboarding: () => ({ markChecklistVisited: mockStable.markChecklistVisited }) }));
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: 20, setBalance: mockStable.setBalance, refresh: mockStable.refresh }) }));
jest.mock("@/lib/recipes", () => ({
  useRecipes: () => ({ recipes: mockStable.recipes }),
  stashRecipeSuggestion: jest.fn(),
}));
const mockSendChat = jest.fn();
jest.mock("@/lib/api", () => ({
  api: {
    getChatHistory: () => Promise.resolve({ session_id: null, messages: [] }),
    getChatSessionMessages: () => Promise.resolve({ session_id: null, messages: [] }),
    sendChat: (...a: unknown[]) => mockSendChat(...a),
    extractMemory: () => Promise.resolve(),
  },
}));

import Chat from "@/app/(tabs)/chat";

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 8, 15, 12),
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockSendChat.mockResolvedValue({ session_id: "s1", agent_response: "Use the milk today.", recipe_suggestion: null, mocked: false, id: 5, credits: 19 });
});

/** The + sheet swaps to the context sheet after a short delay (an iOS Modal quirk). */
async function openContextSheet() {
  await fireEvent.press(await screen.findByLabelText("Add attachment"));
  await fireEvent.press(await screen.findByText("Add context"));
  await screen.findByLabelText("An item", {}, { timeout: 2000 }); // the context sheet opens a beat later
}

describe("Quick Chat: add context", () => {
  test("the + sheet offers Add context beside photos and files", async () => {
    await render(<Chat />);
    await fireEvent.press(await screen.findByLabelText("Add attachment"));

    expect(screen.getByText("Add context")).toBeTruthy();
    expect(screen.getByText("Take a photo")).toBeTruthy();
  });

  test("a pinned item shows as a removable chip and is sent with the message, with the device timezone", async () => {
    await render(<Chat />);
    await openContextSheet();

    await fireEvent.press(screen.getByLabelText("An item"));
    await fireEvent.press(screen.getByLabelText("Milk"));
    expect(screen.getByLabelText("Remove Milk")).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText(/./), "can I still drink this?");
    await fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockSendChat).toHaveBeenCalled());
    const [message, , opts] = mockSendChat.mock.calls[0];
    expect(message).toBe("can I still drink this?");
    expect(opts.contexts).toEqual([{ type: "item", id: "11" }]);
    expect(opts.tz).toBe("Asia/Kuala_Lumpur");
    expect(screen.queryByLabelText("Remove Milk")).toBeNull(); // the chip is spent once sent
  });

  test("context alone is enough to send, and can be removed before sending", async () => {
    await render(<Chat />);
    await openContextSheet();
    await fireEvent.press(screen.getByLabelText("What's expiring"));

    await fireEvent.press(screen.getByLabelText("Remove Expiring soon"));
    expect(screen.queryByLabelText("Remove Expiring soon")).toBeNull();

    await openContextSheet();
    await fireEvent.press(screen.getByLabelText("What's expiring"));
    await fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockSendChat).toHaveBeenCalled());
    expect(mockSendChat.mock.calls[0][0]).toBe("What should I know about this?");
    expect(mockSendChat.mock.calls[0][2].contexts).toEqual([{ type: "expiring" }]);
  });

  test("a message with no context sends none (and no timezone)", async () => {
    await render(<Chat />);

    await fireEvent.changeText(await screen.findByPlaceholderText(/./), "hi");
    await fireEvent.press(screen.getByLabelText("Send message"));

    await waitFor(() => expect(mockSendChat).toHaveBeenCalled());
    expect(mockSendChat.mock.calls[0][2].contexts).toBeUndefined();
    expect(mockSendChat.mock.calls[0][2].tz).toBeUndefined();
  });

  test("opened from the calendar's Ask Quick Chat, the day arrives pinned with the prefilled text", async () => {
    mockParams = { prefill: "Add to Friday 18 September: ", contextDay: "2026-09-18" };
    await render(<Chat />);

    expect(await screen.findByLabelText("Remove Fri 18")).toBeTruthy();
    expect(screen.getByDisplayValue("Add to Friday 18 September: ")).toBeTruthy();
  });
});
