"use client";

import { ChefHat, Shuffle } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";
import type { Recipe } from "@/lib/thatfridge/types";
import type { FoodFocus, MealType, Vibe } from "@/lib/thatfridge/types";

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

const VIBES: { key: Vibe; label: string }[] = [
  { key: "comfort", label: "Comfort" },
  { key: "light_fresh", label: "Light & Fresh" },
  { key: "quick_easy", label: "Quick & Easy" },
  { key: "something_new", label: "Something New" },
  { key: "use_it_up", label: "Use It Up" },
];

const FOOD_FOCUS: { key: FoodFocus; label: string }[] = [
  { key: "high_protein", label: "High Protein" },
  { key: "high_veg", label: "High Veg" },
  { key: "low_carb", label: "Low Carb" },
  { key: "balanced", label: "Balanced" },
];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    flex: "none",
    whiteSpace: "nowrap",
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    background: active ? theme.amber : theme.bg.surface2,
    color: active ? "#0a0a0c" : theme.text.primary,
  };
}

// Shared by the "exact" and "similar" tiers - each pages through its own pre-shuffled list of
// results 3 at a time via its own Shuffle button, so a thin "exact" list doesn't have to be the
// only thing on screen: "similar" gets the exact same treatment right below it.
function ResultsTier({
  label,
  results,
  page,
  onShuffle,
  onOpenRecipe,
}: {
  label: string;
  results: Recipe[];
  page: number;
  onShuffle: () => void;
  onOpenRecipe: (id: string) => void;
}) {
  if (results.length === 0) return null;
  const visible = results.slice(page * 3, page * 3 + 3);
  const canShuffle = results.length > 3;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: canShuffle ? 10 : 0 }}>
        {visible.map((recipe) => (
          <div
            key={recipe.id}
            onClick={() => onOpenRecipe(recipe.id)}
            style={{ display: "flex", alignItems: "center", gap: 12, background: theme.bg.surface2, borderRadius: theme.radius.md, padding: "10px 14px", cursor: "pointer" }}
          >
            <div style={{ position: "relative", width: 32, height: 32, flex: "none" }}>
              <FoodIcon icon={recipe.ingredients[0]?.icon ?? "leftovers"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.text.primary }}>{recipe.name}</div>
              <div style={{ fontSize: 11, color: theme.text.faint }}>{recipe.minutes} min</div>
            </div>
          </div>
        ))}
      </div>

      {canShuffle && (
        <div
          onClick={onShuffle}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 11,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.border.strong}`,
            color: theme.text.primary,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Shuffle size={14} strokeWidth={2.4} />
          Not feeling these? Shuffle
        </div>
      )}
    </div>
  );
}

export default function WhatToEatSheet() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.whatToEatOpen) return null;

  const hasResults = state.whatToEatExact !== null;
  const exact = state.whatToEatExact ?? [];
  const similar = state.whatToEatSimilar ?? [];

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: 60,
          background: theme.bg.surface,
          borderRadius: `${theme.radius.xl}px ${theme.radius.xl}px 0 0`,
          padding: "14px 22px 26px",
          animation: "pop .22s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          onClick={actions.closeWhatToEat}
          style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flex: "none" }}>
          <ChefHat size={18} color={theme.text.primary} strokeWidth={2.2} />
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 700, fontSize: 14, color: theme.text.primary }}>What should I eat?</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 18, flex: "none" }}>
          <div style={{ position: "relative", width: 56, height: 56, flex: "none", animation: "chefWalkIn .5s ease-out, bounce 2.2s ease-in-out .5s infinite" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel-art GIF, unoptimized like FoodIcon's sprites (Next's optimizer would flatten the animation to a single frame) */}
            <img src="/images/thatfridge/chef.gif" alt="Chef" style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated" }} />
          </div>
          <div
            style={{
              position: "relative",
              background: theme.bg.surface2,
              borderRadius: "14px 14px 14px 4px",
              padding: "9px 13px",
              fontSize: 12.5,
              fontWeight: 600,
              color: theme.text.primary,
              marginBottom: 6,
            }}
          >
            What are the vibes today?
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>MEAL TYPE</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 2 }}>
            {MEAL_TYPES.map((opt) => (
              <div key={opt.key} onClick={() => actions.toggleWhatToEatMealType(opt.key)} style={chipStyle(state.whatToEatMealType === opt.key)}>
                {opt.label}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>VIBES</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {VIBES.map((opt) => (
              <div key={opt.key} onClick={() => actions.toggleWhatToEatVibe(opt.key)} style={chipStyle(state.whatToEatVibes.includes(opt.key))}>
                {opt.label}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>FOOD FOCUS</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {FOOD_FOCUS.map((opt) => (
              <div key={opt.key} onClick={() => actions.toggleWhatToEatFoodFocus(opt.key)} style={chipStyle(state.whatToEatFoodFocus.includes(opt.key))}>
                {opt.label}
              </div>
            ))}
          </div>

          <div
            onClick={state.whatToEatLoading ? undefined : actions.findMeals}
            style={{
              textAlign: "center",
              padding: 13,
              borderRadius: theme.radius.md,
              background: state.whatToEatLoading ? theme.bg.surface2 : theme.amber,
              color: state.whatToEatLoading ? theme.text.faint : "#0a0a0c",
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: theme.fontMono,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: state.whatToEatLoading ? "default" : "pointer",
              marginBottom: 18,
            }}
          >
            {state.whatToEatLoading ? "Finding meals…" : "Find meals"}
          </div>

          {hasResults && (
            <div>
              {state.whatToEatExhausted ? (
                <div style={{ textAlign: "center", padding: "18px 10px" }}>
                  <div style={{ fontSize: 12.5, color: theme.text.muted, marginBottom: 12, lineHeight: 1.4 }}>
                    Nothing in your saved recipes matches that combination yet.
                  </div>
                  <div
                    onClick={actions.askChefInstead}
                    style={{ display: "inline-block", padding: "11px 20px", borderRadius: theme.radius.md, background: theme.amber, color: "#0a0a0c", fontSize: 13, fontWeight: 700, fontFamily: theme.fontMono, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer" }}
                  >
                    Ask Chef instead
                  </div>
                </div>
              ) : (
                <>
                  <ResultsTier
                    label="EXACT MATCHES"
                    results={exact}
                    page={state.whatToEatExactPage}
                    onShuffle={() => actions.shuffleMeals("exact")}
                    onOpenRecipe={actions.openRecipeDetail}
                  />
                  <ResultsTier
                    label="SIMILAR MATCHES"
                    results={similar}
                    page={state.whatToEatSimilarPage}
                    onShuffle={() => actions.shuffleMeals("similar")}
                    onOpenRecipe={actions.openRecipeDetail}
                  />

                  {/* Escape hatch even when there ARE results, in case none of them (or none of
                      the shuffled batches, in either tier) actually sound good. */}
                  <div style={{ textAlign: "center", padding: "18px 10px 4px" }}>
                    <div style={{ fontSize: 11.5, color: theme.text.faint, marginBottom: 10 }}>
                      Still nothing to your liking? Let&apos;s find something.
                    </div>
                    <div
                      onClick={actions.askChefInstead}
                      style={{
                        display: "inline-block",
                        padding: "10px 18px",
                        borderRadius: theme.radius.md,
                        background: "transparent",
                        border: `1px solid ${theme.border.strong}`,
                        color: theme.text.primary,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Ask Chef instead
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
