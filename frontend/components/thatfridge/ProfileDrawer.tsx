"use client";

import { ChevronRight } from "lucide-react";
import { getFridgeSummaries } from "@/lib/thatfridge/selectors";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";

export default function ProfileDrawer() {
  const { state, actions } = useThatFridgeCtx();
  if (!state.showProfilePanel) return null;

  const fridges = getFridgeSummaries(state);
  const settingsRows: { label: string; onClick: () => void }[] = [
    { label: "Find a friend", onClick: actions.openFindFriend },
    { label: "Goal", onClick: actions.openGoals },
    { label: "Badges", onClick: actions.openBadges },
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
      <div className="thatfridge-profile-backdrop" onClick={actions.closeProfile} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      <div
        className="thatfridge-profile-panel"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "78%",
          maxWidth: 300,
          background: theme.bg.surface,
          borderRight: `1px solid ${theme.border.hairline}`,
          padding: "58px 20px 24px",
          display: "flex",
          flexDirection: "column",
          animation: "pop .2s ease-out",
        }}
      >
        <div className="thatfridge-profile-desktop-header" style={{ display: "none", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ marginLeft: 26 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text.primary }}>Profile & settings</div>
            <div style={{ fontSize: 12, color: theme.text.muted }}>Manage your account and app preferences</div>
          </div>
        </div>

        <div className="thatfridge-profile-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              background: theme.bg.surface2,
              border: `1px solid ${theme.border.hairline}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.text.primary,
              fontSize: 16,
              fontWeight: 800,
              flex: "none",
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text.primary }}>{userName}</div>
            <div style={{ fontSize: 11.5, color: theme.text.muted }}>{userEmail}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: theme.text.faint, marginBottom: 8 }}>
          YOUR FRIDGES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 22 }}>
          {fridges.map((f, i) => (
            <div
              key={f.id}
              onClick={() => actions.selectFridgeFromProfile(i)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 4px", cursor: "pointer" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: i === state.activeFridge ? theme.blue : theme.text.primary }}>{f.name}</div>
              <div style={{ fontSize: 11.5, color: theme.text.faint }}>{f.itemCount} items</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: theme.text.faint, marginBottom: 8 }}>SETTINGS</div>
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
                borderBottom: `1px solid ${theme.border.hairline}`,
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.text.primary }}>{row.label}</div>
              <ChevronRight size={16} color={theme.text.faint} />
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div
          onClick={actions.signOut}
          style={{ textAlign: "center", padding: 12, borderRadius: theme.radius.md, background: theme.bg.surface2, border: `1px solid ${theme.border.strong}`, color: theme.text.primary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          Sign out
        </div>
        </div>
      </div>
    </div>
  );
}
