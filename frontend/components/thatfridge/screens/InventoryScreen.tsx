"use client";

import { useState } from "react";
import { ListFilter, Minus, PackageOpen, Plus, Refrigerator, Search } from "lucide-react";
import { NUTRITION_CATEGORIES, STORAGE_LOCATIONS, guessNutritionCategory } from "@/lib/thatfridge/data";
import { getScopeLabel, getScopedItems, type ItemWithSection } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import type { NutritionCategory, StorageLocation } from "@/lib/thatfridge/types";
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
        borderRadius: 6,
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
        style={{ width: 20, height: 20, borderRadius: 10, background: "#eef4fa", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Minus size={11} color="#16325c" strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#16325c", minWidth: 14, textAlign: "center" }}>{qty}</div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onChange(1);
        }}
        style={{ width: 20, height: 20, borderRadius: 10, background: "#eef4fa", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Plus size={11} color="#16325c" strokeWidth={2.4} />
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
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Inventory</div>
        <div
          onClick={actions.openSearch}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(22,50,92,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <Search size={16} color="#16325c" strokeWidth={2} />
        </div>
      </div>

      <div
        onClick={() => actions.goTab("home")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          borderRadius: 10,
          background: "rgba(22,50,92,0.06)",
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(22,50,92,0.55)",
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
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 10, background: "#fff", boxShadow: "0 4px 10px rgba(22,50,92,0.08)", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "#16325c" }}
          >
            <ListFilter size={13} color="#16325c" strokeWidth={2.2} />
            {SORT_OPTIONS.find((o) => o.key === state.inventorySortMode)?.label}
          </div>
          {showSortMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, boxShadow: "0 10px 24px rgba(22,50,92,0.14)", padding: 6, zIndex: 5, minWidth: 120 }}>
              {SORT_OPTIONS.map((opt) => (
                <div
                  key={opt.key}
                  onClick={() => {
                    actions.setInventorySortMode(opt.key);
                    setShowSortMenu(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: state.inventorySortMode === opt.key ? "#2f6fb0" : "#16325c",
                    background: state.inventorySortMode === opt.key ? "#eaf6ff" : "transparent",
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
                borderRadius: 14,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                background: active ? "#16325c" : "#fff",
                color: active ? "#fff" : "#16325c",
                boxShadow: "0 4px 10px rgba(22,50,92,0.08)",
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
              <div style={{ fontSize: 12, color: "rgba(22,50,92,0.45)" }}>{g.items.length} items</div>
            </div>
            <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden" }}>
              {g.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => actions.selectItem(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid rgba(22,50,92,0.06)", cursor: "pointer" }}
                >
                  <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: 11, background: "#f6f1e4", padding: 6, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                      {item.name}
                      {showFridgeTags && <span style={{ fontWeight: 500, color: "rgba(22,50,92,0.4)" }}> · {item.fridgeName}</span>}
                      {item.opened && <PackageOpen size={12} color="#2f6fb0" strokeWidth={2.4} />}
                      <LocationTag location={item.location || "fridge"} />
                      <CategoryTag category={item.nutritionCategory} />
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(22,50,92,0.08)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(22,50,92,0.4)", marginTop: 2 }}>{item.note}</div>
                    <QtyStepper qty={item.qty} onChange={(delta) => actions.adjustItemQty(item.id, delta)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden", marginBottom: 22 }}>
          {sortedItems.map((item) => (
            <div
              key={item.id}
              onClick={() => actions.selectItem(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid rgba(22,50,92,0.06)", cursor: "pointer" }}
            >
              <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: 11, background: "#f6f1e4", padding: 6, boxSizing: "border-box" }}>
                <FoodIcon icon={item.icon} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {item.name}
                  {item.opened && <PackageOpen size={12} color="#2f6fb0" strokeWidth={2.4} />}
                  <LocationTag location={item.location || "fridge"} />
                  <CategoryTag category={item.nutritionCategory} />
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(22,50,92,0.4)", marginBottom: 4 }}>
                  {item.sectionName}
                  {showFridgeTags && <span> · {item.fridgeName}</span>}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(22,50,92,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
                <div style={{ fontSize: 10.5, color: "rgba(22,50,92,0.4)", marginTop: 2 }}>{item.note}</div>
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
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>Inventory</div>
          <div style={{ fontSize: 13.5, color: "rgba(22,50,92,0.55)" }}>
            {allItems.length} item{allItems.length === 1 ? "" : "s"} · {getScopeLabel(state)}
          </div>
        </div>
        <div
          onClick={actions.openSearch}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 12, padding: "9px 14px", width: 240, cursor: "pointer", flex: "none" }}
        >
          <Search size={15} color="rgba(22,50,92,0.5)" strokeWidth={2} />
          <span style={{ fontSize: 13, color: "rgba(22,50,92,0.4)" }}>Search inventory…</span>
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
                borderRadius: 20,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                background: active ? "#16325c" : "#fff",
                color: active ? "#fff" : "rgba(22,50,92,0.55)",
                border: active ? "1px solid #16325c" : "1px solid rgba(22,50,92,0.09)",
              }}
            >
              {cat.name}
            </div>
          );
        })}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <div
            onClick={() => setShowSortMenu((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "rgba(22,50,92,0.55)", padding: "8px 14px", borderRadius: 20, background: "#fff", border: "1px solid rgba(22,50,92,0.09)", cursor: "pointer" }}
          >
            <ListFilter size={13} strokeWidth={2.2} />
            Sort: {SORT_OPTIONS.find((o) => o.key === state.inventorySortMode)?.label}
          </div>
          {showSortMenu && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, boxShadow: "0 10px 24px rgba(22,50,92,0.14)", padding: 6, zIndex: 5, minWidth: 130 }}>
              {SORT_OPTIONS.map((opt) => (
                <div
                  key={opt.key}
                  onClick={() => {
                    actions.setInventorySortMode(opt.key);
                    setShowSortMenu(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: state.inventorySortMode === opt.key ? "#2f6fb0" : "#16325c",
                    background: state.inventorySortMode === opt.key ? "#eaf6ff" : "transparent",
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
        <div style={{ fontSize: 13, color: "rgba(22,50,92,0.5)" }}>No items in this category yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {sortedItems.map((item) => {
            const meta = STORAGE_LOCATIONS.find((l) => l.key === (item.location || "fridge")) || STORAGE_LOCATIONS[0];
            return (
              <div
                key={item.id}
                onClick={() => actions.selectItem(item.id)}
                style={{
                  background: "#fff",
                  boxShadow: "0 6px 20px rgba(22,50,92,0.07)",
                  borderRadius: 16,
                  padding: 16,
                  cursor: "pointer",
                  borderTop: `3px solid ${meta.color}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ position: "relative", width: 40, height: 40, borderRadius: 12, background: "#f6f1e4", padding: 7, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <LocationTag location={item.location || "fridge"} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 700, flexWrap: "wrap" }}>
                    {item.name}
                    {item.opened && <PackageOpen size={12} color="#2f6fb0" strokeWidth={2.4} />}
                    <CategoryTag category={item.nutritionCategory} />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(22,50,92,0.5)", marginTop: 2 }}>
                    {item.sectionName}
                    {showFridgeTags && <span> · {item.fridgeName}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(22,50,92,0.08)", overflow: "hidden" }}>
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
