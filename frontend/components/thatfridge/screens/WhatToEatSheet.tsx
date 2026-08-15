"use client";

import { ChefHat } from "lucide-react";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";
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
    borderRadius: 14,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    background: active ? "#16325c" : "#fff",
    color: active ? "#fff" : "#16325c",
    boxShadow: "0 4px 10px rgba(22,50,92,0.08)",
  };
}

export default function WhatToEatSheet() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.whatToEatOpen) return null;

  const hasResults = state.whatToEatResults !== null;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(22,50,92,0.32)", zIndex: 10 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: 60,
          background: "#fff",
          borderRadius: "28px 28px 0 0",
          padding: "14px 22px 26px",
          animation: "pop .22s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          onClick={actions.closeWhatToEat}
          style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flex: "none" }}>
          <ChefHat size={18} color="#16325c" strokeWidth={2.2} />
          <div style={{ fontSize: 18, fontWeight: 700 }}>What should I eat?</div>
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.5)", marginBottom: 16, flex: "none" }}>
          Pick what sounds good and I&apos;ll pull matches from your own saved recipes.
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>MEAL TYPE</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 2 }}>
            {MEAL_TYPES.map((opt) => (
              <div key={opt.key} onClick={() => actions.toggleWhatToEatMealType(opt.key)} style={chipStyle(state.whatToEatMealType === opt.key)}>
                {opt.label}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>VIBES</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {VIBES.map((opt) => (
              <div key={opt.key} onClick={() => actions.toggleWhatToEatVibe(opt.key)} style={chipStyle(state.whatToEatVibes.includes(opt.key))}>
                {opt.label}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>FOOD FOCUS</div>
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
              borderRadius: 14,
              background: state.whatToEatLoading ? "rgba(22,50,92,0.25)" : "#16325c",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: state.whatToEatLoading ? "default" : "pointer",
              marginBottom: 18,
            }}
          >
            {state.whatToEatLoading ? "Finding meals…" : "Find meals"}
          </div>

          {hasResults && (
            <div>
              {state.whatToEatRelaxed && !state.whatToEatExhausted && (
                <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)", marginBottom: 10, fontStyle: "italic" }}>
                  No exact match, but here&apos;s something close to what you picked.
                </div>
              )}

              {state.whatToEatExhausted ? (
                <div style={{ textAlign: "center", padding: "18px 10px" }}>
                  <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.55)", marginBottom: 12, lineHeight: 1.4 }}>
                    Nothing in your saved recipes matches that combination yet.
                  </div>
                  <div
                    onClick={actions.askChefInstead}
                    style={{ display: "inline-block", padding: "11px 20px", borderRadius: 14, background: "#16325c", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Ask Chef instead
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {state.whatToEatResults?.map((recipe) => (
                    <div
                      key={recipe.id}
                      onClick={() => actions.openRecipeDetail(recipe.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        background: "#eaf6ff",
                        borderRadius: 16,
                        padding: "10px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ position: "relative", width: 32, height: 32, flex: "none" }}>
                        <FoodIcon icon={recipe.ingredients[0]?.icon ?? "leftovers"} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipe.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(22,50,92,0.5)" }}>{recipe.minutes} min</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
