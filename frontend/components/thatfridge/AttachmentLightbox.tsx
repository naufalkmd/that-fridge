"use client";

import { X } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import type { RecipeAttachment } from "@/lib/thatfridge/types";

// Shared full-size viewer for recipe reference photos/videos - the thumbnail grid (in both
// RecipeFormSheet and RecipeDetailSheet) is too small to view a photo properly or to play a
// video at all (no controls, muted, just shows a frame), so tapping a tile opens this instead.
export default function AttachmentLightbox({ attachment, onClose }: { attachment: RecipeAttachment | null; onClose: () => void }) {
  if (!attachment) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,20,35,0.9)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
        {attachment.type === "video" ? (
          <video src={attachment.url} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: theme.radius.sm, display: "block" }} />
        ) : (
          <img src={attachment.url} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: theme.radius.sm, display: "block" }} />
        )}
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            top: -16,
            right: -16,
            width: 32,
            height: 32,
            borderRadius: 16,
            background: theme.bg.surface,
            border: `1px solid ${theme.border.strong}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={16} color={theme.text.primary} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}
