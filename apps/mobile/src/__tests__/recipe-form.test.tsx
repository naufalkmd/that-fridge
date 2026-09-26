import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "@thatfridge/core";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
jest.mock("@/components/sheet", () => ({ SheetHeader: () => null }));
jest.mock("@/components/food-icon", () => ({ FoodIcon: () => null }));
jest.mock("@/lib/recipes", () => ({
  useRecipes: () => ({ byId: () => undefined, create: jest.fn(), update: jest.fn() }),
  takeRecipeIconPick: () => null,
  takeRecipeSuggestion: () => null,
}));
const mockSetCredits = jest.fn();
jest.mock("@/lib/credits", () => ({ useCredits: () => ({ balance: 20, setBalance: mockSetCredits }) }));
const mockToast = jest.fn();
jest.mock("@/lib/toast", () => ({ useToast: () => ({ show: (...a: unknown[]) => mockToast(...a) }) }));
const mockAsk = jest.fn();
jest.mock("@/lib/api", () => ({
  api: { askChefRecipe: (...a: unknown[]) => mockAsk(...a), importRecipeFromLink: jest.fn(), postBadgeProgress: jest.fn(), uploadRecipeAttachment: jest.fn() },
}));

import RecipeForm from "@/app/recipe-form";

const recipe = { name: "Spinach omelette", description: "", minutes: 15, category: "dinner", ingredients: [{ name: "Eggs" }, { name: "Spinach" }], steps: ["Whisk.", "Cook."] };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockAsk.mockResolvedValue({ found: true, recipe, creditsUsed: 2, balance: 18 });
});

/** Ask Chef is a dropdown on this form: it starts tucked away. */
const openChef = async () => fireEvent.press(screen.getByLabelText("Open Ask Chef"));

describe("Recipe form: Ask Chef", () => {
  test("it starts as a closed dropdown that says what it does, and opens on tap", async () => {
    await render(<RecipeForm />);

    expect(screen.getByText("Describe a dish and Chef writes the recipe · 2 credits")).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Tell Chef what you feel like/)).toBeNull();

    await openChef();
    expect(screen.getByPlaceholderText(/Tell Chef what you feel like/)).toBeTruthy();
    expect(screen.queryByText("Describe a dish and Chef writes the recipe · 2 credits")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Close Ask Chef")); // and closes again
    expect(screen.queryByPlaceholderText(/Tell Chef what you feel like/)).toBeNull();
  });

  test("the button shows the cost and stays off until something is typed", async () => {
    await render(<RecipeForm />);
    await openChef();

    expect(screen.getByText("Ask Chef · 2 credits")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Send to Chef"));
    expect(mockAsk).not.toHaveBeenCalled();
  });

  test("what was typed writes a recipe into the form, the dropdown closes, and the usage is reported", async () => {
    await render(<RecipeForm />);
    await openChef();

    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "a quick vegetarian dinner");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith("a quick vegetarian dinner", false));
    expect(await screen.findByDisplayValue("Spinach omelette")).toBeTruthy();
    expect(screen.getByDisplayValue("Eggs")).toBeTruthy();
    expect(screen.getByDisplayValue("Cook.")).toBeTruthy();
    expect(mockSetCredits).toHaveBeenCalledWith(18);
    expect(screen.queryByPlaceholderText(/Tell Chef what you feel like/)).toBeNull(); // tucked away again
    expect(mockToast).toHaveBeenCalledWith('Chef wrote "Spinach omelette" · used 2 credits · 18 left');
  });

  test("'Use what's in my fridge' is passed along", async () => {
    await render(<RecipeForm />);
    await openChef();

    await fireEvent.press(screen.getByLabelText("Use what's in my fridge"));
    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "something with spinach");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(mockAsk).toHaveBeenCalledWith("something with spinach", true));
  });

  test("when Chef can't write it, the form is untouched and the user is told they weren't charged", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockAsk.mockResolvedValue({ found: false, reason: "not_recognized", creditsUsed: 0, balance: 20 });
    await render(<RecipeForm />);
    await openChef();

    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "capital of France");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Chef couldn't write that", expect.stringMatching(/weren't charged/)));
    expect(screen.queryByDisplayValue("Spinach omelette")).toBeNull();
    alert.mockRestore();
  });

  test("out of credits goes to the Credits screen", async () => {
    mockAsk.mockRejectedValue(new ApiError(402, "insufficient_credits"));
    await render(<RecipeForm />);
    await openChef();

    await fireEvent.changeText(screen.getByLabelText("Ask Chef"), "soup please");
    await fireEvent.press(screen.getByLabelText("Send to Chef"));

    await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith("/credits"));
  });
});
