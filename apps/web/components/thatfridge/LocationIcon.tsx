"use client";

import { Archive, Refrigerator, Snowflake } from "lucide-react";
import type { StorageLocation } from "@/lib/thatfridge/types";

const LOCATION_ICONS: Record<StorageLocation, typeof Refrigerator> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Archive,
};

export default function LocationIcon({ location, size = 12, color, strokeWidth = 2.4 }: { location: StorageLocation; size?: number; color?: string; strokeWidth?: number }) {
  const Icon = LOCATION_ICONS[location];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
