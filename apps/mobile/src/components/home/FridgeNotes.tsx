import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo, type FridgeNoteColor } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { useNotes } from "@/lib/notes";

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

const NOTE_COLOR: Record<FridgeNoteColor, string> = {
  amber: "#26c6da",
  blue: "#5b8dee",
  good: "#39e07f",
  warn: "#f5a623",
  bad: "#ff5567",
};
const SWATCHES: FridgeNoteColor[] = ["amber", "blue", "good", "warn", "bad"];

/**
 * `variant="grid"` (Home): read-only sticky-note squares.
 * `variant="editor"` (Organizer): compose / edit / delete.
 */
export function FridgeNotes({ variant = "editor" }: { variant?: "grid" | "editor" }) {
  const { fridges } = useInventory();
  const { scope } = useScope();
  const { notes, add, edit, remove } = useNotes();

  const [text, setText] = useState("");
  const [color, setColor] = useState<FridgeNoteColor>("amber");
  const [editingId, setEditingId] = useState<string | null>(null);
  const showFridge = scope === "all";

  const targetFridgeId = scope === "all" ? fridges[0]?.id : scope;
  const visible = useMemo(
    () => (scope === "all" ? notes : notes.filter((n) => n.fridgeId === scope)),
    [notes, scope],
  );

  if (fridges.length === 0) return null;
  if (variant === "grid" && visible.length === 0) return null;

  async function submit() {
    if (!text.trim() || !targetFridgeId) return;
    const t = text;
    const c = color;
    setText("");
    setColor("amber");
    const wasEditing = editingId;
    setEditingId(null);
    try {
      if (wasEditing) await edit(wasEditing, t, c);
      else await add(targetFridgeId, t, c);
    } catch {
      setText(t);
      setEditingId(wasEditing);
    }
  }

  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
        NOTES{visible.length ? ` (${visible.length})` : ""}
      </Text>

      {variant === "grid" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {visible.map((note) => (
            <View
              key={note.id}
              style={{
                width: "31.5%",
                aspectRatio: 1,
                backgroundColor: `${NOTE_COLOR[note.color]}1f`,
                borderWidth: 1,
                borderColor: `${NOTE_COLOR[note.color]}55`,
                borderRadius: 8,
                padding: 8,
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 11, lineHeight: 15, color: INK }} numberOfLines={4}>
                {note.text}
              </Text>
              <Text style={{ fontSize: 8.5, color: FAINT }} numberOfLines={1}>
                {note.authorUsername ? `@${note.authorUsername}` : "—"}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Leave a note for the household…"
              placeholderTextColor={FAINT}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: HAIRLINE,
                backgroundColor: SURFACE,
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 13.5,
                color: INK,
              }}
            />
            <Pressable
              onPress={submit}
              style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: NOTE_COLOR[color], alignItems: "center", justifyContent: "center" }}
            >
              <MaterialCommunityIcons name={editingId ? "check" : "send"} size={16} color="#0a0a0c" />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: NOTE_COLOR[c],
                    borderWidth: 2,
                    borderColor: color === c ? INK : "transparent",
                  }}
                />
              ))}
            </View>
            {editingId && (
              <Pressable
                onPress={() => {
                  setEditingId(null);
                  setText("");
                }}
                style={{ marginLeft: "auto" }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: BLUE }}>Cancel</Text>
              </Pressable>
            )}
          </View>

          {visible.length === 0 ? (
            <Text style={{ textAlign: "center", color: FAINT, fontSize: 12.5, paddingVertical: 12 }}>
              No notes yet — leave one for the household.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {visible.map((note) => (
                <View
                  key={note.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    backgroundColor: `${NOTE_COLOR[note.color]}12`,
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderLeftWidth: 3,
                    borderLeftColor: NOTE_COLOR[note.color],
                    borderRadius: 6,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, lineHeight: 18, color: INK }}>{note.text}</Text>
                    <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>
                      {note.authorUsername ? `by @${note.authorUsername}` : "by a former member"} ·{" "}
                      {timeAgo(note.createdAt)}
                      {showFridge ? ` · ${note.fridgeName}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setEditingId(note.id);
                      setText(note.text);
                      setColor(note.color);
                    }}
                    hitSlop={6}
                    style={{ padding: 4 }}
                  >
                    <MaterialCommunityIcons name="pencil" size={13} color={FAINT} />
                  </Pressable>
                  <Pressable onPress={() => remove(note.id)} hitSlop={6} style={{ padding: 4 }}>
                    <MaterialCommunityIcons name="close" size={14} color={FAINT} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
