import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  daysLabel,
  freshColor,
  type FlatItem,
  type NutritionCategory,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { SectionHeader } from "@/components/ui";
import { FoodIcon } from "@/components/food-icon";

type Sort = "expiry" | "name" | "category";
const SORTS: Sort[] = ["expiry", "name", "category"];

const CAT_LABEL = Object.fromEntries(
  NUTRITION_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<NutritionCategory, string>;

export default function Inventory() {
  const router = useRouter();
  const { items, loading, error, refresh } = useInventory();
  const [sort, setSort] = useState<Sort>("expiry");
  const [cat, setCat] = useState<NutritionCategory | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  const presentCats = useMemo(() => {
    const set = new Set(items.map((i) => i.nutritionCategory).filter(Boolean));
    return NUTRITION_CATEGORIES.filter((c) => set.has(c.key));
  }, [items]);

  const filtered = useMemo(
    () => (cat === "all" ? items : items.filter((i) => i.nutritionCategory === cat)),
    [items, cat],
  );

  const flat = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : a.freshness - b.freshness,
      ),
    [filtered, sort],
  );

  const groups = useMemo(() => {
    if (sort !== "category") return null;
    return NUTRITION_CATEGORIES.map((c) => ({
      label: c.label,
      items: filtered
        .filter((i) => (i.nutritionCategory ?? "other_extras") === c.key)
        .sort((a, b) => a.freshness - b.freshness),
    })).filter((g) => g.items.length > 0);
  }, [filtered, sort]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="px-5 pb-28 pt-3"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {error && (
          <Pressable onPress={refresh} className="mb-4 rounded-xl border border-bad bg-surface p-3">
            <Text className="font-semibold text-bad">{error}</Text>
            <Text className="mt-0.5 text-[12px] text-muted">Tap to retry.</Text>
          </Pressable>
        )}

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[15px] font-bold text-ink">
            {filtered.length} item{filtered.length === 1 ? "" : "s"}
          </Text>
          <View className="flex-row rounded-lg bg-surface p-1">
            {SORTS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setSort(s)}
                className={`rounded-md px-2.5 py-1.5 ${sort === s ? "bg-canvas" : ""}`}
              >
                <Text
                  className={`text-[11.5px] font-bold capitalize ${
                    sort === s ? "text-ink" : "text-muted"
                  }`}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {presentCats.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4 -mx-5"
            contentContainerClassName="px-5 gap-2"
          >
            {[{ key: "all", label: "All" }, ...presentCats].map((c) => {
              const active = cat === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCat(c.key as NutritionCategory | "all")}
                  className={`rounded-lg border px-3.5 py-1.5 ${
                    active ? "border-ink bg-ink" : "border-hairline bg-surface"
                  }`}
                >
                  <Text
                    className={`text-[12.5px] font-bold ${active ? "text-canvas" : "text-ink"}`}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {filtered.length === 0 ? (
          <Text className="mt-10 text-center text-[13px] text-faint">
            {items.length === 0 ? "Nothing in your fridge yet." : "No items in this category."}
          </Text>
        ) : groups ? (
          <View className="gap-5">
            {groups.map((g) => (
              <View key={g.label}>
                <View className="mb-2 flex-row items-baseline justify-between">
                  <SectionHeader>{g.label}</SectionHeader>
                  <Text className="text-[11px] text-faint">{g.items.length}</Text>
                </View>
                <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
                  {g.items.map((item, i) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      last={i === g.items.length - 1}
                      onPress={() => router.push(`/item/${item.id}`)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
            {flat.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                last={i === flat.length - 1}
                onPress={() => router.push(`/item/${item.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push("/add")}
        className="absolute bottom-4 right-6 h-14 w-14 items-center justify-center rounded-full bg-accent active:opacity-80"
        style={{ elevation: 4 }}
      >
        <Text className="text-[26px] font-bold leading-none text-[#0a0a0c]">+</Text>
      </Pressable>
    </>
  );
}

function ItemRow({ item, last, onPress }: { item: FlatItem; last: boolean; onPress: () => void }) {
  const { setItemQty } = useInventory();
  const loc = STORAGE_LOCATIONS.find((l) => l.key === (item.location ?? "fridge"))!;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3.5 py-3 active:bg-canvas ${
        last ? "" : "border-b border-hairline"
      }`}
    >
      <FoodIcon icon={item.icon} iconUrl={item.iconUrl} name={item.name} size={40} />

      <View className="flex-1">
        <View className="mb-1 flex-row items-center gap-1.5">
          <Text className="shrink text-[14px] font-semibold text-ink" numberOfLines={1}>
            {item.name}
          </Text>
          <View className="rounded px-1 py-px" style={{ backgroundColor: `${loc.color}26` }}>
            <Text className="text-[9px] font-bold" style={{ color: loc.color }}>
              {loc.short}
            </Text>
          </View>
        </View>
        <Text className="mb-1.5 text-[10.5px] text-faint" numberOfLines={1}>
          {item.sectionName} · {item.fridgeName}
          {item.nutritionCategory ? ` · ${CAT_LABEL[item.nutritionCategory]}` : ""}
        </Text>
        <View className="h-1 overflow-hidden rounded-full bg-canvas">
          <View
            className="h-full rounded-full"
            style={{
              width: `${Math.max(3, item.freshness)}%`,
              backgroundColor: freshColor(item.freshness),
            }}
          />
        </View>
      </View>

      <View className="items-end">
        <Text className="text-[12px] font-bold" style={{ color: freshColor(item.freshness) }}>
          {daysLabel(item.days)}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-2">
          <Stepper label="−" onPress={() => setItemQty(item.id, item.qty - 1)} />
          <Text className="min-w-4 text-center text-[12px] font-bold text-ink">{item.qty}</Text>
          <Stepper label="+" onPress={() => setItemQty(item.id, item.qty + 1)} />
        </View>
      </View>
    </Pressable>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="h-5 w-5 items-center justify-center rounded-full bg-canvas active:opacity-60"
    >
      <Text className="text-[13px] font-bold leading-none text-ink">{label}</Text>
    </Pressable>
  );
}
