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

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** The one card look used for everything in Home's Notifications section and the full feed:
 *  tinted icon tile, bold message, faint meta line, blue action on the right. Server events
 *  (NotificationRow) and Home's live crew tips both render through this so there's a single style. */
export function NotificationCard({
  icon,
  color,
  meta,
  actionLabel = "Clear",
  onAction,
  onPress,
  children,
}: {
  icon: IconName;
  color: string;
  meta: string;
  actionLabel?: string;
  onAction: () => void;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const {
    surface: SURFACE,
    hairline: HAIRLINE,
    faint: FAINT,
    blue: BLUE,
  } = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
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
          backgroundColor: `${color}1a`,
        }}
      >
        <MaterialCommunityIcons name={icon} size={17} color={color} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ marginBottom: 2 }}>{children}</View>
        <Text style={{ fontSize: 11, color: FAINT }}>{meta}</Text>
      </View>

      <Pressable
        onPress={onAction}
        hitSlop={8}
        style={{ paddingHorizontal: 4, paddingVertical: 6 }}
      >
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: BLUE }}>{actionLabel}</Text>
      </Pressable>
    </Pressable>
  );
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
  // `event.kind` is a string from the server, not a compile-time-checked union - guard
  // against a kind this build doesn't know yet (see fallbackMeta above) rather than crashing.
  const meta = kindMeta(colors)[event.kind] ?? fallbackMeta(colors);
  return (
    <NotificationCard
      icon={meta.icon}
      color={meta.color}
      meta={`${event.fridgeName} · ${timeAgo(event.createdAt)}`}
      onAction={onClear}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{event.message}</Text>
    </NotificationCard>
  );
}
