"use client";

import { useState } from "react";
import { Check, ChefHat, Heart, Pencil, Play, Plus } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/lib/thatfridge/data";
import { getRecipesView } from "@/lib/thatfridge/selectors";
import { theme } from "@/lib/thatfridge/theme";
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
    isMine: false,
    ownerName: null,
    ownerUsername: null,
    attachments: [],
    ratioLabel: "",
    icon: "",
    ingredientsView: [],
    stepsView: [],
  };
  const categoryLabel = RECIPE_CATEGORIES.find((c) => c.key === selectedRecipe.category)?.label;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 60, background: theme.bg.surface, borderRadius: `${theme.radius.xl}px ${theme.radius.xl}px 0 0`, padding: "14px 22px 26px", animation: "pop .22s ease-out", display: "flex", flexDirection: "column" }}>
        <div onClick={actions.closeRecipeDetail} style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 16px", cursor: "pointer", flex: "none" }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, position: "relative" }}>
            <div style={{ width: 76, height: 76, background: theme.bg.surface2, borderRadius: theme.radius.lg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 44, height: 44 }}>
                <FoodIcon icon={selectedRecipe.icon} />
              </div>
            </div>
            <div style={{ position: "absolute", top: 0, right: "calc(50% - 66px)", display: "flex", gap: 6 }}>
              <div
                onClick={() => actions.toggleFavoriteRecipe(selectedRecipe.id)}
                title={selectedRecipe.isFavorite ? "Remove from favorites" : "Add to favorites"}
                style={{ width: 30, height: 30, borderRadius: 15, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Heart size={14} color={theme.text.primary} fill={selectedRecipe.isFavorite ? theme.amber : "none"} strokeWidth={2.2} />
              </div>
              {selectedRecipe.isMine && (
                <div
                  onClick={() => actions.openEditRecipeForm(selectedRecipe.id)}
                  title="Edit recipe"
                  style={{ width: 30, height: 30, borderRadius: 15, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Pencil size={14} color={theme.text.primary} strokeWidth={2.2} />
                </div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 19, fontWeight: 700, marginBottom: 2, color: theme.text.primary }}>{selectedRecipe.name}</div>
          {!selectedRecipe.isMine && selectedRecipe.isCustom && selectedRecipe.ownerUsername && (
            <div style={{ textAlign: "center", fontSize: 11.5, color: theme.text.faint, marginBottom: 4 }}>by @{selectedRecipe.ownerUsername}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: theme.text.faint }}>
              {selectedRecipe.minutes} min · {selectedRecipe.ratioLabel}
            </div>
            {categoryLabel && (
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, color: theme.blue, background: `${theme.blue}1a`, padding: "2px 8px", borderRadius: theme.radius.sm }}>
                {categoryLabel.toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>INGREDIENTS</div>
          <div style={{ background: theme.bg.surface2, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 20 }}>
            {selectedRecipe.ingredientsView.map((ing, i) => {
              const onShoppingList = state.shoppingList.some((si) => !si.checked && si.name.toLowerCase() === ing.name.toLowerCase());
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${theme.border.hairline}` }}>
                  <div
                    onClick={ing.have || onShoppingList ? undefined : () => actions.addPredictedToShopping(ing.name, ing.icon)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: theme.radius.sm,
                      background: onShoppingList ? theme.blue : ing.badgeBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      cursor: ing.have || onShoppingList ? "default" : "pointer",
                    }}
                  >
                    {ing.have || onShoppingList ? <Check size={12} color={theme.text.primary} strokeWidth={2.5} /> : <Plus size={12} color={theme.text.primary} strokeWidth={2.5} />}
                  </div>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: theme.text.primary }}>{ing.name}</div>
                  <div style={{ fontSize: 11.5, color: onShoppingList ? theme.blue : ing.badgeBg, fontWeight: 700 }}>
                    {onShoppingList ? "On list" : ing.statusLabel}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>STEPS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
            {selectedRecipe.stepsView.map((step) => (
              <div key={step.n} style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: theme.bg.surface2, color: theme.blue, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  {step.n}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: theme.text.primary }}>{step.text}</div>
              </div>
            ))}
          </div>

          <div
            onClick={() => actions.openMarkRecipeMade(selectedRecipe.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 13,
              borderRadius: theme.radius.md,
              background: theme.amber,
              color: "#0a0a0c",
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: theme.fontMono,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: "pointer",
              marginBottom: selectedRecipe.attachments.length > 0 ? 20 : 6,
            }}
          >
            <ChefHat size={15} strokeWidth={2.2} />
            Mark as made
          </div>

          {selectedRecipe.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>REFERENCE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedRecipe.attachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setViewingAttachment(att)}
                    style={{ position: "relative", width: 64, height: 64, borderRadius: theme.radius.sm, overflow: "hidden", background: "#000", cursor: "pointer" }}
                  >
                    {att.type === "video" ? (
                      <>
                        <video src={att.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
                          <Play size={18} color={theme.text.primary} fill={theme.text.primary} strokeWidth={0} />
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
