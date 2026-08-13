"use client";

import { useState } from "react";
import { Check, Heart, Pencil, Play, Plus } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/lib/thatfridge/data";
import { getRecipesView } from "@/lib/thatfridge/selectors";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import AttachmentLightbox from "../AttachmentLightbox";
import FoodIcon from "../FoodIcon";
import type { RecipeAttachment } from "@/lib/thatfridge/types";

export default function RecipeDetailSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [viewingAttachment, setViewingAttachment] = useState<RecipeAttachment | null>(null);
  const recipesView = getRecipesView(state);
  const selectedRecipe = recipesView.find((r) => r.id === state.selectedRecipeId) || {
    id: "",
    name: "",
    minutes: 0,
    category: null,
    isFavorite: false,
    isCustom: false,
    attachments: [],
    ratioLabel: "",
    icon: "",
    ingredientsView: [],
    stepsView: [],
  };
  const categoryLabel = RECIPE_CATEGORIES.find((c) => c.key === selectedRecipe.category)?.label;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(22,50,92,0.32)", zIndex: 10 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 60, background: "#fff", borderRadius: "28px 28px 0 0", padding: "14px 22px 26px", animation: "pop .22s ease-out", display: "flex", flexDirection: "column" }}>
        <div onClick={actions.closeRecipeDetail} style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 16px", cursor: "pointer", flex: "none" }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, position: "relative" }}>
            <div style={{ width: 76, height: 76, background: "#eaf6ff", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 44, height: 44 }}>
                <FoodIcon icon={selectedRecipe.icon} />
              </div>
            </div>
            <div style={{ position: "absolute", top: 0, right: "calc(50% - 66px)", display: "flex", gap: 6 }}>
              <div
                onClick={() => actions.toggleFavoriteRecipe(selectedRecipe.id)}
                title={selectedRecipe.isFavorite ? "Remove from favorites" : "Add to favorites"}
                style={{ width: 30, height: 30, borderRadius: 15, background: "#16325c", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Heart size={14} color="#fff" fill={selectedRecipe.isFavorite ? "#fff" : "none"} strokeWidth={2.2} />
              </div>
              {selectedRecipe.isCustom && (
                <div
                  onClick={() => actions.openEditRecipeForm(selectedRecipe.id)}
                  title="Edit recipe"
                  style={{ width: 30, height: 30, borderRadius: 15, background: "#16325c", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Pencil size={14} color="#fff" strokeWidth={2.2} />
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 19, fontWeight: 700, marginBottom: 2 }}>{selectedRecipe.name}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.45)" }}>
              {selectedRecipe.minutes} min · {selectedRecipe.ratioLabel}
            </div>
            {categoryLabel && (
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, color: "#2f6fb0", background: "#2f6fb01a", padding: "2px 8px", borderRadius: 8 }}>
                {categoryLabel.toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>INGREDIENTS</div>
          <div style={{ background: "#eaf6ff", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
            {selectedRecipe.ingredientsView.map((ing, i) => {
              const onShoppingList = state.shoppingList.some((si) => !si.checked && si.name.toLowerCase() === ing.name.toLowerCase());
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(22,50,92,0.06)" }}>
                  <div
                    onClick={ing.have || onShoppingList ? undefined : () => actions.addPredictedToShopping(ing.name, ing.icon)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: onShoppingList ? "#2f6fb0" : ing.badgeBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      cursor: ing.have || onShoppingList ? "default" : "pointer",
                    }}
                  >
                    {ing.have || onShoppingList ? <Check size={12} color="#fff" strokeWidth={2.5} /> : <Plus size={12} color="#fff" strokeWidth={2.5} />}
                  </div>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{ing.name}</div>
                  <div style={{ fontSize: 11.5, color: onShoppingList ? "#2f6fb0" : ing.badgeBg, fontWeight: 700 }}>
                    {onShoppingList ? "On list" : ing.statusLabel}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>STEPS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
            {selectedRecipe.stepsView.map((step) => (
              <div key={step.n} style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: "#eaf6ff", color: "#2f6fb0", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  {step.n}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#16325c" }}>{step.text}</div>
              </div>
            ))}
          </div>

          {selectedRecipe.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>REFERENCE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedRecipe.attachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setViewingAttachment(att)}
                    style={{ position: "relative", width: 64, height: 64, borderRadius: 12, overflow: "hidden", background: "#000", cursor: "pointer" }}
                  >
                    {att.type === "video" ? (
                      <>
                        <video src={att.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                          <Play size={18} color="#fff" fill="#fff" strokeWidth={0} />
                        </div>
                      </>
                    ) : (
                      <img src={att.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <AttachmentLightbox attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />
    </div>
  );
}
