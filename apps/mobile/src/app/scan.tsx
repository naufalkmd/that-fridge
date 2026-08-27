import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";

export default function Scan() {
  const router = useRouter();
  const { lookupBarcode } = useInventory();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

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
          className="rounded-lg bg-warn px-5 py-3 active:opacity-80"
        >
          <Text className="font-bold uppercase text-[#0a0a0c]">Grant access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-muted">Not now</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  async function onScanned({ data }: { data: string }) {
    if (handled.current || busy) return;
    handled.current = true;
    setBusy(true);
    try {
      const s = await lookupBarcode(data);
      router.replace({
        pathname: "/add",
        params: {
          name: s.name,
          location: s.location ?? "",
          category: s.category ?? "",
          shelfLife: String(s.default_shelf_life_days ?? ""),
        },
      });
    } catch (err) {
      // Not in Open Food Facts, or the lookup failed — fall through to a blank add form.
      if (!(err instanceof ApiError && err.status === 404)) {
        console.warn("barcode lookup failed", err);
      }
      router.replace("/add");
    }
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
        }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <SafeAreaView className="absolute inset-x-0 bottom-0 items-center gap-3 p-6">
        <Text className="rounded-lg bg-black/60 px-4 py-2 text-center text-white">
          {busy ? "Looking up…" : "Point at a barcode"}
        </Text>
        <Pressable onPress={() => router.back()} className="rounded-lg bg-white/15 px-5 py-2.5">
          <Text className="font-semibold text-white">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
