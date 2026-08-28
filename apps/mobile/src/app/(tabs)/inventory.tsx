import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  NUTRITION_CATEGORIES,
  daysLabel,
  freshColor,
  guessNutritionCategory,
  type FlatItem,
  type NutritionCategory,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { PixelText } from "@/components/brand";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { CategoryTag, LocationTag } from "@/components/tags";
import { FoodIcon } from "@/components/food-icon";
import { SkeletonList } from "@/components/ui";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const BLUE = "#5b8dee";
const FAINT = "rgba(234,234,236,0.34)";

type Sort = "category" | "expiry" | "name";
const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "expiry", label: "Expiry" },
  { key: "name", label: "Name" },
];

const resolveCategory = (item: FlatItem): NutritionCategory =>
  item.nutritionCategory ?? guessNutritionCategory(item.icon) ?? "other_extras";

export default function Inventory() {
  const router = useRouter();
  const { items, loading, error, refresh } = useInventory();
  const { scope } = useScope();

  const [sort, setSort] = useState<Sort>("expiry");
  const [sortMenu, setSortMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<NutritionCategory | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  const showFridgeTags = scope === "all";
  const allItems = useMemo(() => scopeItems(items, scope), [items, scope]);

  const categories = useMemo(() => {
    const present = new Set(allItems.map(resolveCategory));
    return [
      { id: "all" as const, name: "All" },
      ...NUTRITION_CATEGORIES.filter((c) => present.has(c.key)).map((c) => ({
        id: c.key,
        name: c.label,
      })),
    ];
  }, [allItems]);

  const filtered = useMemo(
    () =>
      categoryFilter === "all"
        ? allItems
        : allItems.filter((i) => resolveCategory(i) === categoryFilter),
    [allItems, categoryFilter],
  );

  const sorted = useMemo(() => {
    if (sort === "expiry") return [...filtered].sort((a, b) => a.freshness - b.freshness);
    if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    if (sort !== "category") return null;
    return NUTRITION_CATEGORIES.map((c) => ({
      id: c.key,
      name: c.label,
      items: filtered.filter((i) => resolveCategory(i) === c.key).sort((a, b) => a.freshness - b.freshness),
    })).filter((g) => g.items.length > 0);
  }, [filtered, sort]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-5 pt-3 pb-40"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
        onScrollBeginDrag={() => setSortMenu(false)}
      >
        {/* header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <PixelText style={{ fontSize: 16, letterSpacing: 0.5, color: INK }}>Inventory</PixelText>
          <Pressable onPress={() => router.push("/search")} hitSlop={8}>
            <View
              style={{
                height: 34,
                width: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="search" size={16} color={INK} />
            </View>
          </Pressable>
        </View>

        <View style={{ marginBottom: 16 }}>
          <FridgeScopePicker small />
        </View>

        {error && (
          <Pressable
            onPress={refresh}
            style={{
              marginBottom: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#ff5567",
              backgroundColor: SURFACE,
              padding: 12,
            }}
          >
            <Text style={{ fontWeight: "600", color: "#ff5567" }}>{error}</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: "rgba(234,234,236,0.58)" }}>
              Tap to retry.
            </Text>
          </Pressable>
        )}

        {loading ? (
          <View style={{ marginTop: 12 }}>
            <SkeletonList rows={6} />
          </View>
        ) : (
          <>
            {/* all items + sort */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
                zIndex: 10,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>All items</Text>
              <View>
                <Pressable
                  onPress={() => setSortMenu((v) => !v)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 6,
                    backgroundColor: SURFACE,
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                  }}
                >
                  <MaterialCommunityIcons name="filter-variant" size={13} color={INK} />
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: INK }}>
                    {SORT_OPTIONS.find((o) => o.key === sort)?.label}
                  </Text>
                </Pressable>
                {sortMenu && (
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 38,
                      minWidth: 120,
                      backgroundColor: SURFACE,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: HAIRLINE,
                      padding: 6,
                    }}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          setSort(opt.key);
                          setSortMenu(false);
                        }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 6,
                          backgroundColor: sort === opt.key ? SURFACE2 : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: "600",
                            color: sort === opt.key ? BLUE : INK,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* category chips */}
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20, marginBottom: 14 }}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
              >
                {categories.map((cat) => {
                  const active = categoryFilter === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategoryFilter(cat.id)}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 14,
                        borderRadius: 6,
                        backgroundColor: active ? INK : SURFACE,
                        borderWidth: active ? 0 : 1,
                        borderColor: HAIRLINE,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "700",
                          color: active ? "#0a0a0c" : INK,
                        }}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {filtered.length === 0 ? (
              <Text style={{ marginTop: 40, textAlign: "center", fontSize: 13, color: FAINT }}>
                {items.length === 0
                  ? "Nothing in your fridge yet."
                  : "No items in this category."}
              </Text>
            ) : grouped ? (
              grouped.map((g) => (
                <View key={g.id} style={{ marginBottom: 22 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>{g.name}</Text>
                    <Text style={{ fontSize: 12, color: FAINT }}>{g.items.length} items</Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: HAIRLINE,
                      backgroundColor: SURFACE,
                      overflow: "hidden",
                    }}
                  >
                    {g.items.map((item, i) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        last={i === g.items.length - 1}
                        showFridge={showFridgeTags}
                        onPress={() => router.push(`/item/${item.id}`)}
                      />
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  backgroundColor: SURFACE,
                  overflow: "hidden",
                  marginBottom: 22,
                }}
              >
                {sorted.map((item, i) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    last={i === sorted.length - 1}
                    showFridge={showFridgeTags}
                    onPress={() => router.push(`/item/${item.id}`)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemRow({
  item,
  last,
  showFridge,
  onPress,
}: {
  item: FlatItem;
  last: boolean;
  showFridge: boolean;
  onPress: () => void;
}) {
  const { setItemQty } = useInventory();
  const fresh = freshColor(item.freshness);

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 6,
          backgroundColor: SURFACE2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FoodIcon icon={item.icon} iconUrl={item.iconUrl} name={item.name} size={30} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: "600", color: INK }} numberOfLines={1}>
            {item.name}
          </Text>
          {item.opened && (
            <MaterialCommunityIcons name="package-variant" size={12} color={BLUE} />
          )}
          <LocationTag location={item.location} />
          <CategoryTag category={item.nutritionCategory} />
        </View>
        {showFridge && (
          <Text style={{ fontSize: 10.5, color: FAINT, marginBottom: 5 }} numberOfLines={1}>
            {item.fridgeName}
          </Text>
        )}
        <View style={{ height: 4, borderRadius: 2, backgroundColor: SURFACE2, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              borderRadius: 2,
              width: `${Math.max(3, item.freshness)}%`,
              backgroundColor: fresh,
            }}
          />
        </View>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: fresh }}>{daysLabel(item.days)}</Text>
        {!!item.note && (
          <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 2, maxWidth: 90 }} numberOfLines={1}>
            {item.note}
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
          <Stepper icon="minus" onPress={() => setItemQty(item.id, item.qty - 1)} />
          <Text style={{ minWidth: 14, textAlign: "center", fontSize: 12, fontWeight: "700", color: INK }}>
            {item.qty}
          </Text>
          <Stepper icon="plus" onPress={() => setItemQty(item.id, item.qty + 1)} />
        </View>
      </View>
    </Pressable>
  );
}

function Stepper({
  icon,
  onPress,
}: {
  icon: "minus" | "plus";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        height: 20,
        width: 20,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: SURFACE2,
      }}
    >
      <MaterialCommunityIcons name={icon} size={11} color={INK} />
    </Pressable>
  );
}
