"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, PackageOpen, Pencil, ShoppingCart } from "lucide-react";
import { FOOD_ICON_KEYS, ICON_LABELS, NUTRITION_CATEGORIES } from "@/lib/thatfridge/data";
import { findItem } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import CategoryTag from "../CategoryTag";
import FoodIcon from "../FoodIcon";
import { theme } from "@/lib/thatfridge/theme";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: theme.text.faint,
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${theme.border.hairline}`,
  outline: "none",
  background: theme.bg.surface2,
  borderRadius: theme.radius.sm,
  padding: "12px 14px",
  fontSize: 13.5,
  color: theme.text.primary,
  boxSizing: "border-box",
};

export default function ItemDetailSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [showIconPicker, setShowIconPicker] = useState(false);
  const found = state.selectedItemId ? findItem(state, state.selectedItemId) : null;
  if (!found) return null;
  const { item, section, fridgeIndex } = found;
  const itemFridge = state.fridges[fridgeIndex];
  // Same name-match this app already uses everywhere else to relate a shopping entry to a
  // food item (RecipeDetailSheet's ingredient rows, Guardian/Shopkeeper suggestions) - there's
  // no stored id linking the two records, just a consistent name comparison.
  const onShoppingList = state.shoppingList.some((si) => !si.checked && si.name.toLowerCase() === item.name.toLowerCase());

  if (state.isEditingItem) {
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
            padding: "14px 22px 30px",
            animation: "pop .22s ease-out",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            onClick={() => {
              setShowIconPicker(false);
              actions.cancelEditItem();
            }}
            style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 20px", cursor: "pointer", flex: "none" }}
          />
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14, marginBottom: 18, flex: "none" }}>Edit item</div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>NAME</div>
            <input
              autoFocus
              value={state.editName}
              onChange={(e) => actions.onEditNameChange(e.target.value)}
              placeholder="Item name"
              style={fieldStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>CATEGORY</div>
            <select
              value={state.editSectionId}
              onChange={(e) => actions.onEditSectionChange(e.target.value)}
              style={{ ...fieldStyle, appearance: "none" }}
            >
              {state.fridges[state.editFridgeIndex]?.sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>PICTURE</div>
            <div
              onClick={() => setShowIconPicker((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 10, background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: "8px 12px", cursor: "pointer" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: theme.radius.sm, background: theme.bg.surface, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <div style={{ position: "relative", width: 22, height: 22 }}>
                  <FoodIcon icon={state.editIcon} />
                </div>
              </div>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: theme.text.primary }}>
                {ICON_LABELS[state.editIcon] || "Choose a picture"}
              </div>
              <ChevronDown
                size={16}
                color={theme.text.faint}
                strokeWidth={2.2}
                style={{ transform: showIconPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </div>
            {showIconPicker && (
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {FOOD_ICON_KEYS.map((key) => (
                    <div
                      key={key}
                      title={ICON_LABELS[key]}
                      onClick={() => {
                        actions.onEditIconChange(key);
                        setShowIconPicker(false);
                      }}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: theme.radius.sm,
                        background: theme.bg.surface,
                        border: `2px solid ${state.editIcon === key ? theme.blue : "transparent"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ position: "relative", width: 28, height: 28 }}>
                        <FoodIcon icon={key} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>FOOD GROUP</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NUTRITION_CATEGORIES.map((c) => {
                const active = state.editCategory === c.key;
                return (
                  <div
                    key={c.key}
                    onClick={() => actions.onEditCategoryChange(c.key)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: theme.radius.sm,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: active ? theme.amber : theme.bg.surface2,
                      color: active ? "#0a0a0c" : theme.text.primary,
                    }}
                  >
                    {c.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>BEST BEFORE</div>
            <input
              type="date"
              value={state.editExpiryDate}
              onChange={(e) => actions.onEditExpiryDateChange(e.target.value)}
              style={fieldStyle}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>NOTE (OPTIONAL)</div>
            <input
              value={state.editNote}
              onChange={(e) => actions.onEditNoteChange(e.target.value)}
              placeholder="e.g. 2 loaves"
              style={fieldStyle}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>SHOP LINK (OPTIONAL)</div>
            <input
              type="url"
              value={state.editShopUrl}
              onChange={(e) => actions.onEditShopUrlChange(e.target.value)}
              placeholder="https://…"
              style={fieldStyle}
            />
          </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 10, flex: "none" }}>
            <div onClick={() => {
            setShowIconPicker(false);
            actions.cancelEditItem();
          }} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, color: theme.text.primary, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </div>
            <div
              onClick={() => {
                setShowIconPicker(false);
                actions.confirmEditItem();
              }}
              style={{
                flex: 1,
                textAlign: "center",
                padding: 13,
                borderRadius: theme.radius.sm,
                background: state.editName.trim() ? theme.amber : theme.bg.surface2,
                color: state.editName.trim() ? "#0a0a0c" : theme.text.faint,
                fontSize: 13.5,
                fontWeight: 700,
                fontFamily: theme.fontMono,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                cursor: "pointer",
              }}
            >
              Save
            </div>
          </div>
          <div onClick={actions.discardItemWasted} style={{ textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, color: theme.bad, fontSize: 13.5, fontWeight: 700, cursor: "pointer", flex: "none" }}>
            Throw away
          </div>
        </div>
      </div>
    );
  }

  const tip = item.opened
    ? item.freshness < 30
      ? `Opened — use ${item.name.toLowerCase()} today, it won't keep much longer.`
      : `Opened — use within ${item.days} day${item.days === 1 ? "" : "s"} for best quality.`
    : item.freshness < 30
      ? `Use ${item.name.toLowerCase()} today for best quality.`
      : item.freshness < 60
        ? `Plan to use ${item.name.toLowerCase()} within the next couple days.`
        : `${item.name} is holding up well — no action needed.`;

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
          padding: "14px 22px 34px",
          animation: "pop .22s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div onClick={actions.goHome} style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 20px", cursor: "pointer", flex: "none" }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, position: "relative" }}>
          <div style={{ width: 88, height: 88, background: theme.bg.surface2, borderRadius: theme.radius.lg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: 52, height: 52 }}>
              <FoodIcon icon={item.icon} />
            </div>
          </div>
          <div
            onClick={() => {
              setShowIconPicker(false);
              actions.startEditItem();
            }}
            style={{
              position: "absolute",
              top: 0,
              right: "calc(50% - 78px)",
              width: 30,
              height: 30,
              borderRadius: 15,
              background: theme.amber,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Pencil size={14} color="#0a0a0c" strokeWidth={2.2} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700 }}>{item.name}</div>
          {item.opened && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: theme.blue, background: `${theme.blue}1a`, padding: "2px 7px", borderRadius: theme.radius.sm }}>
              <PackageOpen size={10} strokeWidth={2.4} />
              OPENED
            </div>
          )}
          <CategoryTag category={item.nutritionCategory} />
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: theme.text.faint, marginBottom: 18 }}>
          {itemFridge?.name} · {section.name}
        </div>

        <div style={{ background: theme.bg.surface2, borderRadius: theme.radius.md, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            <span>Freshness</span>
            <span style={{ color: freshColor(item.freshness) }}>{item.freshness}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: theme.border.hairline, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
          </div>
          <div style={{ fontSize: 12.5, color: theme.text.muted }}>
            {daysLabel(item.days)} · {item.note}
          </div>
        </div>

        <div style={{ background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: theme.text.primary }}>{tip}</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <div
            onClick={() => !onShoppingList && actions.addPredictedToShopping(item.name, item.icon, item.shopUrl)}
            title={onShoppingList ? "Already on your shopping list" : "Queue this up so it's easy to buy again"}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 11,
              borderRadius: theme.radius.sm,
              background: theme.bg.surface2,
              border: `1px solid ${theme.border.hairline}`,
              color: onShoppingList ? theme.good : theme.blue,
              fontSize: 13,
              fontWeight: 700,
              cursor: onShoppingList ? "default" : "pointer",
            }}
          >
            {onShoppingList ? <Check size={14} strokeWidth={2.6} /> : <ShoppingCart size={14} strokeWidth={2.2} />}
            {onShoppingList ? "On your shopping list" : "Add to shopping list"}
          </div>
          {item.shopUrl && (
            <div
              onClick={() => window.open(item.shopUrl!, "_blank", "noopener,noreferrer")}
              title="Open the shop link"
              style={{
                width: 44,
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radius.sm,
                background: theme.bg.surface2,
                border: `1px solid ${theme.border.hairline}`,
                color: theme.blue,
                cursor: "pointer",
              }}
            >
              <ExternalLink size={15} strokeWidth={2.2} />
            </div>
          )}
        </div>

        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "none" }}>
          {item.opened ? (
            <div style={{ textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface2, color: theme.text.faint, fontSize: 13, fontWeight: 700 }}>
              Opened
            </div>
          ) : (
            <div
              onClick={actions.markUsed}
              title="Opened but not finished - stays in your fridge, just tracked as opened"
              style={{ textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface2, color: theme.blue, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Opened it
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <div
              onClick={actions.markItemConsumed}
              title="Finished it - counts toward your Food Balance score"
              style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.amber, color: "#0a0a0c", fontSize: 13.5, fontWeight: 700, fontFamily: theme.fontMono, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer" }}
            >
              Used it up
            </div>
            <div
              onClick={actions.discardItemWasted}
              title="Threw it out - doesn't count toward your Food Balance score"
              style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.bad}40`, color: theme.bad, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
            >
              Throw away
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
