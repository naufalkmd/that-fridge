"use client";

import type { ComponentType, CSSProperties } from "react";
import { House, MessageCircle, Package, Plus, Users } from "lucide-react";
import Image from "next/image";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

interface NavDef {
  key: "home" | "inventory" | "chat" | "activity";
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }>;
}

const NAV_ITEMS: NavDef[] = [
  { key: "home", label: "Home", Icon: House },
  { key: "inventory", label: "Inventory", Icon: Package },
  { key: "chat", label: "Chat", Icon: MessageCircle },
  { key: "activity", label: "Crew", Icon: Users },
];

// Wide-viewport (>=900px) sidebar navigation — the desktop counterpart to TabBar,
// which stays mobile-only. See globals.css for the breakpoint that swaps between them.
export default function Sidebar() {
  const { state, actions } = useThatFridgeCtx();

  const userInitials = (state.currentUser?.name || "Friend")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      className="thatfridge-sidebar"
      style={{
        flexDirection: "column",
        gap: 24,
        background: theme.bg.surface,
        color: theme.text.primary,
        padding: "22px 16px",
        height: "100%",
        boxSizing: "border-box",
        borderRight: `1px solid ${theme.border.hairline}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
        <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Image src="/images/thatfridge/logo.svg" alt="ThatFridge" width={26} height={27} unoptimized style={{ objectFit: "contain" }} />
        </div>
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 17, letterSpacing: 0.5 }}>ThatFridge</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.key === "activity" ? state.screen === "foodHub" : state.screen === item.key;
          return (
            <div
              key={item.key}
              onClick={() => (item.key === "activity" ? actions.openRecipesHub() : actions.goTab(item.key))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 12px",
                borderRadius: theme.radius.sm,
                fontSize: 13.5,
                fontWeight: 600,
                color: active ? theme.text.primary : theme.text.muted,
                background: active ? theme.bg.surface2 : "transparent",
                cursor: "pointer",
              }}
            >
              <item.Icon size={17} strokeWidth={2} color={active ? theme.amber : theme.text.muted} style={{ transition: "color .2s ease" }} />
              {item.label}
            </div>
          );
        })}
      </nav>

      {state.fridges.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: theme.text.faint, padding: "0 12px", marginBottom: 6 }}>
            Your fridges
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              onClick={() => actions.selectFridgeScope("all")}
              style={{
                padding: "8px 12px",
                borderRadius: theme.radius.sm,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: state.kitchenScope === "all" ? theme.text.primary : theme.text.muted,
                background: state.kitchenScope === "all" ? theme.bg.surface2 : "transparent",
              }}
            >
              All Fridges
            </div>
            {state.fridges.map((f, i) => {
              const active = state.kitchenScope === "active" && state.activeFridge === i;
              return (
                <div
                  key={f.id}
                  onClick={() => actions.selectFridgeScope(i)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: theme.radius.sm,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: active ? theme.text.primary : theme.text.muted,
                    background: active ? theme.bg.surface2 : "transparent",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        onClick={actions.openAdd}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "11px 14px",
          borderRadius: theme.radius.sm,
          background: theme.amber,
          color: "#0a0a0c",
          fontWeight: 700,
          fontSize: 13.5,
          fontFamily: theme.fontMono,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        <Plus size={16} strokeWidth={2.4} />
        Add item
      </div>

      <div style={{ flex: 1 }} />

      <div
        onClick={actions.openProfile}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: theme.radius.sm, cursor: "pointer" }}
      >
        <div style={{ width: 32, height: 32, borderRadius: theme.radius.sm, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
          {userInitials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.currentUser?.name || "Friend"}
          </div>
          <div style={{ fontSize: 11, color: theme.text.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.currentUser?.email || ""}
          </div>
        </div>
      </div>
    </aside>
  );
}
