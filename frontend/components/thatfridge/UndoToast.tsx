"use client";

import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

export default function UndoToast() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.undoMessage) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 186,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 12px 12px 18px",
        background: theme.bg.surface,
        color: theme.text.primary,
        border: `1px solid ${theme.border.strong}`,
        borderRadius: theme.radius.md,
        zIndex: 6,
        animation: "pop .2s ease-out",
        width: "calc(100% - 40px)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {state.undoMessage}
      </div>
      <div
        onClick={actions.undoLastRemoval}
        style={{ fontSize: 13, fontWeight: 800, color: theme.blue, cursor: "pointer", flex: "none", padding: "4px 6px" }}
      >
        Undo
      </div>
    </div>
  );
}
