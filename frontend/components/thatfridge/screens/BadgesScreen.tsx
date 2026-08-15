"use client";

import { ChevronLeft, X } from "lucide-react";
import { BADGE_CATALOG } from "@/lib/thatfridge/badges";
import { useThatFridgeCtx } from "../ThatFridgeContext";

export default function BadgesScreen() {
  const { state, actions } = useThatFridgeCtx();

  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#eaf6ff,#cfe8fb 55%,#eaf6ff)", display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: "#fff", border: "1px solid rgba(22,50,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color="rgba(22,50,92,0.5)" strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color="rgba(22,50,92,0.5)" strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Badges</div>
          <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>One-time unlocks for real anti-waste habits, not just a score</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BADGE_CATALOG.map((badge) => {
            const progress = state.badges.find((b) => b.badgeKey === badge.key);
            const earned = !!progress?.earnedAt;
            const current = Math.min(progress?.progress ?? 0, badge.target);
            return (
              <div
                key={badge.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#fff",
                  boxShadow: "0 6px 16px rgba(22,50,92,0.06)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  opacity: earned ? 1 : 0.55,
                }}
              >
                <div style={{ fontSize: 28, flex: "none" }}>{badge.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#16325c", marginBottom: 2 }}>{badge.label}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)", lineHeight: 1.35, marginBottom: earned ? 0 : 4 }}>{badge.description}</div>
                  {earned ? (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#3f8f5c" }}>
                      Earned {new Date(progress!.earnedAt!).toLocaleDateString()}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(22,50,92,0.4)" }}>
                      {current}/{badge.target}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
