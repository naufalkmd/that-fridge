import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo, type NotificationEvent, type NotificationKind } from "@thatfridge/core";
import { useTheme, type ThemeColors } from "@/lib/theme";

// Same shape as kindMeta's per-kind entries - used for a `kind` this build doesn't recognize
// yet (an older, not-yet-updated install receiving a notification kind added after it
// shipped), so the row degrades to a generic bell instead of crashing the whole list.
function fallbackMeta(colors: ThemeColors): { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap } {
  return { color: colors.faint, icon: "bell-outline" };
}

function kindMeta(
  colors: ThemeColors,
): Record<NotificationKind, { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> {
  return {
    expiring: { color: colors.agentGuardian, icon: "timer-sand" },
    lowStock: { color: colors.agentShopkeeper, icon: "cart-outline" },
    recipe: { color: colors.agentChef, icon: "chef-hat" },
    invite: { color: colors.blue, icon: "email-outline" },
    joinRequest: { color: colors.blue, icon: "account-plus-outline" },
    requestApproved: { color: colors.good, icon: "check-circle-outline" },
    requestDeclined: { color: colors.faint, icon: "close-circle-outline" },
    inviteAccepted: { color: colors.good, icon: "account-check-outline" },
    inviteDeclined: { color: colors.faint, icon: "account-cancel-outline" },
    memberLeft: { color: colors.faint, icon: "account-arrow-right-outline" },
    removed: { color: colors.agentGuardian, icon: "account-remove-outline" },
    itemAdded: { color: colors.agentOrganizer, icon: "package-variant-closed" },
    itemUsed: { color: colors.agentOrganizer, icon: "package-variant" },
    note: { color: colors.agentOrganizer, icon: "note-text-outline" },
    // Accent (the brand cyan, not one of the four crew-agent colors) - a Machine is
    // cross-cutting, not owned by any one agent. See Kitchen Lab's Machine concept.
    machine: { color: colors.accent, icon: "cog-outline" },
  };
}

/** One notification row - shared by the full Notifications screen and Home's small preview so
 *  both render (and swipe-delete) the exact same thing off the exact same NotificationsProvider
 *  state, rather than the preview growing into a second feed of its own. */
export function NotificationRow({
  event,
  onClear,
}: {
  event: NotificationEvent;
  onClear: () => void;
}) {
  const colors = useTheme().colors;
  const {
    surface: SURFACE,
    hairline: HAIRLINE,
    ink: INK,
    faint: FAINT,
    blue: BLUE,
  } = colors;
  // `event.kind` is a string from the server, not a compile-time-checked union - guard
  // against a kind this build doesn't know yet (see fallbackMeta above) rather than crashing.
  const meta = kindMeta(colors)[event.kind] ?? fallbackMeta(colors);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 13,
        marginBottom: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: HAIRLINE,
        backgroundColor: SURFACE,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${meta.color}1a`,
        }}
      >
        <MaterialCommunityIcons name={meta.icon} size={17} color={meta.color} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: INK, marginBottom: 2 }}>
          {event.message}
        </Text>
        <Text style={{ fontSize: 11, color: FAINT }}>
          {event.fridgeName} · {timeAgo(event.createdAt)}
        </Text>
      </View>

      <Pressable
        onPress={onClear}
        hitSlop={8}
        style={{ paddingHorizontal: 4, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: BLUE }}>Clear</Text>
      </Pressable>
    </View>
  );
}
