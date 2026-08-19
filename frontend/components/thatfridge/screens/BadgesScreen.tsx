"use client";

import { ChevronLeft, LifeBuoy, Link, Salad, Star, X, type LucideIcon } from "lucide-react";
import { BADGE_CATALOG } from "@/lib/thatfridge/badges";
import { theme } from "@/lib/thatfridge/theme";
import type { BadgeKey } from "@/lib/thatfridge/types";
import { useThatFridgeCtx } from "../ThatFridgeContext";

// first_link_recipe keeps its own purple accent - the theme has no token for it (it isn't one
// of the four crew-agent colors or a semantic status color), so it's left as a hand-picked hex.
const BADGE_STYLE: Record<BadgeKey, { Icon: LucideIcon; color: string; bg: string }> = {
  rescued_10: { Icon: LifeBuoy, color: theme.blue, bg: `${theme.blue}1a` },
  first_link_recipe: { Icon: Link, color: "#7a5cb0", bg: "#7a5cb01a" },
  full_week_variety: { Icon: Salad, color: theme.good, bg: `${theme.good}1a` },
  zero_waste_week: { Icon: Star, color: theme.warn, bg: `${theme.warn}1a` },
};

export default function BadgesScreen() {
  const { state, actions } = useThatFridgeCtx();

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color={theme.text.muted} strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color={theme.text.muted} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 700, fontSize: 15 }}>Badges</div>
          <div style={{ fontSize: 11.5, color: theme.text.faint }}>One-time unlocks for real anti-waste habits, not just a score</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BADGE_CATALOG.map((badge) => {
            const progress = state.badges.find((b) => b.badgeKey === badge.key);
            const earned = !!progress?.earnedAt;
            const current = Math.min(progress?.progress ?? 0, badge.target);
            const { Icon, color, bg } = BADGE_STYLE[badge.key];
            return (
              <div
                key={badge.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: theme.bg.surface,
                  border: `1px solid ${theme.border.hairline}`,
                  borderRadius: theme.radius.md,
                  padding: "14px 16px",
                  opacity: earned ? 1 : 0.55,
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: theme.radius.md, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <Icon size={21} color={color} strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.text.primary, marginBottom: 2 }}>{badge.label}</div>
                  <div style={{ fontSize: 11.5, color: theme.text.faint, lineHeight: 1.35, marginBottom: earned ? 0 : 4 }}>{badge.description}</div>
                  {earned ? (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.good }}>
                      Earned {new Date(progress!.earnedAt!).toLocaleDateString()}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.text.faint }}>
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
