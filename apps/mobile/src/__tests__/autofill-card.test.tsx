import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { FlatItem } from "@thatfridge/core";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/theme", () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }) }));
const mockPatch = jest.fn();
jest.mock("@/lib/inventory", () => ({ useInventory: () => ({ patchItem: (...a: unknown[]) => mockPatch(...a) }) }));
const mockAutofill = jest.fn();
jest.mock("@/lib/api", () => ({ api: { autofillItem: (...a: unknown[]) => mockAutofill(...a) } }));

import { AutofillCard } from "@/components/item-detail/autofill-card";

const item = {
  id: "5", name: "Chicken breast",
  customFields: [{ id: "f1", label: "Supplier", value: "Tesco" }, { id: "f2", label: "Protein", value: "" }, { id: "f3", label: "Fat", value: "" }],
} as unknown as FlatItem;

beforeEach(() => {
  jest.clearAllMocks();
  mockPatch.mockResolvedValue(undefined);
});

describe("AutofillCard: custom fields", () => {
  test("shows the proposed custom-field values with where each came from, and saves the whole array", async () => {
    const proposed = [
      { id: "f1", label: "Supplier", value: "Tesco" },
      { id: "f2", label: "Protein", value: "155 g" },
      { id: "f3", label: "Fat", value: "18 g" },
    ];
    mockAutofill.mockResolvedValue({ fields: { custom_fields: proposed }, custom_sources: { Protein: "table", Fat: "ai" } });
    await render(<AutofillCard item={item} />);

    await fireEvent.press(screen.getByText("Autofill missing details"));

    expect(await screen.findByText("Protein: 155 g")).toBeTruthy();
    expect(screen.getByText("worked out from the food and its weight")).toBeTruthy();
    expect(screen.getByText("Fat: 18 g")).toBeTruthy();
    expect(screen.getByText("estimated")).toBeTruthy();
    expect(screen.queryByText("Supplier: Tesco")).toBeNull(); // already had a value: not a proposal

    await fireEvent.press(screen.getByText("Use these"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("5", { custom_fields: proposed }));
  });

  test("dismissing writes nothing", async () => {
    mockAutofill.mockResolvedValue({ fields: { custom_fields: [{ id: "f2", label: "Protein", value: "20 g" }] }, custom_sources: { Protein: "history" } });
    await render(<AutofillCard item={item} />);

    await fireEvent.press(screen.getByText("Autofill missing details"));
    expect(await screen.findByText("from your other items")).toBeTruthy();
    await fireEvent.press(screen.getByText("Dismiss"));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(screen.getByText("Autofill missing details")).toBeTruthy();
  });

  test("nothing to propose says so", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockAutofill.mockResolvedValue({ fields: {}, message: "Couldn't confidently estimate anything new for this item." });
    await render(<AutofillCard item={item} />);

    await fireEvent.press(screen.getByText("Autofill missing details"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Nothing to fill in", expect.stringMatching(/Couldn't confidently/)));
    alert.mockRestore();
  });
});
