"use client";

import { useEffect } from "react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

export default function SyncErrorToast() {
  const { state, actions } = useThatFridgeCtx();

  useEffect(() => {
    if (!state.syncError) return;
    const timer = setTimeout(() => actions.dismissSyncError(), 4000);
    return () => clearTimeout(timer);
  }, [state.syncError, actions]);

  if (!state.syncError) return null;

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
        padding: "12px 16px",
        background: theme.bad,
        color: theme.text.primary,
        borderRadius: theme.radius.md,
        zIndex: 6,
        animation: "pop .2s ease-out",
        width: "calc(100% - 40px)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {state.syncError}
      </div>
    </div>
  );
}
