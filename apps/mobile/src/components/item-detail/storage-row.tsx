import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  type FlatItem,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";

import { useTheme } from "@/lib/theme";
import { ChipGroup } from "./chip-group";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

/**
 * Combines Location + Food Group behind one row: each chip tap patches immediately (so a
 * mis-tap is never unrecoverable), and Done only collapses - an accumulate-then-patch-on-
 * Done design was considered and rejected for exactly that reason.
 */
export function StorageRow({
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
  const { accent: AMBER, onAccent: CANVAS, faint: FAINT } = useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);

  const locationLabel = STORAGE_LOCATIONS.find((l) => l.key === (item.location ?? "fridge"))?.label ?? "Fridge";
  const categoryLabel = NUTRITION_CATEGORIES.find((c) => c.key === item.nutritionCategory)?.label;
  const summary = categoryLabel ? `${locationLabel} · ${categoryLabel}` : locationLabel;

  return (
    <ExpandableRow
      label="Storage"
      value={summary}
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
    >
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 6 }}>
        LOCATION
      </Text>
      <View style={{ marginBottom: 12 }}>
        <ChipGroup
          options={STORAGE_LOCATIONS.map((l) => ({ key: l.key, label: l.label }))}
          value={item.location ?? "fridge"}
          onChange={(key) => void save({ location: key as StorageLocation })}
        />
      </View>

      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 6 }}>
        FOOD GROUP
      </Text>
      <View style={{ marginBottom: 12 }}>
        <ChipGroup
          options={NUTRITION_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
          value={item.nutritionCategory ?? null}
          onChange={(key) =>
            void save({
              nutrition_category: item.nutritionCategory === key ? null : (key as NutritionCategory),
            })
          }
        />
      </View>

      <Pressable
        onPress={onToggle}
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
