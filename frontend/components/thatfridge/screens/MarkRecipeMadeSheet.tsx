"use client";

import { X } from "lucide-react";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

export default function MarkRecipeMadeSheet() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.markMadeRecipeId) return null;

  const candidateCount = state.markMadeCandidates.length;

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
            ? "These fridge items look like a match — mark each one finished or still remaining, or remove anything you didn't actually use."
            : "None of this recipe's ingredients matched anything currently in your fridge, so there's nothing to mark used."}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {state.markMadeCandidates.length > 0 && (
            <div style={{ background: "#eaf6ff", borderRadius: 16, overflow: "hidden" }}>
              {state.markMadeCandidates.map((c, i) => {
                const status = state.markMadeStatus[c.id] ?? "finished";
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderBottom: i < state.markMadeCandidates.length - 1 ? "1px solid rgba(22,50,92,0.08)" : undefined,
                    }}
                  >
                    <div style={{ position: "relative", width: 28, height: 28, flex: "none" }}>
                      <FoodIcon icon={c.icon} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.ingredientName}</div>
                    </div>
                    <div style={{ display: "flex", background: "#fff", borderRadius: 10, padding: 2, flex: "none" }}>
                      <div
                        onClick={() => actions.setMarkMadeStatus(c.id, "finished")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: status === "finished" ? "#3f8f5c" : "transparent",
                          color: status === "finished" ? "#fff" : "rgba(22,50,92,0.55)",
                        }}
                      >
                        Finished
                      </div>
                      <div
                        onClick={() => actions.setMarkMadeStatus(c.id, "remaining")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: status === "remaining" ? "#d98c2b" : "transparent",
                          color: status === "remaining" ? "#fff" : "rgba(22,50,92,0.55)",
                        }}
                      >
                        Remaining
                      </div>
                    </div>
                    <div
                      onClick={() => actions.removeMarkMadeCandidate(c.id)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "none",
                        cursor: "pointer",
                        color: "rgba(22,50,92,0.4)",
                      }}
                    >
                      <X size={15} strokeWidth={2.5} />
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
              background: candidateCount > 0 ? "#16325c" : "rgba(22,50,92,0.25)",
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {candidateCount > 0 ? `Confirm (${candidateCount})` : "Confirm"}
          </div>
        </div>
      </div>
    </div>
  );
}
