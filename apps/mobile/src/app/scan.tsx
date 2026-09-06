import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { ApiError, guessFoodIcon } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { stashScans, type ScannedItem } from "@/lib/scanQueue";

const isExpoGo = Constants.appOwnership === "expo";
// A barcode sits in frame for many consecutive callbacks — ignore repeats of the same
// code within this window so one product isn't added a dozen times.
const DEDUPE_MS = 2500;

export default function Scan() {
  const router = useRouter();
  const { lookupBarcode } = useInventory();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<ScannedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const say = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, []);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      const now = Date.now();
      if (busy) return;
      if (lastRef.current.code === data && now - lastRef.current.at < DEDUPE_MS) {
        return;
      }
      lastRef.current = { code: data, at: now };

      if (scanned.some((s) => s.barcode === data)) {
        say("Already in the list");
        return;
      }

      setBusy(true);
      try {
        const s = await lookupBarcode(data);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScanned((prev) => [
          ...prev,
          {
            barcode: data,
            name: s.name,
            icon: s.icon || guessFoodIcon(s.name) || "generic",
            iconUrl: s.image_url ?? null,
            location: s.location ?? null,
            shelfLifeDays: s.default_shelf_life_days ?? null,
          },
        ]);
        say(`Added ${s.name}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          setScanned((prev) => [
            ...prev,
            {
              barcode: data,
              name: "",
              icon: "generic",
              iconUrl: null,
              location: null,
              shelfLifeDays: null,
            },
          ]);
          say("Not in the database — name it on the next screen");
        } else {
          say("Lookup failed — try again");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, scanned, lookupBarcode, say],
  );

  function done() {
    if (scanned.length === 0) {
      router.back();
      return;
    }
    stashScans(scanned);
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
          {flash ??
            (busy
              ? "Looking up…"
              : scanned.length > 0
                ? `${scanned.length} scanned — keep going`
                : "Point at a barcode")}
        </Text>
      </SafeAreaView>

      <SafeAreaView className="absolute inset-x-0 bottom-0 items-center gap-3 p-6">
        {scanned.length > 0 && (
          <Text
            className="max-w-[86%] rounded-lg bg-black/50 px-3 py-1.5 text-center text-[12px] text-white/80"
            numberOfLines={2}
          >
            {scanned.map((s) => s.name || "Unnamed item").join("  ·  ")}
          </Text>
        )}
        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-lg bg-white/15 px-5 py-3"
          >
            <Text className="font-semibold text-white">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={done}
            disabled={scanned.length === 0}
            className="flex-row items-center gap-2 rounded-lg bg-accent px-6 py-3 active:opacity-80"
            style={scanned.length === 0 ? { opacity: 0.45 } : undefined}
          >
            <MaterialCommunityIcons name="check" size={16} color="#0a0a0c" />
            <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">
              {scanned.length > 0 ? `Done (${scanned.length})` : "Done"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
