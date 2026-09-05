import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Persistent "You're offline" bar, shown whenever the device has no usable connection.
 * Anchored to the top (not the bottom, where UpdateBanner/toasts live) so it can never
 * overlap them if both are showing at once. Unlike UpdateBanner this isn't dismissible - it
 * tracks real connectivity state, so it disappears on its own the moment the device reconnects
 * rather than needing a tap.
 *
 * `isConnected` is the transport layer (Wi-Fi/cellular radio up); `isInternetReachable` is
 * NetInfo's own reachability probe and can briefly be `null` while it's still checking, which
 * would otherwise flash the banner on every launch - only treat an explicit `false` as offline.
 *
 * NetInfo's entry point calls TurboModuleRegistry.getEnforcing() at import time, which throws
 * on a build that predates this feature (same risk as expo-speech-recognition - see voice.ts).
 * Load it defensively so an OTA to such a build no-ops this banner instead of crashing the
 * whole app at launch.
 */
let NetInfo: typeof import("@react-native-community/netinfo").default | null =
  null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  NetInfo = null;
}

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!NetInfo) return;
    return NetInfo.addEventListener((state) => {
      setOffline(
        state.isConnected === false || state.isInternetReachable === false,
      );
    });
  }, []);

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: insets.top, left: 0, right: 0 }}
    >
      <View className="items-center border-b border-bad bg-surface py-2">
        <Text className="text-[12px] font-bold text-bad">
          You&apos;re offline
        </Text>
      </View>
    </View>
  );
}
