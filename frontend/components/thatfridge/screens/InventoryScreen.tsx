"use client";

import { useState } from "react";
import { ListFilter, Minus, PackageOpen, Plus, Refrigerator, Search } from "lucide-react";
import { NUTRITION_CATEGORIES, STORAGE_LOCATIONS, guessNutritionCategory } from "@/lib/thatfridge/data";
import { getScopeLabel, getScopedItems, type ItemWithSection } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import type { NutritionCategory, StorageLocation } from "@/lib/thatfridge/types";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import CategoryTag from "../CategoryTag";
import FoodIcon from "../FoodIcon";
import LocationIcon from "../LocationIcon";

function LocationTag({ location }: { location: StorageLocation }) {
  const meta = STORAGE_LOCATIONS.find((l) => l.key === location) || STORAGE_LOCATIONS[0];
  return (
    <span
      title={meta.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 5px",
        borderRadius: theme.radius.sm,
        color: meta.color,
        background: `${meta.color}1a`,
        flex: "none",
      }}
    >
      <LocationIcon location={location} size={10.5} color={meta.color} />
    </span>
  );
}

const SORT_OPTIONS: { key: "category" | "expiry" | "name"; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "expiry", label: "Expiry" },
  { key: "name", label: "Name" },
];

function QtyStepper({ qty, onChange }: { qty: number; onChange: (delta: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onChange(-1);
        }}
        style={{ width: 20, height: 20, borderRadius: 10, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Minus size={11} color={theme.text.primary} strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text.primary, minWidth: 14, textAlign: "center" }}>{qty}</div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onChange(1);
        }}
        style={{ width: 20, height: 20, borderRadius: 10, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Plus size={11} color={theme.text.primary} strokeWidth={2.4} />
      </div>
    </div>
  );
}

