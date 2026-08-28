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
import * as ImagePicker from "expo-image-picker";
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
import { api } from "@/lib/api";
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

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  return Math.round((target.getTime() - Date.now()) / 86400000);
}

export default function Add() {
  const router = useRouter();
  const { addItem, ensureSectionId } = useInventory();
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
  const [autoFilling, setAutoFilling] = useState(false);
  const [scanningDate, setScanningDate] = useState(false);

  async function scanExpiryDate() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera needed", "Allow camera access to scan a printed date.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    setScanningDate(true);
    try {
      const sectionId = await ensureSectionId();
      const image = { uri: res.assets[0].uri, name: "expiry.jpg", type: "image/jpeg" };
      const result = await api.scanExpiryPhoto(sectionId, image);
      if (result.found && result.date) {
        const d = daysUntil(result.date);
        setExpiryDays(d);
        Alert.alert(
          "Date found",
          d >= 0 ? `Best before ${result.date} (~${d} days). Adjust below if needed.` : `That date (${result.date}) is already past — double-check the photo.`,
        );
      } else {
        Alert.alert("No date read", result.message || "Couldn't read a date. Try a closer, well-lit shot.");
      }
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't scan that photo."));
    } finally {
      setScanningDate(false);
    }
  }

  async function autoFill() {
    if (!name.trim()) return;
    setAutoFilling(true);
    try {
      const s = await api.suggestItemDetails(name.trim());
      if (s.location) setLocation(s.location);
      if (s.shelf_life_days) setExpiryDays(s.shelf_life_days);
    } catch {
      /* best effort */
    } finally {
      setAutoFilling(false);
    }
  }

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
      ) : method === "receipt" || method === "photo" ? (
        <ScanFlow mode={method} onDone={() => router.back()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Labeled label="NAME">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus={!params.name}
                placeholder="Milk"
                placeholderTextColor={FAINT}
                style={[field, { flex: 1 }]}
              />
              <Pressable
                onPress={autoFill}
                disabled={!name.trim() || autoFilling}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  backgroundColor: "rgba(122,92,201,0.14)",
                  opacity: !name.trim() || autoFilling ? 0.5 : 1,
                }}
              >
                {autoFilling ? (
                  <ActivityIndicator color="#7a5cc9" size="small" />
                ) : (
                  <MaterialCommunityIcons name="auto-fix" size={14} color="#7a5cc9" />
                )}
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#7a5cc9" }}>Auto-fill</Text>
              </Pressable>
            </View>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={scanExpiryDate}
                disabled={scanningDate}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: "rgba(38,198,218,0.14)",
                  opacity: scanningDate ? 0.5 : 1,
                }}
              >
                {scanningDate ? (
                  <ActivityIndicator color={AMBER} size="small" />
                ) : (
                  <MaterialCommunityIcons name="camera-outline" size={14} color={AMBER} />
                )}
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: AMBER }}>Scan date</Text>
              </Pressable>
              {expiryDays != null && (
                <Text style={{ fontSize: 11, color: FAINT }}>≈ {isoInDays(expiryDays)}</Text>
              )}
            </View>
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

type Detected = {
  name: string;
  icon: string;
  qty: number;
  location: StorageLocation;
  checked: boolean;
};

