"use client";

import Image from "next/image";
import { FOOD_ICON_IMAGES } from "@/lib/thatfridge/data";
import { iconFor } from "@/lib/thatfridge/selectors";
import PixelIcon from "./PixelIcon";

export default function FoodIcon({ icon, iconUrl }: { icon: string; iconUrl?: string | null }) {
  if (iconUrl) {
    // AI-generated icons are force-downsampled server-side to the same tiny scale as the
    // curated set (see IconGenerationService::toPixelArt), so they get the same blocky
    // nearest-neighbor treatment here instead of a smooth scale.
    return <Image src={iconUrl} alt={icon} fill unoptimized style={{ objectFit: "contain", imageRendering: "pixelated" }} />;
  }

  const src = FOOD_ICON_IMAGES[icon];
  if (src) {
    // These source PNGs are tiny by design (~15x15px pixel art, meant to be scaled up
    // blocky). Next's default image optimizer resizes every <Image> through Sharp before it
    // reaches the browser, using smooth interpolation - that bakes blur in server-side, which
    // no amount of client-side `image-rendering: pixelated` can undo (it only governs how the
    // browser itself scales whatever it receives). Worse on high-DPR phones, since Next then
    // targets an even larger raster for the same tiny source. `unoptimized` serves the raw
    // file as-is so the browser does the (crisp, nearest-neighbor) upscale itself.
    return <Image src={src} alt={icon} fill unoptimized style={{ objectFit: "contain", imageRendering: "pixelated" }} />;
  }
  return <PixelIcon icon={iconFor(icon)} />;
}
