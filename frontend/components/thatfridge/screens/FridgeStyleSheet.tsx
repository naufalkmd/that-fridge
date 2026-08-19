"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Check, ChevronRight, ImagePlus, X } from "lucide-react";
import { FRIDGE_STYLES } from "@/lib/thatfridge/data";
import { compressAndScaleImage } from "@/lib/thatfridge/image";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import { theme } from "@/lib/thatfridge/theme";

export default function FridgeStyleSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Ephemeral per-sheet-open UI state, not app-wide data - which invite-search results have
  // already been invited this session, so the button can flip to a disabled "Invited" label.
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const stylingFridge = state.fridges[state.stylingFridgeIndex];
  const currentStyle = stylingFridge?.style || "photo";
  const itemCount = stylingFridge?.sections.reduce((n, sec) => n + sec.items.length, 0) || 0;
  const canDelete = state.fridges.length > 1;
  const isOwner = stylingFridge?.role === "owner";

  const options: { key: string; label: string; photo: string }[] = [
    { key: "photo", label: "Original photo", photo: "/images/thatfridge/fridge-hero.png" },
    ...FRIDGE_STYLES.map((d) => ({ key: d.key, label: d.label, photo: d.photo })),
  ];

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const photoUrl = await compressAndScaleImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
      actions.updateFridgePhoto(photoUrl);
    } catch (error) {
      console.error("Fridge photo upload failed", error);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 120, background: theme.bg.surface, borderRadius: `${theme.radius.xl}px ${theme.radius.xl}px 0 0`, padding: "14px 22px 26px", animation: "pop .22s ease-out", display: "flex", flexDirection: "column" }}>
        <div onClick={actions.closeStylePicker} style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 16px", cursor: "pointer", flex: "none" }} />
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 13, marginBottom: 14 }}>Manage fridge</div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>FRIDGE NAME</div>
          <input
            value={stylingFridge?.name || ""}
            onChange={(e) => actions.renameFridge(e.target.value)}
            onBlur={actions.renameFridgeBlur}
            placeholder="e.g. Garage, Office…"
            style={{ width: "100%", border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: "11px 14px", fontSize: 14, fontWeight: 600, color: theme.text.primary, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>CHOOSE A LOOK</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            {options.map((opt) => (
              <div
                key={opt.key}
                onClick={() => actions.selectFridgeStyle(opt.key as Parameters<typeof actions.selectFridgeStyle>[0])}
                style={{ cursor: "pointer", borderRadius: theme.radius.md, padding: 8, background: theme.bg.surface2, border: `2px solid ${opt.key === currentStyle ? theme.amber : "transparent"}`, boxSizing: "border-box" }}
              >
                <div style={{ width: "100%", height: 64, borderRadius: theme.radius.sm, overflow: "hidden", marginBottom: 8, position: "relative" }}>
                  <Image src={opt.photo} alt="" fill sizes="120px" style={{ objectFit: "cover" }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: theme.text.primary }}>{opt.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>OR UPLOAD YOUR OWN</div>
          <div
            onClick={() => uploadInputRef.current?.click()}
            style={{ cursor: "pointer", borderRadius: theme.radius.md, padding: 14, background: theme.bg.surface2, display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ width: 44, height: 44, borderRadius: theme.radius.sm, background: theme.bg.surface, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <ImagePlus size={19} color={theme.blue} strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Photo from gallery</div>
              <div style={{ fontSize: 11.5, color: theme.text.faint }}>{stylingFridge?.photoUrl ? "Replace the current fridge photo" : "Drop your own fridge photo"}</div>
            </div>
            <ChevronRight size={17} color={theme.text.faint} />
          </div>
          <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />

          {stylingFridge?.photoUrl && (
            <div style={{ marginTop: 12, borderRadius: theme.radius.md, overflow: "hidden", background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}` }}>
              <div style={{ position: "relative", aspectRatio: "16 / 10" }}>
                <img
                  src={stylingFridge.photoUrl}
                  alt="Selected fridge photo preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", willChange: "transform", transform: "translateZ(0)" }}
                />
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, margin: "24px 0 8px" }}>MEMBERS</div>
          {state.fridgeMembersLoading ? (
            <div style={{ fontSize: 12, color: theme.text.faint, padding: "4px 2px 12px" }}>Loading members…</div>
          ) : (
            <div style={{ borderRadius: theme.radius.md, overflow: "hidden", background: theme.bg.surface2, marginBottom: 8 }}>
              {state.fridgeMembers.map((member, i) => {
                const isMe = member.id === state.currentUser?.id;
                return (
                  <div
                    key={member.id}
                    onClick={() => !isMe && actions.openFriendProfile(member.username)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "11px 14px",
                      borderBottom: i < state.fridgeMembers.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                      cursor: isMe ? "default" : "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {member.name}
                        {isMe && <span style={{ color: theme.text.faint, fontWeight: 600 }}> (you)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: theme.text.faint, textTransform: "uppercase", letterSpacing: 0.3 }}>{member.role}</div>
                    </div>
                    {isOwner && member.role !== "owner" && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.removeFridgeMemberAction(member.id);
                        }}
                        style={{ cursor: "pointer", padding: 4 }}
                      >
                        <X size={15} color={theme.text.faint} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isOwner && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, margin: "24px 0 8px" }}>INVITE SOMEONE</div>
              <input
                value={state.inviteSearchQuery}
                onChange={(e) => actions.onInviteSearchChange(e.target.value)}
                placeholder="Search by username…"
                style={{ width: "100%", border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: "11px 14px", fontSize: 13, color: theme.text.primary, boxSizing: "border-box", marginBottom: 8 }}
              />
              {state.inviteSearchLoading ? (
                <div style={{ fontSize: 12, color: theme.text.faint, padding: "4px 2px 12px" }}>Searching…</div>
              ) : state.inviteSearchResults.length > 0 ? (
                <div style={{ borderRadius: theme.radius.md, overflow: "hidden", background: theme.bg.surface2, marginBottom: 8 }}>
                  {state.inviteSearchResults.map((user, i) => {
                    const invited = invitedIds.has(user.id);
                    return (
                      <div
                        key={user.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 14px",
                          borderBottom: i < state.inviteSearchResults.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                          <div style={{ fontSize: 11, color: theme.text.faint }}>@{user.username}</div>
                        </div>
                        <div
                          onClick={() => {
                            if (invited) return;
                            setInvitedIds((prev) => new Set(prev).add(user.id));
                            actions.sendFridgeInvite(user.id).catch(() => {
                              setInvitedIds((prev) => {
                                const next = new Set(prev);
                                next.delete(user.id);
                                return next;
                              });
                            });
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                            padding: "6px 12px",
                            borderRadius: theme.radius.sm,
                            cursor: invited ? "default" : "pointer",
                            background: invited ? "transparent" : theme.amber,
                            color: invited ? theme.text.faint : "#0a0a0c",
                            flex: "none",
                          }}
                        >
                          {invited ? "Invited" : "Invite"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, margin: "24px 0 8px" }}>
                JOIN REQUESTS{state.joinRequests.length ? ` (${state.joinRequests.length})` : ""}
              </div>
              {state.joinRequestsLoading ? (
                <div style={{ fontSize: 12, color: theme.text.faint, padding: "4px 2px 12px" }}>Loading requests…</div>
              ) : state.joinRequests.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.text.faint, padding: "4px 2px 12px" }}>No pending requests.</div>
              ) : (
                <div style={{ borderRadius: theme.radius.md, overflow: "hidden", background: theme.bg.surface2, marginBottom: 8 }}>
                  {state.joinRequests.map((r, i) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 14px",
                        borderBottom: i < state.joinRequests.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.requesterName}</div>
                        <div style={{ fontSize: 11, color: theme.text.faint }}>@{r.requesterUsername}</div>
                      </div>
                      <div onClick={() => actions.approveJoinRequestAction(r.id)} style={{ cursor: "pointer", padding: 4 }}>
                        <Check size={17} color={theme.good} strokeWidth={2.4} />
                      </div>
                      <div onClick={() => actions.declineJoinRequestAction(r.id)} style={{ cursor: "pointer", padding: 4 }}>
                        <X size={15} color={theme.text.faint} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.bad, margin: "24px 0 8px" }}>DANGER ZONE</div>
          {isOwner ? (
            !confirmingDelete ? (
              <div
                onClick={() => canDelete && setConfirmingDelete(true)}
                style={{
                  cursor: canDelete ? "pointer" : "not-allowed",
                  borderRadius: theme.radius.md,
                  padding: 14,
                  background: theme.bg.surface2,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity: canDelete ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, color: theme.bad }}>Delete this fridge</div>
                  <div style={{ fontSize: 11.5, color: theme.text.faint }}>
                    {canDelete ? "Removes it and everything inside it" : "You need at least one fridge"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ borderRadius: theme.radius.md, padding: 16, background: theme.bg.surface2, border: `1px solid ${theme.bad}40` }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.bad, marginBottom: 6 }}>Delete &quot;{stylingFridge?.name}&quot;?</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: theme.text.muted, marginBottom: 14 }}>
                  {`This permanently deletes this fridge and all ${itemCount} item${itemCount === 1 ? "" : "s"} inside it. This can't be undone.`}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div
                    onClick={() => setConfirmingDelete(false)}
                    style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, color: theme.text.primary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Cancel
                  </div>
                  <div
                    onClick={() => actions.deleteFridge(state.stylingFridgeIndex)}
                    style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bad, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Yes, delete
                  </div>
                </div>
              </div>
            )
          ) : !confirmingLeave ? (
            <div
              onClick={() => canDelete && setConfirmingLeave(true)}
              style={{
                cursor: canDelete ? "pointer" : "not-allowed",
                borderRadius: theme.radius.md,
                padding: 14,
                background: theme.bg.surface2,
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: canDelete ? 1 : 0.5,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, color: theme.bad }}>Leave this fridge</div>
                <div style={{ fontSize: 11.5, color: theme.text.faint }}>
                  {canDelete ? "You'll need to send a new join request to get back in" : "You need at least one fridge"}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ borderRadius: theme.radius.md, padding: 16, background: theme.bg.surface2, border: `1px solid ${theme.bad}40` }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.bad, marginBottom: 6 }}>Leave &quot;{stylingFridge?.name}&quot;?</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: theme.text.muted, marginBottom: 14 }}>
                You&apos;ll lose access to everything inside it unless someone invites you back.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div
                  onClick={() => setConfirmingLeave(false)}
                  style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, color: theme.text.primary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </div>
                <div
                  onClick={() => actions.leaveFridgeAction(state.stylingFridgeIndex)}
                  style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bad, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Yes, leave
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
