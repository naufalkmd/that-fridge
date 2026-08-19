"use client";

import { X } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

export default function MarkRecipeMadeSheet() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.markMadeRecipeId) return null;

  const candidateCount = state.markMadeCandidates.length;

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
          onClick={actions.closeMarkRecipeMade}
          style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 700, fontSize: 14, marginBottom: 8, flex: "none", color: theme.text.primary }}>Mark as made</div>
        <div style={{ fontSize: 12.5, color: theme.text.faint, marginBottom: 16, flex: "none" }}>
          {state.markMadeCandidates.length > 0
            ? "These fridge items look like a match — mark each one finished or still remaining, or remove anything you didn't actually use."
            : "None of this recipe's ingredients matched anything currently in your fridge, so there's nothing to mark used."}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {state.markMadeCandidates.length > 0 && (
            <div style={{ background: theme.bg.surface2, borderRadius: theme.radius.md, overflow: "hidden" }}>
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
                      borderBottom: i < state.markMadeCandidates.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                    }}
                  >
                    <div style={{ position: "relative", width: 28, height: 28, flex: "none" }}>
                      <FoodIcon icon={c.icon} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.text.primary }}>{c.ingredientName}</div>
                    </div>
                    <div style={{ display: "flex", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: 2, flex: "none" }}>
                      <div
                        onClick={() => actions.setMarkMadeStatus(c.id, "finished")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: theme.radius.sm,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: status === "finished" ? theme.good : "transparent",
                          color: status === "finished" ? "#0a0a0c" : theme.text.muted,
                        }}
                      >
                        Finished
                      </div>
                      <div
                        onClick={() => actions.setMarkMadeStatus(c.id, "remaining")}
                        style={{
                          padding: "6px 10px",
                          borderRadius: theme.radius.sm,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                          background: status === "remaining" ? theme.warn : "transparent",
                          color: status === "remaining" ? "#0a0a0c" : theme.text.muted,
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
                        color: theme.text.faint,
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
            style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: theme.radius.md, background: "transparent", border: `1px solid ${theme.border.strong}`, color: theme.text.primary, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </div>
          <div
            onClick={actions.confirmMarkMade}
            style={{
              flex: 1,
              textAlign: "center",
              padding: 13,
              borderRadius: theme.radius.md,
              background: candidateCount > 0 ? theme.amber : theme.bg.surface2,
              color: candidateCount > 0 ? "#0a0a0c" : theme.text.faint,
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
