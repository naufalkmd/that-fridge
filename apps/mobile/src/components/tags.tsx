import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { type NutritionCategory, type StorageLocation } from "@thatfridge/core";

// other_extras keeps its hand-picked purple (no theme token). Icons mirror the food-group
// row on the Kitchen Score card.
const CATEGORY_META: Record<
  NutritionCategory,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string }
> = {
  protein: { icon: "food-drumstick", color: "#ff5f56" },
  vegetables: { icon: "carrot", color: "#39e07f" },
  fruit: { icon: "food-apple", color: "#f5a623" },
  grains: { icon: "barley", color: "#b5702f" },
  dairy: { icon: "cheese", color: "#3d6fe0" },
  other_extras: { icon: "food-variant", color: "#7a5cb0" },
};

export function CategoryTag({ category }: { category?: NutritionCategory | null }) {
  if (!category) return null;
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other_extras;
  return (
    <View style={{ padding: 3, borderRadius: 6, backgroundColor: `${meta.color}1a` }}>
      <MaterialCommunityIcons name={meta.icon} size={11} color={meta.color} />
    </View>
  );
}

const LOCATION_META: Record<
  StorageLocation,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string }
> = {
  fridge: { icon: "fridge-outline", color: "#2f6fb0", label: "Fridge" },
  freezer: { icon: "snowflake", color: "#3f5c85", label: "Freezer" },
  pantry: { icon: "archive-outline", color: "#b5702f", label: "Pantry" },
};

export function LocationTag({ location = "fridge" }: { location?: StorageLocation }) {
  const meta = LOCATION_META[location] ?? LOCATION_META.fridge;
  return (
    <View
      style={{
        padding: 3,
        borderRadius: 6,
        backgroundColor: `${meta.color}1a`,
      }}
    >
      <MaterialCommunityIcons name={meta.icon} size={11} color={meta.color} />
    </View>
  );
}

/** The "All Fridges" pill that opens the fridge-scope menu — used on Home, Inventory, Search. */
export function ScopePill({
  label,
  onPress,
  small,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: small ? 5 : 7,
        paddingHorizontal: small ? 10 : 12,
        borderRadius: 6,
        backgroundColor: small ? "#1a1a1f" : "#131316",
        borderWidth: small ? 0 : 1,
        borderColor: "rgba(255,255,255,0.09)",
      }}
    >
      <MaterialCommunityIcons name="fridge-outline" size={small ? 11 : 14} color={small ? "rgba(234,234,236,0.58)" : "#eaeaec"} />
      <Text
        style={{
          fontSize: small ? 11 : 12.5,
          fontWeight: "700",
          color: small ? "rgba(234,234,236,0.58)" : "#eaeaec",
        }}
      >
        {label}
      </Text>
      {!small && (
        <MaterialCommunityIcons name="chevron-down" size={14} color="#eaeaec" />
      )}
    </Pressable>
  );
}
