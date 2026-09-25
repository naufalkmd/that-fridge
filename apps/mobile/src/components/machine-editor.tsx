import { useEffect, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import type { MachineStep, MachineTrigger } from "@thatfridge/core";
import { useTheme } from "@/lib/theme";
import {
  ARG_OPTIONS,
  INTEGER_KEYS,
  OP_OPTIONS,
  isValidTime,
  parseNumber,
  patchTrigger,
  setStepCondition,
  type ArgPath,
} from "@/lib/machineEdit";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyKey(key: string | number): string {
  return typeof key === "number" ? `#${key + 1}` : key.replace(/_/g, " ");
}

function Label({ children }: { children: string }) {
  return <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint">{children}</Text>;
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (key: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            className="rounded-md px-2.5 py-1.5"
            style={{ backgroundColor: active ? colors.accent : colors.surface2 }}
          >
            <Text className="text-[12px] font-bold" style={{ color: active ? colors.canvas : colors.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Keeps its own text while typing ("1." or "" are valid mid-edit states) and only reports a
 *  value upward once it parses as a number - so a half-typed value never clobbers the last
 *  good one, and the box snaps back to it on blur. */
export function NumberField({
  value,
  onCommit,
  integer,
}: {
  value: number;
  onCommit: (n: number) => void;
  integer?: boolean;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((prev) => (parseNumber(prev, { integer }) === value ? prev : String(value)));
  }, [value, integer]);

  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const n = parseNumber(t, { integer });
        if (n !== null) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
      keyboardType={integer ? "number-pad" : "decimal-pad"}
      placeholderTextColor={colors.faint}
      className="rounded-md border border-hairline bg-canvas px-3 py-2 text-[13.5px] text-ink"
    />
  );
}

function TextField({ value, onCommit, multiline }: { value: string; onCommit: (s: string) => void; multiline?: boolean }) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onCommit}
      multiline={multiline}
      placeholderTextColor={colors.faint}
      autoCapitalize="none"
      className="rounded-md border border-hairline bg-canvas px-3 py-2 text-[13.5px] text-ink"
      style={multiline ? { minHeight: 60, textAlignVertical: "top" } : undefined}
    />
  );
}

/** Edits one argument value of any shape a Machine step's args can take - numbers, text,
 *  on/off flags, closed-list options, and nested objects/arrays (bulk_add_items' `items`) -
 *  recursing with the path so a single onSet can write it back immutably. */
function ArgEditor({
  name,
  value,
  path,
  onSet,
}: {
  name: string | number;
  value: unknown;
  path: ArgPath;
  onSet: (path: ArgPath, value: unknown) => void;
}) {
  const key = typeof name === "string" ? name : null;

  if (Array.isArray(value)) {
    return (
      <View className="gap-2">
        <Label>{prettyKey(name)}</Label>
        {value.map((entry, i) => (
          <View key={i} className="gap-2 rounded-lg border border-hairline p-2.5">
            <ArgEditor name={i} value={entry} path={[...path, i]} onSet={onSet} />
          </View>
        ))}
      </View>
    );
  }

  if (value !== null && typeof value === "object") {
    return (
      <View className="gap-2">
        {typeof name === "string" && <Label>{prettyKey(name)}</Label>}
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <ArgEditor key={k} name={k} value={v} path={[...path, k]} onSet={onSet} />
        ))}
      </View>
    );
  }

  if (typeof value === "number") {
    return (
      <View className="gap-1">
        <Label>{prettyKey(name)}</Label>
        <NumberField value={value} integer={key !== null && INTEGER_KEYS.has(key)} onCommit={(n) => onSet(path, n)} />
      </View>
    );
  }

  if (typeof value === "boolean") {
    return (
      <View className="flex-row items-center justify-between">
        <Label>{prettyKey(name)}</Label>
        <Switch value={value} onValueChange={(v) => onSet(path, v)} />
      </View>
    );
  }

  if (typeof value === "string") {
    const options = key ? ARG_OPTIONS[key] : undefined;
    return (
      <View className="gap-1">
        <Label>{prettyKey(name)}</Label>
        {options ? (
          <Chips options={options.map((o) => ({ key: o, label: o }))} value={value} onChange={(o) => onSet(path, o)} />
        ) : (
          <TextField value={value} onCommit={(s) => onSet(path, s)} multiline={key === "message" || key === "text"} />
        )}
      </View>
    );
  }

  return null;
}

/** Editable values for one step: every argument it carries, plus - when it has one - the
 *  "only if" condition's operator and number. The tool itself and which earlier step a
 *  condition/placeholder points at stay fixed: those change what the Machine *is*, not a value
 *  in it, and redrafting is the path for that. */
