import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useShopping } from "@/lib/shopping";
import { useRecipes } from "@/lib/recipes";
import { FoodIcon } from "@/components/food-icon";
import { SheetHeader } from "@/components/sheet";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";
const BAD = "#ff5567";

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { byId, ensureRecipe, setFavorite, remove } = useRecipes();
  const { items } = useInventory();
  const { items: shoppingItems, add: addToShopping } = useShopping();

  const cached = byId(id);
  const [fetched, setFetched] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;
    if (cached) {
      setFetched(cached);
      return;
    }
    setLoading(true);
    ensureRecipe(id).then((r) => {
      if (alive) {
        setFetched(r ?? undefined);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, cached, ensureRecipe]);

  // Prefer the live cache entry (reflects favorite toggles / edits) over the initial fetch.
  const recipe = byId(id) ?? fetched;

  const onToggleFav = async () => {
    if (!recipe) return;
    const saved = await setFavorite(recipe, !recipe.isFavorite);
    if (saved) setFetched(saved);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }
  if (!recipe) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">That recipe is gone.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="font-semibold text-accent">Close</Text>
        </Pressable>
      </View>
    );
  }

  const ingredients = recipe.ingredients.map((ing) => ({
    ...ing,
    have: items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()),
    onList: shoppingItems.some(
      (s) => !s.checked && s.name.toLowerCase() === ing.name.toLowerCase(),
    ),
  }));
  const haveCount = ingredients.filter((i) => i.have).length;

  function markMade() {
    router.push({ pathname: "/recipe/mark-made", params: { id: recipe!.id } });
  }

  function confirmDelete() {
    Alert.alert("Delete recipe", `Remove "${recipe!.name}" from your book?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await remove(recipe!.id);
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            router.back();
          } catch (e) {
            Alert.alert("Error", describeError(e, "Couldn't delete that."));
          }
        },
      },
    ]);
  }

  return (
    <>
      <SheetHeader title="Recipe" />
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 36 }}
      >
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 10,
              backgroundColor: SURFACE2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FoodIcon icon={recipe.ingredients[0]?.icon ?? "leftovers"} name={recipe.name} size={44} />
          </View>
          <View style={{ position: "absolute", top: 0, right: "50%", marginRight: -58, flexDirection: "row", gap: 6 }}>
            <IconBtn
              icon={recipe.isFavorite ? "heart" : "heart-outline"}
              tint={recipe.isFavorite ? AMBER : INK}
              onPress={onToggleFav}
            />
            {recipe.isMine && (
              <IconBtn icon="pencil" tint={INK} onPress={() => router.push(`/recipe-form?id=${recipe.id}`)} />
            )}
          </View>
        </View>

        <Text style={{ textAlign: "center", fontSize: 19, fontWeight: "700", color: INK }}>
          {recipe.name}
        </Text>
        {!recipe.isMine && recipe.isCustom && recipe.ownerUsername && (
          <Text style={{ textAlign: "center", fontSize: 11.5, color: FAINT, marginTop: 2 }}>
            by @{recipe.ownerUsername}
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, marginBottom: 18 }}>
          <Text style={{ fontSize: 12.5, color: FAINT }}>
            {recipe.minutes} min · {haveCount}/{ingredients.length} ready
          </Text>
          {recipe.category && (
            <View style={{ backgroundColor: `${BLUE}1a`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 10.5, fontWeight: "800", letterSpacing: 0.3, color: BLUE }}>
                {recipe.category.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
          INGREDIENTS
        </Text>
        <View style={{ borderRadius: 8, backgroundColor: SURFACE2, overflow: "hidden", marginBottom: 20 }}>
          {ingredients.map((ing, i) => {
            const done = ing.have || ing.onList;
            const tint = ing.have ? GOOD : ing.onList ? BLUE : FAINT;
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
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: done ? tint : `${tint}1a`,
                  }}
                >
                  <MaterialCommunityIcons name={done ? "check" : "plus"} size={12} color={done ? "#0a0a0c" : tint} />
                </View>
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: INK }}>{ing.name}</Text>
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: tint }}>
                  {ing.have ? "Have it" : ing.onList ? "On list" : "Need it"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
          STEPS
        </Text>
        <View style={{ gap: 10, marginBottom: 20 }}>
          {recipe.steps.map((step, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE2 }}>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: BLUE }}>{i + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: INK }}>{step}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={markMade}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 13,
            borderRadius: 8,
            backgroundColor: AMBER,
            marginBottom: recipe.attachments.length ? 20 : 8,
          }}
        >
          <MaterialCommunityIcons name="chef-hat" size={15} color="#0a0a0c" />
          <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
            Mark as made
          </Text>
        </Pressable>

        {recipe.attachments.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              REFERENCE
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {recipe.attachments.map((att, i) => (
                <Pressable
                  key={i}
                  onPress={() =>
                    att.type === "image"
                      ? router.push({ pathname: "/recipe/attachment", params: { url: att.url } })
                      : Linking.openURL(att.url)
                  }
                >
                  <View style={{ width: 64, height: 64, borderRadius: 6, overflow: "hidden", backgroundColor: "#000" }}>
                    {att.type === "image" ? (
                      <Image source={{ uri: att.url }} style={{ flex: 1 }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <MaterialCommunityIcons name="play" size={20} color={INK} />
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {recipe.isMine && (
          <Pressable onPress={confirmDelete} style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: BAD }}>Delete recipe</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function IconBtn({
  icon,
  tint,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: SURFACE2,
        borderWidth: 1,
        borderColor: HAIRLINE,
      }}
    >
      <MaterialCommunityIcons name={icon} size={14} color={tint} />
    </Pressable>
  );
}
