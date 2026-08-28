import { Text, View } from "react-native";
import { Image } from "expo-image";

import { foodIconFile, guessFoodIcon, resolveFoodIcon } from "@thatfridge/core";
import { FOOD_ICON_ASSETS } from "@/lib/food-icon-assets";

/**
 * Blocky pixel food icon — mirrors the web `FoodIcon`. Resolution order:
 * AI-generated (iconUrl) → the 164-icon pixel-art pack (by key, else guessed from the name) →
 * one of the hand-coded core grids → the name's initials.
 */
export function FoodIcon({
  icon,
  iconUrl,
  name,
  size = 40,
}: {
  icon?: string | null;
  iconUrl?: string | null;
  name: string;
  size?: number;
}) {
  const wrap = { width: size, height: size } as const;

  if (iconUrl) {
    return (
      <View style={wrap} className="items-center justify-center">
        <Image source={{ uri: iconUrl }} style={{ width: size * 0.78, height: size * 0.78 }} contentFit="contain" />
      </View>
    );
  }

  // Pixel-art pack: use the item's own key if it's a pack key, otherwise guess from the name
  // (covers items still stored with a generic/legacy key).
  const file = foodIconFile(icon) ?? foodIconFile(guessFoodIcon(name));
  if (file && FOOD_ICON_ASSETS[file]) {
    return (
      <View style={wrap} className="items-center justify-center">
        <Image source={FOOD_ICON_ASSETS[file]} style={{ width: size * 0.82, height: size * 0.82 }} contentFit="contain" />
      </View>
    );
  }

  const grid = resolveFoodIcon(icon, name);
  if (grid) {
    const cell = (size * 0.72) / grid.cols;
    return (
      <View style={wrap} className="items-center justify-center">
        <View style={{ width: cell * grid.cols, height: cell * grid.rows, flexDirection: "row", flexWrap: "wrap" }}>
          {grid.cells.map((hex, i) => (
            <View key={i} style={{ width: cell, height: cell, backgroundColor: hex ?? "transparent" }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={wrap} className="items-center justify-center">
      <Text className="text-[13px] font-bold text-muted">{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}
