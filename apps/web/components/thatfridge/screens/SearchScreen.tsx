"use client";

import { ChevronLeft, Refrigerator } from "lucide-react";
import { getScopeLabel, getScopedItems } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

const SUGGESTIONS = ["Dairy", "Produce", "Leftovers", "Meat"];

export default function SearchScreen() {
  const { state, actions } = useThatFridgeCtx();
  const q = state.searchQuery.trim().toLowerCase();
  const showFridgeTags = state.kitchenScope === "all";
  const results = q
    ? getScopedItems(state).filter((i) => i.name.toLowerCase().includes(q) || i.sectionName.toLowerCase().includes(q))
    : [];

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 10, boxSizing: "border-box" }}>
        <div onClick={actions.goHome} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}>
          <ChevronLeft size={20} color={theme.text.primary} strokeWidth={2.2} />
        </div>
        <input
          autoFocus
          value={state.searchQuery}
          onChange={(e) => actions.onSearchChange(e.target.value)}
          placeholder="Search your fridge…"
          style={{ flex: 1, border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: "11px 16px", fontSize: 14, color: theme.text.primary }}
        />
      </div>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "0 20px 10px", boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: theme.radius.sm,
            background: theme.bg.surface2,
            fontSize: 11,
            fontWeight: 700,
            color: theme.text.muted,
            cursor: "pointer",
          }}
        >
          <Refrigerator size={11} strokeWidth={2.2} />
          {getScopeLabel(state)}
        </div>
      </div>
      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 30px", boxSizing: "border-box" }}>
        {q.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {SUGGESTIONS.map((label) => (
              <div
                key={label}
                onClick={() => actions.onSearchChange(label)}
                style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.sm, padding: "8px 13px", fontSize: 12, fontWeight: 600, color: theme.text.primary, cursor: "pointer" }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
        {results.length > 0 && (
          <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
            {results.map((item) => (
              <div key={item.id} onClick={() => actions.selectItem(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}>
                <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 6, boxSizing: "border-box" }}>
                  <FoodIcon icon={item.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{item.name}</div>
                  <div style={{ fontSize: 11.5, color: theme.text.faint }}>
                    {item.sectionName}
                    {showFridgeTags && <span> · {item.fridgeName}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
              </div>
            ))}
          </div>
        )}
        {q.length > 0 && results.length === 0 && (
          <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>No items match &quot;{state.searchQuery}&quot;</div>
        )}
      </div>
    </div>
  );
}
