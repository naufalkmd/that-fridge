import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { Recipe, RecipeCategory } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useRecipes } from "@/lib/recipes";
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";
import { SkeletonList } from "@/components/ui";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";

const CATEGORIES: { key: RecipeCategory | "all" | "fav"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fav", label: "★ Favorites" },
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "dessert", label: "Dessert" },
  { key: "snack", label: "Snack" },
  { key: "quick", label: "Quick" },
];

export default function Recipes() {
  const router = useRouter();
  const { recipes, loading, error, refresh, toggleFavorite } = useRecipes();
  const { items } = useInventory();
  const [filter, setFilter] = useState<RecipeCategory | "all" | "fav">("all");
  const [refreshing, setRefreshing] = useState(false);

  const withReady = useMemo(
    () =>
      recipes.map((r) => {
        const have = r.ingredients.filter((ing) =>
          items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()),
        ).length;
        return { r, have, total: r.ingredients.length };
      }),
    [recipes, items],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return withReady;
    if (filter === "fav") return withReady.filter((x) => x.r.isFavorite);
    return withReady.filter((x) => x.r.category === filter);
  }, [withReady, filter]);

  const tonight = useMemo(
    () =>
      withReady.length
        ? [...withReady].sort((a, b) => b.have / b.total - a.have / a.total)[0]
        : null,
    [withReady],
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          <PixelText style={{ fontSize: 15, color: INK }}>Recipe book</PixelText>
        </View>
        <Pressable onPress={() => router.push("/recipe-form")} hitSlop={8}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SURFACE2,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <Ionicons name="add" size={18} color={INK} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}
      >
        {CATEGORIES.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setFilter(c.key)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 6,
                backgroundColor: active ? INK : SURFACE,
                borderWidth: active ? 0 : 1,
                borderColor: HAIRLINE,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {error && (
          <Pressable
            onPress={refresh}
            style={{ marginBottom: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ff5567", backgroundColor: SURFACE, padding: 12 }}
          >
            <Text style={{ fontWeight: "600", color: "#ff5567" }}>{error}</Text>
          </Pressable>
        )}

        {loading ? (
          <View style={{ marginTop: 12 }}><SkeletonList rows={6} /></View>
        ) : recipes.length === 0 ? (
          <Text style={{ textAlign: "center", paddingVertical: 60, color: FAINT, fontSize: 13 }}>
            No saved recipes yet. Tap ＋ to add one, or save Chef&apos;s suggestions from chat.
          </Text>
        ) : (
          <>
            {filter === "all" && tonight && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
                  TONIGHT&apos;S PICK
                </Text>
                <Row
                  entry={tonight}
                  onPress={() => router.push(`/recipe/${tonight.r.id}`)}
                  onFav={() => toggleFavorite(tonight.r.id)}
                  highlight
                />
              </View>
            )}
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
              {filtered.map(({ r, have, total }, i) => (
                <Row
                  key={r.id}
                  entry={{ r, have, total }}
                  last={i === filtered.length - 1}
                  onPress={() => router.push(`/recipe/${r.id}`)}
                  onFav={() => toggleFavorite(r.id)}
                />
              ))}
              {filtered.length === 0 && (
                <Text style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: FAINT }}>
                  Nothing in this category.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  entry,
  last,
  highlight,
  onPress,
  onFav,
}: {
  entry: { r: Recipe; have: number; total: number };
  last?: boolean;
  highlight?: boolean;
  onPress: () => void;
  onFav: () => void;
}) {
  const { r, have, total } = entry;
  const ready = total > 0 && have === total;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last || highlight ? 0 : 1,
        borderBottomColor: HAIRLINE,
        borderWidth: highlight ? 1 : 0,
        borderColor: highlight ? AMBER : "transparent",
        borderRadius: highlight ? 8 : 0,
        backgroundColor: highlight ? SURFACE : "transparent",
      }}
    >
      <FoodIcon icon={r.ingredients[0]?.icon ?? "leftovers"} name={r.name} size={34} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: INK }} numberOfLines={1}>
          {r.name}
        </Text>
        <Text style={{ fontSize: 11, color: ready ? GOOD : MUTED }} numberOfLines={1}>
          {r.minutes} min · {have}/{total} ready
          {!r.isMine && r.ownerUsername ? ` · from @${r.ownerUsername}` : ""}
        </Text>
      </View>
      <Pressable onPress={onFav} hitSlop={10} style={{ padding: 4 }}>
        <MaterialCommunityIcons
          name={r.isFavorite ? "heart" : "heart-outline"}
          size={18}
          color={r.isFavorite ? AMBER : FAINT}
        />
      </Pressable>
    </Pressable>
  );
}
