jest.mock("@/lib/theme", () => ({
  useTheme: () => ({
    colors: { accent: "#26c6da", surface2: "#1a1a1f", ink: "#eee", canvas: "#0a0a0c", faint: "#888" },
  }),
}));

import { fireEvent, render } from "@testing-library/react-native";
import type { MachineStep, MachineTrigger } from "@thatfridge/core";
import { StepValuesEditor, TriggerValuesEditor } from "@/components/machine-editor";

describe("StepValuesEditor", () => {
  const step: MachineStep = { tool: "add_item", args: { name: "Bread", quantity: 2, calories: 250 } };

  test("changing a number reports it via the path", async () => {
    const onSetArg = jest.fn();
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={step} index={3} steps={[step]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.changeText(getByDisplayValue("250"), "300");

    expect(onSetArg).toHaveBeenCalledWith(3, ["calories"], 300);
  });

  test("a half-typed or non-numeric value never reaches onSetArg", async () => {
    const onSetArg = jest.fn();
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={step} index={0} steps={[step]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.changeText(getByDisplayValue("250"), "");
    await fireEvent.changeText(getByDisplayValue("2"), "abc");

    expect(onSetArg).not.toHaveBeenCalled();
  });

  test("quantity is integer-only, calories/decimals elsewhere aren't restricted", async () => {
    const onSetArg = jest.fn();
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={step} index={0} steps={[step]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.changeText(getByDisplayValue("2"), "2.5");
    expect(onSetArg).not.toHaveBeenCalled();
    // The box keeps the typed text until blur, so it's found by what's shown now.
    await fireEvent.changeText(getByDisplayValue("2.5"), "4");
    expect(onSetArg).toHaveBeenCalledWith(0, ["quantity"], 4);
  });

  test("editing text arguments", async () => {
    const onSetArg = jest.fn();
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={step} index={0} steps={[step]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.changeText(getByDisplayValue("Bread"), "Sourdough");

    expect(onSetArg).toHaveBeenCalledWith(0, ["name"], "Sourdough");
  });

  test("picking a location option", async () => {
    const onSetArg = jest.fn();
    const s: MachineStep = { tool: "add_item", args: { name: "Peas", location: "fridge" } };
    const { getByText } = await render(
      <StepValuesEditor step={s} index={0} steps={[s]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.press(getByText("freezer"));

    expect(onSetArg).toHaveBeenCalledWith(0, ["location"], "freezer");
  });

  test("edits nested bulk_add_items entries", async () => {
    const onSetArg = jest.fn();
    const s: MachineStep = { tool: "bulk_add_items", args: { items: [{ name: "Eggs", quantity: 6 }] } };
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={s} index={1} steps={[s]} onSetArg={onSetArg} onChangeSteps={jest.fn()} />,
    );

    await fireEvent.changeText(getByDisplayValue("6"), "12");

    expect(onSetArg).toHaveBeenCalledWith(1, ["items", 0, "quantity"], 12);
  });

  test("edits a step condition's number", async () => {
    const onChangeSteps = jest.fn();
    const steps: MachineStep[] = [
      { tool: "sum_item_field", args: { field: "calories" } },
      { tool: "notify_user", args: { message: "x" }, condition: { step: 1, op: "gt", value: 100 } },
    ];
    const { getByDisplayValue } = await render(
      <StepValuesEditor step={steps[1]} index={1} steps={steps} onSetArg={jest.fn()} onChangeSteps={onChangeSteps} />,
    );

    await fireEvent.changeText(getByDisplayValue("100"), "250");

    expect(onChangeSteps.mock.calls[0][0][1].condition.value).toBe(250);
  });
});

describe("TriggerValuesEditor", () => {
  test("editing a threshold's value", async () => {
    const onChange = jest.fn();
    const trigger: MachineTrigger = {
      type: "threshold",
      config: { field: "quantity", custom_field_label: null, unit: null, op: "lte", value: 5 },
    };
    const { getByDisplayValue } = await render(<TriggerValuesEditor trigger={trigger} onChange={onChange} />);

    await fireEvent.changeText(getByDisplayValue("5"), "2");

    expect(onChange.mock.calls[0][0].config.value).toBe(2);
  });

  test("a valid schedule time is applied, an invalid one is not", async () => {
    const onChange = jest.fn();
    const trigger: MachineTrigger = {
      type: "schedule",
      config: { frequency: "daily", time: "08:00", weekday: null, timezone: "UTC" },
    };
    const { getByDisplayValue } = await render(<TriggerValuesEditor trigger={trigger} onChange={onChange} />);

    await fireEvent.changeText(getByDisplayValue("08:00"), "25:00");
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.changeText(getByDisplayValue("25:00"), "18:30");
    expect(onChange.mock.calls[0][0].config.time).toBe("18:30");
  });

  test("weekly shows the day picker, daily doesn't", async () => {
    const weekly: MachineTrigger = {
      type: "schedule",
      config: { frequency: "weekly", time: "08:00", weekday: 1, timezone: "UTC" },
    };
    const onChange = jest.fn();
    const { queryByText, rerender, getByText } = await render(<TriggerValuesEditor trigger={weekly} onChange={onChange} />);
    expect(getByText("Wed")).toBeTruthy();

    await fireEvent.press(getByText("Wed"));
    expect(onChange.mock.calls[0][0].config.weekday).toBe(3);

    await rerender(
      <TriggerValuesEditor trigger={{ type: "schedule", config: { ...weekly.config, frequency: "daily", weekday: null } }} onChange={onChange} />,
    );
    expect(queryByText("Wed")).toBeNull();
  });
});