function ScanFlow({ mode, onDone }: { mode: "receipt" | "photo"; onDone: () => void }) {
  const { ensureSectionId, addManyItems } = useInventory();
  const [status, setStatus] = useState<"idle" | "scanning" | "review">("idle");
  const [items, setItems] = useState<Detected[]>([]);
  const [saving, setSaving] = useState(false);

  async function pickAndScan() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setStatus("scanning");
    try {
      const sectionId = await ensureSectionId();
      const image = { uri: res.assets[0].uri, name: "scan.jpg", type: "image/jpeg" };
      const scan = mode === "receipt"
        ? await api.scanReceipt(sectionId, image)
        : await api.scanFridgePhoto(sectionId, image);
      setItems(
        scan.detected_items.map((d) => ({
          name: d.parsed_name,
          icon: d.icon || "generic",
          qty: Math.max(1, d.parsed_quantity ?? 1),
          location: "fridge" as StorageLocation,
          checked: true,
        })),
      );
      setStatus("review");
    } catch (e) {
      setStatus("idle");
      Alert.alert("Scan failed", describeError(e, "Couldn't read that photo. Try a clearer shot."));
    }
  }

  async function confirm() {
    const toAdd = items.filter((i) => i.checked && i.name.trim());
    if (toAdd.length === 0) return;
    setSaving(true);
    try {
      const n = await addManyItems(
        toAdd.map((d) => ({ name: d.name.trim(), icon: d.icon, quantity: d.qty, location: d.location })),
      );
      onDone();
      setTimeout(() => Alert.alert("Added", `${n} item${n === 1 ? "" : "s"} added to your fridge.`), 300);
    } catch (e) {
      setSaving(false);
      Alert.alert("Error", describeError(e, "Couldn't add those items."));
    }
  }

  if (status === "idle") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 }}>
        <MaterialCommunityIcons
          name={mode === "receipt" ? "receipt" : "fridge-outline"}
          size={40}
          color={FAINT}
        />
        <Text style={{ fontSize: 13, color: MUTED, textAlign: "center", lineHeight: 19 }}>
          {mode === "receipt"
            ? "Snap a photo of your grocery receipt and we'll pull out the items."
            : "Take a photo inside your fridge and the crew will spot what changed."}
        </Text>
        <Pressable
          onPress={pickAndScan}
          style={{ backgroundColor: AMBER, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
            Choose a photo
          </Text>
        </Pressable>
      </View>
    );
  }

  if (status === "scanning") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <ActivityIndicator color={AMBER} size="large" />
        <Text style={{ fontSize: 13, color: MUTED }}>
          {mode === "receipt" ? "Reading receipt…" : "Scanning fridge photo…"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 10 }}>
        FOUND {items.filter((i) => i.checked).length} ITEM{items.filter((i) => i.checked).length === 1 ? "" : "S"}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 13, color: FAINT, textAlign: "center", marginTop: 20 }}>
          Nothing recognised. Try a clearer photo, or add manually.
        </Text>
      ) : (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
          {items.map((it, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderBottomWidth: i === items.length - 1 ? 0 : 1,
                borderBottomColor: HAIRLINE,
                opacity: it.checked ? 1 : 0.45,
              }}
            >
              <Pressable
                onPress={() => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, checked: !x.checked } : x)))}
                hitSlop={6}
              >
                <MaterialCommunityIcons
                  name={it.checked ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={20}
                  color={it.checked ? AMBER : FAINT}
                />
              </Pressable>
              <TextInput
                value={it.name}
                onChangeText={(t) => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, name: t } : x)))}
                style={{ flex: 1, fontSize: 13.5, color: INK, paddingVertical: 6 }}
              />
              <Step icon="minus" onPress={() => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} />
              <Text style={{ minWidth: 16, textAlign: "center", fontSize: 12, fontWeight: "700", color: INK }}>{it.qty}</Text>
              <Step icon="plus" onPress={() => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, qty: x.qty + 1 } : x)))} />
            </View>
          ))}
        </View>
      )}
      <Pressable
        onPress={confirm}
        disabled={saving || items.filter((i) => i.checked).length === 0}
        style={{
          alignItems: "center",
          paddingVertical: 14,
          borderRadius: 8,
          backgroundColor: AMBER,
          opacity: saving || items.filter((i) => i.checked).length === 0 ? 0.5 : 1,
        }}
      >
        {saving ? (
          <ActivityIndicator color="#0a0a0c" />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
            Add {items.filter((i) => i.checked).length} to fridge
          </Text>
        )}
      </Pressable>
    </ScrollView>
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
