"use client";

import { Check, Pencil, Send, X } from "lucide-react";
import { getScopedFridgeNotes } from "@/lib/thatfridge/selectors";
import { theme } from "@/lib/thatfridge/theme";
import { timeAgo } from "@/lib/thatfridge/utils";
import type { FridgeNoteColor } from "@/lib/thatfridge/types";
import { useThatFridgeCtx } from "./ThatFridgeContext";

const COLOR_SWATCHES: FridgeNoteColor[] = ["amber", "blue", "good", "warn", "bad"];

function colorValue(color: FridgeNoteColor): string {
  return theme[color];
}

// A shared, communal sticky note on the fridge door - any member can edit or delete any note,
// not just its author (see FridgeNotePolicy on the backend), so the Pencil/X pair below is
// never gated by who wrote it.
export default function FridgeNotesSection() {
  const { state, actions } = useThatFridgeCtx();
  const notes = getScopedFridgeNotes(state);
  const showFridgeTags = state.kitchenScope === "all";
  const targetFridge = state.fridges[state.activeFridge];
  const isEditing = !!state.editingNoteId;

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>
        NOTES{notes.length ? ` (${notes.length})` : ""}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={state.noteDraftText}
          onChange={(e) => actions.onNoteDraftTextChange(e.target.value)}
          placeholder="Leave a note for the household…"
          style={{ flex: 1, border: `1px solid ${theme.border.hairline}`, outline: "none", background: theme.bg.surface, borderRadius: theme.radius.sm, padding: "11px 14px", fontSize: 13.5, color: theme.text.primary }}
        />
        <div
          onClick={() => targetFridge && actions.submitNote(targetFridge.id)}
          style={{ width: 40, height: 40, borderRadius: theme.radius.sm, background: theme.amber, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          {isEditing ? <Check size={17} color="#0a0a0c" strokeWidth={2.6} /> : <Send size={15} color="#0a0a0c" strokeWidth={2.3} />}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {COLOR_SWATCHES.map((c) => (
            <div
              key={c}
              onClick={() => actions.onNoteDraftColorChange(c)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: colorValue(c),
                cursor: "pointer",
                border: `2px solid ${state.noteDraftColor === c ? theme.text.primary : "transparent"}`,
                boxSizing: "border-box",
              }}
            />
          ))}
        </div>
        {showFridgeTags && targetFridge && (
          <div style={{ fontSize: 11, color: theme.text.faint }}>Posting to {targetFridge.name}</div>
        )}
        {isEditing && (
          <div onClick={actions.cancelEditingNote} style={{ fontSize: 11, fontWeight: 700, color: theme.blue, cursor: "pointer", marginLeft: "auto" }}>
            Cancel
          </div>
        )}
      </div>

      {notes.length === 0 ? (
        <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 12.5, padding: "14px 8px" }}>
          No notes yet — leave one for the household.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                background: `${colorValue(note.color)}12`,
                border: `1px solid ${theme.border.hairline}`,
                borderLeft: `3px solid ${colorValue(note.color)}`,
                borderRadius: theme.radius.sm,
                padding: "10px 12px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: theme.text.primary, lineHeight: 1.4, wordBreak: "break-word" }}>{note.text}</div>
                <div style={{ fontSize: 10.5, color: theme.text.faint, marginTop: 4 }}>
                  {note.authorUsername ? `by @${note.authorUsername}` : "by a former member"} · {timeAgo(note.createdAt)}
                  {showFridgeTags && ` · ${note.fridgeName}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 2, flex: "none" }}>
                <div onClick={() => actions.startEditingNote(note.id)} style={{ cursor: "pointer", padding: 4, color: theme.text.faint }}>
                  <Pencil size={13} strokeWidth={2.2} />
                </div>
                <div onClick={() => actions.deleteFridgeNoteAction(note.id)} style={{ cursor: "pointer", padding: 4, color: theme.text.faint }}>
                  <X size={14} strokeWidth={2.2} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
