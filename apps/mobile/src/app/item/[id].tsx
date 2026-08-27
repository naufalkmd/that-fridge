import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { STORAGE_LOCATIONS, daysLabel, freshColor } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { itemById, setItemQty, removeItem } = useInventory();
  const item = itemById(id);

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">This item is no longer in your fridge.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="font-semibold text-accent">Close</Text>
        </Pressable>
      </View>
    );
  }

  const loc = STORAGE_LOCATIONS.find((l) => l.key === (item.location ?? "fridge"))!;

  function confirmDelete() {
    Alert.alert("Delete item", `Remove "${item!.name}" from your fridge?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await removeItem(item!.id);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete.");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-6 gap-5">
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-ink">{item.name}</Text>
        <Text className="text-[13px] text-muted">
          {item.sectionName} · {item.fridgeName}
        </Text>
      </View>

      <View className="rounded-2xl border border-hairline bg-surface p-4 gap-4">
        <Row label="Expires">
          <Text className="font-bold" style={{ color: freshColor(item.freshness) }}>
            {daysLabel(item.days)}
          </Text>
        </Row>
        <View className="h-1.5 overflow-hidden rounded-full bg-canvas">
          <View
            className="h-full rounded-full"
            style={{ width: `${Math.max(3, item.freshness)}%`, backgroundColor: freshColor(item.freshness) }}
          />
        </View>
        <Row label="Location">
          <Text className="font-semibold" style={{ color: loc.color }}>
            {loc.label}
          </Text>
        </Row>
        {item.nutritionCategory && (
          <Row label="Category">
            <Text className="font-semibold capitalize text-ink">
              {item.nutritionCategory.replace("_", " / ")}
            </Text>
          </Row>
        )}
        <Row label="Quantity">
          <View className="flex-row items-center gap-3">
            <Step label="−" onPress={() => setItemQty(item.id, item.qty - 1)} />
            <Text className="min-w-6 text-center text-[15px] font-bold text-ink">{item.qty}</Text>
            <Step label="+" onPress={() => setItemQty(item.id, item.qty + 1)} />
          </View>
        </Row>
        {!!item.note && (
          <Row label="Note">
            <Text className="text-ink">{item.note}</Text>
          </Row>
        )}
      </View>

      <Pressable
        onPress={confirmDelete}
        className="items-center rounded-xl border border-bad py-3 active:opacity-70"
      >
        <Text className="font-semibold text-bad">Delete item</Text>
      </Pressable>

      <Text className="text-center text-[11px] text-faint">
        Editing name / expiry / location comes next (ItemDetailSheet, plan §6).
      </Text>
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[13px] text-muted">{label}</Text>
      {children}
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="h-7 w-7 items-center justify-center rounded-full bg-canvas active:opacity-60"
    >
      <Text className="text-[15px] font-bold leading-none text-ink">{label}</Text>
    </Pressable>
  );
}
