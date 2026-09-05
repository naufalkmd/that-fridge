import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  describeError,
  type FridgeJoinRequest,
  type FridgeMember,
  type FridgeStyleKey,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useSocial } from "@/lib/social";
import { SheetHeader } from "@/components/sheet";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";
const BAD = "#ff5567";

const STYLES: { key: Exclude<FridgeStyleKey, "custom">; label: string; photo: number }[] = [
  { key: "photo", label: "Original", photo: require("../../../assets/images/thatfridge/fridge-hero.png") },
  { key: "classic", label: "Classic", photo: require("../../../assets/images/thatfridge/fridge-classic.png") },
  { key: "french", label: "French", photo: require("../../../assets/images/thatfridge/fridge-french.png") },
  { key: "retro", label: "Retro", photo: require("../../../assets/images/thatfridge/fridge-retro.png") },
  { key: "mini", label: "Mini", photo: require("../../../assets/images/thatfridge/fridge-mini.png") },
];

export default function ManageFridge() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { fridges, refresh } = useInventory();
  const { refresh: refreshSocial } = useSocial();

  const fridge = fridges.find((f) => f.id === id);
  const isOwner = fridge?.role === "owner";

  const [name, setName] = useState(fridge?.name ?? "");
  const [members, setMembers] = useState<FridgeMember[]>([]);
  const [requests, setRequests] = useState<FridgeJoinRequest[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<{ id: string; name: string; username: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.listFridgeMembers(id).then(setMembers).catch(() => {});
    if (isOwner) api.listJoinRequests(id).then(setRequests).catch(() => {});
  }, [id, isOwner]);

  useEffect(() => {
    const q = inviteQuery.trim();
    if (q.length < 2) return setInviteResults([]);
    const t = setTimeout(() => {
      api.searchUsers(q).then(setInviteResults).catch(() => setInviteResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [inviteQuery]);

  const style = (fridge?.style ?? "photo") as FridgeStyleKey;
  const styleKey = style === "custom" ? "photo" : style;

  async function saveName() {
    if (!name.trim() || name.trim() === fridge?.name) return;
    try {
      await api.updateFridge(id, { name: name.trim() });
      await refresh();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't rename that."));
    }
  }

  async function setStyle(key: Exclude<FridgeStyleKey, "custom">) {
    try {
      await api.updateFridge(id, { style: key });
      await refresh();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't change the style."));
    }
  }

  async function uploadPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    try {
      await api.updateFridge(id, {
        style: "custom",
        photo_url: `data:image/jpeg;base64,${res.assets[0].base64}`,
      });
      await refresh();
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't upload that photo."));
    }
  }

  async function invite(userId: string) {
    setBusy(true);
    try {
      await api.inviteToFridge(id, userId);
      setInviteQuery("");
      setInviteResults([]);
      Alert.alert("Invite sent", "They'll see it under Find a friend.");
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't send that invite."));
    } finally {
      setBusy(false);
    }
  }

  async function decideRequest(reqId: string, approve: boolean) {
    setRequests((r) => r.filter((x) => x.id !== reqId));
    try {
      await (approve ? api.approveJoinRequest(reqId) : api.declineJoinRequest(reqId));
      if (approve) await Promise.all([refresh(), api.listFridgeMembers(id).then(setMembers)]);
      refreshSocial();
    } catch (e) {
      api.listJoinRequests(id).then(setRequests);
      if (approve) {
        Alert.alert("Couldn't approve", describeError(e, "Couldn't approve that request."));
      }
    }
  }

  function confirmLeaveOrDelete() {
    const owner = isOwner;
    Alert.alert(
      owner ? "Delete fridge" : "Leave fridge",
      owner
        ? "This permanently deletes the fridge and everything in it."
        : "You'll lose access to this shared fridge.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: owner ? "Delete" : "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await (owner ? api.deleteFridge(id) : api.leaveFridge(id));
              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              await refresh();
              router.back();
            } catch (e) {
              Alert.alert("Error", describeError(e, "Couldn't do that."));
            }
          },
        },
      ],
    );
  }

  const canRemove = useMemo(() => fridges.length > 1, [fridges]);

  if (!fridge) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">Fridge not found.</Text>
      </View>
    );
  }

  return (
    <>
      <SheetHeader title="Manage fridge" />
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 40 }}>
        <Label>NAME</Label>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          editable={isOwner}
          style={{
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 13.5,
            color: isOwner ? INK : MUTED,
            marginBottom: 20,
          }}
        />

        <Label>LOOK</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 10 }}>
          {STYLES.map((s) => {
            const active = styleKey === s.key && style !== "custom";
            return (
              <Pressable key={s.key} onPress={() => setStyle(s.key)} style={{ alignItems: "center", gap: 4 }}>
                <View style={{ width: 84, height: 60, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: active ? AMBER : "transparent" }}>
                  <Image source={s.photo} style={{ flex: 1 }} contentFit="cover" />
                </View>
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: active ? AMBER : FAINT }}>{s.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={uploadPhoto} style={{ alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: 84,
                height: 60,
                borderRadius: 8,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: style === "custom" ? AMBER : "rgba(255,255,255,0.18)",
                borderStyle: style === "custom" ? "solid" : "dashed",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE2,
              }}
            >
              {style === "custom" && fridge.photoUrl ? (
                <Image source={{ uri: fridge.photoUrl }} style={{ flex: 1, alignSelf: "stretch" }} contentFit="cover" />
              ) : (
                <MaterialCommunityIcons name="image-plus" size={18} color={FAINT} />
              )}
            </View>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: style === "custom" ? AMBER : FAINT }}>
              Custom
            </Text>
          </Pressable>
        </ScrollView>

        <Label>MEMBERS ({members.length})</Label>
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
          {members.map((m, i) => (
            <View
              key={m.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderBottomWidth: i === members.length - 1 ? 0 : 1,
                borderBottomColor: HAIRLINE,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
                  {m.name}
                  {m.id === user?.id ? " (you)" : ""}
                </Text>
                <Text style={{ fontSize: 11, color: FAINT }}>
                  @{m.username} · {m.role}
                </Text>
              </View>
              {isOwner && m.role !== "owner" && (
                <Pressable
                  onPress={() =>
                    api
                      .removeFridgeMember(id, m.id)
                      .then(() => {
                        void Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success,
                        );
                        setMembers((prev) => prev.filter((x) => x.id !== m.id));
                      })
                      .catch(() => {})
                  }
                  hitSlop={6}
                >
                  <MaterialCommunityIcons name="account-remove-outline" size={16} color={FAINT} />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {isOwner && (
          <>
            <Label>INVITE SOMEONE</Label>
            <TextInput
              value={inviteQuery}
              onChangeText={setInviteQuery}
              placeholder="Search by username…"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: HAIRLINE,
                backgroundColor: SURFACE2,
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 13.5,
                color: INK,
                marginBottom: inviteResults.length ? 8 : 20,
              }}
            />
            {inviteResults.length > 0 && (
              <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
                {inviteResults.map((u, i) => (
                  <Pressable
                    key={u.id}
                    onPress={() => !busy && invite(u.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 12,
                      borderBottomWidth: i === inviteResults.length - 1 ? 0 : 1,
                      borderBottomColor: HAIRLINE,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: INK }}>
                      {u.name} <Text style={{ color: FAINT }}>@{u.username}</Text>
                    </Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: BLUE }}>Invite</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {requests.length > 0 && (
              <>
                <Label>JOIN REQUESTS ({requests.length})</Label>
                <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
                  {requests.map((r, i) => (
                    <View
                      key={r.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderBottomWidth: i === requests.length - 1 ? 0 : 1,
                        borderBottomColor: HAIRLINE,
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 13, color: INK }}>
                        {r.requesterName} <Text style={{ color: FAINT }}>@{r.requesterUsername}</Text>
                      </Text>
                      <Pressable onPress={() => decideRequest(r.id, true)} hitSlop={6} style={{ padding: 4 }}>
                        <MaterialCommunityIcons name="check" size={18} color={GOOD} />
                      </Pressable>
                      <Pressable onPress={() => decideRequest(r.id, false)} hitSlop={6} style={{ padding: 4 }}>
                        <MaterialCommunityIcons name="close" size={16} color={FAINT} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {(!isOwner || canRemove) && (
          <Pressable
            onPress={confirmLeaveOrDelete}
            style={{ alignItems: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: `${BAD}66` }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: BAD }}>
              {isOwner ? "Delete fridge" : "Leave fridge"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
      {children}
    </Text>
  );
}
