import { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SkeletonList } from "@/components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { timeAgo } from "@thatfridge/core";
import { useNotifications } from "@/lib/notifications";
import { useSocial } from "@/lib/social";
import { PixelText } from "@/components/brand";
import { SwipeRow } from "@/components/swipe-row";
import { NotificationUndoSnackbar } from "@/components/notification-undo-snackbar";
import { NotificationRow } from "@/components/notification-row";
import { useTheme } from "@/lib/theme";

export default function Notifications() {
  const router = useRouter();
  const { events, loading, error, refresh, requestRemove, clearAll } = useNotifications();
  const { myInvites, myJoinRequests, acceptInvite, declineInvite, approveRequest, declineRequest } =
    useSocial();
  const [refreshing, setRefreshing] = useState(false);
  const hasPending = myInvites.length + myJoinRequests.length > 0;
  const {
    accent: ACCENT,
    surface: SURFACE,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    bad: BAD,
  } = useTheme().colors;

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function confirmClearAll() {
    Alert.alert(
      "Clear all notifications",
      "This removes every notification from the list.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: () => clearAll() },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={{ paddingTop: 1 }}>
            <Ionicons name="chevron-back" size={20} color={MUTED} />
          </Pressable>
          <View>
            <PixelText style={{ fontSize: 14, color: INK }}>Notifications</PixelText>
            <Text style={{ fontSize: 11.5, color: FAINT, marginTop: 3 }}>
              Swipe left to remove one
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {events.length > 0 && (
            <Pressable onPress={confirmClearAll} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: BAD }}>
                Clear all
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.push("/notification-settings")} hitSlop={8}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="settings-outline" size={15} color={MUTED} />
            </View>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {error && (
          <Pressable
            onPress={refresh}
            style={{ marginBottom: 14, borderRadius: 12, borderWidth: 1, borderColor: BAD, backgroundColor: SURFACE, padding: 12 }}
          >
            <Text style={{ fontWeight: "600", color: BAD }}>{error}</Text>
          </Pressable>
        )}

        {hasPending && (
          <View style={{ marginBottom: 14 }}>
            {myJoinRequests.map((r) => (
              <PendingRow
                key={r.id}
                icon="account-plus-outline"
                title={`@${r.requesterUsername} wants to join ${r.fridgeName}`}
                createdAt={r.createdAt}
                onAccept={() => approveRequest(r.id)}
                onDecline={() => declineRequest(r.id)}
              />
            ))}
            {myInvites.map((inv) => (
              <PendingRow
                key={inv.id}
                icon="email-outline"
                title={`Invite to ${inv.fridgeName} from @${inv.inviterUsername}`}
                createdAt={inv.createdAt}
                onAccept={() => acceptInvite(inv.id)}
                onDecline={() => declineInvite(inv.id)}
              />
            ))}
          </View>
        )}

        {loading ? (
          <View style={{ marginTop: 12 }}>
            <SkeletonList rows={5} />
          </View>
        ) : events.length === 0 && !hasPending ? (
          <Text style={{ textAlign: "center", paddingVertical: 60, color: FAINT, fontSize: 13 }}>
            You&apos;re all caught up — no notifications yet.
          </Text>
        ) : (
          events.map((e) => (
            <SwipeRow key={e.id} onDelete={() => requestRemove(e.id)}>
              <NotificationRow event={e} onClear={() => requestRemove(e.id)} />
            </SwipeRow>
          ))
        )}
      </ScrollView>

      <NotificationUndoSnackbar />
    </SafeAreaView>
  );
}

function PendingRow({
  icon,
  title,
  createdAt,
  onAccept,
  onDecline,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  createdAt: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const {
    surface: SURFACE,
    hairline: HAIRLINE,
    ink: INK,
    faint: FAINT,
    blue: BLUE,
    good: GOOD,
  } = useTheme().colors;
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
      <View style={{ width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${BLUE}1a` }}>
        <MaterialCommunityIcons name={icon} size={17} color={BLUE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: INK, lineHeight: 17 }}>{title}</Text>
        <Text style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{timeAgo(createdAt)}</Text>
      </View>
      <Pressable onPress={onAccept} hitSlop={6} style={{ padding: 4 }}>
        <MaterialCommunityIcons name="check" size={18} color={GOOD} />
      </Pressable>
      <Pressable onPress={onDecline} hitSlop={6} style={{ padding: 4 }}>
        <MaterialCommunityIcons name="close" size={16} color={FAINT} />
      </Pressable>
    </View>
  );
}
