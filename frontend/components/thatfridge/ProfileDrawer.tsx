"use client";

import { ChevronRight } from "lucide-react";
import { getFridgeSummaries } from "@/lib/thatfridge/selectors";
import { useThatFridgeCtx } from "./ThatFridgeContext";

export default function ProfileDrawer() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.showProfilePanel) return null;

  const fridges = getFridgeSummaries(state);
  const settingsRows: { label: string; onClick: () => void }[] = [
    { label: "Goal", onClick: actions.openGoals },
    { label: "Notifications", onClick: actions.openNotifications },
    { label: "AI Data & Memory", onClick: actions.openAIDataSettings },
    { label: "About ThatFridge", onClick: actions.openAbout },
  ];
  const userName = state.currentUser?.name || "Friend";
  const userEmail = state.currentUser?.email || "";
  const initials = userName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="thatfridge-profile-shell" style={{ position: "absolute", inset: 0, zIndex: 20 }}>
      <div className="thatfridge-profile-backdrop" onClick={actions.closeProfile} style={{ position: "absolute", inset: 0, background: "rgba(22,50,92,0.4)" }} />
      <div
        className="thatfridge-profile-panel"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "78%",
          maxWidth: 300,
          background: "#fff",
          boxShadow: "8px 0 30px rgba(22,50,92,0.2)",
          padding: "58px 20px 24px",
          display: "flex",
          flexDirection: "column",
          animation: "pop .2s ease-out",
        }}
      >
        <div className="thatfridge-profile-desktop-header" style={{ display: "none", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ marginLeft: 26 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#16325c" }}>Profile & settings</div>
            <div style={{ fontSize: 12, color: "rgba(22,50,92,0.5)" }}>Manage your account and app preferences</div>
          </div>
        </div>

        <div className="thatfridge-profile-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              background: "#16325c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
              fontWeight: 800,
              flex: "none",
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#16325c" }}>{userName}</div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>{userEmail}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>
          YOUR FRIDGES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 22 }}>
          {fridges.map((f, i) => (
            <div
              key={f.id}
              onClick={() => actions.selectFridgeFromProfile(i)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 4px", cursor: "pointer" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: i === state.activeFridge ? "#2f6fb0" : "#16325c" }}>{f.name}</div>
              <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.4)" }}>{f.itemCount} items</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>SETTINGS</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {settingsRows.map((row) => (
            <div
              key={row.label}
              onClick={row.onClick}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 4px",
                borderBottom: "1px solid rgba(22,50,92,0.06)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#16325c" }}>{row.label}</div>
              <ChevronRight size={16} color="rgba(22,50,92,0.3)" />
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div
          onClick={actions.signOut}
          style={{ textAlign: "center", padding: 12, borderRadius: 14, background: "#fff", border: "1px solid rgba(22,50,92,0.1)", color: "#16325c", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Sign out
        </div>
        </div>
      </div>
    </div>
  );
}
