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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  describeError,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { usePro } from "@/lib/pro";
import { SheetHeader } from "@/components/sheet";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

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

type Method = "receipt" | "barcode" | "photo" | "manual";
const METHODS: {
  key: Method;
  title: string;
  desc: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  pro?: boolean;
}[] = [
  { key: "receipt", title: "Scan receipt", desc: "Snap your grocery receipt", icon: "receipt", pro: true },
  { key: "barcode", title: "Scan barcode", desc: "Point your camera at a product barcode", icon: "barcode-scan" },
  { key: "photo", title: "Photo of fridge", desc: "Let AI spot what changed", icon: "camera-outline", pro: true },
  { key: "manual", title: "Add manually", desc: "Type in the item yourself", icon: "keyboard-outline" },
];

export default function Add() {
  const router = useRouter();
  const { addItem } = useInventory();
  const { isPro } = usePro();
  const params = useLocalSearchParams<{
    name?: string;
    location?: string;
    category?: string;
    shelfLife?: string;
  }>();

  // Jump straight to the manual form when prefilled from a barcode scan.
  const [method, setMethod] = useState<Method | null>(params.name ? "manual" : null);

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

  function chooseMethod(m: Method) {
    if (m === "barcode") {
      if (isExpoGo) {
        Alert.alert(
          "Needs the dev build",
          "Barcode scanning uses the camera, which isn't available in Expo Go. Use a development build.",
        );
      } else {
        router.push("/scan");
      }
      return;
    }
    if ((m === "receipt" || m === "photo") && !isPro) {
      router.push("/paywall");
      return;
    }
    setMethod(m);
  }

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
      <SheetHeader
        title={method === "manual" ? "Add item" : "Add to fridge"}
        onBack={method && !params.name ? () => setMethod(null) : undefined}
      />

      {method === null ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32, gap: 12 }}>
          <Text style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>
            Choose how you&apos;d like to add items
          </Text>
          {METHODS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => chooseMethod(m.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                backgroundColor: SURFACE,
                borderWidth: 1,
                borderColor: HAIRLINE,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name={m.icon} size={19} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: "700", color: INK }}>{m.title}</Text>
                  {m.pro && !isPro && (
                    <View style={{ backgroundColor: `${AMBER}1a`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 0.3, color: AMBER }}>
                        PRO
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>{m.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={FAINT} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Labeled label="NAME">
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus={!params.name}
              placeholder="Milk"
              placeholderTextColor={FAINT}
              style={field}
            />
          </Labeled>

          <Labeled label="QUANTITY">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Step icon="minus" onPress={() => setQty((q) => Math.max(1, q - 1))} />
              <Text style={{ minWidth: 24, textAlign: "center", fontSize: 16, fontWeight: "700", color: INK }}>
                {qty}
              </Text>
              <Step icon="plus" onPress={() => setQty((q) => q + 1)} />
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
              <Text style={{ marginTop: 6, fontSize: 11, color: FAINT }}>≈ {isoInDays(expiryDays)}</Text>
            )}
          </Labeled>

          <Pressable
            onPress={submit}
            disabled={saving}
            style={{ marginTop: 4, alignItems: "center", borderRadius: 8, backgroundColor: AMBER, paddingVertical: 14 }}
          >
            {saving ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
                Add to fridge
              </Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const field = {
  borderWidth: 1,
  borderColor: HAIRLINE,
  backgroundColor: SURFACE2,
  borderRadius: 6,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 13.5,
  color: INK,
} as const;

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT }}>
        {label}
      </Text>
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
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 6,
              backgroundColor: active ? AMBER : SURFACE2,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Step({ icon, onPress }: { icon: "minus" | "plus"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        height: 32,
        width: 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: SURFACE2,
      }}
    >
      <MaterialCommunityIcons name={icon} size={16} color={INK} />
    </Pressable>
  );
}
