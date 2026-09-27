import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  describeError,
  guessFoodIcon,
  normalizeItemName,
  type NutritionCategory,
  type StorageLocation,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useTheme } from "@/lib/theme";
import { SheetHeader } from "@/components/sheet";
import {
  AutoFillButton,
  ItemCard,
  blankDraft,
  isoInDays,
  takeStashedDrafts,
  toCreatePayload,
  useDraftItems,
  type DraftStore,
} from "@/components/draft-item";

const isExpoGo = Constants.appOwnership === "expo";

type Method = "sweep" | "receipt" | "barcode" | "manual";
const METHODS: {
  key: Method;
  title: string;
  desc: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Costs AI credits (vs. barcode/manual which are free). */
  credits?: number;
  /** Overrides the "N CREDITS" badge text. */
  creditsLabel?: string;
}[] = [
  {
    key: "sweep",
    // Named as in the store listing and ads; it now covers freezer, pantry and grocery hauls too.
    title: "Photo of fridge",
    desc: "Fridge, freezer, pantry or a grocery haul",
    icon: "line-scan",
    credits: 3,
    creditsLabel: "3 CREDITS / PHOTO",
  },
  {
    key: "receipt",
    title: "Scan receipt",
    desc: "Snap your grocery receipt",
    icon: "receipt",
    credits: 3,
  },
  {
    key: "barcode",
    title: "Scan barcode",
    desc: "Point your camera at a product barcode",
    icon: "barcode-scan",
  },
  {
    key: "manual",
    title: "Add manually",
    desc: "Type in the item yourself",
    icon: "keyboard-outline",
  },
];

// ---- screen -------------------------------------------------------------

