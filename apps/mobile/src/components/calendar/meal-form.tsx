import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MealStatus } from "@thatfridge/core";

import { useRecipes } from "@/lib/recipes";
import { useTheme } from "@/lib/theme";
import {
  MAX_SLOTS,
  MAX_SLOT_LENGTH,
  MEAL_TEMPLATES,
  STATUS_LABEL,
  normalizeSlots,
  type MealDraft,
} from "@/lib/mealPlan";

/**
 * Add / edit one meal. Slots are the user's own labels: with none yet it offers templates to
 * start from, and a new label can always be typed in. Shown inside the day sheet.
 */
export function MealForm({
  draft,
  slots,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onSaveSlots,
}: {
  draft: MealDraft;
  slots: string[];
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<MealDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onSaveSlots: (slots: string[]) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { recipes } = useRecipes();
  const [pickingRecipe, setPickingRecipe] = useState(false);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlot, setNewSlot] = useState("");

  const isEdit = draft.id !== null;
  // An entry can carry a slot the user has since removed from their list - keep it selectable.
  const shownSlots = useMemo(
    () => (draft.slot && !slots.some((s) => s.toLowerCase() === draft.slot.toLowerCase()) ? [...slots, draft.slot] : slots),
    [slots, draft.slot],
  );
  const matches = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    return recipes.filter((r) => q === "" || r.name.toLowerCase().includes(q)).slice(0, 30);
  }, [recipes, recipeQuery]);
  const chosenRecipe = draft.recipeId ? recipes.find((r) => r.id === draft.recipeId) : undefined;

  const input = {
    backgroundColor: colors.surface2,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  } as const;
  const label = { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: colors.faint, marginBottom: 6, textTransform: "uppercase" } as const;

  async function applyTemplate(templateSlots: string[]) {
    await onSaveSlots(templateSlots);
    onChange({ slot: draft.slot || templateSlots[0] });
  }

  async function addSlot() {
    const next = normalizeSlots([...slots, newSlot]);
    const label = newSlot.trim().slice(0, MAX_SLOT_LENGTH);
    if (label === "") return;
    await onSaveSlots(next);
    onChange({ slot: label });
    setNewSlot("");
    setAddingSlot(false);
  }

  function pickRecipe(id: string, name: string) {
    const previous = chosenRecipe?.name;
    onChange({ recipeId: id, title: draft.title.trim() === "" || draft.title === previous ? name : draft.title });
    setPickingRecipe(false);
    setRecipeQuery("");
  }

  return (
    <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>
        {isEdit ? "Edit meal" : "Plan a meal"}
      </Text>

      <Text style={label}>Meal</Text>
      {slots.length === 0 && !isEdit && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12.5, color: colors.muted, marginBottom: 8 }}>
            How do you like to plan? Pick a starting point — you can rename or add your own any time.
          </Text>
          <View style={{ gap: 8 }}>
            {MEAL_TEMPLATES.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => applyTemplate(t.slots)}
                style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
              >
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {shownSlots.map((slot) => {
          const on = draft.slot.toLowerCase() === slot.toLowerCase();
          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange({ slot })}
              style={{
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                backgroundColor: on ? `${colors.accent}26` : colors.surface2,
                borderWidth: 1, borderColor: on ? colors.accent : colors.hairline,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: on ? colors.accent : colors.muted }}>{slot}</Text>
            </Pressable>
          );
        })}
        {shownSlots.length < MAX_SLOTS && !addingSlot && (
          <Pressable
            onPress={() => setAddingSlot(true)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderStyle: "dashed", borderColor: colors.hairline }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.faint }}>+ New slot</Text>
          </Pressable>
        )}
      </View>
      {addingSlot && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            value={newSlot}
            onChangeText={setNewSlot}
            placeholder="e.g. Post-workout"
            placeholderTextColor={colors.faint}
            maxLength={MAX_SLOT_LENGTH}
            autoFocus
            style={[input, { flex: 1 }]}
          />
          <Pressable onPress={addSlot} style={{ justifyContent: "center", paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent }}>
            <Text style={{ fontWeight: "800", color: colors.onAccent }}>Add</Text>
          </Pressable>
        </View>
      )}

      <Text style={label}>Name</Text>
      <TextInput
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        placeholder="What are you having?"
        placeholderTextColor={colors.faint}
        maxLength={120}
        style={[input, { marginBottom: 10 }]}
      />

      <Pressable
        onPress={() => setPickingRecipe((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: pickingRecipe ? 8 : 12 }}
      >
        <MaterialCommunityIcons name="chef-hat" size={16} color={colors.accent} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.accent }}>
          {chosenRecipe ? `Recipe: ${chosenRecipe.name}` : "Choose from your recipes"}
        </Text>
        {draft.recipeId && (
          <Pressable hitSlop={8} accessibilityLabel="Remove recipe" onPress={() => onChange({ recipeId: null })}>
            <MaterialCommunityIcons name="close" size={16} color={colors.faint} />
          </Pressable>
        )}
      </Pressable>
      {pickingRecipe && (
        <View style={{ marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
          <TextInput
            value={recipeQuery}
            onChangeText={setRecipeQuery}
            placeholder="Search recipes"
            placeholderTextColor={colors.faint}
            style={[input, { borderRadius: 0 }]}
          />
          <ScrollView style={{ maxHeight: 170 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matches.length === 0 ? (
              <Text style={{ padding: 12, fontSize: 12.5, color: colors.faint }}>No matching recipes.</Text>
            ) : (
              matches.map((r) => (
                <Pressable key={r.id} onPress={() => pickRecipe(r.id, r.name)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Text style={{ fontSize: 13.5, color: colors.ink }}>{r.name}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={label}>Reminder time</Text>
          <TextInput
            value={draft.time}
            onChangeText={(time) => onChange({ time })}
            placeholder="18:30 (optional)"
            placeholderTextColor={colors.faint}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={input}
          />
        </View>
      </View>

      <Text style={label}>Note</Text>
      <TextInput
        value={draft.note}
        onChangeText={(note) => onChange({ note })}
        placeholder="Optional"
        placeholderTextColor={colors.faint}
        maxLength={255}
        style={[input, { marginBottom: 12 }]}
      />

      {isEdit && (
        <>
          <Text style={label}>Status</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {(["planned", "cooked", "skipped"] as MealStatus[]).map((status) => {
              const on = draft.status === status;
              return (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onChange({ status })}
                  style={{
                    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8,
                    backgroundColor: on ? `${colors.accent}26` : colors.surface2,
                    borderWidth: 1, borderColor: on ? colors.accent : colors.hairline,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: on ? colors.accent : colors.muted }}>{STATUS_LABEL[status]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {error && <Text style={{ fontSize: 12.5, color: colors.bad, marginBottom: 10 }}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.hairline }}
        >
          <Text style={{ fontWeight: "700", color: colors.muted }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={{ flex: 2, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ fontWeight: "800", color: colors.onAccent }}>Save</Text>}
        </Pressable>
      </View>
      {isEdit && onDelete && (
        <Pressable onPress={onDelete} disabled={saving} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.bad }}>Delete meal</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
