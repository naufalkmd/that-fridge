"use client";

import { useState } from "react";
import { ChevronDown, PackageOpen, Pencil } from "lucide-react";
import { FOOD_ICON_KEYS, ICON_LABELS } from "@/lib/thatfridge/data";
import { findItem } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: "rgba(22,50,92,0.5)",
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "#eaf6ff",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13.5,
  color: "#16325c",
  boxSizing: "border-box",
};

export default function ItemDetailSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [showIconPicker, setShowIconPicker] = useState(false);
  const found = state.selectedItemId ? findItem(state, state.selectedItemId) : null;
  if (!found) return null;
  const { item, section, fridgeIndex } = found;
  const itemFridge = state.fridges[fridgeIndex];

  if (state.isEditingItem) {
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
            style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 20px", cursor: "pointer", flex: "none" }}
          />
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, flex: "none" }}>Edit item</div>

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
              style={{ display: "flex", alignItems: "center", gap: 10, background: "#eaf6ff", borderRadius: 14, padding: "8px 12px", cursor: "pointer" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <div style={{ position: "relative", width: 22, height: 22 }}>
                  <FoodIcon icon={state.editIcon} />
                </div>
              </div>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#16325c" }}>
                {ICON_LABELS[state.editIcon] || "Choose a picture"}
              </div>
              <ChevronDown
                size={16}
                color="rgba(22,50,92,0.4)"
                strokeWidth={2.2}
                style={{ transform: showIconPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </div>
            {showIconPicker && (
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", background: "#eaf6ff", borderRadius: 14, padding: 10 }}>
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
                        borderRadius: 14,
                        background: "#fff",
                        border: `2px solid ${state.editIcon === key ? "#2f6fb0" : "transparent"}`,
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
            <div style={labelStyle}>BEST BEFORE</div>
            <input
              type="date"
              value={state.editExpiryDate}
              onChange={(e) => actions.onEditExpiryDateChange(e.target.value)}
              style={fieldStyle}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>NOTE (OPTIONAL)</div>
            <input
              value={state.editNote}
              onChange={(e) => actions.onEditNoteChange(e.target.value)}
              placeholder="e.g. 2 loaves"
              style={fieldStyle}
            />
          </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 10, flex: "none" }}>
            <div onClick={() => {
            setShowIconPicker(false);
            actions.cancelEditItem();
          }} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#16325c", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
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
                borderRadius: 14,
                background: state.editName.trim() ? "#16325c" : "rgba(22,50,92,0.25)",
                color: "#fff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </div>
          </div>
          <div onClick={actions.discardItem} style={{ textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#c1452e", fontSize: 13.5, fontWeight: 700, cursor: "pointer", flex: "none" }}>
            Delete item
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
          padding: "14px 22px 34px",
          animation: "pop .22s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div onClick={actions.goHome} style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(22,50,92,0.18)", margin: "0 auto 20px", cursor: "pointer", flex: "none" }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, position: "relative" }}>
          <div style={{ width: 88, height: 88, background: "#eaf6ff", borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
              background: "#16325c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Pencil size={14} color="#fff" strokeWidth={2.2} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 }}>
          <div style={{ textAlign: "center", fontSize: 20, fontWeight: 700 }}>{item.name}</div>
          {item.opened && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#2f6fb0", background: "#2f6fb01a", padding: "2px 7px", borderRadius: 6 }}>
              <PackageOpen size={10} strokeWidth={2.4} />
              OPENED
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(22,50,92,0.45)", marginBottom: 18 }}>
          {itemFridge?.name} · {section.name}
        </div>

        <div style={{ background: "#eaf6ff", borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
            <span>Freshness</span>
            <span style={{ color: freshColor(item.freshness) }}>{item.freshness}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(22,50,92,0.08)", overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${item.freshness}%`, background: freshColor(item.freshness) }} />
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.6)" }}>
            {daysLabel(item.days)} · {item.note}
          </div>
        </div>

        <div style={{ background: "#eef2f7", borderRadius: 14, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "#16325c" }}>{tip}</div>
        </div>

        </div>

        <div style={{ display: "flex", gap: 10, flex: "none" }}>
          {item.opened ? (
            <div style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "rgba(22,50,92,0.06)", color: "rgba(22,50,92,0.4)", fontSize: 13.5, fontWeight: 700 }}>
              Opened
            </div>
          ) : (
            <div onClick={actions.markUsed} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "#16325c", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
              Mark as used
            </div>
          )}
          <div onClick={actions.discardItem} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.14)", color: "#c1452e", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Delete item
          </div>
        </div>
      </div>
    </div>
  );
}
