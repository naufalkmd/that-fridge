"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";

const AUTO_FILL_COLOR = "#7a5cc9";

// Inline prompt input dropped into an icon-picker dropdown, above the curated grid, so users
// aren't limited to the curated icon set - typing a prompt calls fal.ai and swaps in a
// generated image instead.
export default function GenerateIconRow({ loading, onGenerate }: { loading: boolean; onGenerate: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const submit = () => {
    if (loading || !prompt.trim()) return;
    onGenerate(prompt.trim());
    setPrompt("");
  };
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Describe an icon…"
        disabled={loading}
        style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: "7px 10px", fontSize: 12.5, color: theme.text.primary }}
      />
      <div
        onClick={submit}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 10px",
          borderRadius: theme.radius.sm,
          background: `${AUTO_FILL_COLOR}1a`,
          color: AUTO_FILL_COLOR,
          fontSize: 11.5,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
          flex: "none",
        }}
      >
        <Sparkles size={13} strokeWidth={2.2} />
        {loading ? "Generating…" : "Generate"}
      </div>
    </div>
  );
}
