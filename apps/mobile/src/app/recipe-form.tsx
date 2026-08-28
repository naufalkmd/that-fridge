import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError, type RecipeCategory } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useRecipes } from "@/lib/recipes";
import { SheetHeader } from "@/components/sheet";

const AMBER = "#26c6da";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

const CATEGORIES: RecipeCategory[] = ["breakfast", "lunch", "dinner", "dessert", "snack", "quick"];

export default function RecipeForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { byId, create, update } = useRecipes();
  const existing = id ? byId(id) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [minutes, setMinutes] = useState(String(existing?.minutes ?? 20));
  const [category, setCategory] = useState<RecipeCategory | null>(existing?.category ?? null);
  const [ingredients, setIngredients] = useState<string[]>(
    existing?.ingredients.map((i) => i.name) ?? [""],
  );
  const [steps, setSteps] = useState<string[]>(existing?.steps ?? [""]);
  const [link, setLink] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function importLink() {
    if (!link.trim()) return;
    setImporting(true);
    try {
      const res = await api.importRecipeFromLink(link.trim());
      if (res.found && res.recipe) {
        setName(res.recipe.name);
        setMinutes(String(res.recipe.minutes || 20));
        setCategory(res.recipe.category);
        setIngredients(res.recipe.ingredients.map((i) => i.name));
        setSteps(res.recipe.steps);
        setLink("");
        api.postBadgeProgress("first_link_recipe", 1).catch(() => {});
      } else {
        Alert.alert("Nothing found", res.reason ?? "Couldn't read a recipe from that link.");
      }
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't import that link."));
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    const cleanIngredients = ingredients.map((s) => s.trim()).filter(Boolean);
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || cleanIngredients.length === 0 || cleanSteps.length === 0) {
      Alert.alert("Missing fields", "Add a name, at least one ingredient, and one step.");
      return;
    }
    setSaving(true);
    const data = {
      name: name.trim(),
      minutes: Number(minutes) || 20,
      category,
      ingredients: cleanIngredients.map((n) => ({ name: n, icon: "leftovers" })),
      steps: cleanSteps,
    };
    try {
      if (existing) await update(existing.id, data);
      else await create(data);
      router.back();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't save that recipe."));
    } finally {
      setSaving(false);
    }
  }

  const setAt = (list: string[], set: (v: string[]) => void, i: number, v: string) =>
    set(list.map((x, idx) => (idx === i ? v : x)));
  const removeAt = (list: string[], set: (v: string[]) => void, i: number) =>
    set(list.length > 1 ? list.filter((_, idx) => idx !== i) : list);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader title={existing ? "Edit recipe" : "New recipe"} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {!existing && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="Paste a recipe link to import…"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              keyboardType="url"
              style={[input, { flex: 1 }]}
            />
            <Pressable
              onPress={importLink}
              disabled={importing || !link.trim()}
              style={{ paddingHorizontal: 14, justifyContent: "center", borderRadius: 6, backgroundColor: SURFACE2, opacity: importing || !link.trim() ? 0.5 : 1 }}
            >
              {importing ? (
                <ActivityIndicator color={BLUE} />
              ) : (
                <MaterialCommunityIcons name="link-variant" size={16} color={BLUE} />
              )}
            </Pressable>
          </View>
        )}

        <Field label="NAME">
          <TextInput value={name} onChangeText={setName} placeholder="Weeknight pasta" placeholderTextColor={FAINT} style={input} />
        </Field>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 100 }}>
            <Field label="MINUTES">
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={input} />
            </Field>
          </View>
        </View>

        <Field label="CATEGORY">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(active ? null : c)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: active ? AMBER : SURFACE2 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#0a0a0c" : INK, textTransform: "capitalize" }}>
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="INGREDIENTS">
          <View style={{ gap: 8 }}>
            {ingredients.map((v, i) => (
              <RowInput
                key={i}
                value={v}
                placeholder="e.g. 2 eggs"
                onChangeText={(t) => setAt(ingredients, setIngredients, i, t)}
                onRemove={() => removeAt(ingredients, setIngredients, i)}
              />
            ))}
            <AddRow label="Add ingredient" onPress={() => setIngredients([...ingredients, ""])} />
          </View>
        </Field>

        <Field label="STEPS">
          <View style={{ gap: 8 }}>
            {steps.map((v, i) => (
              <RowInput
                key={i}
                value={v}
                multiline
                placeholder={`Step ${i + 1}`}
                onChangeText={(t) => setAt(steps, setSteps, i, t)}
                onRemove={() => removeAt(steps, setSteps, i)}
              />
            ))}
            <AddRow label="Add step" onPress={() => setSteps([...steps, ""])} />
          </View>
        </Field>

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ alignItems: "center", paddingVertical: 14, borderRadius: 8, backgroundColor: AMBER, marginTop: 4 }}
        >
          {saving ? (
            <ActivityIndicator color="#0a0a0c" />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
              {existing ? "Save changes" : "Add recipe"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const input = {
  borderWidth: 1,
  borderColor: HAIRLINE,
  backgroundColor: SURFACE2,
  borderRadius: 6,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 13.5,
  color: INK,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function RowInput({
  value,
  placeholder,
  multiline,
  onChangeText,
  onRemove,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  onChangeText: (t: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={FAINT}
        multiline={multiline}
        style={[input, { flex: 1 }]}
      />
      <Pressable onPress={onRemove} hitSlop={8} style={{ padding: 10 }}>
        <MaterialCommunityIcons name="close" size={16} color={FAINT} />
      </Pressable>
    </View>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
      <MaterialCommunityIcons name="plus" size={14} color={MUTED} />
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: MUTED }}>{label}</Text>
    </Pressable>
  );
}
