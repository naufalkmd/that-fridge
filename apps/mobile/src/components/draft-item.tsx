// Shared draft-item model + the full item editor card, used by both the Add screen
// (manual entry, receipt/photo scan review) and the barcode scanner's inline editor.
// Extracted verbatim from app/add.tsx.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  FOOD_ICON_KEYS,
  ICON_LABELS,
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  describeError,
  guessFoodIcon,
  type GeneratedIcon,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { FoodIcon } from "@/components/food-icon";
import { BottomSheet } from "@/components/bottom-sheet";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const STRONG_BORDER = "rgba(255,255,255,0.18)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const AUTOFILL = "#7a5cc9";

// ---- date helpers ----------------------------------------------------------

/** Local calendar date as ISO yyyy-mm-dd (no UTC shift). */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
export function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`);
  return Math.round((target.getTime() - Date.now()) / 86400000);
}
function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ---- unified draft item --------------------------------------------------

export type Draft = {
  id: string;
  name: string;
  icon: string;
  iconUrl: string | null;
  qty: number;
  location: StorageLocation;
  category: NutritionCategory | null;
  expiryDate: string | null;
  condition: "vibrant" | "wilting" | "past_best" | null;
  checked: boolean;
};

export const blankDraft = (over: Partial<Draft> = {}): Draft => ({
  id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  name: "",
  icon: "generic",
  iconUrl: null,
  qty: 1,
  location: "fridge",
  category: null,
  expiryDate: null,
  condition: null,
  checked: true,
  ...over,
});

const CONDITION_PHRASE: Record<string, string> = {
  wilting: "starting to wilt",
  past_best: "past its best",
};

export const toCreatePayload = (d: Draft) => ({
  name: d.name.trim(),
  icon:
    d.icon !== "generic" ? d.icon : (guessFoodIcon(d.name.trim()) ?? "generic"),
  icon_url: d.iconUrl,
  quantity: d.qty,
  location: d.location,
  nutrition_category: d.category,
  ...(d.expiryDate
    ? { expiry_date: d.expiryDate, shelf_life_days: daysUntil(d.expiryDate) }
    : {}),
});


export function useDraftItems(initial: () => Draft[]) {
  const { ensureSectionId } = useInventory();
  const [items, setItems] = useState<Draft[]>(initial);
  const [library, setLibrary] = useState<GeneratedIcon[]>([]);
  const [fillingAll, setFillingAll] = useState(false);
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [scanningDateId, setScanningDateId] = useState<string | null>(null);

  const refetchLibrary = useCallback(
    () =>
      api
        .listGeneratedIcons()
        .then(setLibrary)
        .catch(() => {}),
    [],
  );
  const set = useCallback(
    (id: string, p: Partial<Draft>) =>
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x))),
    [],
  );
  const remove = useCallback(
    (id: string) => setItems((prev) => prev.filter((x) => x.id !== id)),
    [],
  );
  const append = useCallback(
    (d: Draft = blankDraft()) => setItems((prev) => [...prev, d]),
    [],
  );

  const suggest = useCallback(async (d: Draft) => {
    const s = await api.suggestItemDetails(d.name.trim(), d.icon);
    return {
      ...(s.location ? { location: s.location } : {}),
      ...(s.shelf_life_days
        ? { expiryDate: isoInDays(s.shelf_life_days) }
        : {}),
      ...(s.nutrition_category ? { category: s.nutrition_category } : {}),
    } satisfies Partial<Draft>;
  }, []);

  const fillOne = useCallback(
    async (d: Draft) => {
      if (!d.name.trim() || fillingId || fillingAll) return;
      setFillingId(d.id);
      try {
        set(d.id, await suggest(d));
      } catch {
        /* best effort */
      } finally {
        setFillingId(null);
      }
    },
    [fillingId, fillingAll, set, suggest],
  );

  const fillAll = useCallback(async () => {
    if (fillingAll || fillingId) return;
    const todo = items.filter((i) => i.checked && i.name.trim());
    if (!todo.length) return;
    setFillingAll(true);
    await Promise.allSettled(
      todo.map(async (d) => {
        try {
          set(d.id, await suggest(d));
        } catch {
          /* skip */
        }
      }),
    );
    setFillingAll(false);
  }, [items, fillingAll, fillingId, set, suggest]);

  const scanDate = useCallback(
    async (d: Draft) => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted)
        return Alert.alert(
          "Camera needed",
          "Allow camera access to scan a date.",
        );
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.6,
      });
      if (res.canceled || !res.assets[0]) return;
      setScanningDateId(d.id);
      try {
        const sectionId = await ensureSectionId();
        const image = {
          uri: res.assets[0].uri,
          name: "expiry.jpg",
          type: "image/jpeg",
        };
        const r = await api.scanExpiryPhoto(sectionId, image);
        if (r.found && r.date) set(d.id, { expiryDate: r.date });
        else
          Alert.alert(
            "No date read",
            r.message || "Try a closer, well-lit shot.",
          );
      } catch (e) {
        Alert.alert("Error", describeError(e, "Couldn't scan that photo."));
      } finally {
        setScanningDateId(null);
      }
    },
    [ensureSectionId, set],
  );

  return {
    items,
    setItems,
    set,
    remove,
    append,
    library,
    refetchLibrary,
    fillOne,
    fillAll,
    fillingId,
    fillingAll,
    scanDate,
    scanningDateId,
  };
}

export type DraftStore = ReturnType<typeof useDraftItems>;

// Hand-off buffer: /scan writes fully-edited drafts on "Done", a fresh /add mount
// reads them once (cleared on read so a back-nav doesn't reload stale scans).
let stash: Draft[] = [];
export function stashDrafts(items: Draft[]): void {
  stash = items;
}
export function takeStashedDrafts(): Draft[] {
  const out = stash;
  stash = [];
  return out;
}

// ---- the shared item card ----------------------------------------------

export function ItemCard({
  item,
  autoFocus,
  onChange,
  onToggle,
  onRemove,
  onAutoFill,
  autoFilling,
  onScanDate,
  scanningDate,
  library,
  refetchLibrary,
}: {
  item: Draft;
  autoFocus?: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onToggle?: () => void;
  onRemove?: () => void;
  onAutoFill: () => void;
  autoFilling: boolean;
  onScanDate: () => void;
  scanningDate: boolean;
  library: GeneratedIcon[];
  refetchLibrary: () => void;
}) {
  const [iconOpen, setIconOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (generating || !genPrompt.trim()) return;
    setGenerating(true);
    try {
      const r = await api.generateIcon(genPrompt.trim());
      onChange({ iconUrl: r.icon_url });
      setGenPrompt("");
      setIconOpen(false);
      refetchLibrary();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't generate that icon."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: HAIRLINE,
        backgroundColor: SURFACE,
        padding: 14,
        gap: 12,
        opacity: onToggle && !item.checked ? 0.45 : 1,
      }}
    >
      {/* name row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => setIconOpen((v) => !v)} hitSlop={4}>
          <FoodIcon
            icon={item.icon}
            iconUrl={item.iconUrl}
            name={item.name || "item"}
            size={30}
          />
        </Pressable>
        <TextInput
          value={item.name}
          onChangeText={(t) => onChange({ name: t })}
          placeholder="Item name"
          placeholderTextColor={FAINT}
          autoFocus={autoFocus}
          style={{
            flex: 1,
            fontSize: 14.5,
            fontWeight: "600",
            color: INK,
            paddingVertical: 2,
          }}
        />
        {onToggle && (
          <Pressable
            onPress={onToggle}
            hitSlop={6}
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: item.checked ? BLUE : STRONG_BORDER,
              backgroundColor: item.checked ? BLUE : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item.checked && (
              <MaterialCommunityIcons name="check" size={14} color="#fff" />
            )}
          </Pressable>
        )}
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={6}>
            <MaterialCommunityIcons name="close" size={15} color={FAINT} />
          </Pressable>
        )}
      </View>

      {iconOpen && (
        <View
          style={{
            backgroundColor: SURFACE2,
            borderRadius: 8,
            padding: 10,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TextInput
              value={genPrompt}
              onChangeText={setGenPrompt}
              placeholder="Describe an icon…"
              placeholderTextColor={FAINT}
              editable={!generating}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: HAIRLINE,
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 12,
                color: INK,
              }}
            />
            <Pressable
              onPress={generate}
              disabled={generating || !genPrompt.trim()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 12,
                borderRadius: 6,
                backgroundColor: `${AUTOFILL}33`,
                opacity: generating || !genPrompt.trim() ? 0.5 : 1,
              }}
            >
              {generating ? (
                <ActivityIndicator color={AUTOFILL} size="small" />
              ) : (
                <MaterialCommunityIcons
                  name="auto-fix"
                  size={13}
                  color={AUTOFILL}
                />
              )}
              <Text
                style={{ fontSize: 11, fontWeight: "700", color: AUTOFILL }}
              >
                Gen
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: 200 }}
            keyboardShouldPersistTaps="handled"
          >
            {library.length > 0 && (
              <Text style={{ fontSize: 10, color: FAINT, marginBottom: 2 }}>
                Your generated icons — long-press to delete
              </Text>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {library.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    onChange({ iconUrl: g.image_url });
                    setIconOpen(false);
                  }}
                  onLongPress={() => {
                    Alert.alert("Delete this icon?", "Removes it from your library.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          api.deleteGeneratedIcon(g.id).catch(() => {});
                          refetchLibrary();
                        },
                      },
                    ]);
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 6,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FoodIcon iconUrl={g.image_url} name={item.name} size={34} />
                </Pressable>
              ))}
              {FOOD_ICON_KEYS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    onChange({ icon: key, iconUrl: null });
                    setIconOpen(false);
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 6,
                    backgroundColor: SURFACE,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: !item.iconUrl && item.icon === key ? 1.5 : 0,
                    borderColor: BLUE,
                  }}
                >
                  <FoodIcon
                    icon={key}
                    name={ICON_LABELS[key] ?? key}
                    size={34}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* food group + quantity */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setCatOpen((v) => !v)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 13, color: item.category ? INK : FAINT }}>
            {NUTRITION_CATEGORIES.find((c) => c.key === item.category)?.label ??
              "Food group"}
          </Text>
          <MaterialCommunityIcons
            name={catOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={FAINT}
          />
        </Pressable>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingHorizontal: 4,
          }}
        >
          <Pressable
            onPress={() => onChange({ qty: Math.max(1, item.qty - 1) })}
            hitSlop={6}
            style={{ padding: 7 }}
          >
            <MaterialCommunityIcons name="minus" size={14} color={INK} />
          </Pressable>
          <Text
            style={{
              minWidth: 16,
              textAlign: "center",
              fontSize: 13,
              fontWeight: "700",
              color: INK,
            }}
          >
            {item.qty}
          </Text>
          <Pressable
            onPress={() => onChange({ qty: item.qty + 1 })}
            hitSlop={6}
            style={{ padding: 7 }}
          >
            <MaterialCommunityIcons name="plus" size={14} color={INK} />
          </Pressable>
        </View>
      </View>

      {catOpen && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            backgroundColor: SURFACE2,
            borderRadius: 6,
            padding: 8,
          }}
        >
          {NUTRITION_CATEGORIES.map((c) => {
            const on = item.category === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => {
                  onChange({ category: on ? null : c.key });
                  setCatOpen(false);
                }}
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: on ? AMBER : SURFACE,
                }}
              >
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: "700",
                    color: on ? "#0a0a0c" : INK,
                  }}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* date + camera + auto-fill */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <DateField
          value={item.expiryDate}
          onChange={(iso) => onChange({ expiryDate: iso })}
        />
        <Pressable
          onPress={onScanDate}
          disabled={scanningDate}
          style={{
            width: 34,
            height: 38,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${AMBER}24`,
          }}
        >
          {scanningDate ? (
            <ActivityIndicator color={AMBER} size="small" />
          ) : (
            <MaterialCommunityIcons
              name="camera-outline"
              size={15}
              color={AMBER}
            />
          )}
        </Pressable>
        <AutoFillButton onPress={onAutoFill} loading={autoFilling} />
      </View>

      {/* location */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {STORAGE_LOCATIONS.map((l) => {
          const on = item.location === l.key;
          return (
            <Pressable
              key={l.key}
              onPress={() => onChange({ location: l.key })}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                height: 34,
                borderRadius: 6,
                backgroundColor: on ? l.color : SURFACE2,
              }}
            >
              <MaterialCommunityIcons
                name={
                  l.key === "freezer"
                    ? "snowflake"
                    : l.key === "pantry"
                      ? "archive-outline"
                      : "fridge-outline"
                }
                size={14}
                color={on ? "#fff" : FAINT}
              />
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: "700",
                  color: on ? "#fff" : MUTED,
                }}
              >
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {item.condition && item.condition !== "vibrant" && (
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#f5a623",
            lineHeight: 15,
          }}
        >
          AI noticed this is{" "}
          {CONDITION_PHRASE[item.condition] ?? item.condition} in the photo —
          Auto-fill accounts for it
        </Text>
      )}
    </View>
  );
}

