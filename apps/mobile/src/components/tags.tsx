import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { NUTRITION_CATEGORIES, type NutritionCategory, type StorageLocation } from "@thatfridge/core";

// Mirrors apps/web CategoryTag — other_extras keeps its hand-picked purple (no theme token).
const CATEGORY_COLOR: Record<NutritionCategory, string> = {
  protein: "#ff5f56",
  vegetables: "#39e07f",
  fruit: "#f5a623",
  grains: "#b5702f",
  dairy: "#3d6fe0",
  other_extras: "#7a5cb0",
};

const CAT_LABEL = Object.fromEntries(NUTRITION_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  NutritionCategory,
  string
>;

export function CategoryTag({ category }: { category?: NutritionCategory | null }) {
  if (!category) return null;
  const color = CATEGORY_COLOR[category];
  return (
    <View
      style={{
        backgroundColor: `${color}1a`,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
      }}
    >
      <Text style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 0.2, color }}>
        {CAT_LABEL[category] ?? category}
      </Text>
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
