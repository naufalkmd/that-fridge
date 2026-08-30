import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";

/**
 * OTA "Update ready" banner. On app foreground it checks for and silently downloads a new
 * EAS update; once one is staged (`isUpdatePending`) it shows a dismissible pill. Tapping
 * "Reload" applies it — we never auto-reload, so an open sheet / half-typed form is safe.
 * No-ops in dev and Expo Go (`Updates.isEnabled` is false there).
 */
export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const checking = useRef(false);

  const checkAndDownload = useCallback(async () => {
    if (!Updates.isEnabled || checking.current) return;
    checking.current = true;
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) await Updates.fetchUpdateAsync();
    } catch {
      /* offline / transient — try again next foreground */
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    checkAndDownload();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkAndDownload();
    });
    return () => sub.remove();
  }, [checkAndDownload]);

  if (!isUpdatePending || dismissed) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 74 }}
    >
      <View className="flex-row items-center gap-3 rounded-[10px] border border-accent bg-surface py-3 pl-4 pr-2">
        <Text className="flex-1 text-[13px] font-semibold text-ink">
          Update ready
        </Text>
        <Pressable
          onPress={async () => {
            setReloading(true);
            try {
              await Updates.reloadAsync();
            } catch {
              setReloading(false);
            }
          }}
          hitSlop={8}
          className="px-2 py-1"
        >
          {reloading ? (
            <ActivityIndicator size="small" color="#26c6da" />
          ) : (
            <Text className="text-[13px] font-extrabold text-accent">Reload</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} className="px-2 py-1">
          <Text className="text-[15px] text-muted">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
