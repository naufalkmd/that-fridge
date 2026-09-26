import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type { ChatContextType } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useRecipes } from "@/lib/recipes";
import { useTheme } from "@/lib/theme";
import { CONTEXT_TYPES, dayLabel, dayOptions, weekOptions, type ChatContext } from "@/lib/chatContext";
import { toISO } from "@/lib/calendar";
import { BottomSheet } from "@/components/bottom-sheet";

/**
 * "Add context" for Quick Chat: pin something from your kitchen to the message so the crew reads it - an item,
 * a fridge, a recipe, a day, a week of the meal plan, the shopping list, or what's expiring. Two steps: what
 * kind of thing, then which one (the parameterless kinds are added straight away).
 */
export function ContextSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: ChatContext) => void }) {
  const { colors } = useTheme();
  const { items, fridges } = useInventory();
  const { recipes } = useRecipes();
  const [step, setStep] = useState<ChatContextType | null>(null);
  const [query, setQuery] = useState("");
  const today = toISO(new Date());

  useEffect(() => {
    if (visible) {
      setStep(null);
      setQuery("");
    }
  }, [visible]);

  const q = query.trim().toLowerCase();
  const itemMatches = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items).slice(0, 40),
    [items, q],
  );
  const recipeMatches = useMemo(
    () => (q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : recipes).slice(0, 40),
    [recipes, q],
  );

  const pick = (c: ChatContext) => {
    onPick(c);
    onClose();
  };

  function choose(type: ChatContextType) {
    if (type === "shopping") return pick({ type, label: "Shopping list" });
    if (type === "expiring") return pick({ type, label: "Expiring soon" });
    setQuery("");
    setStep(type);
  }

  const meta = step ? CONTEXT_TYPES.find((t) => t.type === step)! : null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {step && (
            <Pressable onPress={() => setStep(null)} hitSlop={10} accessibilityLabel="Back to context types">
              <Ionicons name="chevron-back" size={20} color={colors.muted} />
            </Pressable>
          )}
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>{meta ? meta.label : "Add context"}</Text>
        </View>

        {step === null && (
          <View>
            {CONTEXT_TYPES.map((t) => (
              <Row key={t.type} icon={t.icon} title={t.label} hint={t.hint} onPress={() => choose(t.type)} />
            ))}
          </View>
        )}

        {(step === "item" || step === "recipe") && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={step === "item" ? "Search your items" : "Search your recipes"}
            placeholderTextColor={colors.faint}
            accessibilityLabel="Search"
            autoCorrect={false}
            style={{ height: 42, paddingHorizontal: 12, borderRadius: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline }}
          />
        )}

        <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
          {step === "item" &&
            (itemMatches.length === 0 ? (
              <Empty>No items match.</Empty>
            ) : (
              itemMatches.map((i) => (
                <Row
                  key={i.id}
                  icon="nutrition-outline"
                  title={i.name}
                  hint={`${i.fridgeName} · ${i.days < 0 ? `${Math.abs(i.days)}d overdue` : `${i.days}d left`}`}
                  onPress={() => pick({ type: "item", id: i.id, label: i.name })}
                />
              ))
            ))}

          {step === "fridge" &&
            (fridges.length === 0 ? (
              <Empty>No fridges yet.</Empty>
            ) : (
              fridges.map((f) => (
                <Row key={f.id} icon="cube-outline" title={f.name} onPress={() => pick({ type: "fridge", id: f.id, label: f.name })} />
              ))
            ))}

          {step === "recipe" &&
            (recipeMatches.length === 0 ? (
              <Empty>No recipes match.</Empty>
            ) : (
              recipeMatches.map((r) => (
                <Row
                  key={r.id}
                  icon="restaurant-outline"
                  title={r.name}
                  hint={r.minutes ? `${r.minutes} min` : undefined}
                  onPress={() => pick({ type: "recipe", id: r.id, label: r.name })}
                />
              ))
            ))}

          {step === "day" &&
            dayOptions(today).map((d) => (
              <Row
                key={d.date}
                icon="calendar-outline"
                title={d.label}
                onPress={() => pick({ type: "day", id: d.date, label: dayLabel(d.date, today) })}
              />
            ))}

          {step === "meal_plan" &&
            weekOptions(today).map((w) => (
              <Row
                key={w.start}
                icon="calendar-number-outline"
                title={w.label}
                onPress={() => pick({ type: "meal_plan", id: w.start, label: `Meal plan · ${w.label.toLowerCase()}` })}
              />
            ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

function Row({ icon, title, hint, onPress }: { icon: string; title: string; hint?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}>
        <Ionicons name={icon as never} size={18} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.ink }} numberOfLines={1}>{title}</Text>
        {hint ? <Text style={{ fontSize: 12, color: colors.faint, marginTop: 1 }} numberOfLines={1}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function Empty({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 16, textAlign: "center" }}>{children}</Text>;
}
