import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { usePro } from "@/lib/pro";
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

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const STRONG_BORDER = "rgba(255,255,255,0.18)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

const isExpoGo = Constants.appOwnership === "expo";

type Method = "receipt" | "barcode" | "photo" | "manual";
const METHODS: {
  key: Method;
  title: string;
  desc: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  pro?: boolean;
}[] = [
  {
    key: "receipt",
    title: "Scan receipt",
    desc: "Snap your grocery receipt",
    icon: "receipt",
    pro: true,
  },
  {
    key: "barcode",
    title: "Scan barcode",
    desc: "Point your camera at a product barcode",
    icon: "barcode-scan",
  },
  {
    key: "photo",
    title: "Photo of fridge",
    desc: "Let AI spot what changed",
    icon: "camera-outline",
    pro: true,
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
  const { isPro } = usePro();
  const params = useLocalSearchParams<{
    name?: string;
    location?: string;
    category?: string;
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
      : (params.method as Method) || null,
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
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text
                    style={{ fontSize: 14.5, fontWeight: "700", color: INK }}
                  >
                    {m.title}
                  </Text>
                  {m.pro && !isPro && (
                    <View
                      style={{
                        backgroundColor: `${AMBER}1a`,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 5,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "800",
                          letterSpacing: 0.3,
                          color: AMBER,
                        }}
                      >
                        PRO
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
      ) : method === "receipt" || method === "photo" ? (
        <ScanFlow mode={method} onDone={() => router.back()} />
      ) : (
        <DraftList
          drafts={drafts}
          scanMode={false}
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

// ---- scan flow (receipt / fridge photo) ---------------------------------

function ScanFlow({
  mode,
  onDone,
}: {
  mode: "receipt" | "photo";
  onDone: () => void;
}) {
  const { ensureSectionId, addManyItems } = useInventory();
  const [status, setStatus] = useState<"idle" | "scanning" | "review">("idle");
  const [saving, setSaving] = useState(false);
  const drafts = useDraftItems(() => []);
  const autoOpened = useRef(false);

  async function runScan(uri: string) {
    setStatus("scanning");
    try {
      const sectionId = await ensureSectionId();
      const image = { uri, name: "scan.jpg", type: "image/jpeg" };
      const scan =
        mode === "receipt"
          ? await api.scanReceipt(sectionId, image)
          : await api.scanFridgePhoto(sectionId, image);
      drafts.setItems(
        scan.detected_items.map((d) =>
          blankDraft({
            name: d.parsed_name,
            icon: d.icon || guessFoodIcon(d.parsed_name) || "generic",
            qty: Math.max(1, d.parsed_quantity ?? 1),
            condition: d.condition ?? null,
          }),
        ),
      );
      drafts.refetchLibrary();
      setStatus("review");
    } catch (e) {
      setStatus("idle");
      Alert.alert(
        "Scan failed",
        describeError(e, "Couldn't read that photo. Try a clearer shot."),
      );
    }
  }

  async function capture(source: "camera" | "library") {
    let res: ImagePicker.ImagePickerResult;
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access needed",
          "Allow camera access to take a photo, or upload one from your library instead.",
        );
        return;
      }
      res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
    }
    if (res.canceled || !res.assets[0]) return;
    await runScan(res.assets[0].uri);
  }

  // Camera-first: jump straight to the camera on entry. If it's cancelled or
  // denied, the idle screen below offers "Take a photo" again plus an upload option.
  useEffect(() => {
    if (autoOpened.current) return;
    autoOpened.current = true;
    void capture("camera");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    const toAdd = drafts.items.filter((i) => i.checked && i.name.trim());
    if (toAdd.length === 0) return;
    setSaving(true);
    try {
      const n = await addManyItems(toAdd.map(toCreatePayload));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
      setTimeout(
        () =>
          Alert.alert(
            "Added",
            `${n} item${n === 1 ? "" : "s"} added to your fridge.`,
          ),
        300,
      );
    } catch (e) {
      setSaving(false);
      Alert.alert("Error", describeError(e, "Couldn't add those items."));
    }
  }

  if (status === "idle") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          gap: 16,
        }}
      >
        <MaterialCommunityIcons
          name={mode === "receipt" ? "receipt" : "fridge-outline"}
          size={40}
          color={FAINT}
        />
        <Text
          style={{
            fontSize: 13,
            color: MUTED,
            textAlign: "center",
            lineHeight: 19,
          }}
        >
          {mode === "receipt"
            ? "Take a photo of your grocery receipt and we'll pull out the items."
            : "Take a photo inside your fridge and the crew will spot what changed."}
        </Text>
        <Pressable
          onPress={() => capture("camera")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: AMBER,
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
          }}
        >
          <MaterialCommunityIcons name="camera" size={16} color="#0a0a0c" />
          <Text
            style={{
              fontSize: 13.5,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "#0a0a0c",
            }}
          >
            Take a photo
          </Text>
        </Pressable>
        <Pressable onPress={() => capture("library")} hitSlop={8}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: MUTED }}>
            Upload from library instead
          </Text>
        </Pressable>
      </View>
    );
  }

  if (status === "scanning") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <ActivityIndicator color={AMBER} size="large" />
        <Text style={{ fontSize: 13, color: MUTED }}>
          {mode === "receipt" ? "Reading receipt…" : "Scanning fridge photo…"}
        </Text>
      </View>
    );
  }

  return (
    <DraftList
      drafts={drafts}
      scanMode
      intro={
        <Text style={{ fontSize: 12.5, color: MUTED, lineHeight: 17 }}>
          Found {drafts.items.length} item{drafts.items.length === 1 ? "" : "s"}{" "}
          — the scan can&apos;t tell expiry or storage, so set them below or tap
          Auto-fill
        </Text>
      }
      emptyText="Nothing recognised. Try a clearer photo, or add manually."
      addLabel="Add item the scan missed"
      submitLabel={(n) => `Add ${n} item${n === 1 ? "" : "s"}`}
      submitting={saving}
      onSubmit={confirm}
    />
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
}) {
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
              onPress={() => drafts.append()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 14,
                borderRadius: 8,
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
            borderRadius: 8,
            backgroundColor: AMBER,
            opacity: submitting || count === 0 ? 0.5 : 1,
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#0a0a0c" />
          ) : (
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "#0a0a0c",
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
        borderRadius: 8,
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
        <Text style={{ color: "#f5a623", fontWeight: "700" }}>Use first</Text>.
      </Text>
    </View>
  );
}

