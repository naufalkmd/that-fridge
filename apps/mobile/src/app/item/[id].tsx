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

import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  daysLabel,
  describeError,
  freshColor,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";

const BEST_BEFORE_PRESETS = [
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { itemById, setItemQty, patchItem, removeItem } = useInventory();
  const item = itemById(id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<StorageLocation>("fridge");
  const [category, setCategory] = useState<NutritionCategory | null>(null);
  const [note, setNote] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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

  function startEdit() {
    setName(item!.name);
    setLocation(item!.location ?? "fridge");
    setCategory(item!.nutritionCategory ?? null);
    setNote(item!.note ?? "");
    setExpiryDays(null);
    setEditing(true);
  }

  async function save() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the item a name.");
      return;
    }
    setSaving(true);
    try {
      await patchItem(item!.id, {
        name: name.trim(),
        location,
        nutrition_category: category,
        note: note.trim(),
        ...(expiryDays != null
          ? { expiry_date: isoInDays(expiryDays), shelf_life_days: expiryDays }
          : {}),
      });
      setEditing(false);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't save your changes."));
    } finally {
      setSaving(false);
    }
  }

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

  if (editing) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-canvas"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerClassName="p-6 gap-5" keyboardShouldPersistTaps="handled">
          <Text className="text-xl font-extrabold text-ink">Edit item</Text>

          <Labeled label="NAME">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholderTextColor="#5f7285"
              className="rounded-lg border border-hairline bg-surface px-4 py-3 text-[14px] text-ink"
            />
          </Labeled>

          <Labeled label="LOCATION">
            <ChipRow
              options={STORAGE_LOCATIONS.map((l) => ({ key: l.key, label: l.label }))}
              value={location}
              onChange={(k) => setLocation(k as StorageLocation)}
            />
          </Labeled>

          <Labeled label="FOOD GROUP">
            <ChipRow
              options={NUTRITION_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
              value={category}
              onChange={(k) => setCategory(category === k ? null : (k as NutritionCategory))}
            />
          </Labeled>

          <Labeled label="BEST BEFORE">
            <ChipRow
              options={BEST_BEFORE_PRESETS.map((p) => ({ key: String(p.days), label: p.label }))}
              value={expiryDays == null ? null : String(expiryDays)}
              onChange={(k) => setExpiryDays(Number(k))}
            />
            <Text className="mt-1.5 text-[11px] text-faint">
              {expiryDays == null
                ? `Currently ${daysLabel(item.days)} — leave untouched to keep it`
                : `New best-before: ${isoInDays(expiryDays)}`}
            </Text>
          </Labeled>

          <Labeled label="NOTE">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. 2 loaves"
              placeholderTextColor="#5f7285"
              className="rounded-lg border border-hairline bg-surface px-4 py-3 text-[14px] text-ink"
            />
          </Labeled>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setEditing(false)}
              className="flex-1 items-center rounded-lg border border-hairline py-3 active:opacity-70"
            >
              <Text className="font-semibold text-ink">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              className="flex-1 items-center rounded-lg bg-warn py-3 active:opacity-80"
            >
              {saving ? (
                <ActivityIndicator color="#0a0a0c" />
              ) : (
                <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">Save</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-6 gap-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 gap-1">
          <Text className="text-2xl font-extrabold text-ink">{item.name}</Text>
          <Text className="text-[13px] text-muted">
            {item.sectionName} · {item.fridgeName}
          </Text>
        </View>
        <Pressable onPress={startEdit} hitSlop={8} className="px-2 py-1">
          <Text className="font-semibold text-accent">Edit</Text>
        </Pressable>
      </View>

      <View className="gap-4 rounded-2xl border border-hairline bg-surface p-4">
        <Row label="Expires">
          <Text className="font-bold" style={{ color: freshColor(item.freshness) }}>
            {daysLabel(item.days)}
          </Text>
        </Row>
        <View className="h-1.5 overflow-hidden rounded-full bg-canvas">
          <View
            className="h-full rounded-full"
            style={{
              width: `${Math.max(3, item.freshness)}%`,
              backgroundColor: freshColor(item.freshness),
            }}
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
    </ScrollView>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-1.5 text-[12px] font-bold tracking-wide text-faint">{label}</Text>
      {children}
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
            <Text
              className={`text-[12.5px] font-bold ${active ? "text-[#0a0a0c]" : "text-ink"}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
