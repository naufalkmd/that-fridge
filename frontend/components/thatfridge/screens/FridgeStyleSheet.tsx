"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ChevronRight, ImagePlus } from "lucide-react";
import { FRIDGE_STYLES } from "@/lib/thatfridge/data";
import { compressAndScaleImage } from "@/lib/thatfridge/image";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import { theme } from "@/lib/thatfridge/theme";

export default function FridgeStyleSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const stylingFridge = state.fridges[state.stylingFridgeIndex];
  const currentStyle = stylingFridge?.style || "photo";
  const itemCount = stylingFridge?.sections.reduce((n, sec) => n + sec.items.length, 0) || 0;
  const canDelete = state.fridges.length > 1;

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

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.bad, margin: "24px 0 8px" }}>DANGER ZONE</div>
          {!confirmingDelete ? (
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
          )}
        </div>
      </div>
    </div>
  );
}