export function StepValuesEditor({
  step,
  index,
  steps,
  onSetArg,
  onChangeSteps,
}: {
  step: MachineStep;
  index: number;
  steps: MachineStep[];
  onSetArg: (stepIndex: number, path: ArgPath, value: unknown) => void;
  onChangeSteps: (steps: MachineStep[]) => void;
}) {
  const entries = Object.entries(step.args);
  return (
    <View className="gap-3 pt-2">
      {entries.length === 0 && !step.condition && (
        <Text className="text-[12px] text-faint">Nothing to edit on this step.</Text>
      )}
      {entries.map(([k, v]) => (
        <ArgEditor key={k} name={k} value={v} path={[k]} onSet={(path, value) => onSetArg(index, path, value)} />
      ))}
      {step.condition && (
        <View className="gap-2 rounded-lg border border-hairline p-2.5">
          <Label>{`Only if step ${step.condition.step}'s total is`}</Label>
          <Chips
            options={OP_OPTIONS}
            value={step.condition.op}
            onChange={(op) => onChangeSteps(setStepCondition(steps, index, { op }))}
          />
          <NumberField
            value={step.condition.value}
            onCommit={(n) => onChangeSteps(setStepCondition(steps, index, { value: n }))}
          />
        </View>
      )}
    </View>
  );
}

/** Editable trigger values, per trigger type. Goes through patchTrigger so fields that only
 *  make sense together (weekday/daily, unit/weight, label/custom) stay consistent. */
export function TriggerValuesEditor({
  trigger,
  onChange,
}: {
  trigger: MachineTrigger;
  onChange: (trigger: MachineTrigger) => void;
}) {
  const [timeText, setTimeText] = useState(trigger.type === "schedule" ? trigger.config.time : "");
  const patch = (p: Record<string, unknown>) => onChange(patchTrigger(trigger, p));

  if (trigger.type === "schedule") {
    const { frequency, weekday, time } = trigger.config;
    const timeOk = isValidTime(timeText);
    return (
      <View className="gap-3 pt-2">
        <View className="gap-1">
          <Label>Repeats</Label>
          <Chips
            options={[
              { key: "daily" as const, label: "Every day" },
              { key: "weekly" as const, label: "Every week" },
            ]}
            value={frequency}
            onChange={(f) => patch({ frequency: f })}
          />
        </View>
        {frequency === "weekly" && (
          <View className="gap-1">
            <Label>Day</Label>
            <Chips
              options={WEEKDAYS.map((d, i) => ({ key: i, label: d }))}
              value={weekday}
              onChange={(d) => patch({ weekday: d })}
            />
          </View>
        )}
        <View className="gap-1">
          <Label>Time (24h, HH:MM)</Label>
          <TextInput
            value={timeText}
            onChangeText={(t) => {
              setTimeText(t);
              if (isValidTime(t)) patch({ time: t });
            }}
            onBlur={() => setTimeText(time)}
            placeholder="08:00"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            className="rounded-md border bg-canvas px-3 py-2 text-[13.5px] text-ink"
            style={{ borderColor: timeOk ? undefined : "#ff5567" }}
          />
          {!timeOk && <Text className="text-[11px] text-bad">Use 24-hour HH:MM, like 08:00 or 18:30.</Text>}
        </View>
      </View>
    );
  }

  if (trigger.type === "threshold") {
    const { field, op, value, unit, custom_field_label } = trigger.config;
    return (
      <View className="gap-3 pt-2">
        <View className="gap-1">
          <Label>Watch</Label>
          <Chips
            options={ARG_OPTIONS.field.map((f) => ({ key: f, label: f }))}
            value={field}
            onChange={(f) => patch({ field: f })}
          />
        </View>
        {field === "custom" && (
          <View className="gap-1">
            <Label>Custom field label</Label>
            <TextField value={custom_field_label ?? ""} onCommit={(s) => patch({ custom_field_label: s })} />
          </View>
        )}
        {field === "weight" && (
          <View className="gap-1">
            <Label>Unit</Label>
            <Chips
              options={ARG_OPTIONS.unit.map((u) => ({ key: u, label: u }))}
              value={unit}
              onChange={(u) => patch({ unit: u })}
            />
          </View>
        )}
        <View className="gap-1">
          <Label>Fires when the total is</Label>
          <Chips options={OP_OPTIONS} value={op} onChange={(o) => patch({ op: o })} />
        </View>
        <View className="gap-1">
          <Label>Value</Label>
          <NumberField value={value} onCommit={(n) => patch({ value: n })} />
        </View>
      </View>
    );
  }

  if (trigger.type === "item_added") {
    const { search, location } = trigger.config;
    return (
      <View className="gap-3 pt-2">
        <View className="gap-1">
          <Label>Item name contains (blank = any item)</Label>
          <TextField value={search ?? ""} onCommit={(s) => patch({ search: s })} />
        </View>
        <View className="gap-1">
          <Label>Added to</Label>
          <Chips
            options={[
              { key: "any", label: "Anywhere" },
              ...ARG_OPTIONS.location.map((l) => ({ key: l, label: l })),
            ]}
            value={location ?? "any"}
            onChange={(l) => patch({ location: l === "any" ? null : l })}
          />
        </View>
      </View>
    );
  }

  return (
    <Text className="pt-2 text-[12px] text-faint">
      This trigger fires on any recipe you mark made - there's nothing to edit.
    </Text>
  );
}
