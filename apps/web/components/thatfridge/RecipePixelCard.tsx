"use client";

import { useState } from "react";
import { CakeSlice, EggFried, Popcorn, Sandwich, Utensils, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react";
import { guessIcon } from "@/lib/thatfridge/data";
import { theme } from "@/lib/thatfridge/theme";
import type { RecipeCategory, RecipeSuggestion } from "@/lib/thatfridge/types";
import FoodIcon from "./FoodIcon";

const CATEGORY_STYLE: Record<RecipeCategory, { color: string; dark: string; label: string; Icon: LucideIcon }> = {
  breakfast: { color: theme.agent.chef, dark: "#8a5f14", label: "Breakfast", Icon: EggFried },
  lunch: { color: theme.agent.shopkeeper, dark: "#265c39", label: "Lunch", Icon: Sandwich },
  dinner: { color: theme.agent.organizer, dark: "#1c4571", label: "Dinner", Icon: UtensilsCrossed },
  dessert: { color: theme.agent.guardian, dark: "#7d2c1d", label: "Dessert", Icon: CakeSlice },
  snack: { color: "#7a5cb0", dark: "#4c3873", label: "Snack", Icon: Popcorn },
  quick: { color: "#b5702f", dark: "#74491d", label: "Quick meal", Icon: Zap },
};
const DEFAULT_STYLE = { color: theme.text.primary, dark: "#0d1f38", label: "Recipe", Icon: Utensils };

// A stepped/notched corner clip-path instead of border-radius - reads as a chunky pixel-art
// card die-cut rather than a smooth modern card, matching the "pixelated" ask.
const PIXEL_CLIP =
  "polygon(8px 0,calc(100% - 8px) 0,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0 calc(100% - 8px),0 8px)";

const faceStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: 4,
};

export default function RecipePixelCard({ suggestion }: { suggestion: RecipeSuggestion }) {
  const [flipped, setFlipped] = useState(false);
  const style = (suggestion.category && CATEGORY_STYLE[suggestion.category]) || DEFAULT_STYLE;
  const icon = guessIcon(suggestion.ingredients[0]?.name ?? "") || "leftovers";

  return (
    <div style={{ perspective: 1200, width: "100%", maxWidth: 220 }}>
      <div
        onClick={() => setFlipped((f) => !f)}
        role="button"
        aria-label={flipped ? "Show ingredients" : "Show steps"}
        style={{
          position: "relative",
          width: "100%",
          height: 300,
          cursor: "pointer",
          transformStyle: "preserve-3d",
          WebkitTransformStyle: "preserve-3d",
          transition: "transform .55s cubic-bezier(.4,.15,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT */}
        <div style={{ ...faceStyle, background: style.color, clipPath: PIXEL_CLIP }}>
          <div style={{ flex: 1, minHeight: 0, background: theme.bg.surface, clipPath: PIXEL_CLIP, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ background: style.color, color: theme.text.primary, padding: "6px 9px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flex: "none" }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggestion.name}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, background: "rgba(10,10,12,0.25)", padding: "2px 6px", borderRadius: 4, flex: "none" }}>{suggestion.minutes}m</div>
            </div>

            <div style={{ margin: 8, height: 86, flex: "none", background: theme.bg.surface2, border: `3px solid ${style.color}`, position: "relative" }}>
              <div style={{ position: "relative", width: "100%", height: "100%", padding: 14, boxSizing: "border-box" }}>
                <FoodIcon icon={icon} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, flex: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, color: theme.text.primary, background: style.color, padding: "3px 9px", borderRadius: 9, letterSpacing: 0.3 }}>
                <style.Icon size={10} strokeWidth={2.5} />
                {style.label.toUpperCase()}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px", display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: style.color, letterSpacing: 0.4, marginBottom: 2 }}>INGREDIENTS</div>
              {suggestion.ingredients.map((ing, i) => (
                <div key={i} style={{ fontSize: 10, color: theme.text.primary, display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 4, height: 4, background: style.color, flex: "none" }} />
                  {ing.name}
                </div>
              ))}
            </div>

            <div style={{ flex: "none", borderTop: `2px solid ${style.color}33`, padding: "6px 10px", fontSize: 9, fontStyle: "italic", color: theme.text.muted, lineHeight: 1.3 }}>
              {suggestion.description || "A tasty pick from your fridge."}
            </div>
            <div style={{ flex: "none", textAlign: "center", fontSize: 7.5, fontWeight: 700, color: style.color, letterSpacing: 0.3, padding: "0 0 6px" }}>TAP FOR STEPS →</div>
          </div>
        </div>

        {/* BACK */}
        <div style={{ ...faceStyle, background: style.color, clipPath: PIXEL_CLIP, transform: "rotateY(180deg)" }}>
          <div style={{ flex: 1, minHeight: 0, background: theme.bg.surface, clipPath: PIXEL_CLIP, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ background: style.color, color: theme.text.primary, padding: "8px 10px", fontSize: 11, fontWeight: 800, textAlign: "center", letterSpacing: 0.4, flex: "none" }}>
              HOW TO MAKE IT
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestion.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <div style={{ width: 15, height: 15, background: style.color, color: theme.text.primary, fontSize: 8.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 10, lineHeight: 1.4, color: theme.text.primary }}>{step}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: "none", textAlign: "center", fontSize: 7.5, fontWeight: 700, color: style.color, letterSpacing: 0.3, padding: "0 0 6px" }}>← TAP FOR INGREDIENTS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
