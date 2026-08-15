"use client";

import { Check } from "lucide-react";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

export default function MarkRecipeMadeSheet() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.markMadeRecipeId) return null;

  const checkedCount = state.markMadeCandidates.filter((c) => state.markMadeChecked[c.itemId]).length;

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
          onClick={actions.closeMarkRecipeMade}
          style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, flex: "none" }}>Mark as made</div>
        <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.5)", marginBottom: 16, flex: "none" }}>
          {state.markMadeCandidates.length > 0
            ? "These fridge items look like a match — uncheck anything you didn't actually use."
            : "None of this recipe's ingredients matched anything currently in your fridge, so there's nothing to mark used."}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {state.markMadeCandidates.length > 0 && (
            <div style={{ background: "#eaf6ff", borderRadius: 16, overflow: "hidden" }}>
              {state.markMadeCandidates.map((c, i) => {
                const checked = !!state.markMadeChecked[c.itemId];
                return (
                  <div
                    key={c.itemId}
                    onClick={() => actions.toggleMarkMadeCandidate(c.itemId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderBottom: i < state.markMadeCandidates.length - 1 ? "1px solid rgba(22,50,92,0.08)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        background: checked ? "#3f8f5c" : "#fff",
                        border: checked ? "none" : "1px solid rgba(22,50,92,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                      }}
                    >
                      {checked && <Check size={14} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{ position: "relative", width: 28, height: 28, flex: "none" }}>
                      <FoodIcon icon={c.icon} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.itemName}</div>
                      <div style={{ fontSize: 11, color: "rgba(22,50,92,0.45)" }}>For &quot;{c.ingredientName}&quot;</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flex: "none" }}>
          <div
            onClick={actions.closeMarkRecipeMade}
            style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#16325c", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </div>
          <div
            onClick={actions.confirmMarkMade}
            style={{
              flex: 1,
              textAlign: "center",
              padding: 13,
              borderRadius: 14,
              background: checkedCount > 0 ? "#16325c" : "rgba(22,50,92,0.25)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {checkedCount > 0 ? `Confirm (${checkedCount})` : "Confirm"}
          </div>
        </div>
      </div>
    </div>
  );
}
