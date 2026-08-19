"use client";

import { Check, ExternalLink, Plus, X } from "lucide-react";
import { getScopedShoppingItems } from "@/lib/thatfridge/selectors";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

export default function ShoppingListPanel() {
  const { state, actions } = useThatFridgeCtx();

  const shoppingList = getScopedShoppingItems(state);
  const showFridgeTags = state.kitchenScope === "all";
  const targetFridge = state.fridges[state.activeFridge];
  const activeShopping = shoppingList.filter((i) => !i.checked);
  const boughtItemsView = shoppingList.filter((i) => i.checked);
  const hasNoShopping = activeShopping.length === 0 && boughtItemsView.length === 0;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: showFridgeTags ? 6 : 16 }}>
        <input
          value={state.newShoppingText}
          onChange={(e) => actions.onNewShoppingChange(e.target.value)}
          onKeyDown={(e) => actions.onNewShoppingKeyDown(e.key)}
          placeholder="Add an item…"
          style={{ flex: 1, border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: "11px 14px", fontSize: 13.5, color: theme.text.primary }}
        />
        <div onClick={actions.addShoppingItem} style={{ width: 40, height: 40, borderRadius: theme.radius.sm, background: theme.amber, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}>
          <Plus size={18} color="#0a0a0c" strokeWidth={2.3} />
        </div>
      </div>
      {showFridgeTags && targetFridge && (
        <div style={{ fontSize: 11, color: theme.text.faint, marginBottom: 16 }}>Posting to {targetFridge.name}</div>
      )}

      {hasNoShopping && (
        <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 20 }}>
          Your list is empty — add items or check the Crew for low-stock picks.
        </div>
      )}

      {activeShopping.length > 0 && (
        <div style={{ marginBottom: 18, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
          {activeShopping.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${theme.border.hairline}` }}>
              <div onClick={() => actions.toggleShoppingItem(item.id)} style={{ width: 22, height: 22, borderRadius: theme.radius.sm, border: `1.5px solid ${theme.border.strong}`, flex: "none", cursor: "pointer" }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: theme.text.primary }}>
                {item.name}
                {showFridgeTags && <span style={{ fontWeight: 500, color: theme.text.faint }}> · {item.fridgeName}</span>}
              </div>
              {item.shopUrl && (
                <div
                  onClick={() => window.open(item.shopUrl!, "_blank", "noopener,noreferrer")}
                  title="Open the shop link"
                  style={{ display: "flex", cursor: "pointer", padding: 4 }}
                >
                  <ExternalLink size={14} color={theme.blue} strokeWidth={2} />
                </div>
              )}
              <div onClick={() => actions.removeShoppingItem(item.id)} style={{ display: "flex", cursor: "pointer", padding: 4 }}>
                <X size={14} color={theme.text.faint} strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>
      )}

      {boughtItemsView.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint }}>BOUGHT ({boughtItemsView.length})</div>
            <div onClick={actions.clearBought} style={{ fontSize: 11.5, fontWeight: 700, color: theme.blue, cursor: "pointer" }}>
              Clear
            </div>
          </div>
          <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
            {boughtItemsView.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${theme.border.hairline}`, opacity: 0.55 }}>
                <div
                  onClick={() => actions.toggleShoppingItem(item.id)}
                  style={{ width: 22, height: 22, borderRadius: theme.radius.sm, background: theme.blue, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", cursor: "pointer" }}
                >
                  <Check size={13} color={theme.text.primary} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, textDecoration: "line-through", color: theme.text.primary }}>
                  {item.name}
                  {showFridgeTags && <span style={{ fontWeight: 500 }}> · {item.fridgeName}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
