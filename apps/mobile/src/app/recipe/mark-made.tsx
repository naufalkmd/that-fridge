import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useRecipes } from "@/lib/recipes";
import { FoodIcon } from "@/components/food-icon";
import { SheetHeader } from "@/components/sheet";
import { useToast } from "@/lib/toast";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const STRONG = "rgba(255,255,255,0.18)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const GOOD = "#39e07f";
const WARN = "#f5a623";

type Row = { id: string; ingredientName: string; itemId: string; itemName: string; icon: string };
type Status = "finished" | "remaining";

/**
 * "Mark as made" reconciliation — the mobile port of apps/web's MarkRecipeMadeSheet. For each
 * recipe ingredient, matches fridge items by icon (soonest-expiring wins when several share
 * one), and lets the user mark each Finished (used up → removed + logged) or Remaining (left
 * in the fridge), or drop a row entirely. Only Confirm commits. If nothing matched, it's just
 * a plain "log this recipe" confirm.
 */
export default function MarkRecipeMade() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { byId } = useRecipes();
  const { items, removeItem, patchItem } = useInventory();
  const { refresh: refreshScore } = useKitchenScore();
  const [busy, setBusy] = useState(false);

  const recipe = byId(id);

  const initialRows = useMemo<Row[]>(() => {
    if (!recipe) return [];
    const rows: Row[] = [];
    let n = 0;
    for (const ing of recipe.ingredients) {
      const matches = items.filter((i) => i.icon === ing.icon);
      if (!matches.length) continue;
      const soonest = matches.reduce((a, b) => (b.days < a.days ? b : a));
      rows.push({ id: `row-${n++}`, ingredientName: ing.name, itemId: soonest.id, itemName: soonest.name, icon: soonest.icon });
    }
    return rows;
    // recipe + items are stable for the life of this sheet; deliberately compute once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [status, setStatus] = useState<Record<string, Status>>(
    () => Object.fromEntries(initialRows.map((r) => [r.id, "finished" as Status])),
  );

  if (!recipe) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">That recipe is gone.</Text>
      </View>
    );
  }

  async function confirm() {
    setBusy(true);
    try {
      await api.markRecipeMade(recipe!.id);

      // "finished" wins if the same physical item is referenced by two rows — it can't be
      // both used up and still in the fridge.
      const itemIds = Array.from(new Set(rows.map((r) => r.itemId)));
      for (const itemId of itemIds) {
        const it = items.find((i) => i.id === itemId);
        if (!it) continue;
        const finished = rows.some((r) => r.itemId === itemId && status[r.id] === "finished");
        if (!finished) {
          // "remaining" → used from, not finished: keep it, mark opened
          if (!it.opened) await patchItem(itemId, { opened: true }).catch(() => {});
          continue;
        }
        await api
          .recordItemUsage({
            name: it.name,
            icon: it.icon,
            daysRemaining: it.days,
            freshness: it.freshness,
            category: it.nutritionCategory ?? null,
          })
          .catch(() => {});
        if (it.days >= 0 && it.days <= 3) api.postBadgeProgress("rescued_10", 1).catch(() => {});
        await removeItem(itemId).catch(() => {});
      }

      refreshScore();
      router.back();
      toast.show(`"${recipe!.name}" logged`);
    } catch (e) {
      setBusy(false);
      Alert.alert("Error", describeError(e, "Couldn't mark that made."));
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="Mark as made" />
      <Text style={{ paddingHorizontal: 22, fontSize: 12.5, lineHeight: 18, color: MUTED, marginBottom: 14 }}>
        {rows.length > 0
          ? "These fridge items look like a match — mark each finished or still remaining, or remove anything you didn't use."
          : "None of this recipe's ingredients matched anything in your fridge, so there's nothing to update — just logging that you made it."}
      </Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 12 }}>
        {rows.length > 0 && (
          <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: SURFACE }}>
            {rows.map((r, i) => {
              const st = status[r.id] ?? "finished";
              return (
                <View
                  key={r.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: 12,
                    borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                    borderBottomColor: HAIRLINE,
                  }}
                >
                  <FoodIcon icon={r.icon} name={r.ingredientName} size={28} />
                  <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: INK }} numberOfLines={1}>
                    {r.ingredientName}
                  </Text>
                  <View style={{ flexDirection: "row", backgroundColor: SURFACE2, borderRadius: 6, padding: 2 }}>
                    {(["finished", "remaining"] as Status[]).map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => setStatus((s) => ({ ...s, [r.id]: opt }))}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 5,
                          backgroundColor: st === opt ? (opt === "finished" ? GOOD : WARN) : "transparent",
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: st === opt ? "#0a0a0c" : MUTED }}>
                          {opt === "finished" ? "Finished" : "Remaining"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={() =>
                      setRows((rs) => rs.filter((x) => x.id !== r.id))
                    }
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close" size={16} color={STRONG} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: STRONG }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={busy ? undefined : confirm}
          style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 10, backgroundColor: AMBER }}
        >
          {busy ? (
            <ActivityIndicator color="#0a0a0c" />
          ) : (
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#0a0a0c" }}>
              {rows.length > 0 ? `Confirm (${rows.length})` : "Confirm"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
