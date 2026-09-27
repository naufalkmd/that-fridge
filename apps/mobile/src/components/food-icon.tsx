import { View } from "react-native";
import { Image } from "expo-image";

import { foodIconFile, guessFoodIcon } from "@thatfridge/core";
import { FOOD_ICON_ASSETS } from "@/lib/food-icon-assets";
import { PixelText } from "@/components/brand";

/**
 * Blocky pixel food icon — mirrors the web `FoodIcon`. Resolution order:
 * AI-generated (iconUrl) → the 164-icon pixel-art pack (by key, else guessed from the name) →
 * a few display-only stopgaps → the name's initials. (The old hand-coded grids are gone: their
 * loose keywords drew peanut butter as a block of cheese.)
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

  // Stopgap until the pack has them: spreads show the jar icon. Display only - the item's saved
  // icon key and food group are untouched (the jar is the pack's sour cream, which counts as dairy).
  const alias = DISPLAY_ALIASES.find(([re]) => re.test(name))?.[1];
  if (alias && FOOD_ICON_ASSETS[alias]) {
    return (
      <View style={wrap} className="items-center justify-center">
        <Image source={FOOD_ICON_ASSETS[alias]} style={{ width: size * 0.82, height: size * 0.82 }} contentFit="contain" />
      </View>
    );
  }

  // No icon yet: the name's initials in the pixel font, so it reads as "not drawn yet" rather
  // than as some other food. These names land on the admin "Items with no icon" list.
  return (
    <View style={wrap} className="items-center justify-center">
      <PixelText style={{ fontSize: Math.max(9, Math.round(size * 0.3)), color: MUTED_INITIALS }}>{initials(name)}</PixelText>
    </View>
  );
}

const DISPLAY_ALIASES: [RegExp, string][] = [
  [/\b(peanut butter|butter|jam|jelly|marmalade|nutella|kaya|spread)\b/i, "icon-005.png"],
];

const MUTED_INITIALS = "#8a8a90";

/** "Peanut Butter" -> "PB", "Rambutan" -> "RA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const two = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return two.toUpperCase();
}
