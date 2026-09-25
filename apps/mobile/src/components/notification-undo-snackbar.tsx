import { Pressable, Text, View } from "react-native";

import { useNotifications } from "@/lib/notifications";
import { useTheme } from "@/lib/theme";

/** Floating "Notification removed / Undo" bar - shown whenever a swipe-delete (from either
 *  the Notifications screen or the Home preview, both driven by the same NotificationsProvider
 *  state) is still inside its undo window. Absolutely positioned, so the parent screen just
 *  needs to render it somewhere inside a relatively-positioned (or full-screen) container. */
export function NotificationUndoSnackbar({ bottom = 20 }: { bottom?: number }) {
  const { pendingRemoval, undoRemove } = useNotifications();
  const { accent: ACCENT, ink: INK, canvas: CANVAS } = useTheme().colors;

  if (!pendingRemoval) return null;

  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: INK,
      }}
    >
      <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "600", color: CANVAS }} numberOfLines={1}>
        Notification removed
      </Text>
      <Pressable onPress={undoRemove} hitSlop={8}>
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: ACCENT }}>Undo</Text>
      </Pressable>
    </View>
  );
}
