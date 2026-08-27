import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  describeError,
  type FoodFocus,
  type MealType,
  type Recipe,
  type Vibe,
  type WhatToEatResult,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useShopping } from "@/lib/shopping";
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";

const CHEF = require("../../../assets/images/thatfridge/chef.gif");

const AMBER = "#26c6da"; // brand accent (the theme's "amber" token)
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const STRONG = "rgba(255,255,255,0.18)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";
const BLUE = "#5b8dee";

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];
const VIBES: { key: Vibe; label: string }[] = [
  { key: "comfort", label: "Comfort" },
  { key: "light_fresh", label: "Light & Fresh" },
  { key: "quick_easy", label: "Quick & Easy" },
  { key: "something_new", label: "Something New" },
  { key: "use_it_up", label: "Use It Up" },
];
const FOOD_FOCUS: { key: FoodFocus; label: string }[] = [
  { key: "high_protein", label: "High Protein" },
  { key: "high_veg", label: "High Veg" },
  { key: "low_carb", label: "Low Carb" },
  { key: "balanced", label: "Balanced" },
];

export default function Eat() {
  const router = useRouter();
  const { refresh: refreshInventory } = useInventory();

  const [meal, setMeal] = useState<MealType | null>(null);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [focus, setFocus] = useState<FoodFocus[]>([]);
  const [result, setResult] = useState<WhatToEatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exactPage, setExactPage] = useState(0);
  const [similarPage, setSimilarPage] = useState(0);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, key: T) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const run = async () => {
    setLoading(true);
    setError(null);
    setExactPage(0);
    setSimilarPage(0);
    try {
      setResult(await api.suggestRecipes({ mealType: meal, vibes, foodFocus: focus }));
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

  const hasResults = result !== null;
  const exhausted = result?.exhausted && (result?.exact.length ?? 0) === 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pt-4 pb-40" contentContainerStyle={{ gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MaterialCommunityIcons name="chef-hat" size={18} color={INK} />
            <PixelText style={{ fontSize: 14, color: INK }}>What should I eat?</PixelText>
          </View>
          <Pressable
            onPress={() => router.push("/recipes")}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="book-open-variant" size={14} color={BLUE} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: BLUE }}>Recipe book</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <Image source={CHEF} style={{ width: 56, height: 56 }} contentFit="contain" />
          <View
            style={{
              backgroundColor: SURFACE2,
              borderRadius: 14,
              borderBottomLeftRadius: 4,
              paddingVertical: 9,
              paddingHorizontal: 13,
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>
              What are the vibes today?
            </Text>
          </View>
        </View>

        <ChipGroup label="MEAL TYPE" scroll>
          {MEAL_TYPES.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              active={meal === o.key}
              onPress={() => setMeal(meal === o.key ? null : o.key)}
            />
          ))}
        </ChipGroup>

        <ChipGroup label="VIBES">
          {VIBES.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              active={vibes.includes(o.key)}
              onPress={() => toggle(vibes, setVibes, o.key)}
            />
          ))}
        </ChipGroup>

        <ChipGroup label="FOOD FOCUS">
          {FOOD_FOCUS.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              active={focus.includes(o.key)}
              onPress={() => toggle(focus, setFocus, o.key)}
            />
          ))}
        </ChipGroup>

        <Pressable
          onPress={loading ? undefined : run}
          style={{
            alignItems: "center",
            paddingVertical: 13,
            borderRadius: 8,
            backgroundColor: loading ? SURFACE2 : AMBER,
          }}
        >
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: loading ? FAINT : "#0a0a0c",
            }}
          >
            {loading ? "Finding meals…" : "Find meals"}
          </Text>
        </Pressable>

        {error && (
          <Pressable
            onPress={run}
            style={{ borderRadius: 12, borderWidth: 1, borderColor: "#ff5567", backgroundColor: SURFACE, padding: 12 }}
          >
            <Text style={{ fontWeight: "600", color: "#ff5567" }}>{error}</Text>
          </Pressable>
        )}

        {hasResults && !loading && (
          <View>
            {exhausted ? (
              <View style={{ alignItems: "center", paddingVertical: 18, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12.5, color: MUTED, marginBottom: 12, textAlign: "center" }}>
                  Nothing in your saved recipes matches that combination yet.
                </Text>
                <AskChef primary onPress={() => router.push("/chat")} />
              </View>
            ) : (
              <>
                <ResultsTier
                  label="EXACT MATCHES"
                  results={result!.exact}
                  page={exactPage}
                  onShuffle={() => setExactPage((p) => p + 1)}
                  onMade={refreshInventory}
                />
                <ResultsTier
                  label="SIMILAR MATCHES"
                  results={result!.similar}
                  page={similarPage}
                  onShuffle={() => setSimilarPage((p) => p + 1)}
                  onMade={refreshInventory}
                />
                {(result!.exact.length > 0 || result!.similar.length > 0) && (
                  <View style={{ alignItems: "center", paddingTop: 18, paddingBottom: 4 }}>
                    <Text style={{ fontSize: 11.5, color: FAINT, marginBottom: 10 }}>
                      Still nothing to your liking? Let&apos;s find something.
                    </Text>
                    <AskChef onPress={() => router.push("/chat")} />
                  </View>
                )}
                {result!.exact.length === 0 && result!.similar.length === 0 && (
                  <Text style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: FAINT }}>
                    Nothing matches right now. Try clearing the filters or adding items.
                  </Text>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AskChef({ onPress, primary }: { onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: primary ? 11 : 10,
        paddingHorizontal: primary ? 20 : 18,
        borderRadius: 8,
        backgroundColor: primary ? AMBER : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: STRONG,
      }}
    >
      <Text
        style={{
          fontSize: primary ? 13 : 12.5,
          fontWeight: "700",
          textTransform: primary ? "uppercase" : "none",
          letterSpacing: primary ? 0.5 : 0,
          color: primary ? "#0a0a0c" : INK,
        }}
      >
        Ask Chef instead
      </Text>
    </Pressable>
  );
}

function ResultsTier({
  label,
  results,
  page,
  onShuffle,
  onMade,
}: {
  label: string;
  results: Recipe[];
  page: number;
  onShuffle: () => void;
  onMade: () => void;
}) {
  const visible = useMemo(() => {
    if (results.length <= 3) return results;
    const start = (page * 3) % results.length;
    const rotated = [...results.slice(start), ...results.slice(0, start)];
    return rotated.slice(0, 3);
  }, [results, page]);

  if (results.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ gap: 8, marginBottom: results.length > 3 ? 10 : 0 }}>
        {visible.map((r) => (
          <RecipeCard key={r.id} recipe={r} onMade={onMade} />
        ))}
      </View>
      {results.length > 3 && (
        <Pressable
          onPress={onShuffle}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 11,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: STRONG,
          }}
        >
          <MaterialCommunityIcons name="shuffle-variant" size={14} color={INK} />
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: INK }}>
            Not feeling these? Shuffle
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function RecipeCard({ recipe, onMade }: { recipe: Recipe; onMade: () => void }) {
  const { items } = useInventory();
  const { items: shoppingItems, add: addToShopping } = useShopping();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const ingredients = recipe.ingredients.map((ing) => ({
    ...ing,
    have: items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()),
    onList: shoppingItems.some(
      (s) => !s.checked && s.name.toLowerCase() === ing.name.toLowerCase(),
    ),
  }));
  const haveCount = ingredients.filter((i) => i.have).length;

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
    <View style={{ borderRadius: 8, backgroundColor: SURFACE2, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}
      >
        <FoodIcon icon={recipe.ingredients[0]?.icon ?? "leftovers"} name={recipe.name} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={{ fontSize: 11, color: FAINT }}>
            {recipe.minutes} min · {haveCount}/{ingredients.length} ready
          </Text>
        </View>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={18} color={FAINT} />
      </Pressable>

      {open && (
        <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)", padding: 14 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              INGREDIENTS
            </Text>
            <View style={{ borderRadius: 8, backgroundColor: SURFACE, overflow: "hidden" }}>
              {ingredients.map((ing, i) => {
                const done = ing.have || ing.onList;
                const tint = ing.have ? GOOD : ing.onList ? "#5b8dee" : FAINT;
                return (
                  <Pressable
                    key={i}
                    onPress={done ? undefined : () => addToShopping(ing.name)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderBottomWidth: i === ingredients.length - 1 ? 0 : 1,
                      borderBottomColor: "rgba(255,255,255,0.09)",
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: `${tint}${done ? "" : "1a"}`,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={done ? "check" : "plus"}
                        size={12}
                        color={done ? "#0a0a0c" : tint}
                      />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: INK }}>
                      {ing.name}
                    </Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: tint }}>
                      {ing.have ? "Have it" : ing.onList ? "On list" : "Need it"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              STEPS
            </Text>
            <View style={{ gap: 10 }}>
              {recipe.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: SURFACE,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#5b8dee" }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: INK }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            onPress={markMade}
            disabled={marking}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 8,
              backgroundColor: AMBER,
            }}
          >
            {marking ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <>
                <MaterialCommunityIcons name="chef-hat" size={15} color="#0a0a0c" />
                <Text style={{ fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
                  Mark as made
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ChipGroup({
  label,
  scroll,
  children,
}: {
  label: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT }}>{label}</Text>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 6,
        backgroundColor: active ? AMBER : SURFACE2,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>
        {label}
      </Text>
    </Pressable>
  );
}
