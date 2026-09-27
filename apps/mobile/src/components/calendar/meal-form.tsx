import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MealStatus } from "@thatfridge/core";

import { api } from "@/lib/api";
import { shortDayLabel } from "@/lib/calendar";
import { useKeyboardHeight } from "@/lib/keyboard";
import { useRecipes } from "@/lib/recipes";
import { useTheme } from "@/lib/theme";
import { PixelText } from "@/components/brand";
import {
  MAX_SLOTS,
  MAX_SLOT_LENGTH,
  MEAL_TEMPLATES,
  STATUS_LABEL,
  kcalLabel,
  normalizeSlots,
  type MealDraft,
} from "@/lib/mealPlan";

/**
 * Add / edit one meal, laid out so the important part comes first and stays above the keyboard:
 * the name (focused for a new meal), then an optional recipe, the meal slot, calories and a
 * reminder time. Calories are filled in for you - from the recipe, or from the name - and show as
 * the field's hint; type a number only to override it. Slots are the user's own labels: with none
 * yet it offers templates to start from, and a new label can always be typed in.
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
  dayOptions,
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
  /** When given (the Meal plan screen), a "Day" row lets the meal be put on / moved to another day. */
  dayOptions?: string[];
}) {
  const { colors } = useTheme();
  const { recipes } = useRecipes();
  const keyboard = useKeyboardHeight();
  const window = useWindowDimensions();
  const [pickingRecipe, setPickingRecipe] = useState(false);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);
  const [newSlot, setNewSlot] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);

  const isEdit = draft.id !== null;
  // With the keyboard up the form scrolls inside whatever room is left above it.
  const scrollMax = keyboard > 0 ? Math.max(180, window.height - keyboard - 64 - 76) : 480;

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

  // The estimate shown as the calories hint: the recipe's own number, else the nutrition table on
  // the name (a free, instant call - no credits), debounced while typing.
  useEffect(() => {
    if (chosenRecipe) {
      setEstimate(chosenRecipe.calories ?? null);
      return;
    }
    const title = draft.title.trim();
    if (title.length < 3) {
      setEstimate(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .estimateMealCalories(title)
        .then((res) => alive && setEstimate(res.calories))
        .catch(() => alive && setEstimate(null));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft.title, chosenRecipe]);

  const input = {
    backgroundColor: colors.surface2,
    color: colors.ink,
    borderCurve: "continuous", borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  } as const;
  const label = { fontSize: 11, fontWeight: "600", letterSpacing: 1.2, color: colors.muted, marginBottom: 8, textTransform: "uppercase" } as const;
  // Selectable chips (slots, status): tinted accent when on, a quiet fill when off.
  const chip = (on: boolean) =>
    ({
      height: 32, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center",
      backgroundColor: on ? `${colors.accent}24` : colors.surface2, borderWidth: 1, borderColor: on ? `${colors.accent}80` : "transparent",
    }) as const;
  const chipText = (on: boolean) => ({ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? colors.accent : colors.muted }) as const;

  async function applyTemplate(templateSlots: string[]) {
    await onSaveSlots(templateSlots);
    onChange({ slot: draft.slot || templateSlots[0] });
  }

  async function addSlot() {
    const label = newSlot.trim().slice(0, MAX_SLOT_LENGTH);
    if (label === "") return;
    await onSaveSlots(normalizeSlots([...slots, label]));
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

  const hint =
    draft.calories !== ""
      ? "Using the number you typed."
      : estimate !== null
        ? chosenRecipe
          ? "Estimated from the recipe. Type a number to change it."
          : "Estimated from the name. Type a number to change it."
        : draft.title.trim().length >= 3
          ? "No estimate for this name — type your own if you like."
          : "";

  return (
    <ScrollView style={{ maxHeight: scrollMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <PixelText style={{ fontSize: 16, color: colors.ink, marginBottom: 16 }}>{isEdit ? "Edit meal" : "Plan a meal"}</PixelText>

      {/* 1. What: the name first (focused for a new meal), with the recipe picker right under it. */}
      <Text style={label}>What are you having?</Text>
      <TextInput
        value={draft.title}
        onChangeText={(title) => onChange({ title })}
        placeholder="e.g. Chicken rice"
        placeholderTextColor={colors.faint}
        maxLength={120}
        autoFocus={!isEdit}
        returnKeyType="done"
        style={[input, { fontSize: 15, marginBottom: 8 }]}
      />

      <Pressable
        onPress={() => setPickingRecipe((v) => !v)}
        style={{
          flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderCurve: "continuous", borderRadius: 12,
          borderWidth: 1, borderColor: chosenRecipe ? `${colors.agentChef}66` : colors.hairline, marginBottom: pickingRecipe ? 8 : 18,
        }}
      >
        <View style={{ width: 28, height: 28, borderCurve: "continuous", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.agentChef}1f` }}>
          <MaterialCommunityIcons name="chef-hat" size={15} color={colors.agentChef} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: chosenRecipe ? colors.ink : colors.muted }} numberOfLines={1}>
          {chosenRecipe ? `Recipe: ${chosenRecipe.name}` : "Choose from your recipes"}
        </Text>
        {draft.recipeId ? (
          <Pressable hitSlop={8} accessibilityLabel="Remove recipe" onPress={() => onChange({ recipeId: null })}>
            <MaterialCommunityIcons name="close" size={16} color={colors.faint} />
          </Pressable>
        ) : (
          <MaterialCommunityIcons name={pickingRecipe ? "chevron-up" : "chevron-down"} size={18} color={colors.faint} />
        )}
      </Pressable>
      {pickingRecipe && (
        <View style={{ marginBottom: 18, borderCurve: "continuous", borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
          <TextInput
            value={recipeQuery}
            onChangeText={setRecipeQuery}
            placeholder="Search recipes"
            placeholderTextColor={colors.faint}
            style={[input, { borderRadius: 0 }]}
          />
          <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matches.length === 0 ? (
              <Text style={{ padding: 12, fontSize: 12.5, color: colors.faint }}>No matching recipes.</Text>
            ) : (
              matches.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => pickRecipe(r.id, r.name)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline }}
                >
                  <Text style={{ flex: 1, fontSize: 13, color: colors.ink }} numberOfLines={1}>{r.name}</Text>
                  {typeof r.calories === "number" && r.calories > 0 && (
                    <Text style={{ fontSize: 11.5, color: colors.muted }}>{kcalLabel(r.calories)}</Text>
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* 2. When: the day as a compact week row, then the meal slot. */}
      {dayOptions && (
        <>
          <Text style={label}>Day</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {(dayOptions.includes(draft.date) ? dayOptions : [draft.date, ...dayOptions]).map((day) => {
              const on = draft.date === day;
              const { weekday, day: n } = shortDayLabel(day);
              return (
                <Pressable
                  key={day}
                  testID={`day-chip-${day}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${weekday} ${n}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => onChange({ date: day })}
                  style={{
                    width: 42, height: 48, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2,
                    backgroundColor: on ? colors.accent : colors.surface2,
                  }}
                >
                  <Text style={{ fontSize: 10, color: on ? colors.onAccent : colors.faint }}>{weekday.slice(0, 3)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: on ? colors.onAccent : colors.ink }}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text style={label}>Meal</Text>
      {slots.length === 0 && !isEdit && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted, marginBottom: 8 }}>
            How do you like to plan? Pick a starting point — you can rename or add your own any time.
          </Text>
          <View style={{ borderCurve: "continuous", borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, overflow: "hidden" }}>
            {MEAL_TEMPLATES.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => applyTemplate(t.slots)}
                style={{ flexDirection: "row", alignItems: "center", padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.hairline }}
              >
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.ink }}>{t.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.faint} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: addingSlot ? 10 : 18 }}>
        {shownSlots.map((slot) => {
          const on = draft.slot.toLowerCase() === slot.toLowerCase();
          return (
            <Pressable key={slot} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange({ slot })} style={chip(on)}>
              <Text style={chipText(on)}>{slot}</Text>
            </Pressable>
          );
        })}
        {shownSlots.length < MAX_SLOTS && !addingSlot && (
          <Pressable
            onPress={() => setAddingSlot(true)}
            style={{ height: 32, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: colors.hairlineStrong }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.faint }}>+ New slot</Text>
          </Pressable>
        )}
      </View>
      {addingSlot && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
          <TextInput
            value={newSlot}
            onChangeText={setNewSlot}
            placeholder="e.g. Post-workout"
            placeholderTextColor={colors.faint}
            maxLength={MAX_SLOT_LENGTH}
            autoFocus
            style={[input, { flex: 1 }]}
          />
          <Pressable onPress={addSlot} style={{ justifyContent: "center", paddingHorizontal: 16, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.accent }}>
            <Text style={{ fontWeight: "700", color: colors.onAccent }}>Add</Text>
          </Pressable>
        </View>
      )}

      {/* 3. Details: calories (estimated for you) and a reminder side by side, then a note. */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={label}>Calories</Text>
          <TextInput
            value={draft.calories}
            onChangeText={(calories) => onChange({ calories: calories.replace(/[^0-9]/g, "") })}
            placeholder={estimate !== null ? kcalLabel(estimate) : "kcal (optional)"}
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Calories"
            style={input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={label}>Reminder</Text>
          <TextInput
            value={draft.time}
            onChangeText={(time) => onChange({ time })}
            placeholder="18:30 (optional)"
            placeholderTextColor={colors.faint}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            accessibilityLabel="Reminder time"
            style={input}
          />
        </View>
      </View>
      <Text style={{ fontSize: 11.5, color: colors.faint, marginBottom: 14, minHeight: 15 }}>{hint}</Text>

      <Text style={label}>Note</Text>
      <TextInput
        value={draft.note}
        onChangeText={(note) => onChange({ note })}
        placeholder="Optional"
        placeholderTextColor={colors.faint}
        maxLength={255}
        style={[input, { marginBottom: 18 }]}
      />

      {isEdit && (
        <>
          <Text style={label}>Status</Text>
          <View style={{ flexDirection: "row", gap: 4, padding: 3, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.surface2, marginBottom: 18 }}>
            {(["planned", "cooked", "skipped"] as MealStatus[]).map((status) => {
              const on = draft.status === status;
              return (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onChange({ status })}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderCurve: "continuous", borderRadius: 8, backgroundColor: on ? `${colors.accent}29` : "transparent" }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? colors.accent : colors.muted }}>{STATUS_LABEL[status]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {error && <Text style={{ fontSize: 12.5, color: colors.bad, marginBottom: 10 }}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 46, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.surface2 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={{ flex: 2, alignItems: "center", justifyContent: "center", height: 46, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onAccent }}>Save</Text>}
        </Pressable>
      </View>
      {isEdit && onDelete && (
        <Pressable onPress={onDelete} disabled={saving} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.bad }}>Delete meal</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
