"use client";

import type { ComponentType } from "react";
import { House, MessageCircle, Package, Plus, Users } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

interface TabDef {
  key: "home" | "inventory" | "chat" | "activity";
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

const LEFT_TABS: TabDef[] = [
  { key: "home", label: "Home", Icon: House },
  { key: "inventory", label: "Inventory", Icon: Package },
];

const RIGHT_TABS: TabDef[] = [
  { key: "chat", label: "Chat", Icon: MessageCircle },
  { key: "activity", label: "Crew", Icon: Users },
];

export default function TabBar() {
  const { state, actions } = useThatFridgeCtx();
  const showTabBar = state.screen === "home" || state.screen === "inventory" || state.screen === "foodHub" || state.screen === "chat";
  if (!showTabBar) return null;

  const renderTab = (tab: TabDef) => {
    const active = tab.key === "activity" ? state.screen === "foodHub" : state.screen === tab.key;
    const color = active ? theme.text.primary : theme.text.faint;
    const pillBg = active ? theme.bg.surface2 : "transparent";
    return (
      <div
        key={tab.key}
        onClick={() => (tab.key === "activity" ? actions.openRecipesHub() : actions.goTab(tab.key))}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: "9px",
          borderRadius: 20,
          background: pillBg,
          flex: "none",
          minWidth: 0,
          transition: "background-color .2s ease, padding .25s ease",
          ...(active ? { padding: "9px 14px" } : {}),
        }}
      >
        <div style={{ flex: "none", display: "flex" }}>
          <tab.Icon size={16} color={color} strokeWidth={2.2} />
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color,
            whiteSpace: "nowrap",
            overflow: "hidden",
            maxWidth: active ? 100 : 0,
            opacity: active ? 1 : 0,
            marginLeft: active ? 6 : 0,
            transition: "max-width .25s ease, opacity .2s ease, margin-left .25s ease",
          }}
        >
          {tab.label}
        </div>
      </div>
    );
  };

  return (
    <div
      className="thatfridge-tabbar"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 4,
        padding: 6,
        background: theme.bg.surface,
        backdropFilter: "blur(16px)",
        borderRadius: 26,
        border: `1px solid ${theme.border.hairline}`,
        zIndex: 4,
      }}
    >
      {LEFT_TABS.map(renderTab)}

      <div style={{ position: "relative", width: 58, flex: "none" }}>
        <div
          onClick={actions.openAdd}
          className="thatfridge-tabbar-fab"
          style={{
            position: "absolute",
            left: "50%",
            top: -22,
            width: 58,
            height: 58,
            borderRadius: 29,
            background: theme.amber,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: `4px solid ${theme.bg.surface}`,
            transition: "transform .15s ease",
          }}
        >
          <Plus size={24} color="#0a0a0c" strokeWidth={2.4} />
        </div>
      </div>

      {RIGHT_TABS.map(renderTab)}
    </div>
  );
}
