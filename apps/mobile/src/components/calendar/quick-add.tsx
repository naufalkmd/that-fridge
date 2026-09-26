import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { describeError } from "@thatfridge/core";

import { useInventory } from "@/lib/inventory";
import { useNotes } from "@/lib/notes";
import { useShopping } from "@/lib/shopping";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";

/**
 * Two one-field forms for the calendar's "+" menu: an item for the shopping list, or a sticky note
 * on the fridge. Neither is tied to the day you opened the menu from - they just save and return.
 */
export function QuickAdd({ kind, onDone, onBack }: { kind: "shopping" | "note"; onDone: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { add: addShopping } = useShopping();
  const { add: addNote } = useNotes();
  const { fridges } = useInventory();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isShopping = kind === "shopping";

  async function save() {
    const value = text.trim();
    if (value === "") {
      setError(isShopping ? "Type what you need to buy." : "Type your note.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isShopping) {
        await addShopping(value);
      } else {
        // A note lives on a fridge: the one the user owns, else the first they belong to.
        const fridge = fridges.find((f) => f.role === "owner") ?? fridges[0];
        if (!fridge) {
          setError("Create or join a fridge first.");
          setSaving(false);
          return;
        }
        await addNote(fridge.id, value, "amber");
      }
      toast.show(isShopping ? `Added "${value}" to your shopping list` : "Note left on the fridge");
      onDone();
    } catch (e) {
      setError(describeError(e, "Couldn't save that."));
      setSaving(false);
    }
  }

  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>
        {isShopping ? "Add to shopping list" : "Leave a note"}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={isShopping ? "e.g. Milk" : "e.g. Out of rice, back Friday"}
        placeholderTextColor={colors.faint}
        maxLength={isShopping ? 120 : 500}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        style={{ backgroundColor: colors.surface2, color: colors.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, marginBottom: 10 }}
      />
      {error && <Text style={{ fontSize: 12.5, color: colors.bad, marginBottom: 10 }}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={onBack} disabled={saving} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.hairline }}>
          <Text style={{ fontWeight: "700", color: colors.muted }}>Back</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={{ flex: 2, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ fontWeight: "800", color: colors.onAccent }}>Add</Text>}
        </Pressable>
      </View>
    </View>
  );
}