export default function Add() {
  const router = useRouter();
  const { addItem, addManyItems, items } = useInventory();
  const {
    accent: AMBER,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    blue: BLUE,
  } = useTheme().colors;
  const params = useLocalSearchParams<{
    name?: string;
    location?: string;
    category?: string;
    // The Inventory category the user was filtered to when they opened Add - distinct from
    // `category` above (the nutrition/food-group param). Every item created in this session
    // (including scan-derived and "Add another item" rows) inherits it, same as location.
    categoryId?: string;
    shelfLife?: string;
    method?: string;
  }>();

  // Fully-edited drafts handed over from a multi-scan barcode session (/scan → "Done").
  const [stashed] = useState(() =>
    params.method === "barcode-batch" ? takeStashedDrafts() : [],
  );

  // Jump straight to the review list when prefilled from a barcode scan (single or batch).
  const [method, setMethod] = useState<Method | null>(
    params.name || stashed.length
      ? "manual"
      : // Scans happen in /sweep now; any other method param lands on the picker.
        (params.method === "manual" ? "manual" : null),
  );

  const drafts = useDraftItems(() =>
    stashed.length
      ? stashed
      : [
          blankDraft({
            name: params.name ?? "",
            icon: params.name
              ? (guessFoodIcon(params.name) ?? "generic")
              : "generic",
            location: (params.location as StorageLocation) ?? "fridge",
            category: (params.category as NutritionCategory) ?? null,
            categoryId: params.categoryId ?? null,
            expiryDate: params.shelfLife
              ? isoInDays(Number(params.shelfLife))
              : null,
          }),
        ],
  );
  const [saving, setSaving] = useState(false);

  // Names in this draft that already sit in the fridge — so the user knows a new
  // row is a separate batch, not an edit to the one they have.
  const existingKeys = useMemo(
    () => new Set(items.map((i) => normalizeItemName(i.name))),
    [items],
  );
  const dupNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of drafts.items) {
      const n = d.name.trim();
      if (!n) continue;
      const k = normalizeItemName(n);
      if (existingKeys.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
    return out;
  }, [drafts.items, existingKeys]);

  async function submitManual() {
    const toAdd = drafts.items.filter((d) => d.name.trim());
    if (!toAdd.length) {
      Alert.alert("Name required", "What are you adding?");
      return;
    }
    setSaving(true);
    try {
      if (toAdd.length === 1) {
        await addItem(toCreatePayload(toAdd[0]));
      } else {
        await addManyItems(toAdd.map(toCreatePayload));
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      if (toAdd.length > 1) {
        setTimeout(
          () =>
            Alert.alert("Added", `${toAdd.length} items added to your fridge.`),
          300,
        );
      }
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't add that."));
    } finally {
      setSaving(false);
    }
  }

  // Receipt, barcode and fridge photo all open the one scan camera, in that mode; the user can
  // switch modes there (see sweep.tsx).
  const CAMERA_MODE: Partial<Record<Method, "photo" | "receipt" | "barcode">> = {
    sweep: "photo",
    receipt: "receipt",
    barcode: "barcode",
  };

  function chooseMethod(m: Method) {
    const mode = CAMERA_MODE[m];
    if (!mode) {
      setMethod(m);
      return;
    }
    if (isExpoGo) {
      Alert.alert(
        "Needs the dev build",
        "Scanning uses the camera, which isn't available in Expo Go. Use a development build.",
      );
      return;
    }
    router.push({
      pathname: "/sweep",
      params: { mode, ...(params.categoryId ? { categoryId: params.categoryId } : {}) },
    });
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader
        title="Add to fridge"
        onBack={method && !params.name ? () => setMethod(null) : undefined}
      />

      {method === null ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 4,
            paddingBottom: 32,
            gap: 12,
          }}
        >
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
                borderCurve: "continuous", borderRadius: 8,
                padding: 16,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderCurve: "continuous", borderRadius: 8,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name={m.icon} size={19} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text
                    style={{ fontSize: 14.5, fontWeight: "700", color: INK }}
                  >
                    {m.title}
                  </Text>
                  {m.credits && (
                    <View
                      style={{
                        backgroundColor: `${AMBER}1a`,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "700",
                          letterSpacing: 0.3,
                          color: AMBER,
                        }}
                      >
                        {m.creditsLabel ?? `${m.credits} CREDITS`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: FAINT, marginTop: 2 }}>
                  {m.desc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={FAINT} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <DraftList
          drafts={drafts}
          scanMode={false}
          categoryId={params.categoryId ?? null}
          notice={dupNames.length ? <DuplicateNotice names={dupNames} /> : null}
          intro={
            <Text style={{ fontSize: 13, color: MUTED }}>
              Fill in what you can — the crew can guess the rest. Add as many
              items as you like.
            </Text>
          }
          addLabel="Add another item"
          submitLabel={(n) => (n <= 1 ? "Add to fridge" : `Add ${n} items`)}
          submitting={saving}
          onSubmit={submitManual}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ---- the shared list: cards + add-row + sticky submit -------------------

function DraftList({
  drafts,
  scanMode,
  notice,
  intro,
  emptyText,
  addLabel,
  submitLabel,
  submitting,
  onSubmit,
  categoryId,
}: {
  drafts: DraftStore;
  scanMode: boolean;
  notice?: React.ReactNode;
  intro: React.ReactNode;
  emptyText?: string;
  addLabel: string;
  submitLabel: (count: number) => string;
  submitting: boolean;
  onSubmit: () => void;
  /** The Inventory category this add session started from (if any) - new rows added via
   *  "Add another item" inherit it too, same as the first row. */
  categoryId?: string | null;
}) {
  const {
    accent: AMBER,
    surface: SURFACE,
    hairline: HAIRLINE,
    hairlineStrong: STRONG_BORDER,
    faint: FAINT,
    blue: BLUE,
    onAccent: CANVAS,
  } = useTheme().colors;
  const count = scanMode
    ? drafts.items.filter((d) => d.checked && d.name.trim()).length
    : drafts.items.filter((d) => d.name.trim()).length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {notice}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <View style={{ flex: 1 }}>{intro}</View>
          {drafts.items.length > 1 && (
            <AutoFillButton
              label="Auto-fill all"
              onPress={drafts.fillAll}
              loading={drafts.fillingAll}
            />
          )}
        </View>

        {drafts.items.length === 0 && emptyText ? (
          <Text
            style={{
              fontSize: 13,
              color: FAINT,
              textAlign: "center",
              marginVertical: 20,
            }}
          >
            {emptyText}
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {drafts.items.map((d, i) => (
              <ItemCard
                key={d.id}
                item={d}
                autoFocus={!d.name && i === drafts.items.length - 1}
                onChange={(p) => drafts.set(d.id, p)}
                onToggle={
                  scanMode
                    ? () => drafts.set(d.id, { checked: !d.checked })
                    : undefined
                }
                onRemove={
                  scanMode || drafts.items.length > 1
                    ? () => drafts.remove(d.id)
                    : undefined
                }
                onAutoFill={() => drafts.fillOne(d)}
                autoFilling={drafts.fillingId === d.id || drafts.fillingAll}
                onScanDate={() => drafts.scanDate(d)}
                scanningDate={drafts.scanningDateId === d.id}
                library={drafts.library}
                refetchLibrary={drafts.refetchLibrary}
              />
            ))}

            <Pressable
              onPress={() => drafts.append(blankDraft({ categoryId: categoryId ?? null }))}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 14,
                borderCurve: "continuous", borderRadius: 8,
                borderWidth: 1.5,
                borderColor: STRONG_BORDER,
                borderStyle: "dashed",
              }}
            >
              <MaterialCommunityIcons name="plus" size={15} color={BLUE} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: BLUE }}>
                {addLabel}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: 28,
          borderTopWidth: 1,
          borderTopColor: HAIRLINE,
          backgroundColor: SURFACE,
        }}
      >
        <Pressable
          onPress={onSubmit}
          disabled={submitting || count === 0}
          style={{
            alignItems: "center",
            paddingVertical: 15,
            borderCurve: "continuous", borderRadius: 8,
            backgroundColor: AMBER,
            opacity: submitting || count === 0 ? 0.5 : 1,
          }}
        >
          {submitting ? (
            <ActivityIndicator color={CANVAS} />
          ) : (
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: CANVAS,
              }}
            >
              {submitLabel(count)}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// Shown when a draft's name is already in the fridge: adding makes a separate
// batch, and Inventory will label the older one so it gets used first.
function DuplicateNotice({ names }: { names: string[] }) {
  const {
    accent: AMBER,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    warn: WARN,
  } = useTheme().colors;
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        alignItems: "flex-start",
        backgroundColor: SURFACE2,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderCurve: "continuous", borderRadius: 8,
        padding: 12,
        marginBottom: 14,
      }}
    >
      <MaterialCommunityIcons
        name="information-outline"
        size={15}
        color={AMBER}
        style={{ marginTop: 1 }}
      />
      <Text style={{ flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 }}>
        <Text style={{ color: INK, fontWeight: "700" }}>{list}</Text> already in
        your fridge. This adds a separate batch — Inventory tags the older one{" "}
        <Text style={{ color: WARN, fontWeight: "700" }}>Use first</Text>.
      </Text>
    </View>
  );
}
