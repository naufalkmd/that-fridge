"use client";

import Image from "next/image";
import { X } from "lucide-react";
import type { GeneratedIconSummary } from "@/lib/thatfridge/api";
import { theme } from "@/lib/thatfridge/theme";

// Every icon a user has ever generated is auto-saved (see IconController::index) - this
// renders that history as a browsable grid so one can be reused without regenerating it.
export default function GeneratedIconLibrary({
  icons,
  selectedUrl,
  onSelect,
  onDelete,
}: {
  icons: GeneratedIconSummary[];
  selectedUrl?: string | null;
  onSelect: (icon: GeneratedIconSummary) => void;
  onDelete: (id: string) => void;
}) {
  if (!icons.length) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.text.faint, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }}>
        Your generated icons
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {icons.map((gi) => (
          <div key={gi.id} style={{ position: "relative", width: 38, height: 38, flex: "none" }}>
            <div
              title={gi.prompt}
              onClick={() => onSelect(gi)}
              style={{
                width: 38,
                height: 38,
                borderRadius: theme.radius.sm,
                background: theme.bg.surface,
                border: `2px solid ${selectedUrl === gi.image_url ? theme.blue : "transparent"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ position: "relative", width: 26, height: 26 }}>
                <Image src={gi.image_url} alt={gi.prompt} fill unoptimized style={{ objectFit: "contain", imageRendering: "pixelated" }} />
              </div>
            </div>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onDelete(gi.id);
              }}
              title="Delete this icon"
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: theme.bg.surface2,
                border: `1px solid ${theme.border.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={10} color={theme.text.faint} strokeWidth={2.5} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
