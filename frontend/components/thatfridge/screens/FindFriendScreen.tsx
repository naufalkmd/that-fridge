"use client";

import { ChevronLeft, Users, X } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";

// Two modes sharing one screen (search results -> a tapped result's profile), the same shape
// this app already uses for recipeDetail/foodHub - one continuous flow, not two unrelated
// screens that happen to be adjacent.
export default function FindFriendScreen() {
  const { state, actions } = useThatFridgeCtx();
  const isProfile = state.screen === "friendProfile";

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={isProfile ? actions.closeFriendProfile : actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color={theme.text.muted} strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color={theme.text.muted} strokeWidth={2.2} />
        </div>
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14 }}>{isProfile ? state.friendProfile?.username ?? "Profile" : "Find a friend"}</div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 30px", boxSizing: "border-box" }}>
        {!isProfile ? (
          <>
            <input
              autoFocus
              value={state.friendSearchQuery}
              onChange={(e) => actions.onFriendSearchChange(e.target.value)}
              placeholder="Search by username…"
              style={{ width: "100%", border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: "11px 16px", fontSize: 14, color: theme.text.primary, boxSizing: "border-box", marginBottom: 14 }}
            />
            {state.friendSearchLoading ? (
              <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>Searching…</div>
            ) : state.friendSearchQuery.trim().length === 0 ? (
              <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>Search for someone by their username to see their fridges.</div>
            ) : state.friendSearchResults.length === 0 ? (
              <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>No one matches &quot;{state.friendSearchQuery}&quot;</div>
            ) : (
              <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
                {state.friendSearchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => actions.openFriendProfile(user.username)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 13, fontWeight: 800, color: theme.text.primary }}>
                      {user.name[0]?.toUpperCase() || "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
                      <div style={{ fontSize: 11.5, color: theme.text.faint }}>@{user.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : state.friendProfileLoading ? (
          <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>Loading profile…</div>
        ) : !state.friendProfile ? (
          <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 30 }}>Couldn&apos;t load that profile.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "16px 12px 26px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontSize: 20, fontWeight: 800, color: theme.text.primary }}>
                {state.friendProfile.name[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text.primary }}>{state.friendProfile.name}</div>
              <div style={{ fontSize: 12.5, color: theme.text.faint }}>@{state.friendProfile.username}</div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>FRIDGES</div>
            {state.friendProfile.fridges.length === 0 ? (
              <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, padding: 20, textAlign: "center", fontSize: 12.5, color: theme.text.faint, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Users size={22} color={theme.text.faint} strokeWidth={1.8} />
                {state.friendProfile.name} doesn&apos;t own any fridges yet.
              </div>
            ) : (
              <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
                {state.friendProfile.fridges.map((fridge, i) => (
                  <div
                    key={fridge.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "13px 14px",
                      borderBottom: i < state.friendProfile!.fridges.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{fridge.name}</div>
                      <div style={{ fontSize: 11.5, color: theme.text.faint }}>
                        {fridge.memberCount} member{fridge.memberCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    {fridge.role ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.text.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>Member</div>
                    ) : fridge.requestStatus === "pending" ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.warn, textTransform: "uppercase", letterSpacing: 0.3 }}>Requested</div>
                    ) : (
                      <div
                        onClick={() => actions.sendJoinRequest(fridge.id)}
                        style={{ background: theme.amber, color: "#0a0a0c", fontFamily: theme.fontMono, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11.5, fontWeight: 700, padding: "8px 14px", borderRadius: theme.radius.sm, cursor: "pointer", flex: "none" }}
                      >
                        Request to join
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
