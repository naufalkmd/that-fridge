import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { WEIGHT_UNITS, type FlatItem, type WeightUnit } from "@thatfridge/core";

import { useTheme } from "@/lib/theme";
import { ChipGroup } from "./chip-group";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

export function WeightRow({
  item,
  open,
  onToggle,
  isLast,
}: {
  item: FlatItem;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { accent: AMBER, onAccent: CANVAS, hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT } =
    useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);
  const [amountDraft, setAmountDraft] = useState(item.weight != null ? String(item.weight) : "");
  const [unitDraft, setUnitDraft] = useState<WeightUnit>(item.weightUnit ?? "g");

  // Weight and its unit are both held as local draft state and committed together on Done,
  // not on blur like Note/Shop Link - tapping a unit chip blurs the amount input first, so
  // blur-commit would collapse the row before the unit choice ever registered.
  useEffect(() => {
    if (open) {
      setAmountDraft(item.weight != null ? String(item.weight) : "");
      setUnitDraft(item.weightUnit ?? "g");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function done() {
    const trimmed = amountDraft.trim();
    const amount = trimmed ? Number(trimmed) : null;
    void save(
      amount === null || !Number.isFinite(amount)
        ? { weight: null, weight_unit: null }
        : { weight: amount, weight_unit: unitDraft },
      { then: onToggle },
    );
  }

  return (
    <ExpandableRow
      label="Weight"
      value={item.weight != null ? `${item.weight} ${item.weightUnit}` : undefined}
      placeholder="Add weight"
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <TextInput
          value={amountDraft}
          onChangeText={setAmountDraft}
          placeholder="0"
          placeholderTextColor={FAINT}
          keyboardType="decimal-pad"
          style={{
            width: 72,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            fontWeight: "600",
            color: INK,
          }}
        />
        <View style={{ flex: 1 }}>
          <ChipGroup
            options={WEIGHT_UNITS.map((u) => ({ key: u.key, label: u.label, group: u.group }))}
            value={unitDraft}
            onChange={(key) => setUnitDraft(key as WeightUnit)}
          />
        </View>
      </View>

      <Pressable
        onPress={done}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 9,
          borderRadius: 6,
          backgroundColor: AMBER,
        }}
      >
        <MaterialCommunityIcons name="check" size={13} color={CANVAS} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: CANVAS }}>Done</Text>
      </Pressable>
    </ExpandableRow>
  );
}
