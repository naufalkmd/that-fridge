"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/lib/thatfridge/data";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import type { RecipeCategory } from "@/lib/thatfridge/types";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: "rgba(22,50,92,0.5)",
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "#eaf6ff",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13.5,
  color: "#16325c",
  boxSizing: "border-box",
};

export default function RecipeFormSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isEditing = !!state.recipeFormId;

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
          onClick={actions.closeRecipeForm}
          style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, flex: "none" }}>{isEditing ? "Edit recipe" : "New recipe"}</div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>NAME</div>
            <input
              autoFocus
              value={state.recipeFormName}
              onChange={(e) => actions.onRecipeFormNameChange(e.target.value)}
              placeholder="e.g. Sunday Pancakes"
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>CATEGORY</div>
              <select
                value={state.recipeFormCategory ?? ""}
                onChange={(e) => actions.onRecipeFormCategoryChange((e.target.value || null) as RecipeCategory | null)}
                style={{ ...fieldStyle, appearance: "none" }}
              >
                <option value="">None</option>
                {RECIPE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <div style={labelStyle}>MINUTES</div>
              <input
                type="number"
                min={1}
                max={1440}
                value={state.recipeFormMinutes}
                onChange={(e) => actions.onRecipeFormMinutesChange(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>INGREDIENTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.recipeFormIngredients.map((ing, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={ing.name}
                    onChange={(e) => actions.onRecipeFormIngredientNameChange(i, e.target.value)}
                    placeholder="e.g. Eggs"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <div
                    onClick={() => actions.removeRecipeFormIngredient(i)}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "#fdf1ee", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Minus size={15} color="#c1452e" strokeWidth={2.4} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.addRecipeFormIngredient}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#2f6fb0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", width: "fit-content" }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Add ingredient
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>STEPS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.recipeFormSteps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: "#eaf6ff", color: "#2f6fb0", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    {i + 1}
                  </div>
                  <input
                    value={step}
                    onChange={(e) => actions.onRecipeFormStepChange(i, e.target.value)}
                    placeholder="Describe this step"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <div
                    onClick={() => actions.removeRecipeFormStep(i)}
                    style={{ width: 34, height: 34, borderRadius: 10, background: "#fdf1ee", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Minus size={15} color="#c1452e" strokeWidth={2.4} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.addRecipeFormStep}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#2f6fb0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", width: "fit-content" }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Add step
            </div>
          </div>

          {isEditing && (
            <div style={{ marginTop: 12 }}>
              {!confirmingDelete ? (
                <div
                  onClick={() => setConfirmingDelete(true)}
                  style={{ textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(193,69,46,0.25)", color: "#c1452e", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  Delete recipe
                </div>
              ) : (
                <div style={{ borderRadius: 14, padding: 14, background: "#fdf1ee", border: "1px solid rgba(193,69,46,0.25)" }}>
                  <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.7)", marginBottom: 10 }}>Delete this recipe? This can&apos;t be undone.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div
                      onClick={() => setConfirmingDelete(false)}
                      style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 12, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#16325c", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Cancel
                    </div>
                    <div
                      onClick={() => state.recipeFormId && actions.deleteCustomRecipe(state.recipeFormId)}
                      style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: 12, background: "#c1452e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Yes, delete
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flex: "none" }}>
          <div
            onClick={actions.closeRecipeForm}
            style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#16325c", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </div>
          <div
            onClick={() => actions.isRecipeFormValid() && actions.saveRecipeForm()}
            style={{
              flex: 1,
              textAlign: "center",
              padding: 13,
              borderRadius: 14,
              background: actions.isRecipeFormValid() ? "#16325c" : "rgba(22,50,92,0.25)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save
          </div>
        </div>
      </div>
    </div>
  );
}
