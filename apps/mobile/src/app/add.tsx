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
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  describeError,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { SheetHeader } from "@/components/sheet";

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

const isExpoGo = Constants.appOwnership === "expo";

export default function Add() {
  const router = useRouter();
  const { addItem } = useInventory();
  const params = useLocalSearchParams<{
    name?: string;
    location?: string;
    category?: string;
    shelfLife?: string;
  }>();

  const [name, setName] = useState(params.name ?? "");
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<StorageLocation>(
    (params.location as StorageLocation) ?? "fridge",
  );
  const [category, setCategory] = useState<NutritionCategory | null>(
    (params.category as NutritionCategory) ?? null,
  );
  const [expiryDays, setExpiryDays] = useState<number | null>(
    params.shelfLife ? Number(params.shelfLife) : 7,
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      Alert.alert("Name required", "What are you adding?");
      return;
    }
    setSaving(true);
    try {
      await addItem({
        name: name.trim(),
        quantity: qty,
        location,
        nutrition_category: category,
        ...(expiryDays != null
          ? { expiry_date: isoInDays(expiryDays), shelf_life_days: expiryDays }
          : {}),
      });
      router.back();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't add that item."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader title="Add item" />
      <ScrollView contentContainerClassName="px-6 pb-8 pt-2 gap-5" keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => {
            if (isExpoGo) {
              Alert.alert(
                "Needs the dev build",
                "Barcode scanning uses the camera, which isn't available in Expo Go. Use a development build.",
              );
            } else {
              router.push("/scan");
            }
          }}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-hairline py-3 active:opacity-70"
        >
          <Text className="text-[13px] font-semibold text-accent">Scan a barcode instead</Text>
        </Pressable>

        <Labeled label="NAME">
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus={!params.name}
            placeholder="Milk"
            placeholderTextColor="rgba(234,234,236,0.34)"
            className="rounded-lg border border-hairline bg-surface px-4 py-3 text-[14px] text-ink"
          />
        </Labeled>

        <Labeled label="QUANTITY">
          <View className="flex-row items-center gap-4">
            <Step label="−" onPress={() => setQty((q) => Math.max(1, q - 1))} />
            <Text className="min-w-6 text-center text-[16px] font-bold text-ink">{qty}</Text>
            <Step label="+" onPress={() => setQty((q) => q + 1)} />
          </View>
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
          {expiryDays != null && (
            <Text className="mt-1.5 text-[11px] text-faint">≈ {isoInDays(expiryDays)}</Text>
          )}
        </Labeled>

        <Pressable
          onPress={submit}
          disabled={saving}
          className="mt-1 items-center rounded-lg bg-accent py-3.5 active:opacity-80"
        >
          {saving ? (
            <ActivityIndicator color="#0a0a0c" />
          ) : (
            <Text className="text-[14px] font-bold uppercase tracking-wide text-[#0a0a0c]">
              Add to fridge
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
              active ? "border-accent bg-accent" : "border-hairline bg-surface"
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

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="h-8 w-8 items-center justify-center rounded-full bg-surface active:opacity-60"
    >
      <Text className="text-[16px] font-bold leading-none text-ink">{label}</Text>
    </Pressable>
  );
}