// ---- small building blocks --------------------------------------------

export function AutoFillButton({
  onPress,
  loading,
  label = "Auto-fill",
}: {
  onPress: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        height: 38,
        borderRadius: 6,
        backgroundColor: `${AUTOFILL}26`,
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={AUTOFILL} size="small" />
      ) : (
        <MaterialCommunityIcons name="auto-fix" size={14} color={AUTOFILL} />
      )}
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: AUTOFILL }}>
        {loading ? "Thinking…" : label}
      </Text>
    </Pressable>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? new Date(`${value}T00:00:00`) : new Date();

  const onAndroidChange = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(false);
    if (e.type === "set" && d) onChange(toISODate(d));
  };

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: SURFACE2,
          borderRadius: 6,
          paddingHorizontal: 12,
          height: 38,
        }}
      >
        <Text style={{ fontSize: 13, color: value ? INK : FAINT }}>
          {value ? fmtDMY(value) : "dd/mm/yyyy"}
        </Text>
        <MaterialCommunityIcons
          name="calendar-blank-outline"
          size={15}
          color={FAINT}
        />
      </Pressable>

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={current}
          mode="date"
          onChange={onAndroidChange}
        />
      )}

      {Platform.OS === "ios" && (
        <BottomSheet visible={open} onClose={() => setOpen(false)}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: FAINT }}>
              Best before
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: AMBER }}>
                Done
              </Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            themeVariant="dark"
            accentColor={AMBER}
            onChange={(_e, d) => d && onChange(toISODate(d))}
            style={{ alignSelf: "stretch" }}
          />
        </BottomSheet>
      )}
    </View>
  );
}
