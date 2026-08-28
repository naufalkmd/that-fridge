import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  daysLabel,
  describeError,
  freshColor,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useShopping } from "@/lib/shopping";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useToast } from "@/lib/toast";
import { FoodIcon } from "@/components/food-icon";
import { SheetHeader } from "@/components/sheet";
import { CategoryTag } from "@/components/tags";

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
  const { itemById, fridges, setItemQty, patchItem, removeItem, restoreItem } = useInventory();
  const { items: shoppingItems, add: addToShopping } = useShopping();
  const { refresh: refreshScore } = useKitchenScore();
  const toast = useToast();
  const item = itemById(id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<StorageLocation>("fridge");
  const [category, setCategory] = useState<NutritionCategory | null>(null);
  const [note, setNote] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [shopUrl, setShopUrl] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const onShoppingList = useMemo(
    () =>
      !!item &&
      shoppingItems.some(
        (s) => !s.checked && s.name.toLowerCase() === item.name.toLowerCase(),
      ),
    [shoppingItems, item],
  );

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
  const fresh = freshColor(item.freshness);

  const tip =
    item.freshness < 30
      ? `Use ${item.name.toLowerCase()} today for best quality.`
      : item.freshness < 60
        ? `Plan to use ${item.name.toLowerCase()} within the next couple of days.`
        : `${item.name} is holding up well — no action needed.`;

  const itemFridge = fridges.find((f) => f.id === item?.fridgeId);
  const sections = itemFridge?.sections ?? [];

  function startEdit() {
    setName(item!.name);
    setLocation(item!.location ?? "fridge");
    setCategory(item!.nutritionCategory ?? null);
    setNote(item!.note ?? "");
    setSectionId(item!.sectionId);
    setShopUrl(item!.shopUrl ?? "");
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
        ...(sectionId && sectionId !== item!.sectionId ? { section_id: sectionId } : {}),
        shop_url: shopUrl.trim() || null,
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

  async function usedItUp() {
    const snap = item!;
    setBusy(true);
    try {
      await api
        .recordItemUsage({
          name: snap.name,
          icon: snap.icon,
          daysRemaining: snap.days,
          freshness: snap.freshness,
          category: snap.nutritionCategory ?? null,
        })
        .catch(() => {});
      // "Rescued" — used up while still in date, with little time to spare.
      if (snap.days >= 0 && snap.days <= 3) {
        api.postBadgeProgress("rescued_10", 1).catch(() => {});
      }
      await removeItem(snap.id);
      refreshScore();
      router.back();
      toast.show(`Used up ${snap.name}`);
    } catch (e) {
      setBusy(false);
      Alert.alert("Error", describeError(e, "Couldn't update that item."));
    }
  }

  function throwAway() {
    const snap = item!;
    Alert.alert("Throw away", `Bin "${snap.name}"? This doesn't count toward your scores.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Throw away",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await removeItem(snap.id);
            router.back();
            toast.show(`Removed ${snap.name}`, {
              actionLabel: "Undo",
              onAction: () => restoreItem(snap),
            });
          } catch (e) {
            setBusy(false);
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to remove.");
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
        <SheetHeader title="Edit item" onBack={() => setEditing(false)} onClose={() => setEditing(false)} />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="NAME">
            <TextInput value={name} onChangeText={setName} placeholderTextColor={FAINT} style={inputStyle} />
          </Field>
          <Field label="LOCATION">
            <ChipRow
              options={STORAGE_LOCATIONS.map((l) => ({ key: l.key, label: l.label }))}
              value={location}
              onChange={(k) => setLocation(k as StorageLocation)}
            />
          </Field>
          {sections.length > 1 && (
            <Field label="SECTION">
              <ChipRow
                options={sections.map((s) => ({ key: s.id, label: s.name }))}
                value={sectionId}
                onChange={(k) => setSectionId(k)}
              />
            </Field>
          )}

          <Field label="FOOD GROUP">
            <ChipRow
              options={NUTRITION_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
              value={category}
              onChange={(k) => setCategory(category === k ? null : (k as NutritionCategory))}
            />
          </Field>
          <Field label="BEST BEFORE">
            <ChipRow
              options={BEST_BEFORE_PRESETS.map((p) => ({ key: String(p.days), label: p.label }))}
              value={expiryDays == null ? null : String(expiryDays)}
              onChange={(k) => setExpiryDays(Number(k))}
            />
            <Text style={{ marginTop: 6, fontSize: 11, color: FAINT }}>
              {expiryDays == null
                ? `Currently ${daysLabel(item.days)} — leave untouched to keep it`
                : `New best-before: ${isoInDays(expiryDays)}`}
            </Text>
          </Field>
          <Field label="NOTE (OPTIONAL)">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. 2 loaves"
              placeholderTextColor={FAINT}
              style={inputStyle}
            />
          </Field>
          <Field label="SHOP LINK (OPTIONAL)">
            <TextInput
              value={shopUrl}
              onChangeText={setShopUrl}
              placeholder="https://…"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              keyboardType="url"
              style={inputStyle}
            />
          </Field>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <Pressable
              onPress={() => setEditing(false)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 6, backgroundColor: SURFACE2, borderWidth: 1, borderColor: HAIRLINE }}
            >
              <Text style={{ fontWeight: "700", color: INK }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 6, backgroundColor: AMBER }}
            >
              {saving ? (
                <ActivityIndicator color="#0a0a0c" />
              ) : (
                <Text style={{ fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <>
      <SheetHeader title="Item" />
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 36 }}
      >
        <View style={{ alignItems: "center", marginBottom: 14 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 10,
              backgroundColor: SURFACE2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FoodIcon icon={item.icon} iconUrl={item.iconUrl} name={item.name} size={52} />
          </View>
          <Pressable
            onPress={startEdit}
            style={{
              position: "absolute",
              top: -4,
              right: "50%",
              marginRight: -60,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: AMBER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name="pencil" size={14} color="#0a0a0c" />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: INK, textAlign: "center" }}>{item.name}</Text>
          <CategoryTag category={item.nutritionCategory} />
        </View>
        <Text style={{ textAlign: "center", fontSize: 12.5, color: FAINT, marginBottom: 18 }}>
          {item.fridgeName} · {item.sectionName}
        </Text>

        <View style={{ backgroundColor: SURFACE2, borderRadius: 8, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>Freshness</Text>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: fresh }}>{item.freshness}%</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: HAIRLINE, overflow: "hidden", marginBottom: 10 }}>
            <View style={{ height: "100%", borderRadius: 3, width: `${Math.max(3, item.freshness)}%`, backgroundColor: fresh }} />
          </View>
          <Text style={{ fontSize: 12.5, color: MUTED }}>
            {daysLabel(item.days)}
            {item.note ? ` · ${item.note}` : ""}
          </Text>
        </View>

        <View style={{ backgroundColor: SURFACE2, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16 }}>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: INK }}>{tip}</Text>
        </View>

        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>Quantity</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Step icon="minus" onPress={() => setItemQty(item.id, item.qty - 1)} />
            <Text style={{ minWidth: 24, textAlign: "center", fontSize: 15, fontWeight: "700", color: INK }}>
              {item.qty}
            </Text>
            <Step icon="plus" onPress={() => setItemQty(item.id, item.qty + 1)} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <Pressable
            onPress={() => !onShoppingList && addToShopping(item.name)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 11,
              borderRadius: 6,
              backgroundColor: SURFACE2,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <MaterialCommunityIcons
              name={onShoppingList ? "check" : "cart-outline"}
              size={14}
              color={onShoppingList ? GOOD : BLUE}
            />
            <Text style={{ fontSize: 13, fontWeight: "700", color: onShoppingList ? GOOD : BLUE }}>
              {onShoppingList ? "On your shopping list" : "Add to shopping list"}
            </Text>
          </Pressable>
          {!!item.shopUrl && (
            <Pressable
              onPress={() => Linking.openURL(item.shopUrl!)}
              style={{
                width: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                backgroundColor: SURFACE2,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="open-outline" size={15} color={BLUE} />
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={usedItUp}
            disabled={busy}
            style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 6, backgroundColor: AMBER }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
              Used it up
            </Text>
          </Pressable>
          <Pressable
            onPress={throwAway}
            disabled={busy}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 13,
              borderRadius: 6,
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: `${BAD}66`,
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: BAD }}>Throw away</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: HAIRLINE,
  backgroundColor: SURFACE2,
  borderRadius: 6,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 13.5,
  color: INK,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 6,
              backgroundColor: active ? AMBER : SURFACE2,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>
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
        height: 28,
        width: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        backgroundColor: SURFACE,
      }}
    >
      <MaterialCommunityIcons name={icon} size={15} color={INK} />
    </Pressable>
  );
}
