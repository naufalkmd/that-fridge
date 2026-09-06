import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, { FadeIn } from "react-native-reanimated";

import { ApiError, guessFoodIcon } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { FoodIcon } from "@/components/food-icon";
import {
  ItemCard,
  blankDraft,
  isoInDays,
  stashDrafts,
  useDraftItems,
} from "@/components/draft-item";

const isExpoGo = Constants.appOwnership === "expo";
// A barcode sits in frame for many consecutive callbacks — ignore repeats of the same
// code within this window so one product isn't added a dozen times.
const DEDUPE_MS = 2500;

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.12)";
const INK = "#eaeaec";

type ScanResult =
  | { kind: "ok"; code: string; name: string }
  | { kind: "unknown"; code: string }
  | { kind: "dupe"; code: string }
  | { kind: "error"; code: string };

export default function Scan() {
  const router = useRouter();
  const { lookupBarcode } = useInventory();
  const drafts = useDraftItems(() => []);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const codesRef = useRef<Set<string>>(new Set());
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    drafts.refetchLibrary();
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showResult = useCallback((r: ScanResult) => {
    setResult(r);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), 2600);
  }, []);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      const now = Date.now();
      if (busy || editingId !== null) return;
      if (lastRef.current.code === data && now - lastRef.current.at < DEDUPE_MS) {
        return;
      }
      lastRef.current = { code: data, at: now };

      if (codesRef.current.has(data)) {
        void Haptics.selectionAsync();
        showResult({ kind: "dupe", code: data });
        return;
      }

      setBusy(true);
      try {
        const s = await lookupBarcode(data);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        codesRef.current.add(data);
        drafts.append(
          blankDraft({
            name: s.name,
            icon: s.icon || guessFoodIcon(s.name) || "generic",
            location: s.location ?? "fridge",
            expiryDate: s.default_shelf_life_days
              ? isoInDays(s.default_shelf_life_days)
              : null,
          }),
        );
        showResult({ kind: "ok", code: data, name: s.name });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          codesRef.current.add(data);
          drafts.append(blankDraft({ name: "" }));
          showResult({ kind: "unknown", code: data });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          showResult({ kind: "error", code: data });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, editingId, lookupBarcode, drafts, showResult],
  );

  function done() {
    const items = drafts.items;
    if (items.length === 0) {
      router.back();
      return;
    }
    stashDrafts(items);
    router.replace("/add?method=barcode-batch");
  }

  if (isExpoGo) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-ink">
          Barcode scanning needs a development build — the camera isn&apos;t
          available in Expo Go.
        </Text>
        <Pressable
          onPress={() => router.replace("/add")}
          className="rounded-lg bg-accent px-5 py-3 active:opacity-80"
        >
          <Text className="font-bold uppercase text-[#0a0a0c]">Add manually</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-muted">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-ink">
          ThatFridge needs camera access to scan grocery barcodes.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="rounded-lg bg-accent px-5 py-3 active:opacity-80"
        >
          <Text className="font-bold uppercase text-[#0a0a0c]">Grant access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-muted">Not now</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const items = drafts.items;
  const editing = editingId ? items.find((d) => d.id === editingId) : undefined;

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
        }}
        onBarcodeScanned={onScanned}
      />

      <SafeAreaView
        className="absolute inset-x-0 top-0 items-center p-4"
        pointerEvents="none"
      >
        <Text className="rounded-lg bg-black/60 px-4 py-2 text-center text-[13px] font-semibold text-white">
          {busy
            ? "Looking up…"
            : editing
              ? "Editing — scanning paused"
              : items.length > 0
                ? `${items.length} scanned — tap one to edit, or keep going`
                : "Point at a barcode"}
        </Text>
      </SafeAreaView>

      {result && !editing && (
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: "32%" }}
          pointerEvents="none"
        >
          <ScanResultCard result={result} />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="absolute inset-x-0 bottom-0"
      >
        <SafeAreaView className="gap-3 p-4" edges={["bottom"]}>
          {editing ? (
            <ScrollView
              style={{ maxHeight: 440 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <ItemCard
                item={editing}
                autoFocus={!editing.name}
                onChange={(p) => drafts.set(editing.id, p)}
                onRemove={() => {
                  drafts.remove(editing.id);
                  setEditingId(null);
                }}
                onAutoFill={() => drafts.fillOne(editing)}
                autoFilling={drafts.fillingId === editing.id || drafts.fillingAll}
                onScanDate={() => drafts.scanDate(editing)}
                scanningDate={drafts.scanningDateId === editing.id}
                library={drafts.library}
                refetchLibrary={drafts.refetchLibrary}
              />
              <Pressable
                onPress={() => setEditingId(null)}
                className="mt-2 items-center rounded-lg bg-accent py-3 active:opacity-80"
              >
                <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">
                  Done editing
                </Text>
              </Pressable>
            </ScrollView>
          ) : (
            <>
              {items.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
                >
                  {items.map((d) => (
                    <Pressable
                      key={d.id}
                      onPress={() => setEditingId(d.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 7,
                        backgroundColor: "rgba(19,19,22,0.9)",
                        borderWidth: 1,
                        borderColor: HAIRLINE,
                        borderRadius: 999,
                        paddingLeft: 6,
                        paddingRight: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <FoodIcon
                        icon={d.icon}
                        iconUrl={d.iconUrl}
                        name={d.name || "item"}
                        size={20}
                      />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "700",
                          color: d.name ? INK : "#f5a623",
                        }}
                        numberOfLines={1}
                      >
                        {d.name || "Name it"}
                        {d.qty > 1 ? ` ×${d.qty}` : ""}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <View className="flex-row gap-3 self-center">
                <Pressable
                  onPress={() => router.back()}
                  className="rounded-lg bg-white/15 px-5 py-3"
                >
                  <Text className="font-semibold text-white">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={done}
                  disabled={items.length === 0}
                  className="flex-row items-center gap-2 rounded-lg bg-accent px-6 py-3 active:opacity-80"
                  style={items.length === 0 ? { opacity: 0.45 } : undefined}
                >
                  <MaterialCommunityIcons name="check" size={16} color="#0a0a0c" />
                  <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">
                    {items.length > 0 ? `Done (${items.length})` : "Done"}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// A stylised echo of the scanned digits — deterministic bar widths, not a real EAN
// encoding. Just confirms visually that *this* number went through.
function BarcodeGlyph({ code }: { code: string }) {
  const digits = (code.replace(/\D/g, "") || "000000").slice(0, 14);
  const bars: { w: number; on: boolean }[] = [{ w: 2, on: true }];
  for (const ch of digits) {
    const n = ch.charCodeAt(0) - 48;
    bars.push({ w: 2 + (n % 3), on: true });
    bars.push({ w: 2 + ((n >> 1) % 2), on: false });
  }
  bars.push({ w: 2, on: true });
  return (
    <View style={{ flexDirection: "row", height: 40 }}>
      {bars.map((b, i) => (
        <View
          key={i}
          style={{
            width: b.w,
            backgroundColor: b.on ? "#0a0a0c" : "transparent",
          }}
        />
      ))}
    </View>
  );
}

function ScanResultCard({ result }: { result: ScanResult }) {
  const tint =
    result.kind === "ok"
      ? "#1f9d55"
      : result.kind === "unknown"
        ? "#c77700"
        : result.kind === "error"
          ? "#c0392b"
          : "#666";
  const label =
    result.kind === "ok"
      ? result.name || "Added"
      : result.kind === "unknown"
        ? "Not recognised"
        : result.kind === "error"
          ? "Lookup failed"
          : "Already scanned";
  const icon =
    result.kind === "ok"
      ? "check-circle"
      : result.kind === "unknown"
        ? "help-circle"
        : result.kind === "error"
          ? "alert-circle"
          : "information";

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 18,
        alignItems: "center",
        gap: 5,
        minWidth: 210,
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      {result.kind !== "error" && <BarcodeGlyph code={result.code} />}
      {result.kind !== "error" && (
        <Text
          style={{
            fontSize: 10.5,
            letterSpacing: 2,
            color: "#777",
            fontVariant: ["tabular-nums"],
          }}
        >
          {result.code}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginTop: 3,
        }}
      >
        <MaterialCommunityIcons name={icon} size={16} color={tint} />
        <Text
          style={{ fontSize: 14, fontWeight: "800", color: "#0a0a0c" }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {result.kind === "unknown" && (
        <Text style={{ fontSize: 11, color: "#888" }}>
          Tap the chip below to name it
        </Text>
      )}
    </Animated.View>
  );
}
