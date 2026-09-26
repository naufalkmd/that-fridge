import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Machine, MachineDraft } from "@thatfridge/core";

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#888888" }) }),
}));
let mockFridges = [{ id: "f1", name: "Home" }];
jest.mock("@/lib/inventory", () => ({
  useInventory: () => ({ fridges: mockFridges, refresh: jest.fn() }),
}));
jest.mock("@/lib/scope", () => ({ useScope: () => ({ scope: "all" }) }));
jest.mock("@/lib/timezone", () => ({ getDeviceTimezone: () => "Asia/Kuala_Lumpur" }));
jest.mock("@/components/ui", () => {
  const { Text, View } = require("react-native");
  return {
    PageHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    Eyebrow: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Section: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const mockApi = {
  listMachines: jest.fn(),
  draftMachine: jest.fn(),
  createMachine: jest.fn(),
  updateMachine: jest.fn(),
  deleteMachine: jest.fn(),
  runMachine: jest.fn(),
  dryRunMachine: jest.fn(),
  listMachineRuns: jest.fn(),
  undoMachineRun: jest.fn(),
};
jest.mock("@/lib/api", () => ({ api: new Proxy({}, { get: (_t, k: string) => (mockApi as never)[k] }) }));

import KitchenLab from "@/app/kitchen-lab";

const schedule = (time = "08:00") =>
  ({ type: "schedule", config: { frequency: "daily", time, weekday: null, timezone: "Asia/Kuala_Lumpur" } }) as const;

const draft: MachineDraft = {
  name: "Daily calories",
  trigger: schedule(),
  steps: [
    { tool: "sum_item_field", args: { field: "calories" } },
    { tool: "notify_user", args: { message: "Total: {step1}" } },
  ],
};

function machine(over: Partial<Machine> = {}): Machine {
  return {
    id: "m1", name: "Morning check", prompt: null, fridgeId: "f1", trigger: schedule("07:00"),
    steps: draft.steps, enabled: false, version: 1, nextRunAt: null, lastRunAt: null,
    lastRunStatus: null, lastRunError: null, runCount: 0, createdAt: 0, ...over,
  } as Machine;
}

async function openCompose() {
  await fireEvent.press(await screen.findByText("Create a Machine"));
  await screen.findByText("New Machine");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFridges = [{ id: "f1", name: "Home" }];
  mockApi.listMachines.mockResolvedValue([]);
  mockApi.listMachineRuns.mockResolvedValue([]);
});

describe("KitchenLab screen", () => {
  test("empty state offers to create a Machine", async () => {
    await render(<KitchenLab />);

    expect(await screen.findByText(/No Machines yet/)).toBeTruthy();
    expect(screen.getByText("Create a Machine")).toBeTruthy();
  });

  test("lists existing Machines with a plain-English trigger", async () => {
    mockApi.listMachines.mockResolvedValue([machine()]);

    await render(<KitchenLab />);

    expect(await screen.findByText("Morning check")).toBeTruthy();
    expect(screen.getByText("Every day at 7:00 AM")).toBeTruthy();
  });

  test("opened with new=1 (from the calendar's + menu) it goes straight to composing a Machine", async () => {
    mockParams = { new: "1" };
    await render(<KitchenLab />);

    expect(await screen.findByText("New Machine")).toBeTruthy();
    expect(screen.getByPlaceholderText(/Every Monday at 8am/)).toBeTruthy();
  });

  test("opened with a draft from Explore it goes straight to reviewing it, unsaved", async () => {
    mockParams = { draft: JSON.stringify(draft) };
    await render(<KitchenLab />);

    expect(await screen.findByDisplayValue(draft.name)).toBeTruthy();
    expect(screen.getByText("Save Machine")).toBeTruthy();
    expect(mockApi.createMachine).not.toHaveBeenCalled();
  });

  test("a garbled draft is ignored and the list shows", async () => {
    mockParams = { draft: "{not json" };
    await render(<KitchenLab />);

    expect(await screen.findByText("Create a Machine")).toBeTruthy();
  });

  test("without it, it opens on the list as before", async () => {
    await render(<KitchenLab />);

    expect(await screen.findByText("Create a Machine")).toBeTruthy();
    expect(screen.queryByText("New Machine")).toBeNull();
  });

  test("Draft is disabled until there's a prompt, then sends the trimmed prompt and lands on review", async () => {
    mockApi.draftMachine.mockResolvedValue({ ok: true, draft });
    await render(<KitchenLab />);
    await openCompose();

    await fireEvent.press(screen.getByText(/Draft with AI/));
    expect(mockApi.draftMachine).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByPlaceholderText(/Every Monday at 8am/), "  tell me calories daily  ");
    await fireEvent.press(screen.getByText(/Draft with AI/));

    await waitFor(() => expect(mockApi.draftMachine).toHaveBeenCalledWith("tell me calories daily"));
    expect(await screen.findByText("Review Machine")).toBeTruthy();
    expect(screen.getByDisplayValue("Daily calories")).toBeTruthy();
  });

  test("a draft the server couldn't produce shows its message and stays on the prompt", async () => {
    mockApi.draftMachine.mockResolvedValue({ ok: false, message: "Try describing it differently." });
    await render(<KitchenLab />);
    await openCompose();

    await fireEvent.changeText(screen.getByPlaceholderText(/Every Monday at 8am/), "do a thing");
    await fireEvent.press(screen.getByText(/Draft with AI/));

    expect(await screen.findByText("Try describing it differently.")).toBeTruthy();
    expect(screen.queryByText("Review Machine")).toBeNull();
  });

  test("saving a reviewed draft creates it with the edited name and the only fridge", async () => {
    mockApi.draftMachine.mockResolvedValue({ ok: true, draft });
    mockApi.createMachine.mockResolvedValue(machine());
    await render(<KitchenLab />);
    await openCompose();
    await fireEvent.changeText(screen.getByPlaceholderText(/Every Monday at 8am/), "calories daily");
    await fireEvent.press(screen.getByText(/Draft with AI/));
    await screen.findByText("Review Machine");

    await fireEvent.changeText(screen.getByDisplayValue("Daily calories"), "My calories");
    await fireEvent.press(screen.getByText("Save Machine"));

    await waitFor(() => expect(mockApi.createMachine).toHaveBeenCalledTimes(1));
    expect(mockApi.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My calories", fridge_id: "f1", trigger: draft.trigger, steps: draft.steps }),
    );
    expect(await screen.findByText("Kitchen Lab")).toBeTruthy(); // back on the list
  });

  test("a rejected save reports the validation errors instead of leaving the screen", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockApi.draftMachine.mockResolvedValue({ ok: true, draft });
    mockApi.createMachine.mockRejectedValue({ status: 422, body: { errors: ["step 2 is not allowed"] } });
    await render(<KitchenLab />);
    await openCompose();
    await fireEvent.changeText(screen.getByPlaceholderText(/Every Monday at 8am/), "calories daily");
    await fireEvent.press(screen.getByText(/Draft with AI/));
    await screen.findByText("Review Machine");

    await fireEvent.press(screen.getByText("Save Machine"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save", expect.any(String)));
    expect(screen.getByText("Review Machine")).toBeTruthy();
    alert.mockRestore();
  });

  test("turning on a Machine that shares a trigger with an enabled one asks before saving", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockApi.listMachines.mockResolvedValue([
      machine({ id: "a", name: "Already on", enabled: true }),
      machine({ id: "b", name: "Twin", enabled: false }),
    ]);
    mockApi.updateMachine.mockImplementation(async (id: string) => machine({ id, enabled: true }));
    await render(<KitchenLab />);
    await screen.findByText("Twin");

    // The list's toggle for the disabled twin is the second switch.
    const switches = screen.getAllByRole("switch");
    await fireEvent(switches[1], "valueChange", true);

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe("Possible duplicate");
    expect(mockApi.updateMachine).not.toHaveBeenCalled(); // nothing changed until confirmed
    alert.mockRestore();
  });

  test("an existing Machine can be moved to another fridge; only the fridge is sent", async () => {
    mockFridges = [{ id: "f1", name: "Home" }, { id: "f2", name: "Office" }];
    mockApi.listMachines.mockResolvedValue([machine({ id: "m1", name: "Morning check" })]);
    mockApi.updateMachine.mockImplementation(async (id: string, input: object) => machine({ id, ...input }));
    await render(<KitchenLab />);

    await fireEvent.press(await screen.findByText("Morning check"));
    await fireEvent.press(await screen.findByText("Office"));
    expect(screen.getByText(/runs will use this fridge/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Save Changes"));

    await waitFor(() => expect(mockApi.updateMachine).toHaveBeenCalledWith("m1", { fridge_id: "f2" }));
  });

  test("editing without changing the fridge sends no fridge", async () => {
    mockFridges = [{ id: "f1", name: "Home" }, { id: "f2", name: "Office" }];
    mockApi.listMachines.mockResolvedValue([machine({ id: "m1", name: "Morning check" })]);
    mockApi.updateMachine.mockImplementation(async (id: string, input: object) => machine({ id, ...input }));
    await render(<KitchenLab />);

    await fireEvent.press(await screen.findByText("Morning check"));
    await fireEvent.changeText(await screen.findByDisplayValue("Morning check"), "Breakfast check");
    await fireEvent.press(screen.getByText("Save Changes"));

    await waitFor(() => expect(mockApi.updateMachine).toHaveBeenCalledWith("m1", { name: "Breakfast check" }));
  });
});