export default function InventoryScreen() {
  const { state, actions } = useThatFridgeCtx();
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const showFridgeTags = state.kitchenScope === "all";

  const allItems = getScopedItems(state);

  // Falls back to guessing from the icon for items added before nutrition categories existed
  // (or anything the picker couldn't place), so grouping/filtering never has to show a
  // meaningless "General"/uncategorized bucket - everything lands in a real food group.
  const resolveCategory = (item: ItemWithSection): NutritionCategory => item.nutritionCategory ?? guessNutritionCategory(item.icon) ?? "other_extras";

  const presentCategoryKeys = new Set(allItems.map(resolveCategory));
  const categories = [
    { id: "all", name: "All" },
    ...NUTRITION_CATEGORIES.filter((c) => presentCategoryKeys.has(c.key)).map((c) => ({ id: c.key, name: c.label })),
  ];

  const filteredItems = categoryFilter === "all" ? allItems : allItems.filter((i) => resolveCategory(i) === categoryFilter);
  const groupedByCategory = NUTRITION_CATEGORIES.map((c) => ({ id: c.key, name: c.label, items: filteredItems.filter((i) => resolveCategory(i) === c.key) })).filter(
    (g) => g.items.length > 0
  );

  const sortedItems =
    state.inventorySortMode === "expiry"
      ? filteredItems.slice().sort((a, b) => a.freshness - b.freshness)
      : state.inventorySortMode === "name"
        ? filteredItems.slice().sort((a, b) => a.name.localeCompare(b.name))
        : filteredItems;

  return (
    <>
    <div className="thatfridge-inventory-mobile" style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "28px 20px 180px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 16, letterSpacing: 0.5 }}>Inventory</div>
        <div
          onClick={actions.openSearch}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: theme.bg.surface,
            backdropFilter: "blur(8px)",
            border: `1px solid ${theme.border.hairline}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <Search size={16} color={theme.text.primary} strokeWidth={2} />
        </div>
      </div>

      <div
        onClick={() => actions.goTab("home")}
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
          marginBottom: 18,
          width: "fit-content",
        }}
      >
        <Refrigerator size={11} strokeWidth={2.2} />
        {getScopeLabel(state)}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>All items</div>
        <div style={{ position: "relative" }}>
          <div
            onClick={() => setShowSortMenu((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: theme.text.primary }}
          >
            <ListFilter size={13} color={theme.text.primary} strokeWidth={2.2} />
            {SORT_OPTIONS.find((o) => o.key === state.inventorySortMode)?.label}
          </div>
          {showSortMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: theme.bg.surface, borderRadius: theme.radius.sm, border: `1px solid ${theme.border.hairline}`, padding: 6, zIndex: 5, minWidth: 120 }}>
              {SORT_OPTIONS.map((opt) => (
                <div
                  key={opt.key}
                  onClick={() => {
                    actions.setInventorySortMode(opt.key);
                    setShowSortMenu(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: theme.radius.sm,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: state.inventorySortMode === opt.key ? theme.blue : theme.text.primary,
                    background: state.inventorySortMode === opt.key ? theme.bg.surface2 : "transparent",
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
        {categories.map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                flex: "none",
                whiteSpace: "nowrap",
                padding: "7px 14px",
                borderRadius: theme.radius.sm,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                background: active ? theme.text.primary : theme.bg.surface,
                color: active ? "#0a0a0c" : theme.text.primary,
                border: active ? "none" : `1px solid ${theme.border.hairline}`,
              }}
            >
              {cat.name}
            </div>
          );
        })}
      </div>

      {state.inventorySortMode === "category" ? (
        groupedByCategory.map((g) => (
          <div key={g.id} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: theme.text.faint }}>{g.items.length} items</div>
            </div>
            <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
              {g.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => actions.selectItem(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}
                >
                  <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 6, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                      {item.name}
                      {showFridgeTags && <span style={{ fontWeight: 500, color: theme.text.faint }}> · {item.fridgeName}</span>}
                      {item.opened && <PackageOpen size={12} color={theme.blue} strokeWidth={2.4} />}
                      <LocationTag location={item.location || "fridge"} />
                      <CategoryTag category={item.nutritionCategory} />
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: theme.bg.surface2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
                    <div style={{ fontSize: 10.5, color: theme.text.faint, marginTop: 2 }}>{item.note}</div>
                    <QtyStepper qty={item.qty} onChange={(delta) => actions.adjustItemQty(item.id, delta)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 22 }}>
          {sortedItems.map((item) => (
            <div
              key={item.id}
              onClick={() => actions.selectItem(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}
            >
              <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 6, boxSizing: "border-box" }}>
                <FoodIcon icon={item.icon} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {item.name}
                  {item.opened && <PackageOpen size={12} color={theme.blue} strokeWidth={2.4} />}
                  <LocationTag location={item.location || "fridge"} />
                  <CategoryTag category={item.nutritionCategory} />
                </div>
                <div style={{ fontSize: 10.5, color: theme.text.faint, marginBottom: 4 }}>
                  {item.sectionName}
                  {showFridgeTags && <span> · {item.fridgeName}</span>}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: theme.bg.surface2, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
                <div style={{ fontSize: 10.5, color: theme.text.faint, marginTop: 2 }}>{item.note}</div>
                <QtyStepper qty={item.qty} onChange={(delta) => actions.adjustItemQty(item.id, delta)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* ============ Wide layout (>=900px) — see .thatfridge-inventory-wide in globals.css ============ */}
    <div className="thatfridge-inventory-wide">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 21, letterSpacing: 0.5, marginBottom: 8 }}>Inventory</div>
          <div style={{ fontSize: 13.5, color: theme.text.muted }}>
            {allItems.length} item{allItems.length === 1 ? "" : "s"} · {getScopeLabel(state)}
          </div>
        </div>
        <div
          onClick={actions.openSearch}
          style={{ display: "flex", alignItems: "center", gap: 8, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.sm, padding: "9px 14px", width: 240, cursor: "pointer", flex: "none" }}
        >
          <Search size={15} color={theme.text.faint} strokeWidth={2} />
          <span style={{ fontSize: 13, color: theme.text.faint }}>Search inventory…</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {categories.map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                padding: "8px 14px",
                borderRadius: theme.radius.lg,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                background: active ? theme.text.primary : theme.bg.surface,
                color: active ? "#0a0a0c" : theme.text.muted,
                border: active ? `1px solid ${theme.text.primary}` : `1px solid ${theme.border.hairline}`,
              }}
            >
              {cat.name}
            </div>
          );
        })}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <div
            onClick={() => setShowSortMenu((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: theme.text.muted, padding: "8px 14px", borderRadius: theme.radius.lg, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}
          >
            <ListFilter size={13} strokeWidth={2.2} />
            Sort: {SORT_OPTIONS.find((o) => o.key === state.inventorySortMode)?.label}
          </div>
          {showSortMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: theme.bg.surface, borderRadius: theme.radius.sm, border: `1px solid ${theme.border.hairline}`, padding: 6, zIndex: 5, minWidth: 130 }}>
              {SORT_OPTIONS.map((opt) => (
                <div
                  key={opt.key}
                  onClick={() => {
                    actions.setInventorySortMode(opt.key);
                    setShowSortMenu(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: theme.radius.sm,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: state.inventorySortMode === opt.key ? theme.blue : theme.text.primary,
                    background: state.inventorySortMode === opt.key ? theme.bg.surface2 : "transparent",
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.text.faint }}>No items in this category yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {sortedItems.map((item) => {
            const meta = STORAGE_LOCATIONS.find((l) => l.key === (item.location || "fridge")) || STORAGE_LOCATIONS[0];
            return (
              <div
                key={item.id}
                onClick={() => actions.selectItem(item.id)}
                style={{
                  background: theme.bg.surface,
                  border: `1px solid ${theme.border.hairline}`,
                  borderRadius: theme.radius.md,
                  padding: 16,
                  cursor: "pointer",
                  borderTop: `3px solid ${meta.color}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ position: "relative", width: 40, height: 40, borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 7, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <LocationTag location={item.location || "fridge"} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 700, flexWrap: "wrap" }}>
                    {item.name}
                    {item.opened && <PackageOpen size={12} color={theme.blue} strokeWidth={2.4} />}
                    <CategoryTag category={item.nutritionCategory} />
                  </div>
                  <div style={{ fontSize: 11, color: theme.text.faint, marginTop: 2 }}>
                    {item.sectionName}
                    {showFridgeTags && <span> · {item.fridgeName}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: theme.bg.surface2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: freshColor(item.freshness), flex: "none" }}>{daysLabel(item.days)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}
