import { Text, View } from "react-native";
import { Image } from "expo-image";

import { resolveFoodIcon } from "@thatfridge/core";

/**
 * Blocky pixel food icon — mirrors the web `FoodIcon`. Renders an AI-generated icon
 * (iconUrl), else one of the core pixel grids, else the name's initials.
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
  if (iconUrl) {
    return (
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center rounded-lg bg-canvas"
      >
        <Image
          source={{ uri: iconUrl }}
          style={{ width: size * 0.72, height: size * 0.72 }}
          contentFit="contain"
        />
      </View>
    );
  }

  const grid = resolveFoodIcon(icon, name);
  if (grid) {
    const cell = (size * 0.72) / grid.cols;
    return (
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center rounded-lg bg-canvas"
      >
        <View
          style={{
            width: cell * grid.cols,
            height: cell * grid.rows,
            flexDirection: "row",
            flexWrap: "wrap",
          }}
        >
          {grid.cells.map((hex, i) => (
            <View
              key={i}
              style={{ width: cell, height: cell, backgroundColor: hex ?? "transparent" }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-lg bg-canvas"
    >
      <Text className="text-[13px] font-bold text-muted">{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}
