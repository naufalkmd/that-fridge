import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  describeError,
  type FriendProfile,
  type Recipe,
  type UserSearchResult,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useSocial } from "@/lib/social";
import { useRecipes } from "@/lib/recipes";
import { PixelText } from "@/components/brand";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";

export default function FindFriend() {
  const router = useRouter();
  const { myInvites, acceptInvite, declineInvite, refresh } = useSocial();
  const { setFavorite } = useRecipes();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .searchUsers(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function openProfile(username: string) {
    setLoadingProfile(true);
    try {
      setProfile(await api.getFriendProfile(username));
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't load that profile."));
    } finally {
      setLoadingProfile(false);
    }
  }

  async function toggleRecipeFav(recipe: Recipe) {
    const next = !recipe.isFavorite;
    setProfile((p) =>
      p
        ? {
            ...p,
            recipes: p.recipes.map((r) =>
              r.id === recipe.id ? { ...r, isFavorite: next } : r,
            ),
          }
        : p,
    );
    const saved = await setFavorite(recipe, next);
    if (!saved) {
      // revert on failure
      setProfile((p) =>
        p
          ? {
              ...p,
              recipes: p.recipes.map((r) =>
                r.id === recipe.id ? { ...r, isFavorite: recipe.isFavorite } : r,
              ),
            }
          : p,
      );
    }
  }

  function reportProfile() {
    if (!profile) return;
    const subject = `Report @${profile.username}`;
    const body = `I'd like to report @${profile.username}.\n\nReason: `;
    Linking.openURL(
      `mailto:support@thatfridge.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    );
  }

  async function setBlocked(blocked: boolean) {
    if (!profile) return;
    try {
      if (blocked) {
        await api.blockUser(profile.username);
      } else {
        await api.unblockUser(profile.username);
      }
      setResults((r) => r.filter((u) => u.username !== profile.username));
      setProfile(null);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't do that."));
    }
  }

  function openProfileActions() {
    if (!profile) return;
    const username = profile.username;
    if (profile.blockedByMe) {
      Alert.alert(`@${username}`, undefined, [
        { text: "Unblock", onPress: () => setBlocked(false) },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    Alert.alert(`@${username}`, undefined, [
      { text: "Report", onPress: reportProfile },
      {
        text: "Block",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            `Block @${username}?`,
            "They won't be able to find you or invite you to a fridge, and you won't see them in search.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Block", style: "destructive", onPress: () => setBlocked(true) },
            ],
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function requestJoin(fridgeId: string) {
    setRequested((r) => ({ ...r, [fridgeId]: true }));
    try {
      await api.requestJoinFridge(fridgeId);
      refresh();
    } catch (e) {
      setRequested((r) => ({ ...r, [fridgeId]: false }));
      Alert.alert("Error", describeError(e, "Couldn't send that request."));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
        <Pressable onPress={() => (profile ? setProfile(null) : router.back())} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={MUTED} />
        </Pressable>
        <PixelText style={{ fontSize: 14, color: INK, flex: 1 }}>
          {profile ? `@${profile.username}` : "Find a friend"}
        </PixelText>
        {profile && (
          <Pressable onPress={openProfileActions} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={MUTED} />
          </Pressable>
        )}
      </View>

      {profile ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: INK }}>{profile.name}</Text>
          <Text style={{ fontSize: 12.5, color: FAINT, marginBottom: 20 }}>@{profile.username}</Text>

          <Label>THEIR FRIDGES</Label>
          {profile.fridges.length === 0 ? (
            <Text style={{ fontSize: 12, color: FAINT, marginBottom: 20 }}>No shared fridges.</Text>
          ) : (
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
              {profile.fridges.map((f, i) => {
                const already = f.role != null;
                const pending = f.requestStatus === "pending" || requested[f.id];
                return (
                  <View
                    key={f.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 13,
                      borderBottomWidth: i === profile.fridges.length - 1 ? 0 : 1,
                      borderBottomColor: HAIRLINE,
                    }}
                  >
                    <MaterialCommunityIcons name="fridge-outline" size={18} color={BLUE} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{f.name}</Text>
                      <Text style={{ fontSize: 11, color: FAINT }}>
                        {f.memberCount} member{f.memberCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {already ? (
                      <Text style={{ fontSize: 11.5, fontWeight: "700", color: GOOD }}>Joined</Text>
                    ) : pending ? (
                      <Text style={{ fontSize: 11.5, fontWeight: "700", color: FAINT }}>Requested</Text>
                    ) : (
                      <Pressable
                        onPress={() => requestJoin(f.id)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: SURFACE2 }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: BLUE }}>Request</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {profile.recipes.length > 0 && (
            <>
              <Label>THEIR RECIPE BOOK</Label>
              <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
                {profile.recipes.map((r, i) => (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push(`/recipe/${r.id}`)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderBottomWidth: i === profile.recipes.length - 1 ? 0 : 1,
                      borderBottomColor: HAIRLINE,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: INK }} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: FAINT }}>
                        {r.minutes} min · {r.ingredients.length} ingredient
                        {r.ingredients.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Pressable onPress={() => toggleRecipeFav(r)} hitSlop={10} style={{ padding: 4 }}>
                      <MaterialCommunityIcons
                        name={r.isFavorite ? "heart" : "heart-outline"}
                        size={18}
                        color={r.isFavorite ? "#26c6da" : FAINT}
                      />
                    </Pressable>
                    <Ionicons name="chevron-forward" size={15} color={FAINT} />
                  </Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
                Tap the heart to save a recipe to your own book.
              </Text>
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username…"
            placeholderTextColor={FAINT}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: HAIRLINE,
              backgroundColor: SURFACE,
              borderRadius: 6,
              paddingHorizontal: 16,
              paddingVertical: 11,
              fontSize: 14,
              color: INK,
              marginBottom: 18,
            }}
          />

          {myInvites.length > 0 && (
            <>
              <Label>MY INVITES</Label>
              <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 20 }}>
                {myInvites.map((inv, i) => (
                  <View
                    key={inv.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 13,
                      borderBottomWidth: i === myInvites.length - 1 ? 0 : 1,
                      borderBottomColor: HAIRLINE,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: INK }}>{inv.fridgeName}</Text>
                      <Text style={{ fontSize: 11, color: FAINT }}>from @{inv.inviterUsername}</Text>
                    </View>
                    <Pressable onPress={() => acceptInvite(inv.id)} hitSlop={6} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="check" size={18} color={GOOD} />
                    </Pressable>
                    <Pressable onPress={() => declineInvite(inv.id)} hitSlop={6} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="close" size={16} color={FAINT} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}

          {searching || loadingProfile ? (
            <ActivityIndicator color="#26c6da" style={{ marginTop: 20 }} />
          ) : results.length > 0 ? (
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
              {results.map((u, i) => (
                <Pressable
                  key={u.id}
                  onPress={() => openProfile(u.username)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 13,
                    borderBottomWidth: i === results.length - 1 ? 0 : 1,
                    borderBottomColor: HAIRLINE,
                  }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: INK }}>
                      {u.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{u.name}</Text>
                    <Text style={{ fontSize: 11, color: FAINT }}>@{u.username}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={FAINT} />
                </Pressable>
              ))}
            </View>
          ) : query.trim().length >= 2 ? (
            <Text style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 30 }}>
              No one matches “{query}”
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
      {children}
    </Text>
  );
}
