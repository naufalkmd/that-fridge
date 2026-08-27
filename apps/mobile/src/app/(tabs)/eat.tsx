import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  describeError,
  type MealType,
  type Recipe,
  type Vibe,
  type WhatToEatResult,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";

const MEALS: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

const VIBES: { key: Vibe; label: string }[] = [
  { key: "quick_easy", label: "Quick & easy" },
  { key: "comfort", label: "Comfort" },
  { key: "light_fresh", label: "Light & fresh" },
  { key: "use_it_up", label: "Use it up" },
];

export default function Eat() {
  const { refresh: refreshInventory } = useInventory();
  const [meal, setMeal] = useState<MealType | null>(null);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [result, setResult] = useState<WhatToEatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api.suggestRecipes({ mealType: meal, vibes: vibe ? [vibe] : [] }),
      );
    } catch (e) {
      setError(describeError(e, "Couldn't get suggestions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="px-5 pb-24 pt-3 gap-4">
      <View className="gap-2">
        <Text className="text-[12px] font-bold tracking-wide text-faint">MEAL</Text>
        <ChipRow
          options={MEALS}
          value={meal}
          onChange={(k) => setMeal(meal === k ? null : (k as MealType))}
        />
      </View>
      <View className="gap-2">
        <Text className="text-[12px] font-bold tracking-wide text-faint">VIBE</Text>
        <ChipRow
          options={VIBES}
          value={vibe}
          onChange={(k) => setVibe(vibe === k ? null : (k as Vibe))}
        />
      </View>

      <Pressable
        onPress={run}
        disabled={loading}
        className="items-center rounded-lg bg-warn py-3 active:opacity-80"
      >
        {loading ? (
          <ActivityIndicator color="#0a0a0c" />
        ) : (
          <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">
            What can I cook?
          </Text>
        )}
      </Pressable>

      {error && (
        <Pressable onPress={run} className="rounded-xl border border-bad bg-surface p-3">
          <Text className="font-semibold text-bad">{error}</Text>
        </Pressable>
      )}

      {result && !loading && (
        <>
          {result.exact.length === 0 && result.similar.length === 0 && (
            <Text className="mt-6 text-center text-[13px] text-faint">
              Nothing matches right now. Try clearing the filters or adding items.
            </Text>
          )}

          {result.exact.length > 0 && (
            <Section title="You have everything for these">
              {result.exact.map((r) => (
                <RecipeCard key={r.id} recipe={r} onMade={refreshInventory} />
              ))}
            </Section>
          )}

          {result.similar.length > 0 && (
            <Section title="Almost — missing a couple things">
              {result.similar.map((r) => (
                <RecipeCard key={r.id} recipe={r} onMade={refreshInventory} />
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-[12px] font-bold tracking-wide text-faint">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function RecipeCard({ recipe, onMade }: { recipe: Recipe; onMade: () => void }) {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  async function markMade() {
    setMarking(true);
    try {
      await api.markRecipeMade(recipe.id);
      onMade();
      Alert.alert("Nice", `"${recipe.name}" logged. Inventory updated.`);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't mark that made."));
    } finally {
      setMarking(false);
    }
  }

  return (
    <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      <Pressable onPress={() => setOpen((v) => !v)} className="p-4 active:bg-canvas">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-[15px] font-bold text-ink">{recipe.name}</Text>
          <Text className="text-[12px] text-muted">{recipe.minutes} min</Text>
        </View>
        <Text className="mt-1 text-[11.5px] text-faint">
          {recipe.ingredients.map((i) => i.name).join(" · ")}
        </Text>
      </Pressable>

      {open && (
        <View className="gap-3 border-t border-hairline p-4">
          <View className="gap-1">
            <Text className="text-[12px] font-bold tracking-wide text-faint">INGREDIENTS</Text>
            {recipe.ingredients.map((ing, i) => (
              <Text key={i} className="text-[13px] text-ink">
                • {ing.name}
              </Text>
            ))}
          </View>
          <View className="gap-1">
            <Text className="text-[12px] font-bold tracking-wide text-faint">STEPS</Text>
            {recipe.steps.map((step, i) => (
              <Text key={i} className="text-[13px] leading-5 text-ink">
                {i + 1}. {step}
              </Text>
            ))}
          </View>
          <Pressable
            onPress={markMade}
            disabled={marking}
            className="mt-1 items-center rounded-lg border border-good py-2.5 active:opacity-70"
          >
            {marking ? (
              <ActivityIndicator color="#3f8f5c" />
            ) : (
              <Text className="font-semibold text-good">I made this</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className={`rounded-lg border px-3 py-1.5 ${
              active ? "border-warn bg-warn" : "border-hairline bg-surface"
            }`}
          >
            <Text className={`text-[12.5px] font-bold ${active ? "text-[#0a0a0c]" : "text-ink"}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
